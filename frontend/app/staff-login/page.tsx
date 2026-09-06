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
      return "This account is not mapped to an active hospital physician. Please sign in with your hospital-issued credentials.";
    case "unverified_email":
      return "Your Google email address is unverified. Please verify your email before signing in.";
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
      return detail || "Authentication failed. Please verify your hospital credentials.";
  }
}

function StaffLoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    if (!email.trim() || !password || !hospitalCode.trim()) {
      setFormError("Please enter your email, password, and hospital / department code.");
      return;
    }

    setIsLoading(true);
    setFormError(null);

    try {
      const tokenResp = await login({ email: email.trim(), password });
      const user = await getMe(tokenResp.access_token);

      if (user.role !== "doctor" && tokenResp.role !== "doctor") {
        setFormError(
          "This staff portal is restricted to authorized physicians and hospital clinical staff. Please use the Patient Sign In."
        );
        setIsLoading(false);
        return;
      }

      storeToken(tokenResp.access_token);
      setAuth(tokenResp.access_token, user);
      router.push("/doctor/dashboard");
    } catch (err: unknown) {
      console.error("Staff login failed:", err);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setFormError("Invalid email or password. Please verify your hospital credentials.");
        } else if (err.status === 403) {
          setFormError("Your doctor account has been deactivated or restricted. Contact hospital administration.");
        } else {
          setFormError(err.detail || "Authentication failed. Please try again.");
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Unable to connect to the hospital clinical server. Please check your network connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email.trim().length > 0 && password.length > 0 && hospitalCode.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#0D1117]">
      <div className="lg:w-1/2 p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#21262D]">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[var(--clinical)] flex items-center justify-center text-white shadow-xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">CareFlow AI</span>
              <span className="ml-2 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#161B22] text-[var(--clinical)] border border-[#30363D]">
                Clinical Workstation
              </span>
            </div>
          </div>
          <p className="text-xs text-[#8B949E] mt-1">Hospital Staff &amp; Physician Intake Portal</p>

          <div className="mt-12 lg:mt-20">
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
              Hospital Clinical Command Center
            </h1>
            <p className="text-sm text-[#8B949E] mt-3 leading-relaxed max-w-lg">
              Authorized clinical workstation for reviewing voice-led intake, multimodal document
              extractions, and physician-governed evidence validation.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-[#161B22] border border-[#30363D] flex items-center justify-center text-[var(--clinical)] flex-shrink-0 mt-0.5">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Voice-Led Clinical Intake</p>
                  <p className="text-xs text-[#8B949E]">
                    Real-time turn-based conversational history with Hindi, Hinglish, and English capture.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-[#161B22] border border-[#30363D] flex items-center justify-center text-[var(--clinical)] flex-shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Multimodal Document Extraction</p>
                  <p className="text-xs text-[#8B949E]">
                    OCR &amp; LLM extraction with full text provenance, bounding coordinates, and confidence scores.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-[#161B22] border border-[#30363D] flex items-center justify-center text-[var(--clinical)] flex-shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--status-success-fg)]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Doctor-Governed Provenance</p>
                  <p className="text-xs text-[#8B949E]">
                    4-state verification semantics (Accept, Edit, Reject) with complete audit logging.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[#21262D] flex items-center justify-between text-xs text-[#8B949E]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--status-success-fg)]" />
            <span>Clinical Workstation Active</span>
          </div>
          <span className="font-mono text-[11px] text-[#484F58]">v2.4-CLINICAL</span>
        </div>
      </div>

      <div className="lg:w-1/2 p-8 lg:p-14 flex items-center justify-center bg-[#0D1117]">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Doctor / Staff Sign In</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#161B22] text-[#58A6FF] border border-[#30363D]">
                Hospital Staff
              </span>
            </div>
            <p className="text-xs text-[#8B949E]">
              Enter your hospital credentials to access the physician workspace.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-md bg-[#2D1B1B] border border-[#F85149]/40 text-xs text-[#F85149] flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-md border border-[#30363D] bg-[#161B22] text-xs font-semibold text-white hover:bg-[#21262D] hover:border-[#484F58] focus:outline-none focus:ring-1 focus:ring-[var(--clinical)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Continue with Google Workspace</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#21262D]" />
            <span className="text-[11px] font-medium text-[#484F58] uppercase tracking-wider">
              Or with Hospital Credentials
            </span>
            <div className="flex-1 h-px bg-[#21262D]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="staff-email" className="block text-xs font-semibold text-[#C9D1D9]">
                Email Address
              </label>
              <input
                id="staff-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="w-full text-xs px-3 py-2.5 rounded-md border border-[#30363D] bg-[#161B22] text-white placeholder-[#484F58] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="staff-password" className="block text-xs font-semibold text-[#C9D1D9]">
                Password
              </label>
              <div className="relative">
                <input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs px-3 py-2.5 pr-9 rounded-md border border-[#30363D] bg-[#161B22] text-white placeholder-[#484F58] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#484F58] hover:text-[#8B949E] focus:outline-none cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="staff-hospital-code" className="block text-xs font-semibold text-[#C9D1D9]">
                  Hospital / Department Code
                </label>
                <span className="text-[10px] text-[#8B949E] flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Required
                </span>
              </div>
              <input
                id="staff-hospital-code"
                type="text"
                required
                value={hospitalCode}
                onChange={(e) => setHospitalCode(e.target.value)}
                placeholder="e.g. HOSP-9842 or GENERAL-OPD"
                className="w-full text-xs px-3 py-2.5 rounded-md border border-[#30363D] bg-[#161B22] text-white placeholder-[#484F58] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors font-mono"
              />
              <p className="text-[11px] text-[#8B949E]">
                Provided by your hospital administrator.
              </p>
            </div>

            <Button
              type="submit"
              size="md"
              disabled={isLoading || !isFormValid}
              isLoading={isLoading}
              className="w-full text-xs font-semibold cursor-pointer mt-2"
            >
              Sign In to Workstation
            </Button>
          </form>

          <div className="pt-2 text-center border-t border-[#21262D]">
            <p className="text-xs text-[#8B949E]">
              Are you a patient?{" "}
              <Link
                href="/login"
                className="text-[var(--clinical)] hover:underline font-semibold inline-flex items-center gap-1"
              >
                <span>Patient Sign In</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </p>
          </div>

          <div className="p-3 rounded-md bg-[#161B22] border border-[#21262D] text-[11px] text-[#8B949E] flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-[var(--clinical)] flex-shrink-0 mt-0.5" />
            <p>
              Authorized hospital personnel and verified clinical staff only. All sign-in attempts and
              clinical actions are immutably audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0D1117] text-[#8B949E] text-xs">
          Loading CareFlow AI Staff Portal…
        </div>
      }
    >
      <StaffLoginFormContent />
    </Suspense>
  );
}
