"use client";
import React from "react";
import { AlertCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import type { EntityDetail } from "@/types/doctor";

interface SafetyAttentionFlagsProps {
  unreviewedCount?: number;
  entities?: EntityDetail[];
  hasSummary?: boolean;
  documentsCount?: number;
  className?: string;
}

export function SafetyAttentionFlags({
  unreviewedCount = 0,
  entities = [],
  hasSummary = true,
  className = "",
}: SafetyAttentionFlagsProps) {
  const flags: { id: string; label: string; severity: "warning" | "info" }[] = [];

  // Summary status flag
  if (!hasSummary) {
    flags.push({
      id: "summary_pending",
      label: "Clinical summary pending intake completion",
      severity: "info",
    });
  }

  // Unreviewed findings documentation flag
  if (unreviewedCount > 0) {
    flags.push({
      id: "unreviewed",
      label: `${unreviewedCount} unreviewed finding${unreviewedCount > 1 ? "s" : ""} pending verification`,
      severity: "warning",
    });
  }

  // Check if allergy is recorded among entities
  const hasAllergyEntity = entities.some(
    (e) =>
      e.field_name.toLowerCase().includes("allergy") ||
      e.field_name.toLowerCase().includes("allergies")
  );
  if (!hasAllergyEntity && entities.length > 0) {
    flags.push({
      id: "allergies",
      label: "Allergies not recorded in intake",
      severity: "info",
    });
  }

  // Check if medication is recorded among entities
  const hasMedEntity = entities.some(
    (e) =>
      e.field_name.toLowerCase().includes("medication") ||
      e.field_name.toLowerCase().includes("drug")
  );
  if (!hasMedEntity && entities.length > 0) {
    flags.push({
      id: "medications",
      label: "Medication list not recorded",
      severity: "info",
    });
  }

  // Low confidence entities
  const lowConfidenceCount = entities.filter((e) => e.low_confidence_flag).length;
  if (lowConfidenceCount > 0) {
    flags.push({
      id: "low_confidence",
      label: `${lowConfidenceCount} low-confidence extraction${lowConfidenceCount > 1 ? "s" : ""}`,
      severity: "warning",
    });
  }

  if (flags.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md ${className}`}>
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Documentation complete • No pending workflow flags</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {flags.map((flag) => {
        const isWarning = flag.severity === "warning";
        return (
          <span
            key={flag.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
              isWarning
                ? "bg-amber-50 text-amber-800 border-amber-300"
                : "bg-slate-50 text-slate-700 border-slate-200"
            }`}
          >
            {isWarning ? (
              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-3 h-3 text-slate-500 shrink-0" aria-hidden="true" />
            )}
            <span>{flag.label}</span>
          </span>
        );
      })}
    </div>
  );
}
