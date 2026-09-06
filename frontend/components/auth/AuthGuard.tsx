"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { getMe } from "@/services/auth.service";
import { Spinner } from "@/components/ui/Spinner";

/**
 * AuthGuard wraps the app inside <Providers>.
 *
 * On mount:
 * 1. Reads token from localStorage.
 * 2. If token exists → calls GET /auth/me to validate.
 *    - Valid → restores full session (user, role, userId).
 *    - Invalid/expired → clears token, redirects to /login.
 * 3. If no token → marks initializing=false, lets public pages render.
 *
 * Route protection:
 * - /patient/* requires role=patient
 * - /doctor/* requires role=doctor or admin
 * - Unauthenticated access to protected routes → /login
 * - Wrong-role access → redirected to correct dashboard
 */

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isInitializing, role, setAuth, logout, hydrateFromStorage, setInitializing } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Step 1: Hydrate from storage on mount (client only)
  useEffect(() => {
    async function restore() {
      const storedToken = hydrateFromStorage();
      if (storedToken) {
        try {
          const user = await getMe();
          setAuth(storedToken, user);
        } catch {
          // Token invalid or expired
          logout();
        }
      } else {
        setInitializing(false);
      }
      setHydrated(true);
    }
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2: Route protection after hydration
  useEffect(() => {
    if (!hydrated || isInitializing) return;

    const isPublic = PUBLIC_PATHS.includes(pathname);
    const isPatientRoute = pathname.startsWith("/patient");
    const isDoctorRoute = pathname.startsWith("/doctor");

    if (!isAuthenticated) {
      if (!isPublic) router.replace("/login");
      return;
    }

    // Authenticated user on login page → redirect to their dashboard
    if (pathname === "/login" || pathname === "/") {
      router.replace(role === "patient" ? "/patient/dashboard" : "/doctor/dashboard");
      return;
    }

    // Role enforcement
    if (isPatientRoute && role !== "patient") {
      router.replace("/doctor/dashboard");
      return;
    }
    if (isDoctorRoute && role !== "doctor" && role !== "admin") {
      router.replace("/patient/dashboard");
      return;
    }
  }, [hydrated, isInitializing, isAuthenticated, role, pathname, router]);

  // Show secure loading state while checking session
  if (!hydrated || isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)]">
        <span className="text-[var(--clinical)] font-bold text-2xl mb-4 tracking-tight">CareFlow AI</span>
        <div className="flex items-center gap-3 text-[var(--ink-500)]">
          <Spinner className="text-[var(--clinical)]" />
          <span className="text-sm font-medium">Checking your secure session…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}