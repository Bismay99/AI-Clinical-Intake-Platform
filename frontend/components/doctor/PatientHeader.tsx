"use client";
import Link from "next/link";
import { ArrowLeft, User, Building2, Hash } from "lucide-react";
import { StatusBadge } from "@/components/doctor/StatusBadge";

interface PatientHeaderProps {
  patientName: string;
  patientId: string;
  encounterId: string;
  department?: string | null;
  status: string;
  backHref?: string;
  /** Slot for a primary action (e.g. Finalize button) rendered at the far right */
  action?: React.ReactNode;
}

export function PatientHeader({
  patientName,
  patientId,
  encounterId,
  department,
  status,
  backHref = "/doctor/patients",
  action,
}: PatientHeaderProps) {
  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-[var(--ink-500)] hover:text-[var(--clinical)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Patients
        </Link>
      </div>

      {/* Banner */}
      <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg shadow-[var(--shadow-sm)] overflow-hidden">
        {/* Clinical accent bar */}
        <div className="h-1 bg-[var(--clinical)]" />

        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: patient identity */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-lg bg-[var(--clinical-light)] flex items-center justify-center flex-shrink-0 border border-[var(--clinical-mid)]">
              <User className="w-5 h-5 text-[var(--clinical)]" />
            </div>

            {/* Identity block */}
            <div className="min-w-0">
              <h1 className="text-base font-bold text-[var(--ink-900)] leading-tight truncate">
                {patientName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                {/* Patient UID */}
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-500)]">
                  <User className="w-3 h-3" aria-hidden="true" />
                  <span className="font-mono text-[var(--ink-700)]" title="Patient UID">
                    {patientId.slice(0, 8)}…
                  </span>
                </span>

                {/* Encounter token */}
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-500)]">
                  <Hash className="w-3 h-3" aria-hidden="true" />
                  <span className="font-mono text-[var(--ink-700)]" title="Encounter ID">
                    {encounterId.slice(0, 8)}…
                  </span>
                </span>

                {/* Department */}
                {department && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-500)]">
                    <Building2 className="w-3 h-3" aria-hidden="true" />
                    {department}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: status + action */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            <StatusBadge status={status} />
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}

