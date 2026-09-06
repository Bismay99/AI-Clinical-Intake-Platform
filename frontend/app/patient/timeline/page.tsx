"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import {
  Clock,
  Calendar,
  Stethoscope,
  FileText,
  CheckCircle2,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientReports, getPatientReport } from "@/services/report.service";
import type { PatientReportSummaryItem, PatientReportDetailResponse, PatientTimelineItem } from "@/types/report";

interface AggregatedEvent {
  id: string;
  date: string | null;
  date_uncertain: boolean;
  event_type: string;
  source: string;
  encounter_id: string;
  encounter_department: string | null;
}

function eventIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("registered") || t.includes("registration")) return Calendar;
  if (t.includes("intake") || t.includes("consult")) return Stethoscope;
  if (t.includes("document") || t.includes("upload")) return FileText;
  if (t.includes("review") || t.includes("verified") || t.includes("completed")) return CheckCircle2;
  return Activity;
}

function eventColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("completed") || t.includes("verified")) return "bg-[var(--status-success-bg)] border-[var(--status-success-bd)] text-[var(--status-success-fg)]";
  if (t.includes("review")) return "bg-[var(--status-pending-bg)] border-[var(--status-pending-bd)] text-[var(--status-pending-fg)]";
  if (t.includes("intake") || t.includes("in_progress")) return "bg-[var(--clinical-light)] border-[var(--clinical-mid)] text-[var(--clinical)]";
  return "bg-[var(--bg-surface-2)] border-[var(--ink-200)] text-[var(--ink-700)]";
}

export default function TimelinePage() {
  const summaryQuery = useQueries({
    queries: [{ queryKey: ["patient", "reports"], queryFn: getPatientReports }],
  })[0];

  const summaries: PatientReportSummaryItem[] = summaryQuery.data ?? [];
  const allIds = summaries.map((s) => s.encounter_id);

  const detailQueries = useQueries({
    queries: allIds.map((id) => ({
      queryKey: ["patient", "report", id],
      queryFn: () => getPatientReport(id),
      enabled: summaryQuery.isSuccess,
    })),
  });

  const events = useMemo((): AggregatedEvent[] => {
    const result: AggregatedEvent[] = [];

    summaries.forEach((summary, idx) => {
      const detail: PatientReportDetailResponse | undefined = detailQueries[idx]?.data;

      // System events from encounter status
      result.push({
        id: `${summary.encounter_id}-registered`,
        date: summary.consultation_date,
        date_uncertain: false,
        event_type: "Consultation Registered",
        source: "System",
        encounter_id: summary.encounter_id,
        encounter_department: summary.opd_department ?? null,
      });

      if (summary.queue_status !== "registered") {
        result.push({
          id: `${summary.encounter_id}-status-${summary.queue_status}`,
          date: summary.consultation_date,
          date_uncertain: false,
          event_type: summary.queue_status.replace(/_/g, " "),
          source: "System",
          encounter_id: summary.encounter_id,
          encounter_department: summary.opd_department ?? null,
        });
      }

      // Clinical timeline events from the full report
      if (detail?.timeline) {
        detail.timeline.forEach((t: PatientTimelineItem) => {
          result.push({
            id: t.id,
            date: t.date ?? null,
            date_uncertain: t.date_uncertain,
            event_type: t.event_type,
            source: "Clinical Record",
            encounter_id: summary.encounter_id,
            encounter_department: summary.opd_department ?? null,
          });
        });
      }
    });

    // Sort descending: events with dates first, then undated
    return result.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
  }, [summaries, detailQueries]);

  const isLoading = summaryQuery.isLoading || detailQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-3 border-b border-[var(--ink-200)] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <Clock className="w-6 h-6 text-[var(--clinical)]" />
            Clinical Timeline
          </h1>
          <p className="text-sm text-[var(--ink-500)] mt-1">
            Chronological record of all clinical events across your {summaries.length} encounter{summaries.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Link
          href="/patient/health-record"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--clinical)] hover:underline"
        >
          <Activity className="w-3.5 h-3.5" />
          Health Record
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-5 rounded-lg border border-[var(--ink-200)]">
            <Spinner />
            <span className="text-sm font-medium">Building your clinical timeline…</span>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center">
          <Clock className="w-10 h-10 text-[var(--ink-300)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--ink-500)]">No clinical events recorded yet.</p>
          <p className="text-xs text-[var(--ink-400)] mt-1">
            Start a consultation to begin building your clinical timeline.
          </p>
          <Link
            href="/patient/intake"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--clinical)] hover:underline"
          >
            Start Pre-Consultation
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--ink-200)]" />

          <ul className="space-y-4 pl-12">
            {events.map((event) => {
              const Icon = eventIcon(event.event_type);
              const colorClasses = eventColor(event.event_type);
              return (
                <li key={event.id} className="relative">
                  {/* Timeline node */}
                  <span className={`absolute -left-[2.15rem] top-3.5 w-4 h-4 rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center ${colorClasses}`}>
                    <Icon className="w-2 h-2" />
                  </span>

                  <div className="p-4 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink-900)] capitalize">
                          {event.event_type}
                        </p>
                        {event.encounter_department && (
                          <p className="text-xs text-[var(--ink-500)] mt-0.5">
                            {event.encounter_department}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <p className="text-xs font-mono text-[var(--ink-700)]">
                          {event.date ? (
                            <>
                              {event.date}
                              {event.date_uncertain && <span className="ml-1 text-[var(--ink-400)] italic">(uncertain)</span>}
                            </>
                          ) : (
                            <span className="text-[var(--ink-400)] italic">Date unrecorded</span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--ink-400)] font-mono">
                          Encounter: {event.encounter_id.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-2)] border border-[var(--ink-200)] text-[var(--ink-500)] font-medium">
                        {event.source}
                      </span>
                      <Link
                        href={`/patient/reports/${event.encounter_id}`}
                        className="text-[10px] text-[var(--clinical)] hover:underline font-medium"
                      >
                        View Report →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
