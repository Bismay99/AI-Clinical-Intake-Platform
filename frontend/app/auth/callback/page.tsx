"use client";
import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth.store";
import { exchangeGoogleTicket, getMe } from "@/services/auth.service";
import { storeToken, clearToken, ApiError } from "@/lib/api";

function formatGoogleError(error: string | null, detail: string | null): string {
  switch (error) {
    case "doctor_account_required":
      return "Google accounts cannot automatically register as doctors. Doctor access requires an existing authorized hospital account.";
    case "unauthorized_doctor":
      return "This Google account is not authorized as a hospital doctor. Please sign in with your hospital doctor credentials.";
    case "unverified_email":
      return "Your Google email address is not verified by Google. Please verify your email and try again.";
    case "invalid_state":
      return "Security verification failed (invalid OAuth state). Please return to sign in and try again.";
    case "account_disabled":
      return "Your account has been deactivated. Please contact your hospital administrator.";
    case "database_error":
      return "A database error occurred during sign-in. Please try again later.";
    case "google_auth_failed":
      if (detail === "access_denied") {
        return "Sign in was cancelled.";
      }
      return detail ? `Google authentication failed: ${detail}` : "Google authentication failed. Please try again.";
    default:
      return detail || "An unexpected error occurred during Google sign-in. Please try again.";
  }
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const errorParam = searchParams.get("error");
  const detailParam = searchParams.get("detail");
  const urlError = errorParam ? formatGoogleError(errorParam, detailParam) : null;

  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const errorMessage = exchangeError || urlError;

  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current || errorParam) return;
    processedRef.current = true;

    const ticket = searchParams.get("ticket");
    if (!ticket) {
      router.replace("/login");
      return;
    }

    async function handleExchange(ticketCode: string) {
      try {
        // 1. Redeem single-use exchange ticket
        const tokenResp = await exchangeGoogleTicket(ticketCode);

        // 2. Persist access token
        storeToken(tokenResp.access_token);

        // 3. Fetch full profile with verified token
        const user = await getMe(tokenResp.access_token);
        setAuth(tokenResp.access_token, user);

        // 4. Route based on backend authoritative role
        if (tokenResp.role === "patient") {
          router.replace("/patient/dashboard");
        } else {
          router.replace("/doctor/dashboard");
        }
      } catch (err) {
        clearToken();
        if (err instanceof ApiError) {
          setExchangeError(err.detail);
        } else {
          setExchangeError("Failed to complete authentication with Google. Please try again.");
        }
      }
    }

    handleExchange(ticket);
  }, [errorParam, router, searchParams, setAuth]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 text-[#D92D20]">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-[#172033] mb-2">Sign-in Notice</h1>
          <p className="text-sm text-[#667085] mb-6 leading-relaxed">
            {errorMessage}
          </p>
          <Button onClick={() => router.push("/login")} variant="secondary" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)]">
      <span className="text-[var(--clinical)] font-bold text-2xl mb-4 tracking-tight">CareFlow AI</span>
      <div className="flex items-center gap-3 text-[var(--ink-500)]">
        <Spinner className="text-[var(--clinical)]" />
        <span className="text-sm font-medium">Completing secure sign-in with Google…</span>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)]">
          <span className="text-[var(--clinical)] font-bold text-2xl mb-4 tracking-tight">CareFlow AI</span>
          <div className="flex items-center gap-3 text-[var(--ink-500)]">
            <Spinner className="text-[var(--clinical)]" />
            <span className="text-sm font-medium">Loading…</span>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}