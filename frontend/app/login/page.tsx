"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";
import { login, getMe } from "@/services/auth.service";
import { ApiError, storeToken, clearToken } from "@/lib/api";

type SelectedRole = "patient" | "doctor" | null;

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
      return "Google accounts cannot automatically register as doctors. Doctor access requires an existing authorized hospital account.";
    case "unauthorized_doctor":
      return "This Google account is not authorized as a hospital doctor. Please sign in with your hospital doctor credentials.";
    case "unverified_email":
      return "Your Google email address is not verified by Google. Please verify your email and try again.";
    case "invalid_state":
      return "Security verification failed (invalid OAuth state). Please try again.";
    case "account_disabled":
      return "Your account has been deactivated. Please contact your hospital administrator.";
    case "database_error":
      return "A database error occurred during sign-in. Please try again later.";
    case "google_auth_failed":
      if (detail === "access_denied") return "Sign in with Google was cancelled.";
      return detail ? `Google authentication failed: ${detail}` : "Google authentication failed. Please try again.";
    default:
      return detail || "Authentication failed. Please try again.";
  }
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [selectedRole, setSelectedRole] = useState<SelectedRole>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Derived URL error without effect
  const urlError = parseUrlError(searchParams.get("error"), searchParams.get("detail"));
  const error = formError || urlError;

  const handleGoogleSignIn = () => {
    setFormError(null);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const cleanUrl = baseUrl.replace(/\/$/, "");
    const roleParam = selectedRole ? `?role=${selectedRole}` : "";
    window.location.assign(`${cleanUrl}/auth/google${roleParam}`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRole) {
      setFormError("Please select whether you are a Patient or Doctor.");
      return;
    }
    setIsLoading(true);
    setFormError(null);
    try {
      // 1. Submit login request via centralized API client
      const tokenResp = await login({ email, password });

      // 2. Persist token immediately so getMe and future requests are authenticated
      storeToken(tokenResp.access_token);

      // 3. Backend role is authoritative — selected role is only a UI hint
      if (tokenResp.role !== selectedRole && tokenResp.role !== "admin") {
        clearToken();
        setFormError(
          `Your account role is "${tokenResp.role}", but you selected "${selectedRole}". Please select the correct role.`
        );
        setIsLoading(false);
        return;
      }

      // 4. Fetch full user profile with the authenticated token
      const user = await getMe(tokenResp.access_token);
      setAuth(tokenResp.access_token, user);

      // 5. Route to appropriate dashboard based on BACKEND role
      if (tokenResp.role === "patient") {
        router.push("/patient/dashboard");
      } else {
        router.push("/doctor/dashboard");
      }
    } catch (err) {
      clearToken();
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setFormError("Invalid email or password.");
        } else if (err.status >= 500) {
          setFormError("Server error. Please try again later.");
        } else {
          setFormError(err.detail);
        }
      } else if (err instanceof TypeError && (err as TypeError).message.includes("fetch")) {
        setFormError("Unable to connect to the server. Please check your network connection.");
      } else {
        setFormError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F7F9FC] px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <span className="text-[#155EEF] font-bold text-2xl tracking-tight">PS47</span>
          <p className="text-[#667085] text-sm mt-1">AI-assisted clinical intake before the doctor consultation</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-8">
          <h1 className="text-lg font-semibold text-[#172033] mb-6">Sign in</h1>

          {/* Role selection */}
          <p className="text-sm text-[#667085] mb-3 font-medium">I am a</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              { value: "patient" as const, label: "Patient", icon: User },
              { value: "doctor" as const, label: "Doctor", icon: Stethoscope },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setSelectedRole(value); setFormError(null); }}
                className={[
                  "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                  selectedRole === value
                    ? "border-[#155EEF] bg-blue-50 text-[#155EEF]"
                    : "border-[#E4E7EC] hover:border-gray-300 text-[#667085]",
                ].join(" ")}
              >
                <Icon className="w-6 h-6" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Error notice */}
          {error && (
            <div className="mb-5 flex items-start gap-2 text-sm text-[#D92D20] bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          {/* Real Google OAuth 2.0 / OpenID Connect Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            aria-label="Continue with Google"
            className="w-full h-11 px-4 rounded-xl border border-[#E4E7EC] bg-white hover:bg-gray-50 active:bg-gray-100 text-[#172033] font-medium text-sm flex items-center justify-center gap-3 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#155EEF] focus:ring-offset-2"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-[#E4E7EC]"></div>
            <span className="flex-shrink mx-3 text-xs text-[#667085] uppercase tracking-wider font-medium">
              or with password
            </span>
            <div className="flex-grow border-t border-[#E4E7EC]"></div>
          </div>

          {/* Existing Email/Password Login Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Password with show/hide toggle */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[#172033]">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-[#E4E7EC] bg-white px-3 pr-10 text-sm text-[#172033] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#155EEF] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#172033]"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#667085] mt-6">
          PS47 is for authorised hospital use only.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC]">
          <span className="text-[#155EEF] font-bold text-2xl">PS47</span>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}