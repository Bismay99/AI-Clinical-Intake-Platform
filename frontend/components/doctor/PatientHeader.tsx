"use client";
import React from "react";
import Link from "next/link";
import { ArrowLeft, User, Building2, Hash, Calendar, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/doctor/StatusBadge";

interface PatientHeaderProps {
  patientName: string;
  patientId: string;
  encounterId: string;
  department?: string | null;
  status: string;
  backHref?: string;
  assignedDoctor?: string | null;
  visitDate?: string | null;
  age?: string | number | null;
  gender?: string | null;
  /** Slot for primary clinical actions (e.g. Finalize Consultation button) */
  action?: React.ReactNode;
}

export function PatientHeader({
  patientName,
  patientId,
  encounterId,
  department,
  status,
  backHref = "/doctor/patients",
  assignedDoctor,
  visitDate,
  age,
  gender,
  action,
}: PatientHeaderProps) {
  return (
    <div className="space-y-2">
      {/* Quick Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-500)] hover:text-[var(--clinical)] transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Clinical Queue</span>
        </Link>
        <span className="text-[11px] text-[var(--ink-400)] font-mono hidden sm:inline">
          Workstation • Encounter ID: {encounterId}
        </span>
      </div>

      {/* Primary Workstation Header Banner */}
      <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg shadow-xs overflow-hidden">
        {/* Top Surgical/Clinical Accent Line */}
        <div className="h-1 bg-[var(--clinical)]" />

        <div className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Patient Identity */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center shrink-0 text-[var(--clinical)] font-bold text-sm">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-[var(--ink-900)] leading-none truncate">
                  {patientName}
                </h1>
                {(age || gender) && (
                  <span className="text-xs text-[var(--ink-600)] font-medium bg-[var(--ink-100)] px-2 py-0.5 rounded">
                    {[gender, age ? `${age}y` : null].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-1.5 text-xs text-[var(--ink-500)]">
                <span className="inline-flex items-center gap-1 font-mono">
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-400)]">UID:</span>
                  <span className="text-[var(--ink-800)] font-semibold select-all" title={patientId}>
                    {patientId.slice(0, 8)}…
                  </span>
                </span>

                <span className="inline-flex items-center gap-1 font-mono">
                  <Hash className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                  <span className="text-[var(--ink-700)]">{encounterId.slice(0, 8)}</span>
                </span>

                {department && (
                  <span className="inline-flex items-center gap-1 text-[var(--ink-700)]">
                    <Building2 className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                    <span>{department}</span>
                  </span>
                )}

                {visitDate && (
                  <span className="inline-flex items-center gap-1 text-[var(--ink-500)]">
                    <Calendar className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                    <span>
                      {new Date(visitDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Status & Action Slotted In */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap self-start md:self-auto">
            <StatusBadge status={status} />
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}
