"use client";
import React from "react";
import { AlertCircle, Clock, CheckCircle2, ShieldAlert } from "lucide-react";
import type { OperationalPriorityLevel } from "@/lib/doctorUtils";

interface PriorityBadgeProps {
  level: OperationalPriorityLevel;
  reason?: string;
  className?: string;
  showTooltip?: boolean;
}

export function PriorityBadge({
  level,
  reason,
  className = "",
  showTooltip = true,
}: PriorityBadgeProps) {
  let badgeStyle = "bg-slate-50 text-slate-700 border-slate-200";
  let label = "Normal Priority";
  let Icon = Clock;

  switch (level) {
    case "CRITICAL":
      badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
      label = "Critical";
      Icon = ShieldAlert;
      break;
    case "HIGH":
      badgeStyle = "bg-amber-50 text-amber-800 border-amber-300";
      label = "High";
      Icon = AlertCircle;
      break;
    case "NORMAL":
      badgeStyle = "bg-sky-50 text-sky-700 border-sky-200";
      label = "Normal";
      Icon = Clock;
      break;
    case "LOW":
      badgeStyle = "bg-slate-100 text-slate-600 border-slate-300";
      label = "Low";
      Icon = CheckCircle2;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeStyle} ${className}`}
      title={
        showTooltip
          ? `AI-assisted attention priority (${level})${reason ? `: ${reason}` : ""} — Operational queue prioritization only, not a medical diagnosis.`
          : undefined
      }
      aria-label={`AI-assisted attention priority: ${level}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
