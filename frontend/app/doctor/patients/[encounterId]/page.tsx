"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSummary, getTimeline, verifyEntity, finalizeEncounter } from "@/services/doctor.service";
import { PatientHeader } from "@/components/doctor/PatientHeader";
import { EntityVerificationRow } from "@/components/doctor/EntityVerificationRow";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  FileText, History, Clock, FileCheck, CheckCircle2,
  AlertTriangle, ShieldCheck, FolderOpen, FlaskConical,
  ChevronDown, ChevronUp, FileCheck2,
} from "lucide-react";
import type { VerifyAction, DocumentDetailResponse } from "@/types/doctor";

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EncounterReviewPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const encounterId = params?.encounterId as string;

  const [activeTab, setActiveTab] = useState<"overview" | "history" | "documents" | "timeline">("overview");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});

  // 1. Clinical Summary + Entities (Consolidated)
  const { data: summary, isLoading: sumLoading, error: sumError } = useQuery({
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

  // 3. Verification Mutation
  const verifyMut = useMutation({
    mutationFn: ({ entityId, action, newValue }: { entityId: string; action: VerifyAction; newValue?: string }) =>
      verifyEntity(entityId, { action, new_value: newValue }),
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

  async function handleVerify(entityId: string, action: VerifyAction, newValue?: string) {
    await verifyMut.mutateAsync({ entityId, action, newValue });
  }

  function toggleDocExpand(id: string) {
    setExpandedDocIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (sumLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-xs text-[#667085]">Loading consolidated clinical intake record…</p>
      </div>
    );
  }

  if (sumError || !summary) {
    return (
      <div className="max-w-xl mx-auto py-16 space-y-4">
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20] flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Encounter record not accessible</p>
            <p className="text-xs mt-1">This encounter may not be assigned to your doctor account, or does not exist.</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => router.push("/doctor/dashboard")}>
          Back to Queue
        </Button>
      </div>
    );
  }

  const entities = summary.entities ?? [];
  const unreviewedCount = entities.filter(e => e.verification_status === "unreviewed").length;
  const filteredEntities = statusFilter === "all" ? entities : entities.filter(e => e.verification_status === statusFilter);

  // Group entities by general category for structured overview
  const chiefComplaint = entities.find(e => e.field_name.toLowerCase().includes("chief_complaint") || e.field_name.toLowerCase().includes("symptom"))?.value;
  const medicalHistory = entities.filter(e => e.field_name.toLowerCase().includes("history") || e.field_name.toLowerCase().includes("past"));
  const medications = entities.filter(e => e.field_name.toLowerCase().includes("medication") || e.field_name.toLowerCase().includes("drug"));
  const allergies = entities.filter(e => e.field_name.toLowerCase().includes("allergy"));
  const investigationsList = summary.investigations ?? [];
  const docsList = summary.documents ?? [];
  const docsCount = summary.documents_count ?? docsList.length;

  // Finalize action node — passed into PatientHeader as action prop
  const finalizeAction = !finalizeSuccess ? (
    finalizeConfirm ? (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => finalizeMut.mutate()}
          isLoading={finalizeMut.isPending}
          className="bg-[var(--status-success-fg)] hover:bg-emerald-800 text-white"
        >
          Confirm Finalize
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setFinalizeConfirm(false)}>
          Cancel
        </Button>
      </div>
    ) : (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setFinalizeConfirm(true)}
        className="border-[var(--status-success-bd)] text-[var(--status-success-fg)] hover:bg-[var(--status-success-bg)]"
      >
        <FileCheck2 className="w-4 h-4" />
        Finalize Encounter
      </Button>
    )
  ) : null;

  return (
    <div className="space-y-5 pb-16">
      {/* Patient Header with Finalize action slotted in */}
      <PatientHeader
        patientName={summary.patient_name || "Patient Record"}
        patientId={summary.patient_id || summary.encounter_id}
        encounterId={summary.encounter_id}
        department={summary.opd_department || "General OPD"}
        status={finalizeSuccess ? "completed" : "ready_for_review"}
        backHref="/doctor/dashboard"
        action={finalizeAction}
      />

      {/* Finalize Success Banner */}
      {finalizeSuccess && (
        <div className="px-4 py-3 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-sm text-[var(--status-success-fg)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold">Encounter finalized. This record is now read-only.</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => router.push("/doctor/dashboard")}>
            Return to Queue
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[var(--ink-200)] gap-5">
        {[
          { key: "overview",  label: "Consolidated Report", icon: FileText },
          { key: "history",   label: `Clinical Findings (${unreviewedCount > 0 ? `${unreviewedCount} unreviewed` : "All verified"})`, icon: History },
          { key: "documents", label: `Documents (${docsCount})`, icon: FileCheck },
          { key: "timeline",  label: "Timeline", icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "overview" | "history" | "documents" | "timeline")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === key
                ? "border-[var(--clinical)] text-[var(--clinical)]"
                : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-800)]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Consolidated Overview */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Pre-Consultation Status Banner */}
          <div className="px-4 py-3 rounded-lg border border-[var(--clinical-mid)] bg-[var(--clinical-light)] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--clinical)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--ink-900)]">Consolidated Clinical Report</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Aggregated from conversational intake turns and {docsCount} uploaded medical document{docsCount === 1 ? "" : "s"}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                {docsCount} document{docsCount === 1 ? "" : "s"}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${unreviewedCount > 0 ? "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]" : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"}`}>
                {unreviewedCount > 0 ? `${unreviewedCount} awaiting review` : "All entities verified"}
              </span>
            </div>
          </div>

          {/* AI Clinical Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Clinical Summary Narrative</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--ink-800)] leading-relaxed whitespace-pre-line">
                {summary.summary_text}
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--ink-200)] flex items-center justify-between text-xs text-[var(--ink-500)]">
                <span>Generated: {new Date(summary.generated_at).toLocaleString("en-IN")}</span>
                <span>Entities used: {summary.used_entity_fields?.length ?? 0}</span>
              </div>
            </CardContent>
          </Card>


          {/* Structured Clinical Sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Chief Complaint */}
            <Card className="shadow-xs">
              <CardHeader className="px-4 py-3 border-b border-[#E4E7EC]">
                <CardTitle className="text-xs font-bold text-[#667085] uppercase tracking-wider">Chief Complaint</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-[#172033]">{chiefComplaint ?? "Reported in consultation summary"}</p>
              </CardContent>
            </Card>

            {/* Allergies */}
            <Card className="shadow-xs">
              <CardHeader className="px-4 py-3 border-b border-[#E4E7EC]">
                <CardTitle className="text-xs font-bold text-[#667085] uppercase tracking-wider">Allergies</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {allergies.length ? (
                  <ul className="space-y-1.5 text-sm text-[#172033]">
                    {allergies.map(a => (
                      <li key={a.id} className="font-medium flex items-center justify-between gap-2">
                        <span>• {a.value}</span>
                        {a.source_document_name && (
                          <span className="text-[10px] bg-blue-50 text-[#155EEF] px-1.5 py-0.5 rounded font-mono">
                            Doc: {a.source_document_name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#667085]">No known drug allergies reported.</p>
                )}
              </CardContent>
            </Card>

            {/* Medical History */}
            <Card className="shadow-xs">
              <CardHeader className="px-4 py-3 border-b border-[#E4E7EC]">
                <CardTitle className="text-xs font-bold text-[#667085] uppercase tracking-wider">Medical History</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {medicalHistory.length ? (
                  <ul className="space-y-1.5 text-sm text-[#172033]">
                    {medicalHistory.map(m => (
                      <li key={m.id} className="font-medium flex items-center justify-between gap-2">
                        <span>• {m.field_name.replace(/_/g, " ")}: {m.value}</span>
                        {m.source_document_name && (
                          <span className="text-[10px] bg-blue-50 text-[#155EEF] px-1.5 py-0.5 rounded font-mono">
                            Doc: {m.source_document_name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#667085]">No significant past medical history captured.</p>
                )}
              </CardContent>
            </Card>

            {/* Current Medications */}
            <Card className="shadow-xs">
              <CardHeader className="px-4 py-3 border-b border-[#E4E7EC]">
                <CardTitle className="text-xs font-bold text-[#667085] uppercase tracking-wider">Current Medications</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {medications.length ? (
                  <ul className="space-y-1.5 text-sm text-[#172033]">
                    {medications.map(m => (
                      <li key={m.id} className="font-medium flex items-center justify-between gap-2">
                        <span>• {m.value}</span>
                        {m.source_document_name && (
                          <span className="text-[10px] bg-blue-50 text-[#155EEF] px-1.5 py-0.5 rounded font-mono">
                            Doc: {m.source_document_name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#667085]">No regular medications reported.</p>
                )}
              </CardContent>
            </Card>

            {/* Investigations / Lab Findings (Span 2) */}
            <Card className="shadow-xs sm:col-span-2">
              <CardHeader className="px-4 py-3 border-b border-[#E4E7EC] flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Investigations & Diagnostics ({investigationsList.length})</span>
                </CardTitle>
                <span className="text-xs text-[#667085]">Extracted from lab reports & diagnostic uploads</span>
              </CardHeader>
              <CardContent className="p-4">
                {investigationsList.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {investigationsList.map((inv, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg border border-indigo-100 bg-indigo-50/40 flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#172033] truncate">• {inv}</span>
                        <span className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                          Evidence
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#667085] italic">No laboratory investigations or diagnostics recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Clinical Findings & Verification */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Status Filter Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {["all", "unreviewed", "accepted", "edited", "rejected"].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    statusFilter === st
                      ? "bg-[var(--clinical)] text-white"
                      : "bg-[var(--bg-surface)] border border-[var(--ink-200)] text-[var(--ink-500)] hover:bg-[var(--ink-100)]"
                  }`}
                >
                  {st === "all" ? "All" : st === "unreviewed" ? "AI Extracted" : st === "accepted" ? "Verified" : st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--ink-500)]">
              {filteredEntities.length} of {entities.length} clinical fields
            </span>
          </div>

          {/* Entity Verification List */}
          {filteredEntities.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--ink-500)]">
              No clinical fields match this filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntities.map(entity => (
                <EntityVerificationRow
                  key={entity.id}
                  entity={entity}
                  onVerify={handleVerify}
                  disabled={finalizeSuccess}
                />
              ))}
            </div>
          )}

          {/* Read-only notice when finalized */}
          {finalizeSuccess && (
            <p className="text-xs text-[var(--ink-500)] text-center py-2">
              This encounter is finalized. Clinical findings are read-only.
            </p>
          )}
        </div>
      )}

      {/* TAB 3: Documents & Evidence */}
      {activeTab === "documents" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[var(--clinical)]" />
                Uploaded Documents ({docsList.length})
              </CardTitle>
              <span className="text-xs text-[var(--ink-500)]">
                Expand any document to inspect extracted clinical entities
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {docsList.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--ink-500)]">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 text-[var(--ink-400)]" />
                No medical documents uploaded for this encounter.
              </div>
            ) : (
              <div className="space-y-3">
                {docsList.map((doc: DocumentDetailResponse) => {
                  const isExp = !!expandedDocIds[doc.id];
                  const docEntities = doc.extracted_entities || [];
                  return (
                    <div
                      key={doc.id}
                      className="border border-[var(--ink-200)] rounded-lg overflow-hidden bg-[var(--bg-surface)] hover:border-[var(--ink-400)] transition-colors"
                    >
                      {/* Document row */}
                      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center flex-shrink-0 border border-[var(--clinical-mid)]">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink-900)] truncate">
                              {doc.original_filename || "Document"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[var(--ink-500)] mt-0.5 flex-wrap">
                              <span className="capitalize font-medium text-[var(--ink-700)]">
                                {doc.document_type.replace(/_/g, " ")}
                              </span>
                              <span>·</span>
                              <span>{new Date(doc.upload_timestamp).toLocaleString("en-IN")}</span>
                              {doc.file_size && (
                                <>
                                  <span>·</span>
                                  <span>{formatFileSize(doc.file_size)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Processing status */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            doc.processing_status === "processed"
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                              : doc.processing_status === "failed"
                              ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--status-error-bd)]"
                              : "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]"
                          }`}>
                            <FileCheck2 className="w-3 h-3" />
                            <span className="capitalize">{doc.processing_status || "processed"}</span>
                          </span>

                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border border-[var(--status-info-bd)]">
                            {docEntities.length} entities
                          </span>

                          <button
                            onClick={() => toggleDocExpand(doc.id)}
                            className="p-1.5 rounded-md border border-[var(--ink-200)] hover:bg-[var(--ink-100)] text-[var(--ink-500)] transition-colors"
                            title={isExp ? "Collapse" : "Expand"}
                            aria-expanded={isExp}
                          >
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable entities panel */}
                      {isExp && (
                        <div className="px-4 py-3 bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)] space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[var(--clinical)]" />
                              Extracted Clinical Entities
                            </h4>
                            <span className="text-[10px] text-[var(--ink-500)]">
                              {docEntities.length} field{docEntities.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          {docEntities.length > 0 ? (
                            <div className="space-y-1.5">
                              {docEntities.map((ent) => (
                                <div
                                  key={ent.id}
                                  className="px-3 py-2 bg-[var(--bg-surface)] rounded-md border border-[var(--ink-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-[var(--ink-800)]">{ent.field_name.replace(/_/g, " ")}</span>
                                      <span className="text-[var(--ink-400)] font-mono text-[9px] bg-[var(--ink-100)] px-1.5 py-0.5 rounded">
                                        {ent.source_location || "page 1"}
                                      </span>
                                    </div>
                                    <p className="text-sm font-medium text-[var(--ink-900)] mt-0.5">{ent.value}</p>
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] text-[var(--ink-500)]">
                                      {Math.round(ent.confidence * 100)}% AI confidence
                                    </span>
                                    <StatusBadge status={ent.verification_status} showIcon={false} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--ink-500)] italic py-2">
                              No clinical fields extracted from this document.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: Timeline */}
      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle>Longitudinal Clinical Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {timeLoading ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : !timeline?.length ? (
              <div className="py-8 text-center text-sm text-[var(--ink-500)]">No longitudinal timeline events recorded.</div>
            ) : (
              <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--ink-200)]">
                {timeline.map((ev, idx) => (
                  <div key={ev.id ?? idx} className="relative">
                    <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[var(--clinical)] ring-4 ring-[var(--clinical-light)]" />
                    <div className="bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded-md p-3 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--ink-900)] capitalize">{ev.event_type}</span>
                        <span className="text-xs text-[var(--ink-500)] font-mono">{ev.date ?? "Date uncertain"}</span>
                      </div>
                      <p className="text-xs text-[var(--ink-500)]">
                        AI extraction confidence: {Math.round(ev.date_confidence * 100)}%{ev.date_uncertain && " · date flagged uncertain"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
