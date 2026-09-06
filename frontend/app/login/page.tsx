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
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth.store";
import { login, getMe } from "@/services/auth.service";
import { ApiError, storeToken } from "@/lib/api";

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
      return "This Google account is not mapped to an active hospital physician. Please sign in with your hospital-issued credentials.";
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const urlError = parseUrlError(searchParams.get("error"), searchParams.get("detail"));
  const error = formError || urlError;

  const handleGoogleSignIn = () => {
    setFormError(null);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const cleanUrl = baseUrl.replace(/\/$/, "");
    // Role is determined authoritatively by the backend upon exchange
    window.location.assign(`${cleanUrl}/auth/google`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setFormError("Please enter both your email address and password.");
      return;
    }

    setIsLoading(true);
    setFormError(null);

    try {
      // 1. Submit login request
      const tokenResp = await login({ email: email.trim(), password });

      // 2. Persist access token
      storeToken(tokenResp.access_token);

      // 3. Fetch authoritative user profile
      const user = await getMe(tokenResp.access_token);
      setAuth(tokenResp.access_token, user);

      // 4. Authoritative routing based on account role (NO frontend role toggle)
      if (user.role === "doctor" || tokenResp.role === "doctor") {
        router.push("/doctor/dashboard");
      } else {
        router.push("/patient/dashboard");
      }
    } catch (err: unknown) {
      console.error("Login failed:", err);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setFormError("Invalid email or password. Please verify your credentials and try again.");
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F9FC]">
      {/* ── LEFT PANEL: Clinical Platform Identity & Trust ── */}
      <div className="lg:w-7/12 xl:w-3/5 bg-[#0A1128] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden border-r border-slate-800 shadow-2xl">
        {/* Subtle decorative medical gradient and pulse waveform */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Ambient SVG waveform in background */}
        <div className="absolute inset-x-0 bottom-12 opacity-10 pointer-events-none flex justify-center">
          <svg className="w-full max-w-2xl h-28 text-teal-400" viewBox="0 0 800 120" fill="none" stroke="currentColor">
            <path
              d="M0 60 H200 L220 20 L240 100 L260 40 L280 80 L300 60 H500 L520 15 L540 105 L560 35 L580 85 L600 60 H800"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Header / Brand */}
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#155EEF] to-[#0F9D8A] flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white font-mono">PS47</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-blue-500/20 border border-blue-400/30 text-blue-300">
                  Clinical Workstation
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">AI Clinical Intake Platform</p>
            </div>
          </div>

          <div className="pt-6 space-y-4 max-w-xl">
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Transforming Clinical Intake with{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-teal-300 to-cyan-200">
                Ambient Intelligence
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Hospital-grade conversational triage, automated multi-document clinical extraction, and doctor-in-the-loop evidence provenance.
            </p>
          </div>
        </div>

        {/* Three Trust Pillars */}
        <div className="relative z-10 py-10 space-y-4 max-w-xl">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Ambient Voice Intake (CareVoice)</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Multilingual adaptive conversational intake via LiveKit WebRTC, triaging symptoms and building real-time clinical timelines.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Multimodal Clinical Extraction</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Rapid PaddleOCR and Gemini clinical parsing extracting diagnoses, medications, and laboratory values with strict grounding.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Doctor-Governed Provenance</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Immutable evidence citations linking every extracted entity back to exact document coordinates or patient consultation transcripts.
              </p>
            </div>
          </div>
        </div>

        {/* Security / Compliance Badges */}
        <div className="relative z-10 pt-6 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Hospital-Grade Infrastructure</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            <span>Role-Governed Access</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Audit-Proof Provenance</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Authentication Card ── */}
      <div className="lg:w-5/12 xl:w-2/5 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-xl p-8 sm:p-10 space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-[#155EEF] mb-1">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-[#172033]">Sign In to Portal</h2>
            <p className="text-xs text-[#667085]">
              Access your clinical records or hospital workstation
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#D92D20] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-[#E4E7EC] bg-white text-xs font-semibold text-[#172033] hover:bg-gray-50 transition-all shadow-2xs cursor-pointer"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#E4E7EC]"></div>
            <span className="flex-shrink mx-3 text-[11px] text-[#667085] uppercase tracking-wider font-semibold">
              or sign in with password
            </span>
            <div className="flex-grow border-t border-[#E4E7EC]"></div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#172033] mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org or patient@email.com"
                className="w-full text-xs p-3 rounded-xl border border-[#E4E7EC] bg-white text-[#172033] placeholder:text-gray-400 focus:outline-none focus:border-[#155EEF] focus:ring-1 focus:ring-[#155EEF] transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-[#172033]">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs p-3 pr-10 rounded-xl border border-[#E4E7EC] bg-white text-[#172033] placeholder:text-gray-400 focus:outline-none focus:border-[#155EEF] focus:ring-1 focus:ring-[#155EEF] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              isLoading={isLoading}
              className="w-full text-xs font-semibold py-3 rounded-xl shadow-xs mt-2 cursor-pointer"
            >
              <span>Sign In to Portal</span>
              {!isLoading && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
            </Button>
          </form>

          {/* Registration CTA for patients */}
          <div className="pt-2 text-center border-t border-[#E4E7EC]/60">
            <p className="text-xs text-[#667085]">
              New patient?{" "}
              <Link
                href="/register"
                className="font-semibold text-[#155EEF] hover:text-[#004EEB] hover:underline"
              >
                Register an account
              </Link>
            </p>
          </div>

          {/* Footer Security Notice */}
          <p className="text-[11px] text-center text-[#667085]/80 leading-normal">
            Authorized hospital personnel and registered patients only. All system actions are monitored and audited for data protection.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0A1128] text-white">
          <div className="flex items-center gap-3">
            <Stethoscope className="w-7 h-7 text-teal-400 animate-pulse" />
            <span className="text-lg font-bold font-mono tracking-wider">PS47</span>
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
