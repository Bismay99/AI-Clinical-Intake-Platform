/**
 * PS47 Badge Components — two semantic families:
 *
 * 1. EncounterBadge — encounter lifecycle states
 *    (registered → intake_in_progress → submitted → ready_for_review → completed)
 *
 * 2. EntityBadge — entity verification states
 *    (unreviewed → accepted | edited | rejected)
 *
 * 3. Badge — generic utility badge (ad-hoc use only)
 *
 * Both semantic badge families use icons as a second channel so status is
 * never communicated by color alone (WCAG 1.4.1).
 */
import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Mic2,
  Send,
  Clock,
  CheckCircle2,
  Sparkles,
  Pencil,
  XCircle,
  Circle,
} from "lucide-react";

// ── Encounter lifecycle badge ─────────────────────────────────────────────

type EncounterStatus =
  | "registered"
  | "intake_in_progress"
  | "submitted"
  | "ready_for_review"
  | "completed";

const ENCOUNTER_MAP: Record<
  EncounterStatus,
  { label: string; cls: string; Icon: React.ElementType }
> = {
  registered: {
    label: "Registered",
    cls: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-bd)]",
    Icon: ClipboardList,
  },
  intake_in_progress: {
    label: "In Progress",
    cls: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-bd)]",
    Icon: Mic2,
  },
  submitted: {
    label: "Submitted",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
    Icon: Send,
  },
  ready_for_review: {
    label: "Awaiting Review",
    cls: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]",
    Icon: Clock,
  },
  completed: {
    label: "Completed",
    cls: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]",
    Icon: CheckCircle2,
  },
};

interface EncounterBadgeProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

export function EncounterBadge({ status, className, showIcon = true }: EncounterBadgeProps) {
  const cfg = ENCOUNTER_MAP[status as EncounterStatus] ?? {
    label: status,
    cls: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-bd)]",
    Icon: Circle,
  };
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border",
        cfg.cls,
        className
      )}
    >
      {showIcon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {cfg.label}
    </span>
  );
}

// ── Entity verification badge ─────────────────────────────────────────────

type EntityStatus = "unreviewed" | "accepted" | "edited" | "rejected";

const ENTITY_MAP: Record<
  EntityStatus,
  { label: string; cls: string; Icon: React.ElementType }
> = {
  unreviewed: {
    label: "AI Extracted · Verify",
    cls: "bg-[var(--entity-ai-bg)] text-[var(--entity-ai-fg)] border-[var(--entity-ai-bd)]",
    Icon: Sparkles,
  },
  accepted: {
    label: "Doctor Verified",
    cls: "bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border-[var(--entity-verified-bd)]",
    Icon: CheckCircle2,
  },
  edited: {
    label: "Doctor Edited",
    cls: "bg-[var(--entity-edited-bg)] text-[var(--entity-edited-fg)] border-[var(--entity-edited-bd)]",
    Icon: Pencil,
  },
  rejected: {
    label: "Rejected",
    cls: "bg-[var(--entity-rejected-bg)] text-[var(--entity-rejected-fg)] border-[var(--entity-rejected-bd)]",
    Icon: XCircle,
  },
};

interface EntityBadgeProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

export function EntityBadge({ status, className, showIcon = true }: EntityBadgeProps) {
  const cfg = ENTITY_MAP[status as EntityStatus] ?? {
    label: status,
    cls: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-bd)]",
    Icon: Circle,
  };
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border",
        cfg.cls,
        className
      )}
    >
      {showIcon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {cfg.label}
    </span>
  );
}

// ── Generic utility Badge ─────────────────────────────────────────────────

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "clinical";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default:  "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-bd)]",
  success:  "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]",
  warning:  "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border-[var(--status-pending-bd)]",
  error:    "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--status-error-bd)]",
  info:     "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-bd)]",
  clinical: "bg-[var(--clinical-light)] text-[var(--clinical-dark)] border-[var(--clinical-mid)]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}