"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { getDoctorProfile, updateDoctorProfile } from "@/services/doctor.service";
import { ApiError } from "@/lib/api";
import type { DoctorProfileResponse, DoctorProfileUpdate } from "@/types/doctor";
import {
  UserCircle,
  Shield,
  Building2,
  Mail,
  CheckCircle2,
  LogOut,
  Edit3,
  AlertCircle,
  X,
  Save,
} from "lucide-react";

export default function DoctorProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, setUser, logout } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<DoctorProfileUpdate>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // TanStack Query for Doctor Profile
  const {
    data: profile,
  } = useQuery<DoctorProfileResponse>({
    queryKey: ["doctor", "profile"],
    queryFn: getDoctorProfile,
    initialData: user ? {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      hospital_affiliation: user.hospital_affiliation,
      is_active: user.is_active,
    } : undefined,
  });

  // Mutation for updating doctor profile
  const updateMutation = useMutation({
    mutationFn: (payload: DoctorProfileUpdate) => updateDoctorProfile(payload),
    onSuccess: (updatedProfile) => {
      setSaveSuccess(true);
      setIsEditing(false);
      setFormError(null);
      // Update global auth store
      if (user) {
        setUser({
          ...user,
          full_name: updatedProfile.full_name,
          hospital_affiliation: updatedProfile.hospital_affiliation,
        });
      }
      // Update & invalidate query caches
      qc.setQueryData(["doctor", "profile"], updatedProfile);
      qc.invalidateQueries({ queryKey: ["doctor", "profile"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["doctor", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["doctor", "queue"] });
      setTimeout(() => setSaveSuccess(false), 4000);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setFormError(err.detail || "Failed to update doctor profile.");
      } else {
        setFormError("An unexpected error occurred while saving changes.");
      }
    },
  });

  function startEdit() {
    const currentName = profile?.full_name ?? user?.full_name ?? "";
    const currentAffil = profile?.hospital_affiliation ?? user?.hospital_affiliation ?? "";
    setFormData({
      full_name: currentName,
      hospital_affiliation: currentAffil,
    });
    setFormError(null);
    setSaveSuccess(false);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.full_name || !formData.full_name.trim()) {
      setFormError("Full name is required.");
      return;
    }
    setFormError(null);
    updateMutation.mutate({
      full_name: formData.full_name.trim(),
      hospital_affiliation: formData.hospital_affiliation?.trim() || null,
    });
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const doctorName = profile?.full_name ?? user?.full_name ?? "Doctor";
  const doctorEmail = profile?.email ?? user?.email ?? "—";
  const hospitalAffiliation = profile?.hospital_affiliation ?? user?.hospital_affiliation ?? "General OPD Division";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Doctor Profile & Security</h1>
          <p className="text-sm text-[#667085] mt-1">
            Verified clinician account and hospital clinical workstation settings.
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-semibold text-[#155EEF] border-blue-200 hover:bg-blue-50"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold">Doctor profile updated successfully. Details are updated across your workstation.</span>
        </div>
      )}

      {/* Identity Card */}
      <Card className="shadow-xs">
        <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 flex flex-row items-center justify-between">
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
          {isEditing && (
            <span className="text-xs font-medium text-[#155EEF] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
              Editing Mode
            </span>
          )}
        </CardHeader>
        <CardContent className="p-5">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Doctor Name */}
              <Input
                id="doctor_name"
                label="Full Name *"
                value={formData.full_name || ""}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Priya Sharma"
                required
              />

              {/* Email (Read-Only) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span>Email Address</span>
                  <span className="text-xs text-[#667085] font-normal">Managed by login account</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={doctorEmail}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-[#F7F9FC] px-3 text-sm text-[#667085] cursor-not-allowed"
                />
              </div>

              {/* Hospital Affiliation / Department */}
              <Input
                id="hospital_affiliation"
                label="Hospital Affiliation / Department"
                value={formData.hospital_affiliation || ""}
                onChange={(e) => setFormData({ ...formData, hospital_affiliation: e.target.value })}
                placeholder="e.g. AIIMS New Delhi — Cardiology OPD"
              />

              {/* Role & Account ID display in edit mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC]">
                  <span className="text-[#667085] block font-medium">System Role</span>
                  <span className="text-sm font-semibold text-[#172033] capitalize">{user?.role ?? "doctor"}</span>
                </div>
                <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC]">
                  <span className="text-[#667085] block font-medium">Doctor User ID</span>
                  <span className="text-sm font-mono text-[#172033] truncate block">{user?.id ?? "—"}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E4E7EC]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateMutation.isPending}
                  className="bg-[#155EEF] hover:bg-[#1048C6] text-white flex items-center gap-1.5"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Spinner className="w-3.5 h-3.5 text-white" />
                      <span>Saving Changes…</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-[#F7F9FC] rounded-lg border border-[#E4E7EC] space-y-1">
                <span className="text-[#667085] font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#98A2B3]" /> Email Address
                </span>
                <p className="text-sm font-semibold text-[#172033]">{doctorEmail}</p>
                <p className="text-[10px] text-[#667085]">Managed by login account</p>
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
          )}
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
