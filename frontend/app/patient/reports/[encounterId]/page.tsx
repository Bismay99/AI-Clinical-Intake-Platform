"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Calendar,
  User,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Clock,
  Stethoscope,
  Info,
  AlertTriangle,
  FolderOpen,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { getPatientReport } from "@/services/report.service";
import type { PatientReportDetailResponse } from "@/types/report";

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PatientReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = (params?.encounterId as string) || "";

  const [report, setReport] = useState<PatientReportDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!encounterId) return;

    async function loadReport() {
      try {
        const data = await getPatientReport(encounterId);
        setReport(data);
      } catch (err: unknown) {
        console.error("Failed to load report:", err);
        setError("This report could not be found or you do not have permission to view it.");
      } finally {
        setIsLoading(false);
      }
    }
    loadReport();
  }, [encounterId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-28">
        <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-6 rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-xs)]">
          <Spinner />
          <span className="text-sm font-medium">Assembling structured clinical report…</span>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-xl mx-auto py-16 space-y-4">
        <div className="p-4 rounded-lg border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)] flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error || "Report not found."}</span>
        </div>
        <Link href="/patient/reports">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to My Reports
          </Button>
        </Link>
      </div>
    );
  }

  const isAwaitingReview = report.queue_status === "ready_for_review";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 print:max-w-none print:p-0">
      {/* ── Top Navigation & Actions ── */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/patient/reports"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--clinical)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reports</span>
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          className="text-xs font-medium flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-[var(--ink-500)]" />
          <span>Print / Save PDF</span>
        </Button>
      </div>

      {/* ── Formal Clinical Report Document ── */}
      <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-sm)] overflow-hidden print:border-none print:shadow-none">
        {/* Document Header */}
        <div className="p-6 sm:p-8 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--clinical)] mb-1">
                <Stethoscope className="w-3.5 h-3.5" />
                <span>CareFlow AI Clinical Intake Platform</span>
              </div>
              <h1 className="text-2xl font-bold text-[var(--ink-900)]">
                Pre-Consultation Clinical Report
              </h1>
              <p className="text-xs text-[var(--ink-500)] mt-1">
                Department of {report.opd_department || "General OPD"} · Prepared for Physician Review
              </p>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <Badge
                variant={isAwaitingReview ? "warning" : "success"}
                className="text-xs font-semibold py-1 px-3"
              >
                {report.doctor_review_status}
              </Badge>
              <p className="text-[11px] text-[var(--ink-500)] font-mono">
                Date: {report.consultation_date}
              </p>
            </div>
          </div>

          {/* Patient Metadata Grid */}
          <div className="mt-6 pt-5 border-t border-[var(--ink-200)] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[var(--ink-500)] block mb-0.5">Patient Name</span>
              <span className="font-semibold text-[var(--ink-900)]">{report.patient_name}</span>
            </div>
            <div>
              <span className="text-[var(--ink-500)] block mb-0.5">Patient UID</span>
              <span className="font-mono font-medium text-[var(--clinical)]">{report.patient_uid}</span>
            </div>
            <div>
              <span className="text-[var(--ink-500)] block mb-0.5">Encounter ID</span>
              <span className="font-mono text-[var(--ink-900)]">{report.encounter_id}</span>
            </div>
            <div>
              <span className="text-[var(--ink-500)] block mb-0.5">Review Status</span>
              <span className="font-medium text-[var(--ink-900)] capitalize">{report.queue_status.replace(/_/g, " ")}</span>
            </div>
          </div>
        </div>

        {/* Report Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Status Alert Banner */}
          {isAwaitingReview ? (
            <div className="p-4 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-xs text-[var(--status-pending-fg)] flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--status-pending-fg)]" />
              <div>
                <p className="font-bold text-[var(--ink-900)]">Status: Awaiting Doctor Review</p>
                <p className="mt-0.5 leading-relaxed">
                  This report was compiled automatically by CareVoice from your conversation and uploaded documents. All clinical facts are awaiting physician verification before final consultation.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-fg)] flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--status-success-fg)]" />
              <div>
                <p className="font-bold text-[var(--ink-900)]">Status: Verified by Physician</p>
                <p className="mt-0.5 leading-relaxed">
                  Your clinical history has been reviewed and verified by the attending physician.
                </p>
              </div>
            </div>
          )}

          {/* ── Section 1: Chief Complaint ── */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
              <span>1. Chief Complaint</span>
            </h2>
            <div className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--ink-200)]">
              <p className="text-base font-semibold text-[var(--ink-900)]">
                {report.chief_complaint || "No chief complaint explicitly recorded."}
              </p>
            </div>
          </section>

          {/* ── Section 2: History of Presenting Illness (HPI) ── */}
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
              <span>2. History of Presenting Illness (HPI)</span>
            </h2>
            {Object.keys(report.hpi_details).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {Object.entries(report.hpi_details).map(([field, val]) => (
                  <div key={field} className="p-3.5 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)]">
                    <span className="text-[var(--ink-500)] block mb-1 font-medium">{field}</span>
                    <span className="font-semibold text-[var(--ink-900)] text-sm">{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--ink-500)] italic p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--ink-200)]">
                No structured HPI attributes were captured during intake.
              </p>
            )}
          </section>

          {/* ── Section 3: Clinical Summary Narrative ── */}
          {report.summary_text && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
                <span>3. Pre-Consultation Summary Narrative</span>
              </h2>
              <div className="p-4 rounded-lg bg-[var(--clinical-light)]/40 border border-[var(--clinical-mid)] text-xs text-[var(--ink-900)] leading-relaxed">
                <p className="font-serif text-sm leading-relaxed">{report.summary_text}</p>
                {report.summary_generated_at && (
                  <p className="text-[11px] text-[var(--ink-500)] mt-2 italic">
                    Synthesized on {report.summary_generated_at} from patient intake and uploaded documents.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── Section 4: Categorized Medical History & Investigations ── */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
              <span>4. Medical, Medication, Allergy &amp; Investigation History</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Medical History */}
              <div className="p-3.5 rounded-lg border border-[var(--ink-200)] space-y-2 bg-[var(--bg-surface)]">
                <span className="font-bold text-[var(--ink-900)] block border-b border-[var(--ink-200)] pb-1">
                  Past Medical History
                </span>
                {report.medical_history.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-[var(--ink-800)]">
                    {report.medical_history.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[var(--ink-500)] italic">Not provided</span>
                )}
              </div>

              {/* Medications */}
              <div className="p-3.5 rounded-lg border border-[var(--ink-200)] space-y-2 bg-[var(--bg-surface)]">
                <span className="font-bold text-[var(--ink-900)] block border-b border-[var(--ink-200)] pb-1">
                  Current Medications
                </span>
                {report.medications.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-[var(--ink-800)]">
                    {report.medications.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[var(--ink-500)] italic">Not provided</span>
                )}
              </div>

              {/* Allergies */}
              <div className="p-3.5 rounded-lg border border-[var(--ink-200)] space-y-2 bg-[var(--bg-surface)]">
                <span className="font-bold text-[var(--ink-900)] block border-b border-[var(--ink-200)] pb-1">
                  Known Allergies
                </span>
                {report.allergies.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-[var(--ink-800)]">
                    {report.allergies.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[var(--ink-500)] italic">Not provided</span>
                )}
              </div>

              {/* Investigations (Lab / Diagnostic Findings) */}
              <div className="p-3.5 rounded-lg border border-[var(--ink-200)] space-y-2 bg-[var(--bg-surface)]">
                <span className="font-bold text-[var(--clinical)] block border-b border-[var(--ink-200)] pb-1 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-[var(--clinical)]" />
                  <span>Investigations / Labs</span>
                </span>
                {report.investigations && report.investigations.length > 0 ? (
                  <ul className="space-y-1 text-[var(--ink-800)]">
                    {report.investigations.map((inv, idx) => (
                      <li key={idx} className="font-medium truncate">• {inv}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[var(--ink-500)] italic">No lab findings captured</span>
                )}
              </div>
            </div>
          </section>

          {/* ── Section 5: Uncaptured Clinical Fields (Not Provided - Never Inferred) ── */}
          {report.missing_fields.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink-400)]" />
                <span>5. Clinical Fields Not Captured</span>
              </h2>
              <div className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--ink-200)] space-y-2">
                <p className="text-xs text-[var(--ink-500)]">
                  The following schema fields were not captured during intake and are explicitly marked as not provided (never inferred by AI):
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {report.missing_fields.map((mf) => (
                    <span
                      key={mf.field_name}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--ink-200)] text-xs text-[var(--ink-500)]"
                    >
                      <span className="font-medium text-[var(--ink-900)]">{mf.label}:</span>
                      <span className="italic text-[var(--ink-500)]">{mf.status}</span>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Section 6: AI Extraction Evidence & Confidence ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
                <span>6. AI Extraction Evidence &amp; Provenance</span>
              </h2>
              <span className="text-[11px] text-[var(--ink-500)]">
                {report.extracted_entities.length} total facts captured
              </span>
            </div>

            <div className="rounded-lg border border-[var(--ink-200)] overflow-hidden text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)] text-[var(--ink-500)] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Clinical Field</th>
                      <th className="py-2.5 px-3">Extracted Value</th>
                      <th className="py-2.5 px-3">AI Extraction Confidence</th>
                      <th className="py-2.5 px-3">Evidence Source</th>
                      <th className="py-2.5 px-3">Verification State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink-200)] bg-[var(--bg-surface)]">
                    {report.extracted_entities.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 px-3 text-center text-[var(--ink-500)] italic">
                          No entities extracted.
                        </td>
                      </tr>
                    ) : (
                      report.extracted_entities.map((ent, i) => (
                        <tr key={i} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-[var(--ink-900)]">
                            {ent.label}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[var(--ink-900)]">
                            {ent.value}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`font-mono font-medium ${ent.low_confidence_flag ? "text-[var(--status-pending-fg)] font-bold" : "text-[var(--status-success-fg)]"}`}>
                              {(ent.confidence * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[var(--ink-500)] font-mono text-[11px]">
                            {ent.source_document_name ? (
                              <span className="text-[var(--clinical)] font-semibold">
                                {ent.source_document_name}
                                {ent.source_location ? ` (${ent.source_location})` : ""}
                              </span>
                            ) : (
                              <span>
                                {ent.source_type}
                                {ent.source_location ? ` (${ent.source_location})` : ""}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              ent.verification_status === "accepted"
                                ? "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)]"
                                : ent.verification_status === "edited"
                                ? "bg-[var(--entity-edited-bg)] text-[var(--entity-edited-fg)] border-[var(--entity-edited-bd)]"
                                : ent.verification_status === "rejected"
                                ? "bg-[var(--entity-rejected-bg)] text-[var(--entity-rejected-fg)] border-[var(--entity-rejected-bd)]"
                                : "bg-[var(--entity-ai-bg)] text-[var(--entity-ai-fg)] border-[var(--entity-ai-bd)] border-dashed"
                            }`}>
                              {ent.verification_status === "unreviewed"
                                ? "AI extracted · verify"
                                : `Doctor ${ent.verification_status}`}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── Section 7: Documents Reviewed ── */}
          {report.documents && report.documents.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
                  <span>7. Uploaded Medical Documents ({report.documents_count || report.documents.length})</span>
                </h2>
                <span className="text-xs text-[var(--ink-500)]">
                  {report.documents_count || report.documents.length} records analyzed
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {report.documents.map((d) => (
                  <div key={d.id} className="p-3.5 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText className="w-4 h-4 text-[var(--clinical)] flex-shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-[var(--ink-900)] truncate">
                          {d.original_filename || d.filename || "Medical Document"}
                        </p>
                        <p className="text-[11px] text-[var(--ink-500)]">
                          Type: {d.document_type.replace(/_/g, " ")} · {d.upload_timestamp}
                          {d.file_size ? ` · ${formatFileSize(d.file_size)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)] px-2 py-0.5 rounded font-medium flex-shrink-0">
                      {d.extracted_entity_count ?? d.entity_count} entities
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 8: Longitudinal Timeline ── */}
          {report.timeline && report.timeline.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)]" />
                <span>8. Clinical Timeline</span>
              </h2>
              <div className="space-y-2 text-xs">
                {report.timeline.map((t) => (
                  <div key={t.id} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--clinical)]" />
                      <span className="font-semibold text-[var(--ink-900)] capitalize">{t.event_type}</span>
                    </div>
                    <span className="text-[var(--ink-500)] font-mono">
                      {t.date ? t.date : "Date unrecorded"} {t.date_uncertain ? "(uncertain)" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Document Footer */}
        <div className="p-6 sm:p-8 border-t border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-center text-xs text-[var(--ink-500)]">
          <p className="font-medium text-[var(--ink-900)]">CareFlow AI Clinical Intake Assistant · Hospital Information System Integration</p>
          <p className="mt-0.5">Report generated strictly from patient statements and verified documents.</p>
        </div>
      </div>
    </div>
  );
}
