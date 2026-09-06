"use client";
import { useAuthStore } from "@/stores/auth.store";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { UserCircle, Shield, Building2, Mail, CheckCircle2, LogOut } from "lucide-react";

export default function DoctorProfilePage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const doctorName = user?.full_name ?? "Doctor";
  const doctorEmail = user?.email ?? "—";
  const hospitalAffiliation = user?.hospital_affiliation ?? "General OPD Division";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-xl font-bold text-[#172033]">Doctor Profile & Security</h1>
        <p className="text-sm text-[#667085] mt-1">Verified clinician account and hospital clinical workstation settings.</p>
      </div>

      {/* Identity Card */}
      <Card className="shadow-xs">
        <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <UserCircle className="w-7 h-7 text-[#155EEF]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#172033]">Dr. {doctorName}</h2>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mt-0.5">
                <CheckCircle2 className="w-3 h-3" /> Clinician Account Active
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC] space-y-1">
              <span className="text-[#667085] font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#98A2B3]" /> Email Address
              </span>
              <p className="text-sm font-semibold text-[#172033]">{doctorEmail}</p>
            </div>

            <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC] space-y-1">
              <span className="text-[#667085] font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#98A2B3]" /> Hospital Affiliation
              </span>
              <p className="text-sm font-semibold text-[#172033]">{hospitalAffiliation}</p>
            </div>

            <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC] space-y-1">
              <span className="text-[#667085] font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#98A2B3]" /> System Role
              </span>
              <p className="text-sm font-semibold text-[#172033] capitalize">{user?.role ?? "doctor"}</p>
            </div>

            <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC] space-y-1">
              <span className="text-[#667085] font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#98A2B3]" /> Account Identifier
              </span>
              <p className="text-sm font-mono font-medium text-[#172033] truncate">{user?.id ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security & Sign out */}
      <Card className="shadow-xs border-red-100">
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#172033]">Sign out of Clinical Workstation</h3>
            <p className="text-xs text-[#667085] mt-0.5">End your current session on this terminal.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-[#D92D20] border-red-200 hover:bg-red-50 flex items-center gap-1.5 font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}