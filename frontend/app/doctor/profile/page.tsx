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
      <div className="border-b border-[var(--ink-200)] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink-900)]">Doctor Profile &amp; Security</h1>
          <p className="text-sm text-[var(--ink-500)] mt-1">
            Verified clinician account and hospital clinical workstation settings.
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-semibold"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="p-4 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-sm text-[var(--status-success-fg)] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold">Doctor profile updated successfully. Details are updated across your workstation.</span>
        </div>
      )}

      {/* Identity Card */}
      <Card>
        <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center">
              <UserCircle className="w-7 h-7 text-[var(--clinical)]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--ink-900)]">Dr. {doctorName}</h2>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success-fg)] font-semibold bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2 py-0.5 rounded-md mt-0.5">
                <CheckCircle2 className="w-3 h-3" /> Clinician Account Active
              </span>
            </div>
          </div>
          {isEditing && (
            <span className="text-xs font-medium text-[var(--clinical)] bg-[var(--clinical-light)] border border-[var(--clinical-mid)] px-2 py-0.5 rounded">
              Editing Mode
            </span>
          )}
        </CardHeader>
        <CardContent className="p-5">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
                <label className="text-sm font-medium text-[var(--ink-700)] flex items-center justify-between">
                  <span>Email Address</span>
                  <span className="text-xs text-[var(--ink-500)] font-normal">Managed by login account</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={doctorEmail}
                  className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-3 text-sm text-[var(--ink-500)] cursor-not-allowed"
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
                <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)]">
                  <span className="text-[var(--ink-500)] block font-medium">System Role</span>
                  <span className="text-sm font-semibold text-[var(--ink-900)] capitalize">{user?.role ?? "doctor"}</span>
                </div>
                <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)]">
                  <span className="text-[var(--ink-500)] block font-medium">Doctor User ID</span>
                  <span className="text-sm font-mono text-[var(--ink-900)] truncate block">{user?.id ?? "—"}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--ink-200)]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Spinner className="w-3.5 h-3.5" />
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
              <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[var(--ink-500)] font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[var(--ink-400)]" /> Email Address
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)]">{doctorEmail}</p>
                <p className="text-[10px] text-[var(--ink-500)]">Managed by login account</p>
              </div>

              <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[var(--ink-500)] font-medium flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[var(--ink-400)]" /> Hospital Affiliation
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)]">{hospitalAffiliation}</p>
              </div>

              <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[var(--ink-500)] font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--ink-400)]" /> System Role
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)] capitalize">{user?.role ?? "doctor"}</p>
              </div>

              <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[var(--ink-500)] font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--ink-400)]" /> Account Identifier
                </span>
                <p className="text-sm font-mono font-medium text-[var(--ink-900)] truncate">{user?.id ?? "—"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security & Sign out */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--ink-900)]">Sign out of Clinical Workstation</h3>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">End your current session on this terminal.</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-1.5 font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
