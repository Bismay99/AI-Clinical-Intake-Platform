/**
 * CareFlow AI — Doctor Workstation Utilities
 *
 * Strict single-source-of-truth guidelines:
 * 1. Display formatting & presentation ONLY. Does not mutate database records, JWTs, or auth state.
 * 2. Operational triage priority only ("AI-assisted attention priority"). Never medical diagnosis or clinical risk prediction.
 * 3. Authoritative timestamp parsing with safe fallbacks ("Waiting time unavailable").
 */

/**
 * Normalizes physician display names, stripping redundant "Dr." or "Doctor" prefixes
 * so it cleanly renders as "Dr. <Name>" without duplicate titles (e.g. "Dr. Dr.").
 * Does NOT mutate database records, JWT claims, or auth store payloads.
 */
export function formatDoctorName(rawName?: string | null): string {
  if (!rawName || !rawName.trim()) {
    return "Doctor";
  }
  const clean = rawName.trim().replace(/^(?:(?:dr|doctor)\.?\s*)+/i, "").trim();
  return clean ? `Dr. ${clean}` : "Doctor";
}

/**
 * Time-contextual salutation using normalized doctor display name.
 */
export function getDoctorGreeting(rawName?: string | null): string {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${formatDoctorName(rawName)}`;
}

export type OperationalPriorityLevel = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface OperationalPriority {
  level: OperationalPriorityLevel;
  label: string;
  reason: string;
  badgeClass: string;
}

/**
 * Operational workflow prioritization based strictly on observable queue signals.
 *
 * IMPORTANT CLINICAL SAFETY DIRECTIVE:
 * This is OPERATIONAL WORKFLOW QUEUE PRIORITIZATION ONLY.
 * It is NEVER a medical diagnosis, disease severity metric, or clinical risk prediction.
 */
export function calculateAttentionPriority(item: {
  encounter_status?: string;
  queue_status?: string;
  unreviewed_count?: number;
  total_entities?: number;
  created_at?: string;
  updated_at?: string;
  reason?: string;
}): OperationalPriority {
  const status = item.encounter_status ?? item.queue_status ?? "";
  const unreviewed = item.unreviewed_count ?? 0;

  // Finalized consultations are always LOW operational priority
  if (status === "completed") {
    return {
      level: "LOW",
      label: "Low Operational Priority",
      reason: "Consultation finalized and archived",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    };
  }

  // Waiting time calculation for operational queue backlog
  let waitingMinutes = 0;
  if (item.created_at) {
    const created = new Date(item.created_at).getTime();
    if (!isNaN(created)) {
      waitingMinutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
    }
  }

  // Queue signal 1: High unreviewed findings backlog (>= 5 unreviewed) or waiting over 3 hours
  if (unreviewed >= 5 || waitingMinutes >= 180) {
    const reasonParts: string[] = [];
    if (unreviewed >= 5) reasonParts.push(`${unreviewed} unreviewed findings`);
    if (waitingMinutes >= 180) reasonParts.push(`waiting ${Math.floor(waitingMinutes / 60)}h+`);

    return {
      level: "CRITICAL",
      label: "Attention Priority: Critical",
      reason: `Queue backlog: ${reasonParts.join(", ")}`,
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }

  // Queue signal 2: Unreviewed findings needing review (> 0) or waiting over 1 hour
  if (unreviewed > 0 || waitingMinutes >= 60) {
    const reasonParts: string[] = [];
    if (unreviewed > 0) reasonParts.push(`${unreviewed} unreviewed finding${unreviewed > 1 ? "s" : ""}`);
    if (waitingMinutes >= 60) reasonParts.push(`waiting ${Math.floor(waitingMinutes / 60)}h+`);

    return {
      level: "HIGH",
      label: "Attention Priority: High",
      reason: `Queue signal: ${reasonParts.join(", ")}`,
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  // Queue signal 3: Ready for review / standard queue
  if (status === "ready_for_review" || status === "submitted") {
    return {
      level: "NORMAL",
      label: "Attention Priority: Normal",
      reason: "Intake submitted, ready for physician review",
      badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    };
  }

  return {
    level: "NORMAL",
    label: "Attention Priority: Normal",
    reason: item.reason || "Standard operational queue",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
  };
}

/**
 * Calculates waiting elapsed time from authoritative backend created_at timestamp.
 * Returns "Waiting time unavailable" if timestamp is missing or invalid.
 */
export function formatWaitingTime(dateStr?: string | null): string {
  if (!dateStr) return "Waiting time unavailable";
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return "Waiting time unavailable";

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "Waiting: Just now";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Waiting: < 1m";
  if (diffMins < 60) return `Waiting: ${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  if (diffHours < 24) {
    return remMins > 0 ? `Waiting: ${diffHours}h ${remMins}m` : `Waiting: ${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Waiting: ${diffDays}d ${diffHours % 24}h`;
}

/**
 * Calculates relative elapsed update time from authoritative backend updated_at timestamp.
 */
export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "Not available";
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return "Not available";

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "Just now";

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export interface IntakeCompletenessResult {
  percentage: number;
  hasSummary: boolean;
  hasEntities: boolean;
  hasDocuments: boolean;
  summaryText: string;
}

/**
 * Computes intake completeness percentage and documentation flags based strictly
 * on actual available intake/session/entity/document state.
 */
export function calculateIntakeCompleteness(params: {
  hasSummary?: boolean;
  totalEntities?: number;
  documentsCount?: number;
}): IntakeCompletenessResult {
  const hasSummary = Boolean(params.hasSummary);
  const totalEntities = params.totalEntities ?? 0;
  const docsCount = params.documentsCount ?? 0;

  const hasEntities = totalEntities > 0;
  const hasDocuments = docsCount > 0;

  let score = 0;
  if (hasSummary) score += 40;
  if (hasEntities) score += 40;
  if (hasDocuments) score += 20;

  let summaryText = "Intake in progress";
  if (score === 100) summaryText = "Intake complete";
  else if (score >= 60) summaryText = "Intake mostly complete";
  else if (score > 0) summaryText = "Partial intake recorded";
  else summaryText = "Intake pending";

  return {
    percentage: score,
    hasSummary,
    hasEntities,
    hasDocuments,
    summaryText,
  };
}
