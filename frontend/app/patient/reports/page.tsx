"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Calendar,
  ArrowRight,
  Stethoscope,
  ShieldCheck,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
      } catch (err) {
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
        <div className="flex items-center gap-3 text-[#667085] bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-xs">
          <Spinner className="text-[#155EEF]" />
          <span className="text-sm font-medium">Loading clinical health reports…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[#E4E7EC]">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2.5">
          <ClipboardList className="w-6 h-6 text-[#155EEF]" />
          <span>My Health Reports</span>
        </h1>
        <p className="text-sm text-[#667085] mt-1">
          Structured clinical pre-consultation reports generated from your CareVoice and touch intakes.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20]">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Clinical Disclaimer Notice */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-[#172033] flex items-start gap-3">
        <FileCheck className="w-4 h-4 text-[#155EEF] mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-[#155EEF]">Clinical Pre-Consultation Records</p>
          <p className="text-[#667085]">
            These reports contain your symptoms, history, and AI-extracted clinical evidence prepared for your physician. AI-extracted items remain labeled as unreviewed until explicitly confirmed by your doctor.
          </p>
        </div>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <Card className="border-[#E4E7EC] shadow-xs text-center py-12">
          <CardContent className="space-y-3 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-[#155EEF] flex items-center justify-center mx-auto">
              <ClipboardList className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#172033]">No Health Reports Yet</h3>
            <p className="text-xs text-[#667085]">
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
        <div className="space-y-4">
          {reports.map((rep) => (
            <Card key={rep.encounter_id} className="border-[#E4E7EC] shadow-xs hover:border-[#155EEF]/50 transition-all">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-[#172033]">
                      {rep.opd_department || "General OPD"} Pre-Consultation Report
                    </span>
                    <Badge
                      variant={rep.queue_status === "completed" ? "success" : "warning"}
                      className="text-xs font-semibold"
                    >
                      {rep.doctor_review_status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#667085]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {rep.consultation_date}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Stethoscope className="w-3.5 h-3.5 text-[#155EEF]" />
                      {rep.total_entities} extracted entities ({rep.unreviewed_count} unreviewed)
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[#667085]">ID: {rep.encounter_id.slice(0, 8)}...</span>
                  </div>

                  {rep.summary_preview && (
                    <p className="text-xs text-[#667085] italic bg-[#F7F9FC] p-2.5 rounded-lg border border-[#E4E7EC] line-clamp-2">
                      &ldquo;{rep.summary_preview}&rdquo;
                    </p>
                  )}
                </div>

                <Link
                  href={`/patient/reports/${rep.encounter_id}`}
                  className="w-full sm:w-auto"
                >
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto border-[#155EEF] text-[#155EEF] hover:bg-blue-50 font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
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
