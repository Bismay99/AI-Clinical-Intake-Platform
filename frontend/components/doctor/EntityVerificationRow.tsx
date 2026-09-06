"use client";
import { useState } from "react";
import {
  Check, X, Pencil, RotateCcw, ChevronDown, ChevronUp,
  Sparkles, CheckCircle2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EntityBadge } from "@/components/ui/Badge";
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
  const isVerified = entity.verification_status === "accepted";
  const isEdited = entity.verification_status === "edited";
  const isRejected = entity.verification_status === "rejected";
  const isUnreviewed = entity.verification_status === "unreviewed";

  // Container border class based on verification state
  const containerClass = isVerified
    ? "border border-[var(--entity-verified-bd)] bg-[var(--entity-verified-bg)]"
    : isEdited
    ? "border border-[var(--entity-edited-bd)] bg-[var(--entity-edited-bg)]"
    : isRejected
    ? "border border-[var(--entity-rejected-bd)] bg-[var(--entity-rejected-bg)]"
    : "border border-dashed border-[var(--entity-ai-bd)] bg-[var(--entity-ai-bg)]"; // unreviewed = AI-extracted

  async function handle(action: VerifyAction, val?: string) {
    setLoading(true);
    try { await onVerify(entity.id, action, val); }
    finally { setLoading(false); setEditing(false); }
  }

  // Confidence bar color
  const barColor =
    entity.confidence >= 0.8
      ? "bg-[var(--status-success-fg)]"
      : entity.confidence >= 0.5
      ? "bg-[var(--status-pending-fg)]"
      : "bg-[var(--status-error-fg)]";

  return (
    <div className={`rounded-md overflow-hidden ${containerClass}`}>
      {/* Main row */}
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">

        {/* State indicator icon (left edge micro-icon) */}
        <div className="hidden sm:flex flex-shrink-0 mt-0.5">
          {isVerified ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--entity-verified-fg)]" aria-label="Doctor verified" />
          ) : isEdited ? (
            <Pencil className="w-4 h-4 text-[var(--entity-edited-fg)]" aria-label="Doctor edited" />
          ) : isRejected ? (
            <X className="w-4 h-4 text-[var(--entity-rejected-fg)]" aria-label="Rejected" />
          ) : (
            <Sparkles className="w-4 h-4 text-[var(--entity-ai-fg)]" aria-label="AI extracted, awaiting verification" />
          )}
        </div>

        {/* Field + Value */}
        <div className="flex-1 min-w-0">
          {/* Field name + status badge */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wider">
              {entity.field_name.replace(/_/g, " ")}
            </span>
            <EntityBadge status={entity.verification_status} />
            {entity.low_confidence_flag && (
              <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded px-1.5 py-0.5 font-semibold">
                Low Confidence
              </span>
            )}
          </div>

          {/* Value (edit mode or display) */}
          {editing ? (
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full text-sm border border-[var(--clinical)] rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--clinical-mid)] bg-white"
              autoFocus
            />
          ) : (
            <p className="text-sm font-medium text-[var(--ink-900)] break-words">
              {entity.value}
            </p>
          )}

          {/* Original AI value shown when doctor has edited */}
          {(isEdited) && entity.original_ai_value && entity.original_ai_value !== entity.value && (
            <p className="text-[11px] text-[var(--ink-500)] mt-0.5">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                Original AI value:
              </span>{" "}
              <span className="font-mono">{entity.original_ai_value}</span>
            </p>
          )}
        </div>

        {/* Confidence column */}
        <div className="flex-shrink-0 hidden sm:block min-w-[72px]">
          <div className="flex items-center justify-end gap-1 mb-1">
            <span className="text-xs font-bold text-[var(--ink-700)]">{confidencePct}%</span>
          </div>
          {/* Confidence bar */}
          <div className="h-1 bg-[var(--ink-200)] rounded-full overflow-hidden w-16 ml-auto">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <p className="text-[9px] text-[var(--ink-400)] text-right mt-0.5">AI extraction confidence</p>
        </div>

        {/* Decision buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
          {editing ? (
            <>
              <Button size="xs" variant="primary" isLoading={loading} onClick={() => handle("edit", editValue)}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => { setEditing(false); setEditValue(entity.value); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {/* Accept */}
              <button
                disabled={disabled || loading}
                onClick={() => handle("accept")}
                className="p-1.5 rounded-md bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border border-[var(--entity-verified-bd)] hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                title="Accept — mark as doctor verified"
                aria-label="Accept entity"
              >
                <Check className="w-3.5 h-3.5" />
              </button>

              {/* Edit */}
              <button
                disabled={disabled || loading}
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-md bg-[var(--entity-edited-bg)] text-[var(--entity-edited-fg)] border border-[var(--entity-edited-bd)] hover:bg-blue-100 disabled:opacity-40 transition-colors"
                title="Edit value"
                aria-label="Edit entity value"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Reject */}
              <button
                disabled={disabled || loading}
                onClick={() => handle("reject")}
                className="p-1.5 rounded-md bg-[var(--entity-rejected-bg)] text-[var(--entity-rejected-fg)] border border-[var(--entity-rejected-bd)] hover:bg-red-100 disabled:opacity-40 transition-colors"
                title="Reject — exclude from clinical record"
                aria-label="Reject entity"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Re-verify (when already actioned) */}
              {!isUnreviewed && (
                <button
                  disabled={disabled || loading}
                  onClick={() => handle("accept")}
                  className="p-1.5 rounded-md bg-[var(--status-neutral-bg)] text-[var(--ink-500)] border border-[var(--ink-200)] hover:bg-[var(--ink-100)] disabled:opacity-40 transition-colors"
                  title="Re-verify"
                  aria-label="Re-verify entity"
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
        className="w-full px-4 py-1.5 flex items-center justify-between text-[10px] text-[var(--ink-500)] bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)] hover:bg-[var(--ink-100)] transition-colors"
        aria-expanded={showProvenance}
        aria-controls={`provenance-${entity.id}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <FileText className="w-3 h-3" aria-hidden="true" />
          Source:{" "}
          {entity.source_document_name
            ? `${entity.source_document_name}`
            : entity.source_type}{" "}
          {entity.source_location ? `· ${entity.source_location}` : ""}
        </span>
        {showProvenance ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Provenance panel */}
      {showProvenance && (
        <div
          id={`provenance-${entity.id}`}
          className="px-4 py-3 bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
        >
          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-0.5">Source Type</p>
            <p className="text-[var(--ink-800)]">{entity.source_type}</p>
          </div>
          {entity.source_document_name ? (
            <div>
              <p className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-0.5">Document</p>
              <p className="font-semibold text-[var(--clinical)] truncate">{entity.source_document_name}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-0.5">Source ID</p>
              <p className="font-mono text-[var(--ink-700)]">{entity.source_id.slice(0, 8)}…</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-0.5">Location</p>
            <p className="text-[var(--ink-800)]">{entity.source_location ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-0.5">Reviewed by</p>
            <p className="text-[var(--ink-800)]">
              {entity.reviewed_by
                ? `Dr. (ID: ${entity.reviewed_by.slice(0, 6)}…)`
                : <span className="text-[var(--ink-400)]">Not yet reviewed</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


