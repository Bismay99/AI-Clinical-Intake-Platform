"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ClipboardList,
  Calendar,
  ChevronRight,
  Activity,
  FolderOpen,
  ShieldCheck,
  User,
  Upload,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientProfile, getMyEncounters, createEncounter } from "@/services/patient.service";
import { getPatientReports, getPatientDashboardMetrics, getPatientDocuments } from "@/services/report.service";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse, EncounterResponse } from "@/types/patient";
import type { PatientReportSummaryItem, PatientDashboardMetrics, PatientDocumentItem } from "@/types/report";

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

  // 1. Parallel TanStack Queries
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

  const {
    data: documents = [],
    isLoading: isLoadingDocuments,
  } = useQuery<PatientDocumentItem[]>({
    queryKey: ["patient", "documents"],
    queryFn: () => getPatientDocuments().catch(() => []),
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
  const completedEncounters = encounters.filter((e) => e.queue_status === "completed");
  const primaryActiveEncounter = activeEncounters[0] || null;

  // Build a real chronological activity log from actual records
  interface ActivityItem {
    id: string;
    date: string;
    rawDate: number;
    title: string;
    description: string;
    badgeText: string;
    badgeVariant: "info" | "success" | "pending" | "neutral";
    link?: string;
  }

  const activityList: ActivityItem[] = [];

  encounters.forEach((enc) => {
    const d = enc.scheduled_at ? new Date(enc.scheduled_at) : new Date();
    activityList.push({
      id: `enc-${enc.id}`,
      rawDate: d.getTime(),
      date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      title: `${enc.opd_department || "General OPD"} Consultation`,
      description: `Status: ${enc.queue_status.replace(/_/g, " ")}`,
      badgeText: enc.queue_status === "completed" ? "Completed" : enc.queue_status === "ready_for_review" ? "Awaiting Review" : "Active",
      badgeVariant: enc.queue_status === "completed" ? "success" : enc.queue_status === "ready_for_review" ? "pending" : "info",
      link: enc.queue_status === "ready_for_review" || enc.queue_status === "completed" ? `/patient/reports/${enc.id}` : `/patient/intake?encounter_id=${enc.id}`,
    });
  });

  documents.forEach((doc) => {
    const d = new Date(doc.upload_timestamp || 0);
    activityList.push({
      id: `doc-${doc.id}`,
      rawDate: d.getTime(),
      date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      title: doc.original_filename || doc.filename || "Medical Document",
      description: doc.processing_status === "processed"
        ? `Processed · ${doc.extracted_entity_count ?? doc.entity_count ?? 0} facts extracted`
        : doc.processing_status === "failed"
        ? `Extraction issue · ${doc.processing_error || "Please check format"}`
        : "OCR & clinical analysis underway…",
      badgeText: doc.processing_status === "processed" ? "Processed" : doc.processing_status === "failed" ? "Failed" : "Extracting",
      badgeVariant: doc.processing_status === "processed" ? "success" : doc.processing_status === "failed" ? "neutral" : "pending",
      link: "/patient/documents",
    });
  });

  activityList.sort((a, b) => b.rawDate - a.rawDate);
  const recentActivities = activityList.slice(0, 5);

  const error = actionError || (profileError && !(profileError instanceof ApiError && profileError.status === 404)
    ? "Could not load complete clinical records. Please check your connection."
    : null);

  if (isLoadingProfile && encounters.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-[var(--ink-200)] rounded-md w-1/3" />
        <div className="h-40 bg-[var(--ink-200)] rounded-md w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-20 bg-[var(--ink-200)] rounded-md" />
          <div className="h-20 bg-[var(--ink-200)] rounded-md" />
          <div className="h-20 bg-[var(--ink-200)] rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── SECTION A: CONTEXT HEADER ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--ink-200)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              {getGreeting(profile?.full_name)}
            </h1>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-[var(--ink-400)]" />
            <span className="hidden sm:inline text-xs font-semibold text-[var(--clinical)]">Patient Portal</span>
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            AI Clinical Intake Workstation · Prepare symptoms and document evidence for your physician.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--ink-200)] text-[var(--ink-700)] shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-[var(--clinical)]" />
            <span className="font-medium text-[11px]">
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
          {profile?.id && (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--ink-200)] text-[11px] text-[var(--ink-700)] shadow-xs">
              <span className="text-[var(--ink-400)]">UID:</span>
              <span className="font-mono text-[var(--clinical)] font-semibold">
                {profile.id.slice(0, 8)}
              </span>
            </div>
          )}
          <Link
            href="/patient/profile"
            className="p-1.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-500)] hover:text-[var(--clinical)] hover:bg-[var(--bg-surface-2)] transition-colors"
            title="Account Profile"
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── SECTION B: DOMINANT CURRENT VISIT WORKSPACE ── */}
      <section className="rounded-lg bg-[var(--bg-surface)] border border-[var(--clinical-mid)] shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--clinical-light)] border-b border-[var(--clinical-mid)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--clinical)] animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--clinical)]">
              Current Visit
            </h2>
          </div>
          {primaryActiveEncounter && (
            <span className="text-[11px] font-mono font-semibold text-[var(--clinical-dark)] bg-white px-2 py-0.5 rounded border border-[var(--clinical-mid)]">
              #{primaryActiveEncounter.id.slice(0, 8)}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-5">
          {primaryActiveEncounter?.queue_status === "intake_in_progress" ? (
            /* State 1: Intake in progress */
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--ink-900)]">
                      {primaryActiveEncounter.opd_department || "General OPD"} Consultation
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                      <Clock className="w-2.5 h-2.5" /> Pre-Consultation Active
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                    CareVoice intake assistant is actively capturing your symptoms. Answer questions by voice or text to prepare your record for the physician.
                  </p>
                </div>
                <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`} className="flex-shrink-0">
                  <Button size="md" className="w-full sm:w-auto font-semibold cursor-pointer">
                    <span>Continue Intake</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </div>

              {/* Progress Pipeline */}
              <div className="pt-2 border-t border-[var(--ink-200)] flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-[var(--clinical)] font-semibold">
                  <span className="w-5 h-5 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center font-bold text-[10px] border border-[var(--clinical-mid)]">1</span>
                  <span>History Intake (In Progress)</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--ink-400)]">
                  <span className="w-5 h-5 rounded-full border border-[var(--ink-200)] flex items-center justify-center text-[10px]">2</span>
                  <span>Document Extraction</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--ink-400)]">
                  <span className="w-5 h-5 rounded-full border border-[var(--ink-200)] flex items-center justify-center text-[10px]">3</span>
                  <span>Doctor Review</span>
                </div>
              </div>
            </div>
          ) : primaryActiveEncounter?.queue_status === "ready_for_review" ? (
            /* State 2: Ready for review */
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--ink-900)]">
                      {primaryActiveEncounter.opd_department || "General OPD"} Consultation
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border border-[var(--status-pending-bd)]">
                      <Clock className="w-2.5 h-2.5" /> Ready for Doctor Review
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                    Intake submitted. All captured symptoms and documents are queued on the attending physician&apos;s workstation.
                  </p>
                </div>
                <Link href={`/patient/reports/${primaryActiveEncounter.id}`} className="flex-shrink-0">
                  <Button size="md" variant="secondary" className="w-full sm:w-auto font-semibold cursor-pointer">
                    <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                    <span>View Submitted Report</span>
                  </Button>
                </Link>
              </div>

              {/* Progress Pipeline */}
              <div className="pt-2 border-t border-[var(--ink-200)] flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-[var(--status-success-fg)] font-semibold">
                  <span className="w-5 h-5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] flex items-center justify-center font-bold text-[10px] border border-[var(--status-success-bd)]">✓</span>
                  <span>History Captured</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--status-success-fg)] font-semibold">
                  <span className="w-5 h-5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] flex items-center justify-center font-bold text-[10px] border border-[var(--status-success-bd)]">✓</span>
                  <span>Documents Linked</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--status-pending-fg)] font-semibold">
                  <span className="w-5 h-5 rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] flex items-center justify-center font-bold text-[10px] border border-[var(--status-pending-bd)]">3</span>
                  <span>Awaiting Physician Review</span>
                </div>
              </div>
            </div>
          ) : primaryActiveEncounter?.queue_status === "registered" ? (
            /* State 3: Registered consultation ready to start */
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--ink-900)]">
                      {primaryActiveEncounter.opd_department || "General OPD"} Visit
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-bd)]">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Ready to Begin
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                    Consultation registered. Begin speaking with CareVoice or type your symptoms now.
                  </p>
                </div>
                <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`} className="flex-shrink-0">
                  <Button size="md" className="w-full sm:w-auto font-semibold cursor-pointer">
                    <span>Begin Pre-Consultation</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </div>

              {/* Progress Pipeline */}
              <div className="pt-2 border-t border-[var(--ink-200)] flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-[var(--clinical)] font-semibold">
                  <span className="w-5 h-5 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center font-bold text-[10px] border border-[var(--clinical-mid)]">1</span>
                  <span>Start Pre-Consultation</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--ink-400)]">
                  <span className="w-5 h-5 rounded-full border border-[var(--ink-200)] flex items-center justify-center text-[10px]">2</span>
                  <span>Upload Past Records</span>
                </div>
                <span className="text-[var(--ink-300)]">→</span>
                <div className="flex items-center gap-1.5 text-[var(--ink-400)]">
                  <span className="w-5 h-5 rounded-full border border-[var(--ink-200)] flex items-center justify-center text-[10px]">3</span>
                  <span>Doctor Consultation</span>
                </div>
              </div>
            </div>
          ) : (
            /* State 4: No active consultation */
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border border-[var(--status-neutral-bd)]">
                    <Calendar className="w-2.5 h-2.5" /> Outpatient Intake Desk
                  </span>
                </div>
                <h3 className="text-base font-bold text-[var(--ink-900)]">
                  No Active Consultation
                </h3>
                <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                  Start an OPD consultation visit to begin AI pre-consultation triage and share documents with hospital doctors.
                </p>
              </div>
              <div className="relative flex-shrink-0">
                {!showDeptPicker ? (
                  <Button
                    size="md"
                    onClick={() => setShowDeptPicker(true)}
                    className="font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    <span>Start Consultation</span>
                  </Button>
                ) : (
                  <div className="p-3 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-md shadow-md space-y-2 w-64 z-20">
                    <p className="text-xs font-bold text-[var(--ink-900)]">Select Department:</p>
                    <div className="space-y-1">
                      {DEPARTMENTS.map((dept) => (
                        <button
                          key={dept}
                          onClick={() => {
                            setShowDeptPicker(false);
                            createMutation.mutate(dept);
                          }}
                          disabled={createMutation.isPending}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--clinical-light)] hover:text-[var(--clinical)] transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <span>{dept}</span>
                          <ChevronRight className="w-3 h-3 opacity-50" />
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowDeptPicker(false)}
                      className="w-full text-center text-[11px] text-[var(--ink-500)] hover:underline pt-1 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION C: COMPACT CLINICAL STAT STRIP ── */}
      <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--ink-200)] text-xs shadow-xs">
        <div className="px-3 py-1.5">
          <span className="text-[var(--ink-500)] block text-[11px]">Total Consultations</span>
          <span className="text-base font-bold text-[var(--ink-900)] font-mono">
            {isLoadingEncounters ? "…" : encounters.length}
          </span>
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[var(--ink-500)] block text-[11px]">Active Visits</span>
          <span className="text-base font-bold text-[var(--clinical)] font-mono">
            {isLoadingEncounters ? "…" : activeEncounters.length}
          </span>
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[var(--ink-500)] block text-[11px]">Verified Reports</span>
          <span className="text-base font-bold text-[var(--status-success-fg)] font-mono">
            {isLoadingReports ? "…" : reports.filter((r) => r.queue_status === "completed").length}
          </span>
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[var(--ink-500)] block text-[11px]">Clinical Documents</span>
          <span className="text-base font-bold text-[var(--ink-900)] font-mono">
            {isLoadingMetrics ? "…" : metrics?.documents_count ?? documents.length}
          </span>
        </div>
      </section>

      {/* ── SECTION D: QUICK ACTIONS BAR ── */}
      <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)]">
          Quick Actions
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {primaryActiveEncounter ? (
            <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`}>
              <Button size="xs" variant="secondary" className="cursor-pointer text-xs font-semibold">
                <Activity className="w-3.5 h-3.5 mr-1 text-[var(--clinical)]" />
                Resume Intake
              </Button>
            </Link>
          ) : (
            <Button size="xs" variant="secondary" onClick={() => setShowDeptPicker(true)} className="cursor-pointer text-xs font-semibold">
              <Plus className="w-3.5 h-3.5 mr-1 text-[var(--clinical)]" />
              New Visit
            </Button>
          )}
          <Link href="/patient/documents">
            <Button size="xs" variant="secondary" className="cursor-pointer text-xs font-semibold">
              <Upload className="w-3.5 h-3.5 mr-1 text-[var(--clinical)]" />
              Upload Document
            </Button>
          </Link>
          <Link href="/patient/health-record">
            <Button size="xs" variant="secondary" className="cursor-pointer text-xs font-semibold">
              <ClipboardList className="w-3.5 h-3.5 mr-1 text-[var(--clinical)]" />
              Health Record
            </Button>
          </Link>
          <Link href="/patient/timeline">
            <Button size="xs" variant="secondary" className="cursor-pointer text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 mr-1 text-[var(--clinical)]" />
              Timeline
            </Button>
          </Link>
        </div>
      </section>

      {/* ── SECTION E: TWO-COLUMN CLINICAL DASHBOARD WORKSPACE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: 7 cols — Activity + Reports + Health Record snapshot */}
        <div className="lg:col-span-7 space-y-4">

          {/* ── RECENT CLINICAL ACTIVITY ── */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[var(--clinical)]" />
                Recent Clinical Activity
              </h3>
              <Link
                href="/patient/timeline"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--clinical)] hover:underline"
              >
                <Clock className="w-3 h-3" />
                View Full Timeline →
              </Link>
            </div>

            {recentActivities.length === 0 ? (
              <p className="text-xs text-[var(--ink-500)] px-4 py-4 italic">
                No activity yet — activity appears automatically when you upload documents or complete intake.
              </p>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {recentActivities.map((act, idx) => {
                  const isFirst = idx === 0;
                  return (
                    <div
                      key={act.id}
                      className={`px-4 py-3 flex items-start justify-between gap-3 text-xs transition-colors ${
                        isFirst ? "bg-[var(--clinical-light)]/40" : "hover:bg-[var(--bg-surface-2)]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          act.badgeVariant === "success" ? "bg-[var(--status-success-fg)]"
                          : act.badgeVariant === "pending" ? "bg-[var(--status-pending-fg)]"
                          : act.badgeVariant === "neutral" ? "bg-[var(--ink-400)]"
                          : "bg-[var(--status-info-fg)]"
                        }`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold truncate ${isFirst ? "text-[var(--clinical)]" : "text-[var(--ink-900)]"}`}>
                              {act.title}
                              {isFirst && <span className="ml-1.5 text-[10px] font-bold text-[var(--clinical)] uppercase tracking-wider">· Latest</span>}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--ink-500)] truncate mt-0.5">{act.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          act.badgeVariant === "success"
                            ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                            : act.badgeVariant === "pending"
                            ? "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]"
                            : act.badgeVariant === "neutral"
                            ? "bg-[var(--bg-surface-2)] text-[var(--ink-500)] border-[var(--ink-200)]"
                            : "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-bd)]"
                        }`}>
                          {act.badgeText}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--ink-400)] hidden sm:inline">{act.date}</span>
                        {act.link && (
                          <Link href={act.link} className="text-[var(--clinical)] hover:text-[var(--clinical-dark)]" title="Open">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── MY HEALTH RECORD SUMMARY ── */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--clinical)]" />
                My Health Record Snapshot
              </h3>
              <Link href="/patient/health-record" className="text-[11px] font-semibold text-[var(--clinical)] hover:underline flex items-center gap-0.5">
                Explore Record <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--ink-200)]">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">Visits</span>
                <span className="text-base font-bold font-mono text-[var(--ink-900)]">{encounters.length}</span>
              </div>
              <div className="p-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--ink-200)]">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">Reports</span>
                <span className="text-base font-bold font-mono text-[var(--clinical)]">{reports.length}</span>
              </div>
              <div className="p-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--ink-200)]">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">Documents</span>
                <span className="text-base font-bold font-mono text-[var(--status-success-fg)]">{documents.length}</span>
              </div>
            </div>
          </section>

          {/* ── PRE-CONSULTATION REPORTS ── */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-[var(--clinical)]" />
                Pre-Consultation Reports
              </h3>
              <Link href="/patient/reports" className="text-[11px] font-semibold text-[var(--clinical)] hover:underline flex items-center gap-0.5">
                All Reports ({reports.length}) <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoadingReports ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--ink-500)]">
                <Spinner /> Loading reports…
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-[var(--ink-500)] px-4 py-4 italic">
                No reports yet — synthesized automatically after completing intake.
              </p>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {reports.slice(0, 3).map((rep) => (
                  <div key={rep.encounter_id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-[var(--bg-surface-2)] transition-colors">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--ink-900)]">
                          {rep.opd_department || "General OPD"}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${
                          rep.queue_status === "completed"
                            ? "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)]"
                            : "bg-[var(--entity-ai-bg)] text-[var(--entity-ai-fg)] border-[var(--entity-ai-bd)] border-dashed"
                        }`}>
                          {rep.queue_status === "completed" ? "Doctor Verified" : "AI · Awaiting Review"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-500)]">
                        {rep.consultation_date} · {rep.total_entities} findings
                        {rep.unreviewed_count > 0 && (
                          <span className="ml-1.5 text-[var(--status-pending-fg)] font-semibold">
                            · {rep.unreviewed_count} unverified
                          </span>
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/patient/reports/${rep.encounter_id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--clinical)] hover:underline flex-shrink-0"
                    >
                      View <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: 5 cols — Document Center + AI Governance */}
        <div className="lg:col-span-5 space-y-4">

          {/* ── DOCUMENT CENTER — compact supporting panel ── */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-[var(--clinical)]" />
                Document Center
              </h3>
              <Link href="/patient/documents" className="text-[11px] font-semibold text-[var(--clinical)] hover:underline flex items-center gap-0.5">
                Manage ({documents.length}) <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoadingDocuments ? (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--ink-500)]">
                <Spinner /> Loading…
              </div>
            ) : documents.length === 0 ? (
              <div className="px-4 py-5 text-center space-y-2">
                <FileText className="w-5 h-5 mx-auto text-[var(--ink-400)]" />
                <p className="text-xs text-[var(--ink-500)]">No documents uploaded yet.</p>
                <Link href="/patient/documents">
                  <Button size="xs" variant="secondary" className="cursor-pointer text-xs font-semibold">
                    <Upload className="w-3 h-3 mr-1" /> Upload Document
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {documents.slice(0, 4).map((doc) => {
                  const statusCfg =
                    doc.processing_status === "processed"
                      ? { dot: "bg-[var(--status-success-fg)]", label: "Processed", labelColor: "text-[var(--status-success-fg)]" }
                      : doc.processing_status === "failed"
                      ? { dot: "bg-[var(--status-error-fg)]", label: "Failed", labelColor: "text-[var(--status-error-fg)]" }
                      : { dot: "bg-[var(--status-pending-fg)]", label: "Extracting…", labelColor: "text-[var(--status-pending-fg)]" };
                  return (
                    <div key={doc.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--bg-surface-2)] transition-colors">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusCfg.dot}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--ink-900)] truncate leading-snug">
                            {doc.original_filename || doc.filename || "Medical Document"}
                          </p>
                          <p className="text-[10px] text-[var(--ink-500)] capitalize leading-snug">
                            {doc.document_type.replace(/_/g, " ")}
                            {doc.processing_status === "processed" && (doc.extracted_entity_count ?? doc.entity_count) != null
                              ? ` · ${doc.extracted_entity_count ?? doc.entity_count} entities`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold flex-shrink-0 ${statusCfg.labelColor}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                  );
                })}
                {documents.length > 4 && (
                  <div className="px-4 py-2 text-[11px] text-[var(--ink-500)]">
                    +{documents.length - 4} more ·{" "}
                    <Link href="/patient/documents" className="text-[var(--clinical)] hover:underline">View all</Link>
                  </div>
                )}
              </div>
            )}

            <div className="px-4 py-2 border-t border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <p className="text-[10px] text-[var(--ink-400)]">
                Accepted: Prescriptions, Lab Reports, Discharge Summaries (PDF / JPEG / PNG)
              </p>
            </div>
          </section>

          {/* Quick Access Navigation Strip — compact list (not card grid) */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--ink-200)]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-500)]">
                Quick Access
              </span>
            </div>
            <div className="divide-y divide-[var(--ink-200)]">
              {[
                { href: "/patient/intake",    icon: Activity,      label: "CareVoice Intake",       sub: "Start or resume consultation" },
                { href: "/patient/documents", icon: FolderOpen,    label: "Documents",               sub: `${documents.length} uploaded` },
                { href: "/patient/reports",   icon: ClipboardList, label: "Pre-Consultation Reports", sub: `${reports.length} report${reports.length !== 1 ? "s" : ""}` },
                { href: "/patient/profile",   icon: User,          label: "Profile",                 sub: "Account & clinical history" },
              ].map(({ href, icon: Icon, label, sub }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--bg-surface-2)] transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[var(--clinical)] flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--ink-900)]">{label}</p>
                      <p className="text-[10px] text-[var(--ink-500)]">{sub}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-400)] group-hover:text-[var(--clinical)] transition-colors flex-shrink-0" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          {/* ── AI EXTRACTION & PHYSICIAN GOVERNANCE — concise clinical notice ── */}
          <section className="border border-[var(--clinical-mid)] rounded-lg overflow-hidden shadow-xs">
            <div className="bg-[var(--clinical-light)] px-4 py-2.5 flex items-center gap-2 border-b border-[var(--clinical-mid)]">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--clinical)] flex-shrink-0" />
              <span className="text-xs font-bold text-[var(--clinical)]">AI Extraction &amp; Physician Governance</span>
            </div>
            <div className="px-4 py-3 space-y-2.5 bg-[var(--bg-surface)] text-xs text-[var(--ink-700)]">
              <p className="leading-relaxed">
                CareFlow AI structures your intake into clinical findings. All AI-extracted data is{" "}
                <strong className="text-[var(--ink-900)]">unverified</strong> until explicitly confirmed by your attending physician. AI findings are not diagnoses.
              </p>
              <div className="flex items-center gap-4 text-[11px] pt-0.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm border border-dashed border-[var(--entity-ai-fg)] bg-[var(--entity-ai-bg)]" />
                  <span className="text-[var(--entity-ai-fg)] font-semibold">AI Extracted</span>
                </span>
                <span className="text-[var(--ink-300)]">→</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[var(--entity-verified-bg)] border border-[var(--entity-verified-bd)]" />
                  <span className="text-[var(--entity-verified-fg)] font-semibold">Doctor Verified</span>
                </span>
              </div>
              {reports.length > 0 && (() => {
                const unreviewedTotal = reports.reduce((sum, r) => sum + (r.unreviewed_count ?? 0), 0);
                if (unreviewedTotal > 0) return (
                  <p className="text-[11px] text-[var(--ink-500)] border-t border-[var(--ink-200)] pt-2">
                    <span className="font-semibold text-[var(--status-pending-fg)]">{unreviewedTotal}</span> finding{unreviewedTotal !== 1 ? "s" : ""} awaiting physician review.
                  </p>
                );
                if (reports.some((r) => r.queue_status === "completed")) return (
                  <p className="text-[11px] text-[var(--status-success-fg)] font-semibold border-t border-[var(--ink-200)] pt-2 flex items-center gap-1">
                    <FileCheck2 className="w-3 h-3" /> All submitted findings reviewed.
                  </p>
                );
                return null;
              })()}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

