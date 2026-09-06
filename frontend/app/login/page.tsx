"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Stethoscope,
  Activity,
  ShieldCheck,
  Lock,
  Mic,
  FileText,
  Eye,
  EyeOff,
  AlertCircle,
  Building2,
  ArrowRight,
  User,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth.store";
import { login, getMe } from "@/services/auth.service";
import { ApiError, storeToken } from "@/lib/api";

type EntryMode = "patient" | "doctor";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function parseUrlError(error: string | null, detail: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case "doctor_account_required":
      return "Doctor portal access requires a verified hospital doctor account. Google accounts without pre-authorized doctor credentials cannot sign into the doctor workstation.";
    case "unauthorized_doctor":
      return "This account is not mapped to an active hospital physician. Please sign in with your hospital-issued credentials.";
    case "unverified_email":
      return "Your Google email address is unverified. Please verify your Google email before signing in.";
    case "invalid_state":
      return "Security verification failed (invalid OAuth state parameter). Please try again.";
    case "account_disabled":
      return "This clinical account is deactivated. Please contact your hospital system administrator.";
    case "database_error":
      return "A database error occurred during sign-in. Please try again shortly.";
    case "google_auth_failed":
      if (detail === "access_denied") return "Sign in with Google was cancelled.";
      return detail ? `Google authentication failed: ${detail}` : "Google authentication failed. Please try again.";
    default:
      return detail || "Authentication failed. Please verify your credentials.";
  }
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const roleParam =
    searchParams.get("mode") ||
    searchParams.get("role") ||
    searchParams.get("tab");
  const initialMode: EntryMode = roleParam === "doctor" ? "doctor" : "patient";

  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prevRoleParam, setPrevRoleParam] = useState(roleParam);
  if (roleParam !== prevRoleParam) {
    setPrevRoleParam(roleParam);
    if (roleParam === "doctor") {
      setMode("doctor");
    } else if (roleParam === "patient") {
      setMode("patient");
    }
  }

  const urlError = parseUrlError(searchParams.get("error"), searchParams.get("detail"));
  const error = formError || urlError;

  const handleGoogleSignIn = () => {
    setFormError(null);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const cleanUrl = baseUrl.replace(/\/$/, "");
    window.location.assign(`${cleanUrl}/auth/google`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setFormError("Please enter both your email address and password.");
      return;
    }
    if (mode === "doctor") {
      const code = hospitalCode.trim().toUpperCase();
      if (!code) {
        setFormError("Please enter your Hospital / Department Code.");
        return;
      }
      const validFormat = (code.startsWith("HOSP-") && code.length >= 6) || code.length >= 4;
      if (!validFormat) {
        setFormError(
          "Invalid hospital code format (e.g. HOSP-AIIMS-CARDIO). Contact your hospital administrator if you don't have a code."
        );
        return;
      }
    }

    setIsLoading(true);
    setFormError(null);

    try {
      const tokenResp = await login({ email: email.trim(), password });
      const user = await getMe(tokenResp.access_token);

      if (mode === "patient") {
        if (user.role === "doctor" || tokenResp.role === "doctor") {
          setFormError("Invalid email or password. Please verify your credentials and try again.");
          setIsLoading(false);
          return;
        }

        storeToken(tokenResp.access_token);
        setAuth(tokenResp.access_token, user);
        router.push("/patient/dashboard");
      } else {
        if (user.role !== "doctor" && tokenResp.role !== "doctor") {
          setFormError(
            "This portal is restricted to authorized physicians and hospital clinical staff. Please use the Patient Portal."
          );
          setIsLoading(false);
          return;
        }

        storeToken(tokenResp.access_token);
        setAuth(tokenResp.access_token, user);
        router.push("/doctor/dashboard");
      }
    } catch (err: unknown) {
      console.error("Login failed:", err);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setFormError(
            mode === "doctor"
              ? "Invalid email or password. Please verify your hospital credentials."
              : "Invalid email or password. Please verify your credentials and try again."
          );
        } else if (err.status === 403) {
          setFormError("Your account has been deactivated or restricted. Please contact your hospital administrator.");
        } else {
          setFormError(err.detail || "Authentication failed. Please try again.");
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Unable to connect to the clinical server. Please check your network connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0D1117]">
      {/* ── LEFT PANEL: Clinical Platform Identity & Trust ── */}
      <div className="lg:w-7/12 xl:w-3/5 bg-[#0D1117] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden border-r border-[#1E293B]">
        {/* Subtle clinical glow — teal, not blue */}
        <div className="animate-fade-in anim-d-0 absolute top-0 right-0 w-96 h-96 bg-[#0D5C75]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="animate-fade-in anim-d-80 absolute bottom-0 left-0 w-96 h-96 bg-[#0D5C75]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Ambient SVG ECG waveform */}
        <div className="animate-fade-in anim-d-150 absolute inset-x-0 bottom-12 opacity-[0.07] pointer-events-none flex justify-center">
          <svg className="w-full max-w-2xl h-28 text-[#0D5C75]" viewBox="0 0 800 120" fill="none" stroke="currentColor">
            <path
              d="M0 60 H200 L220 20 L240 100 L260 40 L280 80 L300 60 H500 L520 15 L540 105 L560 35 L580 85 L600 60 H800"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Header / Brand */}
        <div className="relative z-10 space-y-6">
          <div className="animate-settle-up anim-d-150 flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#0D5C75] flex items-center justify-center shadow-lg text-white border border-[#0D5C75]/60">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">CareFlow AI</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-[#0D5C75]/30 border border-[#0D5C75]/40 text-[#B3DCF0]">
                  Clinical Workstation
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">AI Clinical Intake Platform</p>
            </div>
          </div>

          <div className="animate-settle-up anim-d-220 pt-6 space-y-4 max-w-xl">
            <h1 className="text-3xl sm:text-4xl xl:text-[2.6rem] font-bold tracking-tight text-white leading-tight">
              Better patient histories.
              <br />
              <span className="text-[#B3DCF0]">More focused consultations.</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Hospital-grade conversational triage, automated multi-document clinical extraction, and doctor-in-the-loop evidence provenance.
            </p>
          </div>
        </div>

        {/* Three Trust Pillars */}
        <div className="relative z-10 py-10 space-y-3 max-w-xl animate-login-pillars">
          {[
            { Icon: Mic,        title: "Voice-Led Clinical Intake (CareVoice)", delay: "anim-d-300", desc: "Multilingual adaptive conversational intake via LiveKit WebRTC — triaging symptoms and building real-time clinical timelines." },
            { Icon: FileText,   title: "Multimodal Document Extraction",        delay: "anim-d-380", desc: "Rapid PaddleOCR and Gemini clinical parsing extracting diagnoses, medications, and laboratory values with strict evidence grounding." },
            { Icon: ShieldCheck,title: "Doctor-Governed Provenance",            delay: "anim-d-450", desc: "Immutable evidence citations linking every extracted entity back to exact document coordinates or patient consultation transcripts." },
          ].map(({ Icon, title, desc, delay }) => (
            <div key={title} className={`animate-settle-up ${delay} flex items-start gap-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.07]`}>
              <div className="w-8 h-8 rounded-md bg-[#0D5C75]/30 text-[#B3DCF0] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security / Compliance Badges */}
        <div className="animate-fade-in anim-d-530 relative z-10 pt-5 border-t border-[#1E293B] flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#0D5C75]" /><span>Hospital-Grade Infrastructure</span></div>
          <span>·</span>
          <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-[#0D5C75]" /><span>Role-Governed Access</span></div>
          <span>·</span>
          <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-[#0D5C75]" /><span>Audit-Proof Provenance</span></div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Authentication ── */}
      <div className="lg:w-5/12 xl:w-2/5 bg-[var(--bg-canvas)] flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md space-y-5">
          {/* ── Patient / Doctor Entry Toggle ── */}
          <div
            role="group"
            aria-label="Select portal type"
            className="animate-fade-in anim-d-220 flex rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)] p-1 gap-1 shadow-[var(--shadow-xs)]"
          >
            <button
              type="button"
              onClick={() => { setMode("patient"); setFormError(null); setHospitalCode(""); }}
              aria-pressed={mode === "patient"}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer animate-settle-left anim-d-300 ${
                mode === "patient"
                  ? "bg-[var(--clinical)] text-white shadow-[var(--shadow-sm)]"
                  : "text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]"
              }`}
            >
              <User className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Patient Portal</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode("doctor"); setFormError(null); }}
              aria-pressed={mode === "doctor"}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer animate-settle-right anim-d-300 ${
                mode === "doctor"
                  ? "bg-[var(--clinical)] text-white shadow-[var(--shadow-sm)]"
                  : "text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]"
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Doctor Panel</span>
            </button>
          </div>
          <p className="animate-fade-in anim-d-380 text-[11px] text-center text-[var(--ink-400)]">
            {mode === "patient"
              ? "Patient Portal · For patients and visitors"
              : "Doctor Panel · For doctors and clinical staff"}
          </p>

          {/* ── Login Card ── */}
          <div className="animate-settle-up anim-d-380 bg-[var(--bg-surface)] rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-md)] p-8 sm:p-10 space-y-6">
            {/* Card Header */}
            <div className="space-y-1">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[var(--clinical-light)] text-[var(--clinical)] mb-2 border border-[var(--clinical-mid)]">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-[var(--ink-900)]">
                {mode === "patient" ? "Sign in to CareFlow AI" : "Doctor Workstation Sign In"}
              </h2>
              <p className="text-xs text-[var(--ink-500)]">
                {mode === "patient"
                  ? "Access your clinical records and pre-consultation workspace"
                  : "Access your physician workstation and patient queue"}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div role="alert" className="p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--ink-800)] hover:bg-[var(--ink-100)] transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[var(--ink-200)]" />
              <span className="flex-shrink mx-3 text-[11px] text-[var(--ink-400)] uppercase tracking-wider font-semibold">or password</span>
              <div className="flex-grow border-t border-[var(--ink-200)]" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="animate-settle-up anim-d-450">
                <label htmlFor="email" className="block text-xs font-semibold text-[var(--ink-800)] mb-1.5">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === "patient" ? "patient@email.com" : "doctor@hospital.org"}
                  className="w-full text-xs p-3 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                />
              </div>

              <div className="animate-settle-up anim-d-530">
                <label htmlFor="password" className="block text-xs font-semibold text-[var(--ink-800)] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-3 pr-10 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] hover:text-[var(--ink-700)] cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Hospital Code — Doctor mode only */}
              {mode === "doctor" && (
                <div className="animate-settle-up anim-d-530 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="hospital-code" className="block text-xs font-semibold text-[var(--ink-800)]">
                      Hospital / Department Code
                    </label>
                    <span className="text-[10px] text-[var(--ink-500)] flex items-center gap-1">
                      <Building2 className="w-3 h-3" aria-hidden="true" /> Required
                    </span>
                  </div>
                  <input
                    id="hospital-code"
                    type="text"
                    required
                    value={hospitalCode}
                    onChange={(e) => setHospitalCode(e.target.value.toUpperCase())}
                    placeholder="HOSP-XXXX"
                    autoComplete="organization"
                    className="w-full text-xs p-3 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors font-mono"
                  />
                  <div className="flex items-start gap-1.5 p-2 rounded-md bg-[var(--status-info-bg)] border border-[var(--status-info-bd)] text-[10px] text-[var(--status-info-fg)]">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Hospital code format is validated locally. Authoritative verification is performed by your hospital administrator.</span>
                  </div>
                </div>
              )}

              <div className="animate-settle-up anim-d-600">
                <Button type="submit" size="lg" isLoading={isLoading} className="w-full mt-2 cursor-pointer">
                  <span>{mode === "patient" ? "Sign In" : "Sign In to Workstation"}</span>
                  {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </form>

            {/* Registration & Support Links */}
            <div className="animate-fade-in anim-d-600 pt-2 text-center border-t border-[var(--ink-200)] space-y-2">
              {mode === "patient" ? (
                <p className="text-xs text-[var(--ink-500)]">
                  New patient?{" "}
                  <Link href="/patient/onboarding" className="font-semibold text-[var(--clinical)] hover:text-[var(--clinical-dark)] hover:underline">
                    Register an account
                  </Link>
                </p>
              ) : (
                <p className="text-xs text-[var(--ink-500)]">
                  Not a doctor?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("patient"); setFormError(null); setHospitalCode(""); }}
                    className="font-semibold text-[var(--clinical)] hover:text-[var(--clinical-dark)] hover:underline cursor-pointer"
                  >
                    Switch to Patient Portal
                  </button>
                </p>
              )}
            </div>

            {/* Footer notice */}
            <p className="animate-fade-in anim-d-600 text-[11px] text-center text-[var(--ink-400)] leading-normal">
              Authorized hospital personnel and registered patients only. All actions are audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0D1117] text-white">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-7 h-7 text-[#0D5C75] animate-pulse" />
            <span className="text-lg font-bold tracking-wider">CareFlow AI</span>
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}


