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
  Sparkles,
  ShieldCheck,
  User,
  ExternalLink,
  Upload,
  FileCheck2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/doctor/StatusBadge";
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
    const d = new Date(doc.upload_timestamp || Date.now());
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
    <div className="space-y-6">
      {/* ── SECTION A: CONTEXT HEADER ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--ink-200)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              {getGreeting(profile?.full_name)}
            </h1>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-[var(--ink-400)]" />
            <span className="hidden sm:inline text-xs text-[var(--ink-500)]">Patient Portal</span>
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Pre-consultation clinical workspace. Prepare symptoms and evidence for your attending physician.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {profile?.id && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--ink-200)] text-xs text-[var(--ink-700)] shadow-[var(--shadow-xs)]">
              <span className="text-[var(--ink-400)] font-medium">UID:</span>
              <span className="font-mono text-[var(--clinical)] font-semibold">
                {profile.id.slice(0, 8)}…{profile.id.slice(-4)}
              </span>
            </div>
          )}
          <Link
            href="/patient/profile"
            className="p-1.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-500)] hover:text-[var(--clinical)] transition-colors"
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

      {/* ── SECTION B: ONE DOMINANT CURRENT-CONSULTATION AREA (PRIMARY HIERARCHY) ── */}
      <section className="rounded-lg bg-[var(--bg-surface)] border-2 border-[var(--clinical-mid)] shadow-[var(--shadow-sm)] p-5 md:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-[var(--clinical-light)] rounded-full blur-2xl pointer-events-none opacity-50" />

        {primaryActiveEncounter?.queue_status === "intake_in_progress" ? (
          /* State 1: Intake in progress */
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                  <Clock className="w-3 h-3" /> Pre-Consultation In Progress
                </span>
                <span className="text-xs font-mono text-[var(--ink-400)]">
                  #{primaryActiveEncounter.id.slice(0, 8)}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--ink-900)]">
                {primaryActiveEncounter.opd_department || "General OPD"} Consultation
              </h2>
              <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                Adaptive clinical intake is active. Answer questions with CareVoice AI or text so your doctor receives your structured history.
              </p>
            </div>
            <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`}>
              <Button size="md" className="w-full sm:w-auto font-semibold cursor-pointer">
                <span>Resume Intake</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        ) : primaryActiveEncounter?.queue_status === "ready_for_review" ? (
          /* State 2: Ready for review */
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border border-[var(--status-pending-bd)]">
                  <Clock className="w-3 h-3" /> In Doctor Review Queue
                </span>
                <span className="text-xs font-mono text-[var(--ink-400)]">
                  #{primaryActiveEncounter.id.slice(0, 8)}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--ink-900)]">
                Pre-Consultation Submitted · Awaiting Physician Verification
              </h2>
              <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                Clinical symptoms and evidence are synthesized and available on your attending physician&apos;s workstation.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Link href={`/patient/reports/${primaryActiveEncounter.id}`}>
                <Button size="md" variant="secondary" className="w-full sm:w-auto font-semibold cursor-pointer">
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                  <span>View Submitted Summary</span>
                </Button>
              </Link>
            </div>
          </div>
        ) : primaryActiveEncounter?.queue_status === "registered" ? (
          /* State 3: Registered consultation ready to start */
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-bd)]">
                  <CheckCircle2 className="w-3 h-3" /> Ready to Begin
                </span>
                <span className="text-xs font-mono text-[var(--ink-400)]">
                  #{primaryActiveEncounter.id.slice(0, 8)}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--ink-900)]">
                {primaryActiveEncounter.opd_department || "General OPD"} Visit
              </h2>
              <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                Begin speaking with CareVoice or type your symptoms. You can also upload past prescriptions or lab tests.
              </p>
            </div>
            <Link href={`/patient/intake?encounter_id=${primaryActiveEncounter.id}`}>
              <Button size="md" className="w-full sm:w-auto font-semibold cursor-pointer">
                <span>Begin Pre-Consultation</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        ) : (
          /* State 4: No active consultation */
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border border-[var(--status-neutral-bd)]">
                  <Calendar className="w-3 h-3" /> Outpatient Intake Desk
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--ink-900)]">
                No Active Consultation
              </h2>
              <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                Schedule a consultation visit to begin AI pre-consultation triage and share documents with hospital doctors.
              </p>
            </div>
            <div className="relative">
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
                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-md shadow-[var(--shadow-md)] space-y-2 w-64 z-20">
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
      </section>

      {/* ── SECTION C: COMPACT HORIZONTAL STAT STRIP (ELIMINATES GIANT CARDS) ── */}
      <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--ink-200)] text-xs">
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
            {isLoadingReports ? "…" : reports.length}
          </span>
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[var(--ink-500)] block text-[11px]">Clinical Documents</span>
          <span className="text-base font-bold text-[var(--ink-900)] font-mono">
            {isLoadingMetrics ? "…" : metrics?.documents_count ?? documents.length}
          </span>
        </div>
      </section>

      {/* ── TWO-COLUMN CLINICAL DASHBOARD WORKSPACE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: 7 cols (PRIMARY & SECONDARY FEED) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Recent Chronological Clinical Activity */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--ink-200)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Recent Clinical Activity</span>
              </h3>
              <span className="text-[11px] text-[var(--ink-400)]">Chronological audit</span>
            </div>

            {recentActivities.length === 0 ? (
              <p className="text-xs text-[var(--ink-500)] py-3 italic">
                No recent activity recorded. Activity will automatically appear as you upload documents or complete pre-consultations.
              </p>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {recentActivities.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--ink-900)] truncate">{act.title}</span>
                        <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                          act.badgeVariant === "success"
                            ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                            : act.badgeVariant === "pending"
                            ? "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]"
                            : "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-bd)]"
                        }`}>
                          {act.badgeText}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-500)] truncate">{act.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-mono text-[var(--ink-400)]">{act.date}</span>
                      {act.link && (
                        <Link href={act.link} className="text-[var(--clinical)] hover:text-[var(--clinical-dark)]">
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Structured Clinical Reports Overview */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--ink-200)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Pre-Consultation Reports</span>
              </h3>
              <Link href="/patient/reports" className="text-xs font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1">
                <span>All reports ({reports.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoadingReports ? (
              <div className="flex items-center gap-2 py-3 text-xs text-[var(--ink-500)]">
                <Spinner /> Loading reports…
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-[var(--ink-500)] py-3 italic">
                No clinical reports generated yet. Reports are synthesized upon completing pre-consultation intake.
              </p>
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 3).map((rep) => (
                  <div
                    key={rep.encounter_id}
                    className="p-3 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--ink-900)]">
                          {rep.opd_department || "General OPD"} Report
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                          rep.queue_status === "completed"
                            ? "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)]"
                            : "bg-[var(--entity-ai-bg)] text-[var(--entity-ai-fg)] border-[var(--entity-ai-bd)] border-dashed"
                        }`}>
                          {rep.queue_status === "completed" ? "Doctor Verified" : "AI Extracted · Awaiting Doctor"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-500)]">
                        Date: {rep.consultation_date} · {rep.total_entities} clinical findings
                      </p>
                    </div>
                    <Link
                      href={`/patient/reports/${rep.encounter_id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--clinical)] hover:underline self-start sm:self-auto"
                    >
                      <span>View Report</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: 5 cols (DOCUMENTS PREVIEW, CLINICAL VERIFICATION DISCLOSURE, QUICK ACCESS) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Medical Document Center Snapshot */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--ink-200)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Document Center</span>
              </h3>
              <Link href="/patient/documents" className="text-xs font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1">
                <span>Manage ({documents.length})</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoadingDocuments ? (
              <div className="flex items-center gap-2 py-3 text-xs text-[var(--ink-500)]">
                <Spinner /> Loading documents…
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-4 space-y-2 border border-dashed border-[var(--ink-200)] rounded-md">
                <FileText className="w-6 h-6 mx-auto text-[var(--ink-400)]" />
                <p className="text-xs text-[var(--ink-500)]">No prescriptions or lab reports uploaded yet.</p>
                <Link href="/patient/documents">
                  <Button size="xs" variant="secondary" className="cursor-pointer">
                    <Upload className="w-3 h-3 mr-1" /> Upload First Document
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 3).map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-[var(--clinical)] flex-shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-[var(--ink-900)] truncate">
                          {doc.original_filename || doc.filename || "Document"}
                        </p>
                        <p className="text-[10px] text-[var(--ink-500)] capitalize">
                          {doc.document_type.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                      doc.processing_status === "processed"
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-bd)]"
                        : doc.processing_status === "failed"
                        ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)]"
                        : "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border border-[var(--status-pending-bd)]"
                    }`}>
                      {doc.processing_status === "processed" ? "Processed" : doc.processing_status === "failed" ? "Failed" : "Extracting"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[var(--ink-400)] pt-1">
              Supported: Prescriptions, Blood/Lab Tests, Discharge Summaries (PDF/JPEG/PNG).
            </p>
          </section>

          {/* AI Clinical Governance Disclosure */}
          <section className="rounded-lg bg-[var(--clinical-light)]/40 border border-[var(--clinical-mid)] p-3.5 space-y-2 text-xs text-[var(--ink-700)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--clinical)] text-xs">
              <ShieldCheck className="w-4 h-4 text-[var(--clinical)]" />
              <span>AI Extraction &amp; Physician Governance</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--ink-700)]">
              CareFlow AI structures your answers and documents to save time in the clinic. All findings remain marked as unverified until explicitly confirmed by your doctor.
            </p>
            <div className="pt-1 flex items-center gap-3 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 text-[var(--entity-ai-fg)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--entity-ai-fg)]" /> AI Extracted
              </span>
              <span className="inline-flex items-center gap-1 text-[var(--entity-verified-fg)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--entity-verified-fg)]" /> Doctor Verified
              </span>
            </div>
          </section>

          {/* Quick Access Navigation Strip */}
          <section className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-500)] block">
              Quick Portals
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/patient/intake"
                className="p-2.5 rounded-md border border-[var(--ink-200)] hover:border-[var(--clinical)] hover:bg-[var(--clinical-light)]/30 transition-colors flex items-center gap-2 text-[var(--ink-800)] font-medium"
              >
                <Activity className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>CareVoice</span>
              </Link>
              <Link
                href="/patient/documents"
                className="p-2.5 rounded-md border border-[var(--ink-200)] hover:border-[var(--clinical)] hover:bg-[var(--clinical-light)]/30 transition-colors flex items-center gap-2 text-[var(--ink-800)] font-medium"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Documents</span>
              </Link>
              <Link
                href="/patient/reports"
                className="p-2.5 rounded-md border border-[var(--ink-200)] hover:border-[var(--clinical)] hover:bg-[var(--clinical-light)]/30 transition-colors flex items-center gap-2 text-[var(--ink-800)] font-medium"
              >
                <ClipboardList className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Reports</span>
              </Link>
              <Link
                href="/patient/profile"
                className="p-2.5 rounded-md border border-[var(--ink-200)] hover:border-[var(--clinical)] hover:bg-[var(--clinical-light)]/30 transition-colors flex items-center gap-2 text-[var(--ink-800)] font-medium"
              >
                <User className="w-3.5 h-3.5 text-[var(--clinical)]" />
                <span>Profile</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
