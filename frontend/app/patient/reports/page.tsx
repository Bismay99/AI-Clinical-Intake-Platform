"use client";
import Link from "next/link";
import {
  ClipboardList,
  Calendar,
  ArrowRight,
  Stethoscope,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  Bot,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { useQuery } from "@tanstack/react-query";
import { getPatientReports } from "@/services/report.service";
import type { PatientReportSummaryItem } from "@/types/report";

export default function PatientReportsPage() {
  const { data: reports = [], isLoading, error } = useQuery<PatientReportSummaryItem[]>({
    queryKey: ["patient", "reports"],
    queryFn: getPatientReports,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-5 rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-sm)]">
          <Spinner />
          <span className="text-sm font-medium">Loading clinical pre-consultation records…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <div className="pb-4 border-b border-[var(--ink-200)] flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink-900)] flex items-center gap-2.5">
            <ClipboardList className="w-5 h-5 text-[var(--clinical)]" aria-hidden="true" />
            Pre-Consultation Reports
          </h1>
          <p className="text-xs text-[var(--ink-500)] mt-1">
            Structured clinical records prepared for your attending physician.
          </p>
        </div>
        {reports.length > 0 && (
          <div className="text-xs font-semibold text-[var(--ink-500)] mt-0.5">
            {reports.length} record{reports.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start gap-3 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>Could not load your pre-consultation reports. Please check your network connection.</span>
        </div>
      )}

      {/* Clinical Governance Disclosure */}
      <div className="p-3.5 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] text-xs text-[var(--ink-800)] flex items-start gap-3">
        <FileCheck className="w-4 h-4 text-[var(--clinical)] mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-[var(--clinical)]">Clinical Pre-Consultation Records</p>
          <p className="text-[var(--ink-600)] leading-relaxed">
            These records contain your symptoms, history, and AI-extracted clinical evidence prepared for your physician.
            AI-extracted items remain <span className="font-semibold">unverified</span> until explicitly confirmed by your attending doctor.
          </p>
          <div className="flex items-center gap-4 pt-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--entity-ai-fg)]">
              <Bot className="w-3 h-3" aria-hidden="true" /> AI Extracted · Awaiting Doctor Verification
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--entity-verified-fg)]">
              <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Doctor Verified
            </span>
          </div>
        </div>
      </div>

      {/* Reports list */}
      {reports.length === 0 ? (
        <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] py-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-lg bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center mx-auto border border-[var(--clinical-mid)]">
            <ClipboardList className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--ink-900)]">No Records Yet</h3>
            <p className="text-xs text-[var(--ink-500)] max-w-xs mx-auto">
              Your pre-consultation reports will appear here after completing a CareVoice or text intake session.
            </p>
          </div>
          <Link href="/patient/dashboard">
            <Button size="sm" className="mt-2">Go to Dashboard to Start</Button>
          </Link>
        </div>
      ) : (
        <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden divide-y divide-[var(--ink-200)]">
          {reports.map((rep) => {
            const isVerified = rep.queue_status === "completed";
            return (
              <div
                key={rep.encounter_id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                {/* Left: Clinical document identity */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[var(--ink-900)]">
                      {rep.opd_department || "General OPD"} Report
                    </p>
                    {/* AI/Verification status chip — Section H */}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      isVerified
                        ? "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)]"
                        : "bg-[var(--entity-ai-bg)] text-[var(--entity-ai-fg)] border-[var(--entity-ai-bd)] border-dashed"
                    }`}>
                      {isVerified
                        ? <><ShieldCheck className="w-2.5 h-2.5" aria-hidden="true" /> Doctor Verified</>
                        : <><Bot className="w-2.5 h-2.5" aria-hidden="true" /> AI Extracted · Awaiting Doctor Verification</>
                      }
                    </span>
                  </div>

                  {/* Metadata strip */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-500)]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                      {rep.consultation_date}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1">
                      <Stethoscope className="w-3 h-3 text-[var(--clinical)]" aria-hidden="true" />
                      {rep.total_entities} clinical {rep.total_entities === 1 ? "finding" : "findings"}
                      {rep.unreviewed_count > 0 && (
                        <span className="text-[var(--status-pending-fg)] font-semibold"> · {rep.unreviewed_count} pending review</span>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[var(--ink-400)]">
                      ID: {rep.encounter_id.slice(0, 8)}…
                    </span>
                  </div>

                  {/* Summary preview — quoted, muted */}
                  {rep.summary_preview && (
                    <p className="text-[11px] text-[var(--ink-500)] italic bg-[var(--bg-surface-2)] px-2.5 py-1.5 rounded border border-[var(--ink-200)] line-clamp-2">
                      &ldquo;{rep.summary_preview}&rdquo;
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Link href={`/patient/reports/${rep.encounter_id}`} className="flex-shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="font-semibold text-xs flex items-center gap-1.5 w-full sm:w-auto"
                  >
                    <span>View Report</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
