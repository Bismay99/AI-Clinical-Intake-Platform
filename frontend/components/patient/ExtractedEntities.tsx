"use client";
import { ClipboardCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ExtractedEntitySummary } from "@/types/intake";

interface Props {
  entities: ExtractedEntitySummary[];
}

function formatFieldName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ConfidenceIndicator({ confidence, lowFlag }: { confidence: number; lowFlag: boolean }) {
  if (lowFlag || confidence < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#F79009]">
        <AlertTriangle className="w-3 h-3" /> Needs review
      </span>
    );
  }
  if (confidence < 0.8) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#667085]">
        Medium confidence
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#12B76A]">
      <CheckCircle2 className="w-3 h-3" /> High confidence
    </span>
  );
}

function SourceLabel({ sourceType }: { sourceType: string }) {
  const label = sourceType.includes("intake") ? "Captured from your response" : sourceType.replace(/_/g, " ");
  return <span className="text-xs text-[#667085]">{label}</span>;
}

export function ExtractedEntities({ entities }: Props) {
  if (entities.length === 0) return null;

  return (
    <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E4E7EC] bg-[#F7F9FC]">
        <h3 className="text-sm font-semibold text-[#172033] flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#0F9D8A]" />
          Information Captured
        </h3>
      </div>
      <div className="divide-y divide-[#E4E7EC]">
        {entities.map((entity, i) => (
          <div key={`${entity.field_name}-${i}`} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#667085]">{formatFieldName(entity.field_name)}</p>
                <p className="text-sm text-[#172033] mt-0.5">{entity.value}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <ConfidenceIndicator confidence={entity.confidence} lowFlag={entity.low_confidence_flag} />
                <SourceLabel sourceType={entity.source_type} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}