"use client";
import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import {
  Activity,
  Heart,
  Pill,
  AlertTriangle,
  FlaskConical,
  FileText,
  Clock,
  ExternalLink,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientReports, getPatientReport, getPatientDocuments } from "@/services/report.service";
import type { PatientReportSummaryItem, PatientReportDetailResponse, PatientDocumentItem } from "@/types/report";

type Tab = "overview" | "history" | "medications" | "allergies" | "investigations" | "documents";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "history", label: "Medical History", icon: Heart },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "allergies", label: "Allergies", icon: AlertTriangle },
  { id: "investigations", label: "Investigations", icon: FlaskConical },
  { id: "documents", label: "Documents", icon: FileText },
];

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

export default function HealthRecordPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Step 1: fetch report summaries list
  const summaryQuery = useQueries({
    queries: [
      {
        queryKey: ["patient", "reports"],
        queryFn: getPatientReports,
      },
    ],
  })[0];

  const summaries: PatientReportSummaryItem[] = summaryQuery.data ?? [];
  const completedIds = summaries
    .filter((s) => s.has_summary || s.total_entities > 0)
    .map((s) => s.encounter_id);

  // Step 2: fetch full detail for each completed encounter
  const detailQueries = useQueries({
    queries: completedIds.map((id) => ({
      queryKey: ["patient", "report", id],
      queryFn: () => getPatientReport(id),
      enabled: summaryQuery.isSuccess,
    })),
  });

  // Step 3: aggregate across all loaded reports
  const aggregated = useMemo(() => {
    const details: PatientReportDetailResponse[] = detailQueries
      .filter((q) => q.isSuccess && q.data)
      .map((q) => q.data as PatientReportDetailResponse);

    return {
      medical_history: dedupe(details.flatMap((d) => d.medical_history)),
      medications: dedupe(details.flatMap((d) => d.medications)),
      allergies: dedupe(details.flatMap((d) => d.allergies)),
      investigations: dedupe(details.flatMap((d) => d.investigations)),
      investigation_details: Object.assign({}, ...details.map((d) => d.investigation_details)),
    };
  }, [detailQueries]);

  // Documents list
  const docsQuery = useQueries({
    queries: [
      {
        queryKey: ["patient", "documents"],
        queryFn: getPatientDocuments,
      },
    ],
  })[0];

  const documents: PatientDocumentItem[] = docsQuery.data ?? [];

  const isLoading = summaryQuery.isLoading || detailQueries.some((q) => q.isLoading);
  const totalEncounters = summaries.length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-3 border-b border-[var(--ink-200)] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <Activity className="w-6 h-6 text-[var(--clinical)]" />
            Health Record
          </h1>
          <p className="text-sm text-[var(--ink-500)] mt-1">
            Aggregated clinical data across all your consultations — {totalEncounters} encounter{totalEncounters !== 1 ? "s" : ""} on record.
          </p>
        </div>
        <Link
          href="/patient/timeline"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--clinical)] hover:underline"
        >
          <Clock className="w-3.5 h-3.5" />
          View Timeline
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* AI governance note */}
      <div className="p-3 rounded-md border border-[var(--clinical-mid)] bg-[var(--clinical-light)] flex items-start gap-2.5 text-xs">
        <Info className="w-4 h-4 text-[var(--clinical)] flex-shrink-0 mt-0.5" />
        <span className="text-[var(--ink-700)]">
          All data shown here is extracted from your intake sessions and uploaded documents. Values marked <em>AI Extracted</em> are awaiting physician verification.
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-[var(--ink-200)] overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === id
                ? "border-[var(--clinical)] text-[var(--clinical)]"
                : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:border-[var(--ink-300)]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-5 rounded-lg border border-[var(--ink-200)]">
            <Spinner />
            <span className="text-sm font-medium">Assembling your health record…</span>
          </div>
        </div>
      ) : (
        <>
          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Heart, label: "Conditions", count: aggregated.medical_history.length, tab: "history" as Tab, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
                { icon: Pill, label: "Medications", count: aggregated.medications.length, tab: "medications" as Tab, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
                { icon: AlertTriangle, label: "Allergies", count: aggregated.allergies.length, tab: "allergies" as Tab, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
                { icon: FlaskConical, label: "Lab Results", count: aggregated.investigations.length, tab: "investigations" as Tab, color: "text-[var(--clinical)]", bg: "bg-[var(--clinical-light)]", border: "border-[var(--clinical-mid)]" },
              ].map(({ icon: Icon, label, count, tab, color, bg, border }) => (
                <button
                  key={label}
                  onClick={() => setActiveTab(tab)}
                  className={`p-4 rounded-lg border ${border} ${bg} text-left hover:opacity-90 transition-opacity cursor-pointer w-full`}
                >
                  <div className={`flex items-center gap-2 mb-2 ${color}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                  </div>
                  <p className={`text-3xl font-bold ${color}`}>{count}</p>
                  <p className="text-xs text-[var(--ink-500)] mt-1">
                    {count === 0 ? "None recorded" : "recorded entries"}
                  </p>
                </button>
              ))}

              <div className="col-span-2 lg:col-span-2 p-4 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-3 text-[var(--ink-700)]">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Documents</span>
                </div>
                <p className="text-3xl font-bold text-[var(--ink-900)]">{documents.length}</p>
                <p className="text-xs text-[var(--ink-500)] mt-1">uploaded medical documents</p>
              </div>

              <div className="col-span-2 lg:col-span-2 p-4 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-3 text-[var(--ink-700)]">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Consultations</span>
                </div>
                <p className="text-3xl font-bold text-[var(--ink-900)]">{totalEncounters}</p>
                <p className="text-xs text-[var(--ink-500)] mt-1">total clinical encounters</p>
              </div>
            </div>
          )}

          {/* ── Medical History Tab ── */}
          {activeTab === "history" && (
            <Card>
              <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  Past Medical History
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {aggregated.medical_history.length === 0 ? (
                  <p className="text-sm text-[var(--ink-500)] italic py-4 text-center">No medical history recorded across your consultations.</p>
                ) : (
                  <ul className="space-y-2">
                    {aggregated.medical_history.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-sm text-[var(--ink-900)]">
                        <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Medications Tab ── */}
          {activeTab === "medications" && (
            <Card>
              <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
                <CardTitle className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-amber-500" />
                  Current Medications
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {aggregated.medications.length === 0 ? (
                  <p className="text-sm text-[var(--ink-500)] italic py-4 text-center">No medications recorded across your consultations.</p>
                ) : (
                  <ul className="space-y-2">
                    {aggregated.medications.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-sm text-[var(--ink-900)]">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Allergies Tab ── */}
          {activeTab === "allergies" && (
            <Card>
              <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Known Allergies
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {aggregated.allergies.length === 0 ? (
                  <p className="text-sm text-[var(--ink-500)] italic py-4 text-center">No allergies recorded across your consultations.</p>
                ) : (
                  <ul className="space-y-2">
                    {aggregated.allergies.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm text-[var(--ink-900)]">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Investigations Tab ── */}
          {activeTab === "investigations" && (
            <Card>
              <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-[var(--clinical)]" />
                  Investigations & Lab Results
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {aggregated.investigations.length === 0 ? (
                  <p className="text-sm text-[var(--ink-500)] italic py-4 text-center">No investigations or lab results recorded.</p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {aggregated.investigations.map((item, i) => (
                        <li key={i} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
                          <span className="text-sm font-medium text-[var(--ink-900)]">{item}</span>
                          {aggregated.investigation_details[item] && (
                            <p className="text-xs text-[var(--ink-500)] mt-0.5">{aggregated.investigation_details[item]}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {Object.keys(aggregated.investigation_details).length > 0 && (
                      <div className="pt-2">
                        {Object.entries(aggregated.investigation_details)
                          .filter(([key]) => !aggregated.investigations.includes(key))
                          .map(([key, val]) => (
                            <div key={key} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] mb-2">
                              <span className="text-xs font-semibold text-[var(--ink-700)]">{key}:</span>
                              <span className="text-sm text-[var(--ink-900)] ml-2">{String(val)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === "documents" && (
            <Card>
              <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--clinical)]" />
                    Uploaded Documents
                  </div>
                  <Link href="/patient/documents" className="text-xs font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1">
                    Manage
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {docsQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-[var(--ink-500)]"><Spinner /><span className="text-sm">Loading documents…</span></div>
                ) : documents.length === 0 ? (
                  <p className="text-sm text-[var(--ink-500)] italic py-4 text-center">No documents uploaded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {documents.map((doc) => (
                      <li key={doc.id} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="w-4 h-4 text-[var(--clinical)] flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-sm font-medium text-[var(--ink-900)] truncate">
                              {doc.original_filename || doc.filename || "Medical Document"}
                            </p>
                            <p className="text-xs text-[var(--ink-500)]">
                              {doc.document_type.replace(/_/g, " ")} · {doc.processing_status}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)] px-2 py-0.5 rounded font-medium flex-shrink-0">
                          {doc.extracted_entity_count ?? doc.entity_count} entities
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
