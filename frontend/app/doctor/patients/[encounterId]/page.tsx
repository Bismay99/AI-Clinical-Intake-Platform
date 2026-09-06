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
  ExternalLink, ChevronDown, ChevronUp, FileCheck2,
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

  return (
    <div className="space-y-6 pb-16">
      {/* Patient Header */}
      <PatientHeader
        patientName="Patient Record"
        patientId={summary.encounter_id}
        encounterId={summary.encounter_id}
        department="General OPD"
        status={finalizeSuccess ? "completed" : "ready_for_review"}
        backHref="/doctor/dashboard"
      />

      {/* Finalize Success Banner */}
      {finalizeSuccess && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold">Encounter finalized successfully. Status changed to Completed.</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => router.push("/doctor/dashboard")}>
            Return to Queue
          </Button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E4E7EC] gap-6">
        {[
          { key: "overview",  label: "Consolidated Report",  icon: FileText },
          { key: "history",   label: `Clinical History (${unreviewedCount > 0 ? `${unreviewedCount} unreviewed` : "Verified"})`, icon: History },
          { key: "documents", label: `Documents (${docsCount})`, icon: FileCheck },
          { key: "timeline",  label: "Timeline",         icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as "overview" | "history" | "documents" | "timeline")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === key ? "border-[#155EEF] text-[#155EEF]" : "border-transparent text-[#667085] hover:text-[#172033]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Consolidated Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Pre-Consultation Status Banner */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#155EEF]" />
              <div>
                <p className="text-sm font-bold text-[#172033]">Consolidated Clinical Report</p>
                <p className="text-xs text-[#667085]">
                  Aggregated from conversational intake turns and {docsCount} uploaded medical document{docsCount === 1 ? "" : "s"}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-[#155EEF] border border-blue-200">
                Documents reviewed: {docsCount}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                {unreviewedCount > 0 ? `${unreviewedCount} Awaiting Review` : "All Verified"}
              </span>
            </div>
          </div>

          {/* AI Clinical Summary */}
          <Card className="shadow-xs">
            <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
              <CardTitle className="text-sm font-bold text-[#172033]">Clinical Summary Narrative</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <p className="text-sm text-[#172033] leading-relaxed whitespace-pre-line">
                {summary.summary_text}
              </p>
              <div className="mt-4 pt-3 border-t border-[#E4E7EC] flex items-center justify-between text-xs text-[#667085]">
                <span>Generated: {new Date(summary.generated_at).toLocaleString("en-IN")}</span>
                <span>Entities Used: {summary.used_entity_fields?.length ?? 0}</span>
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

      {/* TAB 2: Clinical History & Verification */}
      {activeTab === "history" && (
        <div className="space-y-5">
          {/* Status Filter Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {["all", "unreviewed", "accepted", "edited", "rejected"].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    statusFilter === st
                      ? "bg-[#155EEF] text-white"
                      : "bg-white border border-[#E4E7EC] text-[#667085] hover:bg-gray-50"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <span className="text-xs text-[#667085]">
              Showing {filteredEntities.length} of {entities.length} clinical fields
            </span>
          </div>

          {/* Entity Verification List */}
          <div className="space-y-3">
            {filteredEntities.map(entity => (
              <EntityVerificationRow
                key={entity.id}
                entity={entity}
                onVerify={handleVerify}
                disabled={finalizeSuccess}
              />
            ))}
          </div>

          {/* Finalize Bar */}
          {!finalizeSuccess && (
            <div className="mt-8 pt-6 border-t border-[#E4E7EC] flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-5 rounded-xl border shadow-xs">
              <div>
                <h4 className="text-sm font-bold text-[#172033]">Complete Encounter Review</h4>
                <p className="text-xs text-[#667085] mt-0.5">
                  Finalizing creates an immutable audit trail and marks this encounter as Completed.
                </p>
              </div>
              {finalizeConfirm ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => finalizeMut.mutate()}
                    isLoading={finalizeMut.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold"
                  >
                    Confirm & Finalize
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFinalizeConfirm(false)} className="text-xs">
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="md"
                  onClick={() => setFinalizeConfirm(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-6"
                >
                  Finalize Encounter
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Documents & Evidence */}
      {activeTab === "documents" && (
        <Card className="shadow-xs">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
            <CardTitle className="text-sm font-bold text-[#172033] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#155EEF]" />
                <span>Uploaded Documents ({docsList.length})</span>
              </span>
              <span className="text-xs text-[#667085] font-normal">
                Click any document to inspect OCR text and extracted findings
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {docsList.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#667085]">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 text-[#D0D5DD]" />
                No medical documents uploaded for this encounter.
              </div>
            ) : (
              <div className="space-y-4">
                {docsList.map((doc: DocumentDetailResponse) => {
                  const isExp = !!expandedDocIds[doc.id];
                  const docEntities = doc.extracted_entities || [];
                  return (
                    <div
                      key={doc.id}
                      className="border border-[#E4E7EC] rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors"
                    >
                      {/* Document Card Header */}
                      <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155EEF] flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#172033] truncate">
                              {doc.original_filename || "Document"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[#667085] mt-0.5 flex-wrap">
                              <span className="capitalize font-semibold text-[#172033]">
                                {doc.document_type.replace(/_/g, " ")}
                              </span>
                              <span>•</span>
                              <span>Uploaded {new Date(doc.upload_timestamp).toLocaleString("en-IN")}</span>
                              {doc.file_size && (
                                <>
                                  <span>•</span>
                                  <span>{formatFileSize(doc.file_size)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <FileCheck2 className="w-3 h-3" />
                            <span className="capitalize">{doc.processing_status || "Processed"}</span>
                          </span>

                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-[#155EEF] border border-blue-200">
                            {docEntities.length} findings
                          </span>

                          <button
                            onClick={() => toggleDocExpand(doc.id)}
                            className="p-1.5 rounded-lg border border-[#E4E7EC] hover:bg-gray-50 text-[#667085] transition-colors ml-1"
                            title={isExp ? "Collapse details" : "Expand details"}
                          >
                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Document Findings */}
                      {isExp && (
                        <div className="p-4 bg-[#F7F9FC] border-t border-[#E4E7EC] space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#155EEF]" />
                              <span>Extracted Clinical Entities</span>
                            </h4>
                            <span className="text-[11px] text-[#667085]">
                              {docEntities.length} fields extracted
                            </span>
                          </div>

                          {docEntities.length > 0 ? (
                            <div className="space-y-2">
                              {docEntities.map((ent) => (
                                <div
                                  key={ent.id}
                                  className="p-3 bg-white rounded-lg border border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[#172033]">{ent.field_name.replace(/_/g, " ")}</span>
                                      <span className="text-[#667085] font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
                                        {ent.source_location || "page 1"}
                                      </span>
                                    </div>
                                    <p className="text-sm font-medium text-[#172033] mt-0.5">{ent.value}</p>
                                  </div>

                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="text-[11px] font-mono text-[#12B76A] font-semibold">
                                      {Math.round(ent.confidence * 100)}% conf
                                    </span>
                                    <StatusBadge status={ent.verification_status} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[#667085] italic py-2">
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
        <Card className="shadow-xs">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
            <CardTitle className="text-sm font-bold text-[#172033]">Longitudinal Clinical Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {timeLoading ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : !timeline?.length ? (
              <div className="py-8 text-center text-sm text-[#667085]">No longitudinal timeline events recorded.</div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E4E7EC]">
                {timeline.map((ev, idx) => (
                  <div key={ev.id ?? idx} className="relative">
                    <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[#155EEF] ring-4 ring-blue-50" />
                    <div className="bg-[#F7F9FC] border border-[#E4E7EC] rounded-lg p-3.5 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#172033] capitalize">{ev.event_type}</span>
                        <span className="text-xs text-[#667085] font-mono">{ev.date ?? "Date uncertain"}</span>
                      </div>
                      <p className="text-xs text-[#667085]">
                        Confidence: {Math.round(ev.date_confidence * 100)}% {ev.date_uncertain && "(flagged uncertain)"}
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
