"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope } from "lucide-react";

function StaffLoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("role", "doctor");
    router.replace(`/login?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D1117] text-white">
      <div className="flex items-center gap-3">
        <Stethoscope className="w-6 h-6 text-[#0D5C75] animate-pulse" />
        <span className="text-sm font-semibold tracking-wide">
          Connecting to CareFlow AI Physician Workstation…
        </span>
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0D1117] text-white text-xs">
          Loading Physician Workstation…
        </div>
      }
    >
      <StaffLoginRedirect />
    </Suspense>
  );
}
