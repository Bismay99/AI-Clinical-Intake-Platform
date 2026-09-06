"use client";
import React from "react";
import { FileText, Sparkles, FolderOpen } from "lucide-react";
import { calculateIntakeCompleteness } from "@/lib/doctorUtils";

interface IntakeCompletenessBadgeProps {
  hasSummary?: boolean;
  totalEntities?: number;
  documentsCount?: number;
  showCategories?: boolean;
  className?: string;
}

export function IntakeCompletenessBadge({
  hasSummary,
  totalEntities = 0,
  documentsCount = 0,
  showCategories = false,
  className = "",
}: IntakeCompletenessBadgeProps) {
  const result = calculateIntakeCompleteness({
    hasSummary,
    totalEntities,
    documentsCount,
  });

  const barColor =
    result.percentage >= 80
      ? "bg-emerald-500"
      : result.percentage >= 40
      ? "bg-amber-500"
      : "bg-slate-400";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Progress pill */}
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--ink-200)] bg-[var(--bg-surface-2)] text-[11px] font-medium text-[var(--ink-700)]"
        title={`Intake completeness: ${result.percentage}% (${result.summaryText})`}
      >
        <div className="w-12 h-1.5 bg-[var(--ink-200)] rounded-full overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${result.percentage}%` }}
          />
        </div>
        <span className="font-semibold">{result.percentage}%</span>
      </div>

      {/* Optional Category chips */}
      {showCategories && (
        <div className="flex items-center gap-1 text-[10px]">
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${
              result.hasSummary
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
            title={result.hasSummary ? "Clinical summary generated" : "Summary not recorded"}
          >
            <FileText className="w-2.5 h-2.5" />
            Summary
          </span>

          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${
              result.hasEntities
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
            title={result.hasEntities ? `${totalEntities} findings recorded` : "Findings not recorded"}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {totalEntities > 0 ? `${totalEntities} Findings` : "Findings"}
          </span>

          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${
              result.hasDocuments
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-400 border-slate-200"
            }`}
            title={result.hasDocuments ? `${documentsCount} documents uploaded` : "No documents uploaded"}
          >
            <FolderOpen className="w-2.5 h-2.5" />
            {documentsCount > 0 ? `${documentsCount} Docs` : "Docs"}
          </span>
        </div>
      )}
    </div>
  );
}
