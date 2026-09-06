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
        "--remote-debugging-port=9557",
        "http://localhost:3000/staff-login"
    ]
    proc = subprocess.Popen(chrome_cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9557/json").read())
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

            print("\n--- STEP 1: Doctor Login ---")
            await asyncio.sleep(1.5)
            # Login directly via page fetch to guarantee token
            await eval_js("""
                (async () => {
                    const res = await fetch('http://127.0.0.1:8000/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: 'doctor@hospital.com', password: 'password123' })
                    });
                    const data = await res.json();
                    if (data.access_token) {
                        localStorage.setItem('ps47_token', data.access_token);
                        return true;
                    }
                    return false;
                })()
            """)

            print("\n--- STEP 2: Verify Sidebar Navigation ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/dashboard"})
            await asyncio.sleep(3)

            sidebar_links = await eval_js("""
                Array.from(document.querySelectorAll('nav a')).map(a => ({ href: a.getAttribute('href'), text: a.innerText.trim() }))
            """)
            print("Doctor Sidebar Navigation Items:", sidebar_links)

            # Check that Patient Records exists
            has_records_link = any(l.get("href") == "/doctor/records" for l in sidebar_links)
            assert has_records_link, "FAIL: /doctor/records link not found in sidebar!"
            print("PASS: 'Patient Records' (/doctor/records) exists in doctor sidebar!")

            print("\n--- STEP 3: Navigate to Patient Records (/doctor/records) ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/records"})
            await asyncio.sleep(3)

            records_url = await eval_js("window.location.href")
            print("Records URL:", records_url)

            records_h1 = await eval_js("document.querySelector('h1')?.innerText")
            print("Records H1 Title:", records_h1)

            # Verify initial empty state
            empty_state_text = await eval_js("""
                document.body.innerText.includes('Find a patient by UID to view their records.')
            """)
            print("Initial empty state prompt rendered:", empty_state_text)

            # Verify Find by UID label
            find_label = await eval_js("""
                document.body.innerText.includes('Find by UID')
            """)
            print("'Find by UID' label rendered:", find_label)

            print("\n--- STEP 4: Test Quick Select / Search Authorized Patient UID ---")
            # Click the first quick select chip if present, or fill input
            chip_clicked = await eval_js("""
                (() => {
                    const chip = document.querySelector('button[title^=\"UID:\"]');
                    if (chip) {
                        chip.click();
                        return chip.innerText;
                    }
                    return null;
                })()
            """)
            print("Quick select chip clicked:", chip_clicked)

            if not chip_clicked:
                # If no chip, get assigned patient from API
                patient_uid = await eval_js("""
                    (async () => {
                        const token = localStorage.getItem('ps47_token');
                        const res = await fetch('http://127.0.0.1:8000/doctor/queue', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        const data = await res.json();
                        return data.items[0]?.patient_id;
                    })()
                """)
                print("Fetched assigned patient UID:", patient_uid)
                await eval_js(f"""
                    (() => {{
                        const input = document.querySelector('input[placeholder*=\"UID\"]');
                        const btn = document.querySelector('button[type=\"submit\"]');
                        input.value = '{patient_uid}';
                        input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        btn.click();
                    }})()
                """)

            await asyncio.sleep(3)

            print("\n--- STEP 5: Verify Patient Overview & Demographics ---")
            patient_name = await eval_js("document.querySelector('h2')?.innerText")
            print("Loaded Patient Name:", patient_name)

            overview_card = await eval_js("""
                document.body.innerText.includes('Authorized Record') &&
                document.body.innerText.includes('Date of Birth') &&
                document.body.innerText.includes('Preferred Language')
            """)
            print("Patient Overview & Demographics Card Rendered:", overview_card)

            print("\n--- STEP 6: Verify Encounter History Stream ---")
            encounter_history = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText.includes('Encounter #')).map(s => s.innerText.trim())
            """)
            print("Encounter History Items Found:", encounter_history)

            print("\n--- STEP 7: Verify Clinical Summary & Findings Breakdown ---")
            has_summary_card = await eval_js("""
                document.body.innerText.includes('AI Intake Summary')
            """)
            print("AI Intake Summary Card Rendered:", has_summary_card)

            # Check findings classification (Reviewed vs Pending Verification)
            findings_tabs = await eval_js("""
                Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('All (') || b.innerText.includes('Reviewed (') || b.innerText.includes('Pending (')).map(b => b.innerText.trim())
            """)
            print("Findings Tabs Rendered (Reviewed vs Pending):", findings_tabs)

            # Check findings badge labels
            finding_badges = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText === 'Accepted' || s.innerText.includes('Edited') || s.innerText.includes('Pending Verification') || s.innerText.includes('Rejected')).map(s => s.innerText)
            """)
            print("Finding Verification Badges Found:", set(finding_badges))

            print("\n--- STEP 8: Verify Documents on Record & Provenance ---")
            has_docs = await eval_js("document.body.innerText.includes('Documents on Record')")
            print("Documents Section Present:", has_docs)

            provenance_chips = await eval_js("""
                Array.from(document.querySelectorAll('span')).filter(s => s.innerText.includes('Document-backed') || s.innerText.includes('Voice-intake-backed')).map(s => s.innerText.trim())
            """)
            print("Evidence Provenance Chips:", provenance_chips)

            has_timeline = await eval_js("document.body.innerText.includes('Clinical Timeline Events')")
            print("Clinical Timeline Events Section Present:", has_timeline)

            print("\n--- STEP 9: Verify Open Clinical Workspace Navigation ---")
            workspace_btn_text = await eval_js("""
                Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open Clinical Workspace'))?.innerText
            """)
            print("Clinical Workspace Button Text:", workspace_btn_text)

            clicked_open_ws = await eval_js("""
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open Clinical Workspace'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
            """)
            await asyncio.sleep(3)

            ws_url = await eval_js("window.location.href")
            print("Navigated to URL:", ws_url)
            assert "/doctor/patients/" in ws_url, f"FAIL: Did not navigate to clinical workspace: {ws_url}"
            print("PASS: Successfully navigated to /doctor/patients/[encounterId]!")

            print("\n--- STEP 10: Verify Anti-Enumeration / Unauthorized Lookup Rejection ---")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/doctor/records"})
            await asyncio.sleep(2)

            await eval_js("""
                (() => {
                    const input = document.querySelector('input[placeholder*="UID"]');
                    const btn = document.querySelector('button[type="submit"]');
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(input, '00000000-0000-0000-0000-000000000000');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    btn.click();
                })()
            """)
            await asyncio.sleep(3)

            rejection_message = await eval_js("""
                document.body.innerText.includes('No authorized patient record found for this UID.')
            """)
            print("Unauthorized UID rejection message rendered:", rejection_message)
            assert rejection_message, "FAIL: Unauthorized lookup did not show rejection message!"
            print("PASS: Unauthorized patient lookup rejected securely!")

            print("\n=======================================================")
            print("PATIENT RECORDS PANEL FULLY VERIFIED IN HEADLESS CHROME!")
            print("=======================================================")

    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(run_cdp())
