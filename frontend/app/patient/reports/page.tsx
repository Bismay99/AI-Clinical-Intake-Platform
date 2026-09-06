"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Calendar,
  ArrowRight,
  Stethoscope,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { getPatientReports } from "@/services/report.service";
import type { PatientReportSummaryItem } from "@/types/report";

export default function PatientReportsPage() {
  const [reports, setReports] = useState<PatientReportSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPatientReports();
        setReports(data);
      } catch {
        setError("Could not load your pre-consultation reports. Please check your network.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-5 rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-sm)]">
          <Spinner />
          <span className="text-sm font-medium">Loading clinical health reports…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--ink-200)]">
        <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2.5">
          <ClipboardList className="w-6 h-6 text-[var(--clinical)]" />
          <span>My Health Reports</span>
        </h1>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          Structured clinical pre-consultation reports generated from your CareVoice and touch intakes.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Clinical Disclaimer */}
      <div className="p-3.5 rounded-md bg-[var(--clinical-light)] border border-[var(--clinical-mid)] text-xs text-[var(--ink-800)] flex items-start gap-3">
        <FileCheck className="w-4 h-4 text-[var(--clinical)] mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-[var(--clinical)]">Clinical Pre-Consultation Records</p>
          <p className="text-[var(--ink-600)]">
            These reports contain your symptoms, history, and AI-extracted clinical evidence prepared for your physician. AI-extracted items remain labeled as unreviewed until explicitly confirmed by your doctor.
          </p>
        </div>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-3 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-md bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center mx-auto border border-[var(--clinical-mid)]">
              <ClipboardList className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[var(--ink-900)]">No Health Reports Yet</h3>
            <p className="text-xs text-[var(--ink-500)]">
              Your pre-consultation reports will appear here after completing a CareVoice or text intake session.
            </p>
            <div className="pt-2">
              <Link href="/patient/dashboard">
                <Button size="sm">Go to Dashboard to Start One</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((rep) => (
            <Card key={rep.encounter_id} className="hover:border-[var(--clinical-mid)] transition-colors">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-[var(--ink-900)]">
                      {rep.opd_department || "General OPD"} Pre-Consultation Report
                    </span>
                    <Badge
                      variant={rep.queue_status === "completed" ? "success" : "warning"}
                      className="text-xs font-semibold"
                    >
                      {rep.doctor_review_status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-500)]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {rep.consultation_date}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Stethoscope className="w-3.5 h-3.5 text-[var(--clinical)]" />
                      {rep.total_entities} extracted entities ({rep.unreviewed_count} unreviewed)
                    </span>
                    <span>·</span>
                    <span className="font-mono text-[var(--ink-400)]">ID: {rep.encounter_id.slice(0, 8)}...</span>
                  </div>

                  {rep.summary_preview && (
                    <p className="text-xs text-[var(--ink-500)] italic bg-[var(--bg-surface-2)] p-2.5 rounded-md border border-[var(--ink-200)] line-clamp-2">
                      &ldquo;{rep.summary_preview}&rdquo;
                    </p>
                  )}
                </div>

                <Link href={`/patient/reports/${rep.encounter_id}`} className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full sm:w-auto font-semibold text-xs flex items-center justify-center gap-1.5">
                    <span>View Structured Report</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
