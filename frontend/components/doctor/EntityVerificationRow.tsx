"use client";
import React, { useState } from "react";
import {
  Check,
  X,
  Pencil,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  FileText,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EntityBadge } from "@/components/ui/Badge";
import type { EntityDetail, VerifyAction } from "@/types/doctor";

interface EntityVerificationRowProps {
  entity: EntityDetail;
  onVerify: (entityId: string, action: VerifyAction, newValue?: string) => Promise<void>;
  onInspectEvidence?: (documentId?: string) => void;
  disabled?: boolean;
}

export function EntityVerificationRow({
  entity,
  onVerify,
  onInspectEvidence,
  disabled,
}: EntityVerificationRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entity.value);
  const [loading, setLoading] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const confidencePct = Math.round(entity.confidence * 100);
  const isVerified = entity.verification_status === "accepted";
  const isEdited = entity.verification_status === "edited";
  const isRejected = entity.verification_status === "rejected";
  const isUnreviewed = entity.verification_status === "unreviewed";

  // Four distinct clinical boundary treatments
  const containerClass = isVerified
    ? "border border-[var(--entity-verified-bd)] bg-[var(--entity-verified-bg)]/80"
    : isEdited
    ? "border border-[var(--entity-edited-bd)] bg-[var(--entity-edited-bg)]/80"
    : isRejected
    ? "border border-[var(--entity-rejected-bd)] bg-[var(--entity-rejected-bg)]/70 opacity-80"
    : "border border-dashed border-[var(--entity-ai-bd)] bg-[var(--entity-ai-bg)]"; // AI Extracted

  async function handle(action: VerifyAction, val?: string) {
    setLoading(true);
    try {
      await onVerify(entity.id, action, val);
    } finally {
      setLoading(false);
      setEditing(false);
    }
  }

  // Confidence bar color based on standard threshold
  const barColor =
    entity.confidence >= 0.8
      ? "bg-[var(--status-success-fg)]"
      : entity.confidence >= 0.5
      ? "bg-[var(--status-pending-fg)]"
      : "bg-[var(--status-error-fg)]";

  return (
    <div className={`rounded-md overflow-hidden transition-colors ${containerClass}`}>
      {/* ── Main Clinical Row ── */}
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Left State Micro-Icon */}
        <div className="hidden sm:flex shrink-0 mt-0.5" aria-hidden="true">
          {isVerified ? (
            <ShieldCheck className="w-4 h-4 text-[var(--entity-verified-fg)]" />
          ) : isEdited ? (
            <Pencil className="w-4 h-4 text-[var(--entity-edited-fg)]" />
          ) : isRejected ? (
            <X className="w-4 h-4 text-[var(--entity-rejected-fg)]" />
          ) : (
            <Sparkles className="w-4 h-4 text-[var(--entity-ai-fg)]" />
          )}
        </div>

        {/* Field Name + Value */}
        <div className="flex-1 min-w-0">
          {/* Field Label + Status Tag */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold text-[var(--ink-500)] uppercase tracking-wider">
              {entity.field_name.replace(/_/g, " ")}
            </span>
            <EntityBadge status={entity.verification_status} />
            {entity.low_confidence_flag && (
              <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded px-1.5 py-0.2 font-semibold">
                Low Confidence Extraction
              </span>
            )}
            {isVerified && entity.reviewed_by && (
              <span className="text-[10px] text-[var(--entity-verified-fg)] font-medium">
                Verified by Doctor
              </span>
            )}
          </div>

          {/* Value Display / In-Place Editor */}
          {editing ? (
            <div className="space-y-1.5 mt-1">
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full text-sm font-medium border border-[var(--clinical)] rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--clinical-mid)] bg-white text-[var(--ink-900)] shadow-xs"
                placeholder="Enter corrected clinical value..."
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  isLoading={loading}
                  onClick={() => handle("edit", editValue)}
                  className="text-xs font-semibold"
                >
                  Save Correction
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setEditValue(entity.value);
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p
              className={`text-sm font-semibold break-words leading-relaxed ${
                isRejected
                  ? "line-through text-[var(--ink-500)]"
                  : "text-[var(--ink-900)]"
              }`}
            >
              {entity.value}
            </p>
          )}

          {/* Original AI Value Display (Doctor Edited State) */}
          {isEdited && entity.original_ai_value && entity.original_ai_value !== entity.value && (
            <div className="text-[11px] text-[var(--ink-600)] mt-1 flex items-center gap-1.5 bg-blue-50/70 border border-blue-200 px-2 py-0.5 rounded w-fit">
              <Sparkles className="w-3 h-3 text-[var(--entity-ai-fg)] shrink-0" aria-hidden="true" />
              <span>Original AI value:</span>
              <span className="font-mono text-[var(--ink-800)] font-semibold">{entity.original_ai_value}</span>
            </div>
          )}
        </div>

        {/* Confidence Gauge Strip */}
        <div className="shrink-0 hidden sm:block min-w-[90px] text-right">
          <div className="flex items-center justify-end gap-1 mb-1">
            <span className="text-xs font-bold text-[var(--ink-800)]">{confidencePct}%</span>
          </div>
          <div className="h-1.5 bg-[var(--ink-200)] rounded-full overflow-hidden w-20 ml-auto">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <p className="text-[9px] text-[var(--ink-400)] mt-0.5">AI extraction confidence</p>
        </div>

        {/* Verification Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap self-start">
          {!editing && (
            <>
              {/* Accept / Verify */}
              <button
                disabled={disabled || loading || isVerified}
                onClick={() => handle("accept")}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isVerified
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 opacity-60 cursor-default"
                    : "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)] hover:bg-emerald-100"
                }`}
                title="Accept — verify and commit as clinical truth"
                aria-label="Accept entity"
              >
                <Check className="w-3.5 h-3.5" />
              </button>

              {/* Edit / Correct */}
              <button
                disabled={disabled || loading}
                onClick={() => setEditing(true)}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isEdited
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-[var(--entity-edited-bg)] text-[var(--entity-edited-fg)] border-[var(--entity-edited-bd)] hover:bg-blue-100"
                }`}
                title="Edit — correct extracted clinical value"
                aria-label="Edit entity value"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Reject */}
              <button
                disabled={disabled || loading || isRejected}
                onClick={() => handle("reject")}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isRejected
                    ? "bg-red-100 text-red-800 border-red-300 opacity-60 cursor-default"
                    : "bg-[var(--entity-rejected-bg)] text-[var(--entity-rejected-fg)] border-[var(--entity-rejected-bd)] hover:bg-red-100"
                }`}
                title="Reject — exclude from finalized clinical record"
                aria-label="Reject entity"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Reset to unreviewed / Re-verify if already acted on */}
              {!isUnreviewed && (
                <button
                  disabled={disabled || loading}
                  onClick={() => handle("accept")}
                  className="p-1.5 rounded-md bg-[var(--status-neutral-bg)] text-[var(--ink-500)] border border-[var(--ink-200)] hover:bg-[var(--ink-100)] transition-colors cursor-pointer"
                  title="Re-verify finding"
                  aria-label="Re-verify finding"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Provenance & Source Evidence Bar ── */}
      <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-[var(--ink-600)] bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)]">
        <div className="flex items-center gap-2 truncate">
          <FileText className="w-3 h-3 text-[var(--clinical)] shrink-0" aria-hidden="true" />
          <span className="truncate">
            Source:{" "}
            {entity.source_document_name ? (
              <span className="font-semibold text-[var(--clinical)]">
                {entity.source_document_name}
              </span>
            ) : (
              <span className="font-medium text-[var(--ink-700)] capitalize">
                {entity.source_type.replace(/_/g, " ")}
              </span>
            )}
            {entity.source_location && (
              <span className="text-[var(--ink-500)]"> • {entity.source_location}</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {entity.source_document_id && onInspectEvidence && (
            <button
              onClick={() => onInspectEvidence(entity.source_document_id || undefined)}
              className="text-[10px] font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View in Doc</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
          <button
            onClick={() => setShowProvenance((v) => !v)}
            className="text-[10px] text-[var(--ink-500)] hover:text-[var(--ink-900)] flex items-center gap-0.5 cursor-pointer"
            aria-expanded={showProvenance}
            aria-controls={`provenance-${entity.id}`}
          >
            <span>{showProvenance ? "Hide" : "Details"}</span>
            {showProvenance ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── Expandable Provenance Detail Panel ── */}
      {showProvenance && (
        <div
          id={`provenance-${entity.id}`}
          className="px-4 py-3 bg-[var(--bg-surface)] border-t border-[var(--ink-200)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
        >
          <div>
            <p className="text-[10px] font-bold text-[var(--ink-400)] uppercase tracking-wider">Source Channel</p>
            <p className="text-[var(--ink-900)] font-medium capitalize mt-0.5">
              {entity.source_type.replace(/_/g, " ")}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[var(--ink-400)] uppercase tracking-wider">Provenance Reference</p>
            <p className="font-mono text-[var(--ink-800)] text-[11px] mt-0.5 truncate" title={entity.source_id}>
              {entity.source_location || entity.source_id.slice(0, 10)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[var(--ink-400)] uppercase tracking-wider">Extraction Confidence</p>
            <p className="text-[var(--ink-900)] font-semibold mt-0.5">{confidencePct}%</p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[var(--ink-400)] uppercase tracking-wider">Review Status</p>
            <p className="text-[var(--ink-800)] mt-0.5">
              {entity.reviewed_by ? (
                <span className="text-[var(--status-success-fg)] font-semibold">
                  Dr. Verified
                </span>
              ) : (
                <span className="text-[var(--status-pending-fg)] font-medium">
                  Awaiting Verification
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
