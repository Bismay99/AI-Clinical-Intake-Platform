/**
 * StatusBadge — unified router for all encounter + entity status badges.
 *
 * Existing callsites pass any status string and get the correct badge.
 * Internally delegates to EncounterBadge or EntityBadge from Badge.tsx.
 */
import { EncounterBadge, EntityBadge } from "@/components/ui/Badge";

const ENCOUNTER_STATUSES = new Set([
  "registered",
  "intake_in_progress",
  "submitted",
  "ready_for_review",
  "completed",
]);

const ENTITY_STATUSES = new Set(["unreviewed", "accepted", "edited", "rejected"]);

interface StatusBadgeProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  if (ENCOUNTER_STATUSES.has(status)) {
    return <EncounterBadge status={status} className={className} showIcon={showIcon} />;
  }
  if (ENTITY_STATUSES.has(status)) {
    return <EntityBadge status={status} className={className} showIcon={showIcon} />;
  }
  // Fallback: render as neutral badge
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-bd)] ${className ?? ""}`}
    >
      {status}
    </span>
  );
}

