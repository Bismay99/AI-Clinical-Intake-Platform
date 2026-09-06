import { cn } from "@/lib/utils";

type Status =
  | "registered" | "intake_in_progress" | "submitted" | "ready_for_review" | "completed"
  | "unreviewed" | "accepted" | "edited" | "rejected";

const MAP: Record<Status, { label: string; cls: string }> = {
  registered:         { label: "Registered",     cls: "bg-gray-100 text-gray-600 border-gray-200" },
  intake_in_progress: { label: "In Progress",    cls: "bg-blue-50 text-[#155EEF] border-blue-200" },
  submitted:          { label: "Submitted",       cls: "bg-purple-50 text-purple-700 border-purple-200" },
  ready_for_review:   { label: "Awaiting Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:          { label: "Completed",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  unreviewed:         { label: "Unreviewed",      cls: "bg-gray-100 text-gray-500 border-gray-200" },
  accepted:           { label: "Accepted",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  edited:             { label: "Edited",          cls: "bg-blue-50 text-[#155EEF] border-blue-200" },
  rejected:           { label: "Rejected",        cls: "bg-red-50 text-red-700 border-red-200" },
};

interface StatusBadgeProps { status: string; className?: string; }

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = MAP[status as Status] ?? { label: status, cls: "bg-gray-100 text-gray-500 border-gray-200" };
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border",
      cfg.cls, className
    )}>
      {cfg.label}
    </span>
  );
}
