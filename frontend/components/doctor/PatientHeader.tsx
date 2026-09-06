"use client";
import Link from "next/link";
import { ArrowLeft, User2, Building2 } from "lucide-react";
import { StatusBadge } from "@/components/doctor/StatusBadge";

interface PatientHeaderProps {
  patientName: string;
  patientId: string;
  encounterId: string;
  department?: string | null;
  status: string;
  backHref?: string;
}

export function PatientHeader({ patientName, patientId, encounterId, department, status, backHref = "/doctor/patients" }: PatientHeaderProps) {
  return (
    <div className="bg-white border border-[#E4E7EC] rounded-xl p-5 mb-6 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-[#667085] mb-3 font-medium">
        <Link href={backHref} className="hover:text-[#155EEF] transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Patients
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <User2 className="w-5 h-5 text-[#155EEF]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#172033]">{patientName}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              <span className="text-xs text-[#667085]">Patient UID: <span className="font-mono text-[#172033] font-medium">{patientId}</span></span>
              {department && (
                <span className="text-xs text-[#667085] flex items-center gap-1">
                  <Building2 className="w-3 h-3" />{department}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={status} />
          <span className="text-xs text-[#667085] font-mono">#{encounterId.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}
