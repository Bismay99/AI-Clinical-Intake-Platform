"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getSummary } from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { PriorityBadge } from "@/components/doctor/PriorityBadge";
import { IntakeCompletenessBadge } from "@/components/doctor/IntakeCompletenessBadge";
import { EvidenceProvenanceSummary } from "@/components/doctor/EvidenceProvenanceSummary";
import { SafetyAttentionFlags } from "@/components/doctor/SafetyAttentionFlags";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  calculateAttentionPriority,
  formatWaitingTime,
  formatRelativeTime,
} from "@/lib/doctorUtils";
import {
  X,
  User,
  Building2,
  Clock,
  ArrowRight,
  Sparkles,
  FileText,
  FolderOpen,
} from "lucide-react";

interface PatientQuickViewProps {
  isOpen: boolean;
  onClose: () => void;
  encounterId: string | null;
  patientName: string;
  patientId?: string | null;
  opdDepartment?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  unreviewedCount?: number;
  totalEntities?: number;
}

export function PatientQuickView({
  isOpen,
  onClose,
  encounterId,
  patientName,
  patientId,
  opdDepartment,
  status = "",
  createdAt,
  updatedAt,
  unreviewedCount = 0,
  totalEntities = 0,
}: PatientQuickViewProps) {
  const router = useRouter();

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [isOpen, onClose]);

  // Fetch full summary details when drawer is open
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["doctor", "summary", encounterId],
    queryFn: () => (encounterId ? getSummary(encounterId) : Promise.reject("No ID")),
    enabled: isOpen && !!encounterId,
    staleTime: 30_000,
  });

  if (!isOpen || !encounterId) return null;

  const priority = calculateAttentionPriority({
    encounter_status: status,
    unreviewed_count: unreviewedCount,
    total_entities: totalEntities,
    created_at: createdAt,
    updated_at: updatedAt,
  });

  const waitingDisplay = formatWaitingTime(createdAt);
  const updatedDisplay = formatRelativeTime(updatedAt);

  const entities = summary?.entities ?? [];
  const documents = summary?.documents ?? [];
  const docsCount = summary?.documents_count ?? documents.length;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickview-patient-name"
    >
      <div
        className="w-full max-w-xl bg-[var(--bg-surface)] h-full shadow-2xl flex flex-col overflow-hidden border-l border-[var(--ink-200)] animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-4 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center shrink-0 text-[var(--clinical)]">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="quickview-patient-name"
                  className="text-base font-bold text-[var(--ink-900)] truncate"
                >
                  {patientName}
                </h2>
                <StatusBadge status={status} />
              </div>
              <p className="text-xs text-[var(--ink-500)] font-mono mt-0.5 truncate">
                UID: {patientId ? patientId : "Not recorded"} • Encounter #{encounterId.slice(0, 8)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--ink-400)] hover:text-[var(--ink-800)] hover:bg-[var(--ink-100)] transition-colors cursor-pointer shrink-0"
            aria-label="Close patient quick view"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operational Status & Triage Ribbon */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-[var(--ink-200)] flex items-center justify-between flex-wrap gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <PriorityBadge level={priority.level} reason={priority.reason} />
            <span className="text-[11px] text-[var(--ink-500)] flex items-center gap-1">
              <Clock className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
              {waitingDisplay}
            </span>
          </div>

          <div className="text-[11px] text-[var(--ink-500)]">
            Updated: {updatedDisplay}
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Demographics & Clinical Department */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                Department
              </span>
              <span className="font-semibold text-[var(--ink-800)] flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                {opdDepartment || "Not recorded"}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                Intake Completeness
              </span>
              <div className="mt-0.5">
                <IntakeCompletenessBadge
                  hasSummary={summary ? !!summary.summary_text : undefined}
                  totalEntities={totalEntities}
                  documentsCount={docsCount}
                  showCategories={true}
                />
              </div>
            </div>
          </div>

          {/* Workflow / Safety Documentation Flags */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] mb-2">
              Workflow &amp; Completeness Checks
            </h3>
            <SafetyAttentionFlags
              unreviewedCount={unreviewedCount}
              entities={entities}
              hasSummary={summary ? !!summary.summary_text : true}
              documentsCount={docsCount}
            />
          </div>

          {/* Clinical Findings Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--entity-ai-fg)]" aria-hidden="true" />
                AI Clinical Findings ({sumLoading ? "…" : entities.length})
              </h3>
              {!sumLoading && (
                <EvidenceProvenanceSummary entities={entities} showLabels={false} />
              )}
            </div>

            {sumLoading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-[var(--ink-500)]">
                <Spinner className="w-4 h-4" /> Loading findings preview…
              </div>
            ) : entities.length === 0 ? (
              <div className="p-4 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-xs text-[var(--ink-500)] text-center">
                No clinical findings extracted for this encounter.
              </div>
            ) : (
              <div className="border border-[var(--ink-200)] rounded-lg divide-y divide-[var(--ink-200)] max-h-64 overflow-y-auto">
                {entities.slice(0, 8).map((ent) => (
                  <div key={ent.id} className="p-2.5 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--ink-500)] uppercase text-[10px]">
                          {ent.field_name.replace(/_/g, " ")}:
                        </span>
                        <span className="font-semibold text-[var(--ink-900)] truncate">
                          {ent.value}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--ink-500)] mt-0.5">
                        {ent.source_document_name ? (
                          <span className="text-teal-700 font-medium">
                            Doc: {ent.source_document_name}
                          </span>
                        ) : (
                          <span className="capitalize">{ent.source_type}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        ent.verification_status === "accepted"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : ent.verification_status === "edited"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : ent.verification_status === "rejected"
                          ? "bg-red-50 text-red-700 border border-red-200 line-through"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {ent.verification_status}
                    </span>
                  </div>
                ))}
                {entities.length > 8 && (
                  <div className="p-2 text-center text-[11px] text-[var(--ink-500)] bg-[var(--bg-surface-2)]">
                    +{entities.length - 8} more findings in clinical workspace
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attached Documents Preview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
              Attached Clinical Documents ({sumLoading ? "…" : documents.length})
            </h3>

            {sumLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-[var(--ink-500)]">
                <Spinner className="w-4 h-4" /> Loading documents…
              </div>
            ) : documents.length === 0 ? (
              <div className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-xs text-[var(--ink-500)] text-center">
                No patient documents uploaded for this encounter.
              </div>
            ) : (
              <div className="border border-[var(--ink-200)] rounded-lg divide-y divide-[var(--ink-200)]">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-2.5 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                      <div className="truncate">
                        <p className="font-semibold text-[var(--ink-900)] truncate">
                          {doc.original_filename || "Document"}
                        </p>
                        <p className="text-[10px] text-[var(--ink-500)] uppercase font-mono">
                          {doc.document_type.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        doc.processing_status === "processed"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : doc.processing_status === "failed"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {doc.processing_status || "available"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-3 shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Close Preview
          </Button>

          <Button
            size="sm"
            onClick={() => {
              onClose();
              router.push(`/doctor/patients/${encounterId}`);
            }}
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            Open Full Clinical Workspace <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
