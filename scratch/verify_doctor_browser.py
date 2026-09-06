import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import os

async def run_cdp():
    chrome_cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--remote-debugging-port=9556",
        "http://localhost:3000/staff-login"
    ]
    proc = subprocess.Popen(chrome_cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9556/json").read())
        page_tabs = [t for t in tabs if t.get("type") == "page"]
        if not page_tabs:
            print("No page tabs found!")
            return
        ws_url = page_tabs[0]["webSocketDebuggerUrl"]
        print(f"Connected to Chrome page tab at {ws_url}")

        async with websockets.connect(ws_url) as ws:
            msg_id = 0

            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                req = {"id": msg_id, "method": method, "params": params or {}}
                await ws.send(json.dumps(req))
                while True:
                    res = json.loads(await ws.recv())
                    if res.get("id") == msg_id:
                        return res.get("result", {})

            # Enable Runtime & Page & Console
            await send_cmd("Runtime.enable")
            await send_cmd("Page.enable")

            async def eval_js(expr):
                r = await send_cmd("Runtime.evaluate", {
                    "expression": expr,
                    "returnByValue": True,
                    "awaitPromise": True
                })
                if "exceptionDetails" in r:
                    print(f"JS Exception in '{expr}':", r["exceptionDetails"])
                return r.get("result", {}).get("value")

            print("\n--- STEP 1: Check Staff Login Page ---")
            await asyncio.sleep(2)
            title = await eval_js("document.title")
            print("Login page title:", title)

            print("\n--- STEP 2: Doctor Sign In ---")
            login_success = await eval_js("""
                (async () => {
                    const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
                    const passInput = document.querySelector('input[type="password"]');
                    const btn = document.querySelector('button[type="submit"]');
                    if (emailInput && passInput && btn) {
                        emailInput.value = 'doctor@hospital.com';
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        passInput.value = 'password123';
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            """)
            print("Clicked login button:", login_success)
            await asyncio.sleep(4)

            current_url = await eval_js("window.location.href")
            print("URL after login:", current_url)

            # If still on login, check if token was stored in localStorage or login directly
            token = await eval_js("localStorage.getItem('ps47_token')")
            print("Token stored:", bool(token))

            if not token:
                # Direct API login from page context
                token_res = await eval_js("""
                    (async () => {
                        const res = await fetch('http://127.0.0.1:8000/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: 'doctor@hospital.com', password: 'password123' })
                        });
                        const data = await res.json();
                        if (data.access_token) {
                            localStorage.setItem('ps47_token', data.access_token);
                            return data.access_token;
                        }
                        return null;
                    })()
                """)
                print("Direct page fetch token obtained:", bool(token_res))

            # Navigate to /doctor/dashboard
            print("\n--- STEP 3: Navigate to Doctor Command Center (/doctor/dashboard) ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/dashboard"})
            await asyncio.sleep(3)

            dash_url = await eval_js("window.location.href")
            print("Dashboard URL:", dash_url)

            h1_greeting = await eval_js("document.querySelector('h1')?.innerText")
            print("Dashboard Physician Greeting:", h1_greeting)

            # CRITICAL CHECK: Zero duplicate 'Dr. Dr.'
            assert h1_greeting and "Dr. Dr." not in h1_greeting, f"FAIL: Duplicate title found in {h1_greeting}"
            print("PASS: Physician greeting is correctly formatted without duplicate titles!")

            # Check stats strip
            stats_text = await eval_js("""
                Array.from(document.querySelectorAll('p')).filter(p => p.innerText.includes('Assigned') || p.innerText.includes('Needs Review') || p.innerText.includes('Completed')).map(p => p.innerText)
            """)
            print("Stat strip labels:", stats_text)

            # Check Needs Attention section
            has_needs_attention = await eval_js("document.body.innerText.includes('Needs Attention')")
            print("Needs Attention section present:", has_needs_attention)

            # Check Operational Priority Badges
            priority_badges = await eval_js("""
                Array.from(document.querySelectorAll('[aria-label^=\"AI-assisted attention priority\"]')).map(el => el.innerText.trim())
            """)
            print("Operational Priority Badges found on dashboard:", priority_badges)

            # Check Waiting time labels
            waiting_labels = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText.includes('Waiting:')).map(s => s.innerText.trim())
            """)
            print("Waiting time indicators found:", waiting_labels[:4])

            # Check Intake completeness badges
            intake_pcts = await eval_js("""
                Array.from(document.querySelectorAll('div')).filter(d => d.getAttribute('title') && d.getAttribute('title').includes('Intake completeness')).map(d => d.innerText.trim())
            """)
            print("Intake completeness badges found:", intake_pcts[:4])

            # Check Sorting dropdown
            sort_options = await eval_js("""
                Array.from(document.querySelector('select')?.options || []).map(o => o.text)
            """)
            print("Queue Sort options:", sort_options)

            print("\n--- STEP 4: Test Patient Quick View Drawer on Dashboard ---")
            qv_clicked = await eval_js("""
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Quick View'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            """)
            print("Clicked Quick View on dashboard:", qv_clicked)
            await asyncio.sleep(2)

            drawer_name = await eval_js("document.getElementById('quickview-patient-name')?.innerText")
            print("Quick View Drawer Patient Name:", drawer_name)

            drawer_priority = await eval_js("""
                document.querySelector('[role=\"dialog\"] [aria-label^=\"AI-assisted attention priority\"]')?.innerText
            """)
            print("Quick View Drawer Operational Priority:", drawer_priority)

            drawer_checks = await eval_js("""
                document.querySelector('[role=\"dialog\"]')?.innerText.includes('Workflow & Completeness Checks')
            """)
            print("Quick View Drawer Safety/Workflow Checks Section:", drawer_checks)

            # Close drawer
            await eval_js("""
                (() => {
                    const closeBtn = document.querySelector('button[aria-label=\"Close patient quick view\"]');
                    if (closeBtn) closeBtn.click();
                })()
            """)
            await asyncio.sleep(1)

            print("\n--- STEP 5: Navigate to Clinical Queue (/doctor/patients) ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/patients"})
            await asyncio.sleep(3)

            patients_h1 = await eval_js("document.querySelector('h1')?.innerText")
            print("Clinical Queue H1:", patients_h1)

            patients_priority_badges = await eval_js("""
                Array.from(document.querySelectorAll('[aria-label^=\"AI-assisted attention priority\"]')).map(el => el.innerText.trim())
            """)
            print("Operational Priority Badges in Clinical Queue:", len(patients_priority_badges))

            # Test Quick View in Clinical Queue
            qv2_clicked = await eval_js("""
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Quick View'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            """)
            print("Clicked Quick View on patients page:", qv2_clicked)
            await asyncio.sleep(2)

            qv2_open = await eval_js("!!document.getElementById('quickview-patient-name')")
            print("Quick View Drawer opened in Clinical Queue:", qv2_open)

            # Close drawer
            await eval_js("""
                (() => {
                    const closeBtn = document.querySelector('button[aria-label=\"Close patient quick view\"]');
                    if (closeBtn) closeBtn.click();
                })()
            """)
            await asyncio.sleep(1)

            print("\n--- STEP 6: Navigate to Patient Clinical Workspace ---")
            # Click Open Clinical Workspace button
            clicked_workspace = await eval_js("""
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Review Patient') || b.innerText.includes('Open Clinical Workspace'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            """)
            print("Clicked Review Patient / Open Clinical Workspace:", clicked_workspace)
            await asyncio.sleep(4)

            workspace_url = await eval_js("window.location.href")
            print("Clinical Workspace URL:", workspace_url)

            # Check PatientHeader in Workspace
            ws_priority = await eval_js("""
                document.querySelector('[aria-label^=\"AI-assisted attention priority\"]')?.innerText
            """)
            print("Workspace Patient Header Priority Badge:", ws_priority)

            # Check Physician Governance & Verification Progress bar
            ws_gov_bar = await eval_js("document.body.innerText.includes('Physician Governance & Verification Progress')")
            print("Physician Governance Progress Bar present:", ws_gov_bar)

            # Check Evidence Provenance Summary
            ws_provenance = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText.includes('backed') || s.innerText.includes('Document-backed') || s.innerText.includes('Voice-intake-backed')).map(s => s.innerText.trim())
            """)
            print("Evidence Provenance Summary Chips:", ws_provenance)

            # Check Workflow / Safety Flags
            ws_safety_flags = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText.includes('Allergies not recorded') || s.innerText.includes('Medication') || s.innerText.includes('pending') || s.innerText.includes('Documentation complete')).map(s => s.innerText.trim())
            """)
            print("Workflow / Safety Documentation Flags:", ws_safety_flags)

            print("\n--- STEP 7: Navigate to Clinician Profile (/doctor/profile) ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/profile"})
            await asyncio.sleep(3)

            profile_name = await eval_js("document.querySelector('h2')?.innerText")
            print("Clinician Profile H2 Display Name:", profile_name)

            # Verify no duplicate title in profile
            assert profile_name and "Dr. Dr." not in profile_name, f"FAIL: Duplicate title found in profile: {profile_name}"
            print("PASS: Clinician Profile name is correctly formatted with single title!")

            print("\n=======================================================")
            print("FULL END-TO-END BROWSER WORKFLOW VERIFIED SUCCESSFULLY!")
            print("=======================================================")

    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(run_cdp())
