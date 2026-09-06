"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Calendar,
  Phone,
  Globe,
  Hash,
  Mail,
  Shield,
  FileText,
  ClipboardList,
  LogOut,
  ArrowRight,
  Fingerprint,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { getPatientProfile } from "@/services/patient.service";
import { getPatientDashboardMetrics } from "@/services/report.service";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse } from "@/types/patient";
import type { PatientDashboardMetrics } from "@/types/report";

function languageLabel(code: string): string {
  switch (code) {
    case "en": return "English";
    case "hi": return "Hindi";
    case "hinglish": return "Hinglish";
    default: return code;
  }
}

export default function PatientProfile() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
  const [metrics, setMetrics] = useState<PatientDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [p, met] = await Promise.all([
          getPatientProfile(),
          getPatientDashboardMetrics().catch(() => null),
        ]);
        setProfile(p);
        setMetrics(met);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/patient/onboarding");
          return;
        }
        setError("Could not load your profile details.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-[#667085] bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-xs">
          <Spinner className="text-[#155EEF]" />
          <span className="text-sm font-medium">Loading patient profile…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20]">{error}</div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="pb-3 border-b border-[#E4E7EC]">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
          <User className="w-6 h-6 text-[#155EEF]" />
          <span>Patient Profile</span>
        </h1>
        <p className="text-sm text-[#667085] mt-1">
          Your registered identity and clinical healthcare portal credentials.
        </p>
      </div>

      {/* ── Section 1: Personal & Demographic Information ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7EC]">
          <CardTitle className="text-sm font-bold text-[#172033]">
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 divide-y divide-[#E4E7EC]">
          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Full Name</span>
            </div>
            <span className="text-sm font-medium text-[#172033]">{profile.full_name}</span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Email Address</span>
            </div>
            <span className="text-sm text-[#172033]">{user?.email || "Not available"}</span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Fingerprint className="w-4 h-4 text-[#155EEF]" />
              <span className="text-xs font-semibold text-[#667085]">Patient UID</span>
            </div>
            <span className="font-mono text-xs text-[#155EEF] font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {profile.id}
            </span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Date of Birth</span>
            </div>
            <span className="text-sm text-[#172033]">{profile.date_of_birth || "Not provided"}</span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Gender</span>
            </div>
            <span className="text-sm text-[#172033] capitalize">{profile.gender || "Not provided"}</span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Phone</span>
            </div>
            <span className="text-sm text-[#172033]">{profile.phone || "Not provided"}</span>
          </div>

          <div className="py-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-[#667085]" />
              <span className="text-xs font-semibold text-[#667085]">Preferred Language</span>
            </div>
            <span className="text-sm text-[#172033]">{languageLabel(profile.preferred_language)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Health Identity & Hospital Integration ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7EC]">
          <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#0F9D8A]" />
            <span>Health Identity & Hospital Integration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-[#667085]">Hospital Identifier (HIS):</span>
            <span className="font-mono text-[#172033] font-medium">
              {profile.hospital_identifier || "Assigned by hospital on check-in"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-[#667085]">ABHA Health ID:</span>
            <span className="text-[#667085] italic">Not linked yet</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Clinical Records Quick Access ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#155EEF]" />
                <span className="text-xs font-bold text-[#172033]">Health Reports</span>
              </div>
              <p className="text-xs text-[#667085]">
                {metrics ? `${metrics.reports_count} completed reports` : "View past reports"}
              </p>
            </div>
            <Link
              href="/patient/reports"
              className="text-xs font-semibold text-[#155EEF] hover:underline flex items-center gap-1"
            >
              <span>View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0F9D8A]" />
                <span className="text-xs font-bold text-[#172033]">Medical Documents</span>
              </div>
              <p className="text-xs text-[#667085]">
                {metrics ? `${metrics.documents_count} uploaded files` : "Manage files"}
              </p>
            </div>
            <Link
              href="/patient/documents"
              className="text-xs font-semibold text-[#0F9D8A] hover:underline flex items-center gap-1"
            >
              <span>View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Security & Sign Out ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#172033]">Security & Account Session</p>
            <p className="text-xs text-[#667085] mt-0.5">
              Securely terminate your current session on this device.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-[#D92D20] border-red-200 hover:bg-red-50 flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
