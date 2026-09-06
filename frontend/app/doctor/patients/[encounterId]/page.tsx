"use client";
import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSummary,
  getTimeline,
  verifyEntity,
  finalizeEncounter,
} from "@/services/doctor.service";
import { PatientHeader } from "@/components/doctor/PatientHeader";
import { EntityVerificationRow } from "@/components/doctor/EntityVerificationRow";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  ClinicalSummarySkeleton,
  FindingsSkeleton,
} from "@/components/doctor/DoctorSkeletons";
import {
  FileText,
  History,
  Clock,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FolderOpen,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Pill,
  Search,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type {
  VerifyAction,
  DocumentDetailResponse,
  EntityDetail,
} from "@/types/doctor";

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type WorkspaceTab = "summary" | "findings" | "documents" | "timeline" | "finalize";

export default function EncounterReviewPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const encounterId = params?.encounterId as string;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("summary");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fieldSearch, setFieldSearch] = useState<string>("");
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});
  const [selectedDocForEvidence, setSelectedDocForEvidence] = useState<string | null>(null);

  // 1. Consolidated Clinical Summary + Entities
  const {
    data: summary,
    isLoading: sumLoading,
    error: sumError,
  } = useQuery({
    queryKey: ["doctor", "summary", encounterId],
    queryFn: () => getSummary(encounterId),
    enabled: !!encounterId,
  });

  // 2. Timeline
  const { data: timeline, isLoading: timeLoading } = useQuery({
    queryKey: ["doctor", "timeline", encounterId],
    queryFn: () => getTimeline(encounterId),
    enabled: !!encounterId,
  });

  // 3. Entity Verification Mutation
  const verifyMut = useMutation({
    mutationFn: ({
      entityId,
      action,
      newValue,
    }: {
      entityId: string;
      action: VerifyAction;
      newValue?: string;
    }) => verifyEntity(entityId, { action, new_value: newValue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor", "summary", encounterId] });
      qc.invalidateQueries({ queryKey: ["doctor", "queue"] });
    },
  });

  // 4. Finalize Mutation
  const finalizeMut = useMutation({
    mutationFn: () => finalizeEncounter(encounterId),
    onSuccess: () => {
      setFinalizeConfirm(false);
      setFinalizeSuccess(true);
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
  });

  async function handleVerify(
    entityId: string,
    action: VerifyAction,
    newValue?: string
  ) {
    await verifyMut.mutateAsync({ entityId, action, newValue });
  }

  function toggleDocExpand(id: string) {
    setExpandedDocIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleInspectDocumentEvidence(docId?: string) {
    if (docId) {
      setExpandedDocIds((prev) => ({ ...prev, [docId]: true }));
      setSelectedDocForEvidence(docId);
      setActiveTab("documents");
    }
  }

  // Loading state
  if (sumLoading) {
    return (
      <div className="space-y-5">
        <div className="h-20 bg-[var(--ink-100)] rounded-lg animate-pulse" />
        <ClinicalSummarySkeleton />
      </div>
    );
  }

  // Error state
  if (sumError || !summary) {
    return (
      <div className="max-w-xl mx-auto py-16 space-y-4">
        <div className="p-4 rounded-lg border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)] flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Clinical Record Not Accessible</p>
            <p className="text-xs mt-1">
              This patient encounter may not be assigned to your doctor account, or you do not have permission to view it.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => router.push("/doctor/patients")}
        >
          Return to Clinical Queue
        </Button>
      </div>
    );
  }

  const entities = summary.entities ?? [];
  const unreviewedCount = entities.filter(
    (e) => e.verification_status === "unreviewed"
  ).length;
  const verifiedCount = entities.filter(
    (e) => e.verification_status === "accepted"
  ).length;
  const editedCount = entities.filter(
    (e) => e.verification_status === "edited"
  ).length;
  const rejectedCount = entities.filter(
    (e) => e.verification_status === "rejected"
  ).length;

  // Filter entities for tab
  const filteredEntities = entities.filter((e) => {
    const matchesStatus =
      statusFilter === "all" ? true : e.verification_status === statusFilter;
    const matchesSearch =
      !fieldSearch.trim() ||
      e.field_name.toLowerCase().includes(fieldSearch.toLowerCase().trim()) ||
      e.value.toLowerCase().includes(fieldSearch.toLowerCase().trim());
    return matchesStatus && matchesSearch;
  });

  // Clinical structured categories
  const chiefComplaint =
    entities.find(
      (e) =>
        e.field_name.toLowerCase().includes("chief_complaint") ||
        e.field_name.toLowerCase().includes("symptom")
    )?.value || null;

  const medicalHistory = entities.filter(
    (e) =>
      e.field_name.toLowerCase().includes("history") ||
      e.field_name.toLowerCase().includes("past")
  );

  const medications = entities.filter(
    (e) =>
      e.field_name.toLowerCase().includes("medication") ||
      e.field_name.toLowerCase().includes("drug")
  );

  const allergies = entities.filter((e) =>
    e.field_name.toLowerCase().includes("allergy")
  );

  const labEntities = entities.filter(
    (e) =>
      e.field_name.toLowerCase().includes("lab") ||
      e.field_name.toLowerCase().includes("investigation") ||
      e.field_name.toLowerCase().includes("test")
  );

  const investigationsList = summary.investigations ?? [];
  const docsList = summary.documents ?? [];

  // Finalize button slotted in Header
  const headerAction = !finalizeSuccess ? (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => setActiveTab("finalize")}
      className="text-xs font-semibold flex items-center gap-1.5 border-[var(--clinical-mid)]"
    >
      <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
      Final Review Safety Gate
    </Button>
  ) : (
    <span className="text-xs font-semibold text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2.5 py-1 rounded-md flex items-center gap-1">
      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Finalized &amp; Locked
    </span>
  );

  return (
    <div className="space-y-5 pb-16">
      {/* ── 1. Compact Workstation Patient Header ── */}
      <PatientHeader
        patientName={summary.patient_name || "Patient Record"}
        patientId={summary.patient_id || summary.encounter_id}
        encounterId={summary.encounter_id}
        department={summary.opd_department || "General OPD"}
        status={finalizeSuccess ? "completed" : "ready_for_review"}
        backHref="/doctor/patients"
        visitDate={summary.generated_at}
        action={headerAction}
      />

      {/* ── 2. Finalization Success Banner ── */}
      {finalizeSuccess && (
        <div className="px-4 py-3 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-fg)] flex items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-semibold">
              Clinical consultation finalized and signed. All verified findings are immutably archived.
            </span>
          </div>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => router.push("/doctor/dashboard")}
          >
            Return to Command Center
          </Button>
        </div>
      )}

      {/* ── 3. Clinical Workstation Tabs ── */}
      <div className="flex border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-2 pt-1.5 gap-1 overflow-x-auto">
        {[
          {
            key: "summary",
            label: "Clinical Summary",
            icon: FileText,
            badge: null,
          },
          {
            key: "findings",
            label: "AI Findings & Verification",
            icon: History,
            badge: unreviewedCount > 0 ? `${unreviewedCount} pending` : `${entities.length}`,
            badgeCls:
              unreviewedCount > 0
                ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                : "bg-[var(--ink-200)] text-[var(--ink-700)]",
          },
          {
            key: "documents",
            label: "Documents & Evidence",
            icon: FileCheck,
            badge: `${docsList.length}`,
            badgeCls: "bg-[var(--ink-200)] text-[var(--ink-700)]",
          },
          {
            key: "timeline",
            label: "Clinical Timeline",
            icon: Clock,
            badge: null,
          },
          {
            key: "finalize",
            label: finalizeSuccess ? "✓ Finalized" : "Final Review & Sign",
            icon: FileCheck2,
            badge: unreviewedCount > 0 ? `${unreviewedCount} left` : "Ready",
            badgeCls:
              unreviewedCount > 0
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-emerald-100 text-emerald-900 border border-emerald-300",
          },
        ].map(({ key, label, icon: Icon, badge, badgeCls }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as WorkspaceTab)}
              className={`pb-2.5 pt-2 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 rounded-t-md ${
                isActive
                  ? "border-[var(--clinical)] text-[var(--clinical)] bg-[var(--bg-surface)] font-bold shadow-xs"
                  : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{label}</span>
              {badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${badgeCls}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: CLINICAL SUMMARY (Physician-Ready View) ── */}
      {activeTab === "summary" && (
        <div className="space-y-5">
          {/* Clinical Provenance Banner */}
          <div className="px-4 py-3 rounded-lg border border-[var(--clinical-mid)] bg-[var(--clinical-light)] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--clinical)] shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider">
                  Consolidated Clinical Pre-Consultation Summary
                </p>
                <p className="text-xs text-[var(--ink-600)]">
                  Synthesized from conversational intake turns and {docsList.length} uploaded medical document{docsList.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                {docsList.length} Document{docsList.length === 1 ? "" : "s"}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                  unreviewedCount > 0
                    ? "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]"
                    : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                }`}
              >
                {unreviewedCount > 0
                  ? `${unreviewedCount} awaiting verification`
                  : "All findings doctor-verified"}
              </span>
            </div>
          </div>

          {/* Chief Complaint Callout */}
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs">
            <p className="text-[10px] font-bold text-[var(--ink-400)] uppercase tracking-wider">
              Chief Complaint
            </p>
            <p className="text-sm font-bold text-[var(--ink-900)] mt-1">
              {chiefComplaint || "Reported in consultation summary"}
            </p>
          </div>

          {/* Clinical Summary Narrative */}
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)]">
                Clinical Narrative
              </h3>
              <span className="text-[10px] text-[var(--ink-400)]">
                Generated: {new Date(summary.generated_at).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-[var(--ink-800)] leading-relaxed whitespace-pre-line">
                {summary.summary_text}
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--ink-200)] flex items-center justify-between text-xs text-[var(--ink-500)]">
                <span>Findings incorporated: {summary.used_entity_fields?.length ?? entities.length}</span>
                <button
                  onClick={() => setActiveTab("findings")}
                  className="text-[var(--clinical)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  Verify all findings <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Structured Clinical Sections (2-Column Dense Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Allergies */}
            <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-[var(--ink-200)] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                  Allergies
                </h4>
                <span className="text-[10px] text-[var(--ink-400)]">{allergies.length} recorded</span>
              </div>
              {allergies.length ? (
                <ul className="space-y-1.5 text-xs text-[var(--ink-900)]">
                  {allergies.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--bg-surface-2)]">
                      <span className="font-semibold text-red-900">• {a.value}</span>
                      {a.source_document_name && (
                        <span className="text-[10px] bg-white border border-[var(--ink-200)] px-1 rounded font-mono text-[var(--ink-500)]">
                          {a.source_document_name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--ink-500)] italic py-2">
                  No known drug allergies reported.
                </p>
              )}
            </div>

            {/* Past Medical History */}
            <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-[var(--ink-200)] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)]">
                  Past Medical History
                </h4>
                <span className="text-[10px] text-[var(--ink-400)]">{medicalHistory.length} recorded</span>
              </div>
              {medicalHistory.length ? (
                <ul className="space-y-1.5 text-xs text-[var(--ink-900)]">
                  {medicalHistory.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--bg-surface-2)]">
                      <span>
                        <strong className="text-[var(--ink-700)] capitalize">{m.field_name.replace(/_/g, " ")}:</strong> {m.value}
                      </span>
                      {m.source_document_name && (
                        <span className="text-[10px] bg-white border border-[var(--ink-200)] px-1 rounded font-mono text-[var(--ink-500)] shrink-0">
                          {m.source_document_name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--ink-500)] italic py-2">
                  No significant past medical history captured in current record.
                </p>
              )}
            </div>

            {/* Current Medications (Table View) */}
            <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs space-y-2 md:col-span-2">
              <div className="flex items-center justify-between border-b border-[var(--ink-200)] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                  Reported Medications ({medications.length})
                </h4>
                <span className="text-[10px] text-[var(--ink-400)]">Extracted from prescriptions and intake</span>
              </div>

              {medications.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--ink-200)] text-[var(--ink-400)] text-[10px] uppercase tracking-wider font-bold">
                        <th className="py-2 pr-3">Medication Name / Value</th>
                        <th className="py-2 px-3">Field Classification</th>
                        <th className="py-2 px-3">Source Provenance</th>
                        <th className="py-2 px-3">Verification State</th>
                        <th className="py-2 pl-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ink-200)]">
                      {medications.map((med) => (
                        <tr key={med.id} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                          <td className="py-2.5 pr-3 font-semibold text-[var(--ink-900)]">
                            {med.value}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--ink-600)] capitalize">
                            {med.field_name.replace(/_/g, " ")}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--ink-500)] font-mono text-[11px]">
                            {med.source_document_name || med.source_type}
                            {med.source_location ? ` • ${med.source_location}` : ""}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={med.verification_status} />
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <button
                              onClick={() => {
                                setActiveTab("findings");
                                setFieldSearch(med.field_name);
                              }}
                              className="text-[var(--clinical)] hover:underline font-semibold cursor-pointer"
                            >
                              Verify
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-500)] italic py-2">
                  No regular medications recorded for this patient.
                </p>
              )}
            </div>

            {/* Investigations & Diagnostics (Table View) */}
            <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs space-y-2 md:col-span-2">
              <div className="flex items-center justify-between border-b border-[var(--ink-200)] pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                  Investigations &amp; Laboratory Findings ({investigationsList.length + labEntities.length})
                </h4>
                <span className="text-[10px] text-[var(--ink-400)]">Extracted from diagnostics and lab reports</span>
              </div>

              {investigationsList.length > 0 || labEntities.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                  {investigationsList.map((inv, idx) => (
                    <div
                      key={`inv-${idx}`}
                      className="p-2.5 rounded-md border border-[var(--clinical-mid)] bg-[var(--clinical-light)]/70 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-[var(--ink-900)] truncate">• {inv}</span>
                      <span className="text-[10px] bg-white border border-[var(--clinical-mid)] text-[var(--clinical)] px-1.5 py-0.5 rounded font-mono shrink-0">
                        Evidence
                      </span>
                    </div>
                  ))}
                  {labEntities.map((ent) => (
                    <div
                      key={ent.id}
                      className="p-2.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] text-[var(--ink-500)] block uppercase font-bold">
                          {ent.field_name.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-[var(--ink-900)] truncate block">
                          {ent.value}
                        </span>
                      </div>
                      <StatusBadge status={ent.verification_status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-500)] italic py-2">
                  No laboratory investigations or diagnostic tests recorded yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: AI FINDINGS & VERIFICATION WORKSPACE ── */}
      {activeTab === "findings" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-3 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "All Findings", count: entities.length },
                { id: "unreviewed", label: "AI Extracted", count: unreviewedCount },
                { id: "accepted", label: "Verified", count: verifiedCount },
                { id: "edited", label: "Doctor Edited", count: editedCount },
                { id: "rejected", label: "Rejected", count: rejectedCount },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === st.id
                      ? "bg-[var(--clinical)] text-white"
                      : "bg-[var(--bg-surface-2)] border border-[var(--ink-200)] text-[var(--ink-700)] hover:bg-[var(--ink-100)]"
                  }`}
                >
                  <span>{st.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      statusFilter === st.id
                        ? "bg-white/20 text-white"
                        : "bg-[var(--ink-200)] text-[var(--ink-600)]"
                    }`}
                  >
                    {st.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Quick Search */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-[var(--ink-400)] absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search findings by field or value..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs border border-[var(--ink-200)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--clinical)] bg-[var(--bg-surface)]"
              />
              {fieldSearch && (
                <button
                  onClick={() => setFieldSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ink-400)] hover:text-[var(--ink-800)]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notice banner for verification state */}
          {unreviewedCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>
                  <strong>{unreviewedCount} clinical finding{unreviewedCount === 1 ? "" : "s"}</strong> require physician review.
                  Click the green checkmark to verify as clinical truth, pencil to correct, or X to reject.
                </span>
              </div>
            </div>
          )}

          {/* List of Entity Verification Rows */}
          {filteredEntities.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--ink-500)] border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-6">
              No clinical findings match the selected filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntities.map((entity: EntityDetail) => (
                <EntityVerificationRow
                  key={entity.id}
                  entity={entity}
                  onVerify={handleVerify}
                  onInspectEvidence={handleInspectDocumentEvidence}
                  disabled={finalizeSuccess}
                />
              ))}
            </div>
          )}

          {/* Read-Only State Indicator */}
          {finalizeSuccess && (
            <p className="text-xs text-[var(--ink-500)] text-center py-2">
              This consultation is finalized. Findings are read-only and preserved for clinical audit.
            </p>
          )}
        </div>
      )}

      {/* ── TAB 3: DOCUMENTS & EVIDENCE WORKSPACE ── */}
      {activeTab === "documents" && (
        <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink-900)] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[var(--clinical)]" aria-hidden="true" />
                Uploaded Documents &amp; Optical Provenance ({docsList.length})
              </h3>
              <p className="text-xs text-[var(--ink-500)] mt-0.5">
                Inspect raw document OCR blocks, bounding boxes, and extracted clinical evidence.
              </p>
            </div>
          </div>

          <div className="p-5">
            {docsList.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--ink-500)] space-y-2">
                <FolderOpen className="w-10 h-10 mx-auto text-[var(--ink-400)]" aria-hidden="true" />
                <p className="font-semibold text-[var(--ink-800)]">No documents uploaded for this encounter</p>
                <p className="text-xs text-[var(--ink-500)]">All data was collected via conversational intake.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {docsList.map((doc: DocumentDetailResponse) => {
                  const isExp = !!expandedDocIds[doc.id];
                  const isSelected = selectedDocForEvidence === doc.id;
                  const docEntities = doc.extracted_entities || [];

                  return (
                    <div
                      key={doc.id}
                      className={`border rounded-lg overflow-hidden bg-[var(--bg-surface)] transition-all ${
                        isSelected
                          ? "border-[var(--clinical)] ring-1 ring-[var(--clinical-mid)]"
                          : "border-[var(--ink-200)] hover:border-[var(--ink-400)]"
                      }`}
                    >
                      {/* Document Item Header Bar */}
                      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center shrink-0 border border-[var(--clinical-mid)]">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--ink-900)] truncate">
                              {doc.original_filename || "Clinical Document"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[var(--ink-500)] mt-0.5 flex-wrap">
                              <span className="capitalize font-semibold text-[var(--ink-700)]">
                                {doc.document_type.replace(/_/g, " ")}
                              </span>
                              <span>•</span>
                              <span>{new Date(doc.upload_timestamp).toLocaleString("en-IN")}</span>
                              {doc.file_size && (
                                <>
                                  <span>•</span>
                                  <span>{formatFileSize(doc.file_size)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {/* Processing Status Badge */}
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                              doc.processing_status === "processed"
                                ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                                : doc.processing_status === "failed"
                                ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--status-error-bd)]"
                                : "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]"
                            }`}
                          >
                            <FileCheck2 className="w-3 h-3" />
                            <span className="capitalize">{doc.processing_status || "Processed"}</span>
                          </span>

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                            {docEntities.length} entities extracted
                          </span>

                          <button
                            onClick={() => toggleDocExpand(doc.id)}
                            className="p-1.5 rounded-md border border-[var(--ink-200)] hover:bg-[var(--ink-100)] text-[var(--ink-500)] transition-colors cursor-pointer flex items-center gap-1 text-xs"
                            aria-expanded={isExp}
                          >
                            <span>{isExp ? "Collapse Evidence" : "Inspect Evidence"}</span>
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Document Evidence Panel */}
                      {isExp && (
                        <div className="px-5 py-4 bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)] space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-[var(--ink-800)] uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-[var(--clinical)]" />
                              Extracted Entities with Source Provenance ({docEntities.length})
                            </h4>
                            <span className="text-[11px] text-[var(--ink-500)]">
                              Linked to Document ID: {doc.id.slice(0, 8)}…
                            </span>
                          </div>

                          {docEntities.length > 0 ? (
                            <div className="space-y-2">
                              {docEntities.map((ent) => (
                                <div
                                  key={ent.id}
                                  className="px-3.5 py-2.5 bg-[var(--bg-surface)] rounded-md border border-[var(--ink-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[var(--ink-800)] capitalize">
                                        {ent.field_name.replace(/_/g, " ")}
                                      </span>
                                      <span className="font-mono text-[10px] bg-[var(--ink-100)] text-[var(--ink-600)] px-1.5 py-0.2 rounded border border-[var(--ink-200)]">
                                        {ent.source_location || "page 1"}
                                      </span>
                                    </div>
                                    <p className="text-sm font-semibold text-[var(--ink-900)] mt-0.5">
                                      {ent.value}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[10px] text-[var(--ink-500)] font-medium">
                                      AI extraction confidence: {Math.round(ent.confidence * 100)}%
                                    </span>
                                    <StatusBadge status={ent.verification_status} showIcon={false} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--ink-500)] italic py-2">
                              No structured clinical fields extracted from this document.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: CLINICAL TIMELINE ── */}
      {activeTab === "timeline" && (
        <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
            <h3 className="text-sm font-bold text-[var(--ink-900)]">
              Longitudinal Clinical Timeline
            </h3>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">
              Chronological sequence strictly derived from authoritative backend timestamps and patient history.
            </p>
          </div>

          {timeLoading ? (
            <div className="py-12 flex justify-center">
              <FindingsSkeleton />
            </div>
          ) : !timeline?.length ? (
            <div className="py-16 text-center text-sm text-[var(--ink-500)]">
              No longitudinal timeline events recorded for this encounter.
            </div>
          ) : (
            <div className="p-6 relative pl-12 space-y-5 before:absolute before:left-7 before:top-6 before:bottom-6 before:w-0.5 before:bg-[var(--ink-200)]">
              {timeline.map((ev, idx) => (
                <div key={ev.id ?? idx} className="relative">
                  <span
                    className="absolute -left-7 top-1.5 w-3 h-3 rounded-full bg-[var(--clinical)] ring-4 ring-[var(--clinical-light)]"
                    aria-hidden="true"
                  />
                  <div className="bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded-md p-3.5 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-[var(--ink-900)] capitalize">
                        {ev.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-[var(--ink-600)] font-mono font-medium">
                        {ev.date ?? "Date uncertain"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-500)]">
                      Authoritative event recorded in medical history
                      {ev.date_uncertain && (
                        <span className="ml-1 text-[var(--status-pending-fg)] font-semibold">
                          • date flagged uncertain
                        </span>
                      )}
                      {ev.date_confidence > 0 && (
                        <span className="ml-1 text-[var(--ink-400)]">
                          (Confidence: {Math.round(ev.date_confidence * 100)}%)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: FINAL REVIEW & CLINICAL SAFETY GATE ── */}
      {activeTab === "finalize" && (
        <div className="space-y-4">
          {/* Post-Finalization Read-Only State */}
          {finalizeSuccess ? (
            <div className="p-5 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] space-y-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-[var(--status-success-fg)]">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm">Consultation Finalized &amp; Signed</h3>
              </div>
              <p className="text-xs text-[var(--ink-700)] leading-relaxed">
                This clinical consultation is complete. All verified findings and doctor modifications have been permanently written to the patient record. No further alterations are permitted.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/doctor/dashboard")}
                className="text-xs font-semibold"
              >
                Return to Command Center
              </Button>
            </div>
          ) : (
            <>
              {/* Review Summary Metrics Strip */}
              <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
                  <h3 className="text-sm font-bold text-[var(--ink-900)]">
                    Clinical Verification Audit Summary
                  </h3>
                  <p className="text-xs text-[var(--ink-500)] mt-0.5">
                    Pre-finalization check of all AI-extracted and verified medical entities
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[var(--ink-200)]">
                  {[
                    {
                      label: "Total Entities",
                      value: entities.length,
                      cls: "text-[var(--ink-900)]",
                    },
                    {
                      label: "AI Extracted (Unreviewed)",
                      value: unreviewedCount,
                      cls:
                        unreviewedCount > 0
                          ? "text-[var(--status-pending-fg)] font-bold"
                          : "text-[var(--ink-600)]",
                    },
                    {
                      label: "Doctor Verified / Edited",
                      value: verifiedCount + editedCount,
                      cls: "text-[var(--status-success-fg)]",
                    },
                    {
                      label: "Doctor Rejected",
                      value: rejectedCount,
                      cls: "text-[var(--status-error-fg)]",
                    },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="px-5 py-4 text-center">
                      <p className={`text-2xl font-bold tracking-tight ${cls}`}>{value}</p>
                      <p className="text-[11px] font-medium text-[var(--ink-500)] mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety Gate Warning If Unreviewed Entities Remain */}
              {unreviewedCount > 0 ? (
                <div className="flex items-start gap-3.5 p-4 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] shadow-xs">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">
                      {unreviewedCount} clinical finding{unreviewedCount === 1 ? " remains" : "s remain"} unverified
                    </p>
                    <p className="text-xs text-[var(--ink-700)]">
                      In accordance with hospital clinical governance, all AI-extracted findings must be explicitly accepted, edited, or rejected by the attending physician before finalization.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveTab("findings")}
                      className="mt-2 text-xs font-semibold"
                    >
                      Review Remaining Findings Now
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)] flex items-center gap-2.5 shadow-xs">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <span className="text-xs font-semibold">
                    All clinical findings have been reviewed and verified. This consultation is ready for final sign-off.
                  </span>
                </div>
              )}

              {/* Finalization Action Container */}
              <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
                <div>
                  <h3 className="text-sm font-bold text-[var(--ink-900)]">
                    Finalize &amp; Sign Consultation
                  </h3>
                  <p className="text-xs text-[var(--ink-500)] mt-1 leading-relaxed">
                    Signing and finalizing commits this pre-consultation intake record to the permanent hospital archive.
                    This action is <span className="font-bold text-[var(--ink-900)]">irreversible</span> and will be logged under your clinician credential.
                  </p>
                </div>

                {finalizeConfirm ? (
                  <div className="space-y-3 p-4 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="font-medium">
                        Are you sure you want to finalize this encounter? Once committed, no further clinical edits or verification status changes can be made.
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => finalizeMut.mutate()}
                        isLoading={finalizeMut.isPending}
                        className="bg-[var(--status-success-fg)] hover:bg-emerald-800 text-white text-xs font-bold px-4"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" /> Confirm &amp; Finalize
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setFinalizeConfirm(false)}
                        className="text-xs font-semibold"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={unreviewedCount > 0}
                    onClick={() => setFinalizeConfirm(true)}
                    className={`text-xs font-bold px-5 flex items-center gap-1.5 ${
                      unreviewedCount > 0
                        ? "opacity-50 cursor-not-allowed"
                        : "bg-[var(--clinical)] hover:bg-[var(--clinical-dark)] text-white"
                    }`}
                  >
                    <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                    {unreviewedCount > 0
                      ? `Verify ${unreviewedCount} Remaining Finding${unreviewedCount === 1 ? "" : "s"} First`
                      : "Finalize Consultation"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
