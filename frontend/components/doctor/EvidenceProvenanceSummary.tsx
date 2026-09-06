"use client";
import React from "react";
import { FileText, Mic } from "lucide-react";
import type { EntityDetail } from "@/types/doctor";

interface EvidenceProvenanceSummaryProps {
  entities?: EntityDetail[];
  documentBackedCount?: number;
  voiceBackedCount?: number;
  className?: string;
  showLabels?: boolean;
}

export function EvidenceProvenanceSummary({
  entities,
  documentBackedCount,
  voiceBackedCount,
  className = "",
  showLabels = true,
}: EvidenceProvenanceSummaryProps) {
  // If entities array passed, count accurately
  let docCount = documentBackedCount ?? 0;
  let voiceCount = voiceBackedCount ?? 0;

  if (entities && entities.length > 0) {
    docCount = 0;
    voiceCount = 0;
    for (const ent of entities) {
      if (ent.source_type === "document" || ent.source_document_id || ent.source_document_name) {
        docCount++;
      } else {
        voiceCount++;
      }
    }
  }

  const total = docCount + voiceCount;
  if (total === 0) {
    return (
      <span className={`text-[11px] text-[var(--ink-400)] ${className}`}>
        No evidence sources recorded
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {docCount > 0 && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-teal-200 bg-teal-50 text-teal-800 text-[11px] font-medium"
          title={`${docCount} clinical finding${docCount !== 1 ? "s" : ""} extracted from uploaded documents`}
        >
          <FileText className="w-3 h-3 text-teal-600" aria-hidden="true" />
          <span>
            {docCount} {showLabels ? "Document-backed" : "doc"}
          </span>
        </span>
      )}

      {voiceCount > 0 && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 text-[11px] font-medium"
          title={`${voiceCount} clinical finding${voiceCount !== 1 ? "s" : ""} recorded from patient voice intake`}
        >
          <Mic className="w-3 h-3 text-indigo-600" aria-hidden="true" />
          <span>
            {voiceCount} {showLabels ? "Voice-intake-backed" : "voice"}
          </span>
        </span>
      )}
    </div>
  );
}
