"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Plus,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ClipboardList,
  Calendar,
  Stethoscope,
  ChevronRight,
  Sparkles,
  Activity,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientProfile, getMyEncounters, createEncounter } from "@/services/patient.service";
import { getPatientReports, getPatientDashboardMetrics } from "@/services/report.service";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse, EncounterResponse } from "@/types/patient";
import type { PatientReportSummaryItem, PatientDashboardMetrics } from "@/types/report";

const DEPARTMENTS = [
  "General Medicine",
  "General OPD",
  "Pediatrics",
  "Orthopedics",
  "Cardiology",
  "Other",
];

function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let timeStr = "Good morning";
  if (hour >= 12 && hour < 17) timeStr = "Good afternoon";
  else if (hour >= 17) timeStr = "Good evening";

  if (!name) return timeStr;
  const firstName = name.trim().split(" ")[0];
  return `${timeStr}, ${firstName}`;
}

export default function PatientDashboard() {
  const router = useRouter();
  const qc = useQueryClient();

  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Parallel TanStack Queries for instant cached loading
  const {
    data: profile,
    isLoading: isLoadingProfile,
    error: profileError,
  } = useQuery<PatientProfileResponse>({
    queryKey: ["patient", "profile"],
    queryFn: getPatientProfile,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  const {
    data: encounters = [],
    isLoading: isLoadingEncounters,
  } = useQuery<EncounterResponse[]>({
    queryKey: ["patient", "encounters"],
    queryFn: getMyEncounters,
  });

  const {
    data: reports = [],
    isLoading: isLoadingReports,
  } = useQuery<PatientReportSummaryItem[]>({
    queryKey: ["patient", "reports"],
    queryFn: getPatientReports,
  });

  const {
    data: metrics,
    isLoading: isLoadingMetrics,
  } = useQuery<PatientDashboardMetrics | null>({
    queryKey: ["patient", "metrics"],
    queryFn: () => getPatientDashboardMetrics().catch(() => null),
  });

  // Redirect to onboarding if profile does not exist yet (404)
  useEffect(() => {
    if (profileError instanceof ApiError && profileError.status === 404) {
      router.replace("/patient/onboarding");
    }
  }, [profileError, router]);

  // Create consultation mutation
  const createMutation = useMutation({
    mutationFn: (dept: string) => createEncounter({ opd_department: dept || "General OPD" }),
    onSuccess: (newEnc) => {
      qc.invalidateQueries({ queryKey: ["patient", "encounters"] });
      qc.invalidateQueries({ queryKey: ["patient", "metrics"] });
      router.push(`/patient/intake?encounter_id=${newEnc.id}`);
    },
    onError: (err: unknown) => {
      console.error("Failed to create consultation:", err);
      if (err instanceof ApiError) setActionError(err.detail);
      else setActionError("Failed to start consultation. Please try again.");
    },
  });

  // Segment encounters by state
  const activeEncounters = encounters.filter((e) => e.queue_status !== "completed");
  const primaryActiveEncounter = activeEncounters[0] || null;

  const error = actionError || (profileError && !(profileError instanceof ApiError && profileError.status === 404)
    ? "Could not load complete clinical records. Please check your connection."
    : null);

  if (isLoadingProfile) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-14 bg-gray-200 rounded-xl w-1/3" />
        <div className="h-44 bg-gray-200 rounded-2xl w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── A. WELCOME HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E4E7EC]">
        <div>
          <h1 className="text-2xl font-bold text-[#172033] tracking-tight">
            {getGreeting(profile?.full_name)}
          </h1>
          <p className="text-sm text-[#667085] mt-1">
            Let&apos;s prepare your health information before your doctor consultation.
          </p>
        </div>
        {profile?.id && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E4E7EC] text-xs text-[#667085] shadow-2xs">
            <span className="font-medium text-[#172033]">Patient UID:</span>
            <span className="font-mono text-[#155EEF] font-semibold">
              {profile.id.slice(0, 8)}...{profile.id.slice(-4)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20]">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── B. CONSULTATION STATUS HERO CARD ── */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E4E7EC] shadow-xs p-6 md:p-8">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-blue-50/60 rounded-full blur-2xl pointer-events-none" />

        {primaryActiveEncounter?.queue_status === "intake_in_progress" ? (
          /* State 1: Intake in progress */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#155EEF] border border-blue-200">
                <Clock className="w-3.5 h-3.5" />
                <span>Pre-Consultation In Progress</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                {primaryActiveEncounter.opd_department || "General OPD"} Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Your AI-guided intake has started. Complete speaking or answering questions so your physician has your full clinical summary before your visit.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`}>
                <Button size="lg" className="w-full sm:w-auto text-xs font-semibold px-6 shadow-xs cursor-pointer">
                  <span>Resume Intake</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : primaryActiveEncounter?.queue_status === "ready_for_review" ? (
          /* State 2: Ready for review */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3.5 h-3.5" />
                <span>In Doctor Review Queue</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                Intake Completed — Awaiting Doctor
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Your pre-consultation summary and uploaded evidence have been synthesized and submitted. Your physician is reviewing your chart.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Link href={`/patient/reports/${primaryActiveEncounter.id}`}>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-xs font-semibold px-6 cursor-pointer">
                  <span>View Submitted Summary</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : primaryActiveEncounter?.queue_status === "registered" ? (
          /* State 3: Registered consultation ready to start */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ready to Begin</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                {primaryActiveEncounter.opd_department || "General OPD"} Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Start your adaptive AI intake session with CareVoice or upload your medical prescriptions to prepare your chart for the doctor.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`}>
                <Button size="lg" className="w-full sm:w-auto text-xs font-semibold px-6 shadow-xs cursor-pointer">
                  <span>Begin Pre-Consultation</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* State 4: No active consultation */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-[#667085]">
                <Calendar className="w-3.5 h-3.5" />
                <span>Hospital Outpatient Intake</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                Start a New Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Create a new consultation visit to begin your AI pre-consultation triage and share documents directly with hospital doctors.
              </p>
            </div>
            <div className="relative">
              {!showDeptPicker ? (
                <Button
                  size="lg"
                  onClick={() => setShowDeptPicker(true)}
                  className="text-xs font-semibold px-6 shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  <span>Start Consultation</span>
                </Button>
              ) : (
                <div className="p-3 bg-white border border-[#E4E7EC] rounded-xl shadow-lg space-y-2 w-64">
                  <p className="text-xs font-bold text-[#172033]">Select OPD Department:</p>
                  <div className="space-y-1">
                    {DEPARTMENTS.map((dept) => (
                      <button
                        key={dept}
                        onClick={() => {
                          setShowDeptPicker(false);
                          createMutation.mutate(dept);
                        }}
                        disabled={createMutation.isPending}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#155EEF] transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>{dept}</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowDeptPicker(false)}
                    className="w-full text-center text-[11px] text-[#667085] hover:underline pt-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── C. METRIC TILES ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#667085]">Total Consultations</p>
              <p className="text-2xl font-bold text-[#172033] mt-1">
                {isLoadingEncounters ? "…" : encounters.length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155EEF] flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#667085]">Verified Reports</p>
              <p className="text-2xl font-bold text-[#172033] mt-1">
                {isLoadingReports ? "…" : reports.length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#12B76A] flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#667085]">Clinical Documents</p>
              <p className="text-2xl font-bold text-[#172033] mt-1">
                {isLoadingMetrics ? "…" : metrics?.documents_count ?? "0"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F9D8A] flex items-center justify-center">
              <FolderOpen className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── D. ACTIVE CONSULTATIONS & DOCUMENTS SHORTCUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active / Registered Consultations */}
        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardHeader className="pb-3 border-b border-[#E4E7EC]">
            <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#155EEF]" />
              <span>Active Consultations</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoadingEncounters ? (
              <div className="flex items-center gap-2 py-4 text-xs text-[#667085]">
                <Spinner className="text-[#155EEF]" /> Loading consultations…
              </div>
            ) : activeEncounters.length === 0 ? (
              <p className="text-xs text-[#667085] py-4">No ongoing consultations.</p>
            ) : (
              <div className="space-y-3">
                {activeEncounters.map((enc) => (
                  <div
                    key={enc.id}
                    className="p-3.5 rounded-xl border border-[#E4E7EC] bg-[#F7F9FC] flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#172033]">
                        {enc.opd_department || "General OPD"}
                      </p>
                      <p className="text-xs text-[#667085] mt-0.5">
                        Status: <strong className="text-[#172033]">{enc.queue_status.replace(/_/g, " ")}</strong>
                      </p>
                    </div>
                    {enc.queue_status === "ready_for_review" ? (
                      <Link
                        href={`/patient/reports/${enc.id}`}
                        className="text-xs font-semibold text-[#155EEF] hover:underline"
                      >
                        View Report →
                      </Link>
                    ) : (
                      <Link
                        href={`/patient/intake?encounter_id=${enc.id}`}
                        className="text-xs font-semibold text-[#155EEF] hover:underline"
                      >
                        Continue →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical Document Upload Banner */}
        <Card className="border-[#E4E7EC] shadow-2xs flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0F9D8A]" />
              <span>Medical Documents & History</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[#667085] leading-relaxed">
              Upload prescriptions, laboratory reports, and previous discharge summaries. The PS47 engine automatically extracts structured clinical data directly for physician review.
            </p>
            <div className="p-3 rounded-xl bg-[#F7F9FC] border border-[#E4E7EC] text-xs text-[#667085] space-y-1">
              <p className="font-medium text-[#172033]">Supported formats:</p>
              <p>Prescriptions (Rx), Lab Reports, Discharge Summaries (PDF / Images)</p>
            </div>
            <Link
              href="/patient/documents"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F9D8A] hover:underline pt-1"
            >
              <span>Manage documents</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
