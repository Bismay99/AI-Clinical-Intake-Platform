"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
  const [encounters, setEncounters] = useState<EncounterResponse[]>([]);
  const [reports, setReports] = useState<PatientReportSummaryItem[]>([]);
  const [metrics, setMetrics] = useState<PatientDashboardMetrics | null>(null);

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingEncounters, setIsLoadingEncounters] = useState(true);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Load profile
  useEffect(() => {
    async function loadProfile() {
      try {
        const p = await getPatientProfile();
        setProfile(p);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/patient/onboarding");
          return;
        }
        setError("Could not load your profile. Please check your connection.");
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  // 2. Load encounters, reports, and metrics
  useEffect(() => {
    if (!profile) return;

    async function loadDashboardData() {
      try {
        const [encList, repList, met] = await Promise.all([
          getMyEncounters(),
          getPatientReports(),
          getPatientDashboardMetrics().catch(() => null),
        ]);
        setEncounters(encList);
        setReports(repList);
        setMetrics(met);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setIsLoadingEncounters(false);
        setIsLoadingReports(false);
      }
    }
    loadDashboardData();
  }, [profile]);

  async function handleCreateEncounter(dept: string) {
    setIsCreating(true);
    setError(null);
    setShowDeptPicker(false);
    try {
      const enc = await createEncounter({ opd_department: dept || null });
      setEncounters((prev) => [enc, ...prev]);
      if (metrics) {
        setMetrics({ ...metrics, consultations_count: metrics.consultations_count + 1 });
      }
      router.push(`/patient/intake?encounter_id=${enc.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Failed to create consultation. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  // Segment encounters by clinical state
  const activeEncounters = encounters.filter((e) => e.queue_status !== "completed");
  const primaryActiveEncounter = activeEncounters[0] || null;

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-[#667085] bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-xs">
          <Spinner className="text-[#155EEF]" />
          <span className="text-sm font-medium">Connecting to hospital portal…</span>
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
            <span className="font-mono text-[#155EEF] font-semibold">{profile.id.slice(0, 8)}...{profile.id.slice(-4)}</span>
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
                Continue Pre-Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Your pre-consultation for <strong className="text-[#172033]">{primaryActiveEncounter.opd_department || "General OPD"}</strong> is currently in progress. Complete your medical history questions before meeting your doctor.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => router.push(`/patient/intake?encounter_id=${primaryActiveEncounter.id}`)}
              className="w-full sm:w-auto bg-[#155EEF] hover:bg-[#124bbf] px-8 text-sm font-semibold shadow-xs flex items-center justify-center gap-2"
            >
              <span>Continue Consultation</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : primaryActiveEncounter?.queue_status === "ready_for_review" ? (
          /* State 2: Ready for Doctor Review */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Awaiting Doctor Review</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                Pre-Consultation Complete
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Your medical history for <strong className="text-[#172033]">{primaryActiveEncounter.opd_department || "General OPD"}</strong> has been securely submitted and is waiting for doctor review. You can inspect your persistent clinical report below.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => router.push(`/patient/reports/${primaryActiveEncounter.id}`)}
                className="w-full sm:w-auto border-[#155EEF] text-[#155EEF] hover:bg-blue-50 px-6 text-sm font-semibold"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                View Report
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => router.push(`/patient/intake?encounter_id=${primaryActiveEncounter.id}`)}
                className="w-full sm:w-auto px-6 text-sm font-medium"
              >
                View Status
              </Button>
            </div>
          </div>
        ) : primaryActiveEncounter?.queue_status === "registered" ? (
          /* State 3: Registered, not started */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#155EEF] border border-blue-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ready to Begin</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                Start Your Pre-Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                You have a registered consultation for <strong className="text-[#172033]">{primaryActiveEncounter.opd_department || "General OPD"}</strong>. Speak with CareVoice AI or answer by text to organize your clinical history.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => router.push(`/patient/intake?encounter_id=${primaryActiveEncounter.id}`)}
              className="w-full sm:w-auto bg-[#155EEF] hover:bg-[#124bbf] px-8 text-sm font-semibold shadow-xs flex items-center justify-center gap-2"
            >
              <span>Begin Pre-Consultation</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          /* State 4: No active encounter */
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hospital Ready</span>
              </div>
              <h2 className="text-xl font-bold text-[#172033]">
                Start New Consultation
              </h2>
              <p className="text-sm text-[#667085] leading-relaxed">
                Begin a new clinical pre-consultation session. Your symptoms and documents will be structured into a confidential medical report for your physician.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setShowDeptPicker(true)}
              isLoading={isCreating}
              className="w-full sm:w-auto bg-[#155EEF] hover:bg-[#124bbf] px-8 text-sm font-semibold shadow-xs flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Start Pre-Consultation</span>
            </Button>
          </div>
        )}
      </div>

      {/* Department picker modal */}
      {showDeptPicker && (
        <Card className="border-[#155EEF] border-opacity-40 shadow-sm animate-fadeIn">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#172033] flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-[#155EEF]" />
              Select OPD Clinical Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept}
                  onClick={() => handleCreateEncounter(dept)}
                  className="p-3.5 rounded-xl border border-[#E4E7EC] text-sm font-medium text-[#172033] hover:bg-blue-50 hover:border-[#155EEF] hover:text-[#155EEF] transition-all text-left flex items-center justify-between"
                >
                  <span>{dept}</span>
                  <ChevronRight className="w-4 h-4 text-[#667085]" />
                </button>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[#E4E7EC] flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowDeptPicker(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── C. HEALTH OVERVIEW METRIC CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#155EEF] flex-shrink-0">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">Consultations</p>
              <p className="text-2xl font-bold text-[#172033] mt-0.5">
                {isLoadingEncounters ? "..." : (metrics?.consultations_count ?? encounters.length)}
              </p>
              <p className="text-xs text-[#667085] mt-0.5">Total registered encounters</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-[#0F9D8A] flex-shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">Health Reports</p>
              <p className="text-2xl font-bold text-[#172033] mt-0.5">
                {isLoadingReports ? "..." : (metrics?.reports_count ?? reports.length)}
              </p>
              <p className="text-xs text-[#667085] mt-0.5">Completed pre-consultations</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-2xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">Medical Documents</p>
              <p className="text-2xl font-bold text-[#172033] mt-0.5">
                {metrics ? metrics.documents_count : "0"}
              </p>
              <p className="text-xs text-[#667085] mt-0.5">Uploaded files & records</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── D. HEALTH REPORTS SECTION ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[#E4E7EC]">
          <div>
            <CardTitle className="text-base font-bold text-[#172033] flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#155EEF]" />
              <span>Health Reports</span>
            </CardTitle>
            <p className="text-xs text-[#667085] mt-0.5">
              Structured pre-consultation reports generated from your AI and clinical intake.
            </p>
          </div>
          {reports.length > 0 && (
            <Link
              href="/patient/reports"
              className="text-xs font-semibold text-[#155EEF] hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {isLoadingReports ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[#667085]">
              <Spinner className="text-[#155EEF]" /> Loading reports…
            </div>
          ) : reports.length === 0 ? (
            <div className="py-8 text-center max-w-sm mx-auto">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#155EEF] flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#172033]">No health reports yet</h3>
              <p className="text-xs text-[#667085] mt-1 mb-4">
                Complete a clinical pre-consultation to generate your first structured medical report.
              </p>
              <Button size="sm" onClick={() => setShowDeptPicker(true)}>
                Start Pre-Consultation
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E7EC]">
              {reports.slice(0, 3).map((rep) => (
                <div key={rep.encounter_id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#172033]">
                        {rep.opd_department || "General OPD"} Pre-Consultation
                      </span>
                      <Badge
                        variant={rep.queue_status === "completed" ? "success" : "warning"}
                        className="text-[10px] px-2 py-0.5"
                      >
                        {rep.doctor_review_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#667085]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {rep.consultation_date}
                      </span>
                      <span>•</span>
                      <span>{rep.total_entities} clinical entities</span>
                    </div>
                    {rep.summary_preview && (
                      <p className="text-xs text-[#667085] line-clamp-1 italic max-w-lg">
                        &ldquo;{rep.summary_preview}&rdquo;
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/patient/reports/${rep.encounter_id}`}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#155EEF] hover:underline bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                  >
                    <span>View Report</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── E. RECENT ACTIVITY & ACTIVE CONSULTATIONS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
