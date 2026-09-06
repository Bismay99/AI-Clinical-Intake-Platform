"use client";
import { useState } from "react";
import { Check, X, Edit2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import type { EntityDetail, VerifyAction } from "@/types/doctor";

interface EntityVerificationRowProps {
  entity: EntityDetail;
  onVerify: (entityId: string, action: VerifyAction, newValue?: string) => Promise<void>;
  disabled?: boolean;
}

export function EntityVerificationRow({ entity, onVerify, disabled }: EntityVerificationRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entity.value);
  const [loading, setLoading] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const confidencePct = Math.round(entity.confidence * 100);
  const confColor = entity.confidence >= 0.8 ? "text-emerald-600" : entity.confidence >= 0.5 ? "text-amber-600" : "text-red-600";

  async function handle(action: VerifyAction, val?: string) {
    setLoading(true);
    try { await onVerify(entity.id, action, val); }
    finally { setLoading(false); setEditing(false); }
  }

  return (
    <div className="border border-[#E4E7EC] rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Field + Value */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{entity.field_name.replace(/_/g, " ")}</span>
            <StatusBadge status={entity.verification_status} />
            {entity.low_confidence_flag && (
              <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold">Low Confidence</span>
            )}
          </div>
          {editing ? (
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full text-sm border border-[#155EEF] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
          ) : (
            <p className="text-sm font-medium text-[#172033] break-words">{entity.value}</p>
          )}
          {entity.original_ai_value && entity.original_ai_value !== entity.value && (
            <p className="text-xs text-[#667085] mt-0.5">Original AI: {entity.original_ai_value}</p>
          )}
        </div>

        {/* Confidence */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          <span className={`text-sm font-bold ${confColor}`}>{confidencePct}%</span>
          <p className="text-[10px] text-[#667085]">confidence</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          {editing ? (
            <>
              <Button size="sm" variant="primary" isLoading={loading} onClick={() => handle("edit", editValue)} className="text-xs px-2.5 py-1">
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditValue(entity.value); }} className="text-xs px-2.5 py-1">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <button
                disabled={disabled || loading}
                onClick={() => handle("accept")}
                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                title="Accept"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={disabled || loading}
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg bg-blue-50 text-[#155EEF] hover:bg-blue-100 disabled:opacity-40 transition-colors"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={disabled || loading}
                onClick={() => handle("reject")}
                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition-colors"
                title="Reject"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {entity.verification_status !== "unreviewed" && (
                <button
                  disabled={disabled || loading}
                  onClick={() => handle("accept")}
                  className="p-1.5 rounded-lg bg-gray-50 text-[#667085] hover:bg-gray-100 disabled:opacity-40 transition-colors"
                  title="Re-verify"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Provenance toggle */}
      <button
        onClick={() => setShowProvenance(v => !v)}
        className="w-full px-4 py-1.5 flex items-center justify-between text-[10px] text-[#667085] bg-[#F7F9FC] border-t border-[#E4E7EC] hover:bg-gray-100 transition-colors"
      >
        <span>Source: {entity.source_type} · {entity.source_location ?? "—"}</span>
        {showProvenance ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showProvenance && (
        <div className="px-4 py-2.5 bg-[#F7F9FC] border-t border-[#E4E7EC] text-xs text-[#667085] grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><p className="text-[#172033] font-medium">Source Type</p><p>{entity.source_type}</p></div>
          <div><p className="text-[#172033] font-medium">Source ID</p><p className="font-mono">{entity.source_id.slice(0, 8)}…</p></div>
          <div><p className="text-[#172033] font-medium">Location</p><p>{entity.source_location ?? "—"}</p></div>
          <div><p className="text-[#172033] font-medium">Reviewed by</p><p>{entity.reviewed_by ? `Dr. (${entity.reviewed_by.slice(0, 6)}…)` : "Not reviewed"}</p></div>
        </div>
      )}
    </div>
  );
}
