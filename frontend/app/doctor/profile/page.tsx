"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
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
  KeyRound,
  FileCheck,
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
    isLoading,
  } = useQuery<DoctorProfileResponse>({
    queryKey: ["doctor", "profile"],
    queryFn: getDoctorProfile,
    initialData: user
      ? {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          hospital_affiliation: user.hospital_affiliation,
          is_active: user.is_active,
        }
      : undefined,
  });

  // Mutation for updating doctor profile via backend
  const updateMutation = useMutation({
    mutationFn: (payload: DoctorProfileUpdate) => updateDoctorProfile(payload),
    onSuccess: (updatedProfile) => {
      setSaveSuccess(true);
      setIsEditing(false);
      setFormError(null);
      // Synchronize auth store
      if (user) {
        setUser({
          ...user,
          full_name: updatedProfile.full_name,
          hospital_affiliation: updatedProfile.hospital_affiliation,
        });
      }
      // Update cache
      qc.setQueryData(["doctor", "profile"], updatedProfile);
      qc.invalidateQueries({ queryKey: ["doctor", "profile"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["doctor", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["doctor", "queue"] });
      setTimeout(() => setSaveSuccess(false), 5000);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setFormError(err.detail || "Failed to update clinician profile.");
      } else {
        setFormError("An unexpected error occurred while saving profile changes.");
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

  const doctorName = profile?.full_name ?? user?.full_name ?? "Physician";
  const doctorEmail = profile?.email ?? user?.email ?? "—";
  const hospitalAffiliation =
    profile?.hospital_affiliation ?? user?.hospital_affiliation ?? "Clinical Department / OPD";

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="border-b border-[var(--ink-200)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
            Clinician Profile &amp; Hospital Credential
          </h1>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Verified physician identity, hospital departmental affiliation, and workstation session security.
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
            <span>Edit Credentials</span>
          </Button>
        )}
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-3.5 rounded-lg border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-fg)] flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">
            Doctor profile updated successfully. Updated credentials are now reflected across your clinical workstation.
          </span>
        </div>
      )}

      {/* Error Notification */}
      {formError && (
        <div className="p-3.5 rounded-lg border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)] flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Main Credential Panel */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {/* Header Ribbon */}
        <div className="px-5 py-4 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center shrink-0 text-[var(--clinical)]">
              <UserCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--ink-900)] leading-none">
                Dr. {doctorName}
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2 py-0.2 rounded">
                  <CheckCircle2 className="w-3 h-3" /> Authorized Clinician
                </span>
                <span className="text-xs text-[var(--ink-500)]">• {hospitalAffiliation}</span>
              </div>
            </div>
          </div>

          {isEditing && (
            <span className="text-xs font-semibold text-[var(--clinical)] bg-[var(--clinical-light)] border border-[var(--clinical-mid)] px-2.5 py-1 rounded">
              Editing Clinician Profile
            </span>
          )}
        </div>

        <div className="p-5">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
              <Input
                id="doctor_name"
                label="Doctor Full Name *"
                value={formData.full_name || ""}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Dr. Priya Sharma, MD"
                required
              />

              {/* Email Address (Authoritative Read-Only) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--ink-700)] uppercase tracking-wider flex items-center justify-between">
                  <span>Hospital Account Email</span>
                  <span className="text-[11px] text-[var(--ink-400)] font-normal normal-case">Managed by system administrator</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={doctorEmail}
                  className="h-9 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--ink-500)] cursor-not-allowed font-mono"
                />
              </div>

              {/* Hospital Affiliation */}
              <Input
                id="hospital_affiliation"
                label="Hospital Affiliation / Specialty Department"
                value={formData.hospital_affiliation || ""}
                onChange={(e) =>
                  setFormData({ ...formData, hospital_affiliation: e.target.value })
                }
                placeholder="e.g. AIIMS New Delhi — Department of Cardiology"
              />

              {/* System Identifiers (Read-Only) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">Access Role</span>
                  <span className="font-semibold text-[var(--ink-900)] capitalize mt-0.5 block">
                    {user?.role ?? "doctor"}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">Clinician UID</span>
                  <span className="font-mono text-[11px] text-[var(--ink-800)] truncate mt-0.5 block">
                    {user?.id ?? "—"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--ink-200)]">
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[var(--ink-400)]" />
                  Hospital Email
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)] font-mono truncate">{doctorEmail}</p>
                <p className="text-[10px] text-[var(--ink-500)]">Authoritative credential login</p>
              </div>

              <div className="p-3.5 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[var(--ink-400)]" />
                  Department / Affiliation
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)] truncate">{hospitalAffiliation}</p>
                <p className="text-[10px] text-[var(--ink-500)]">Clinical workstation unit</p>
              </div>

              <div className="p-3.5 bg-[var(--bg-surface-2)] rounded-md border border-[var(--ink-200)] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--ink-400)]" />
                  System Role &amp; Access
                </span>
                <p className="text-sm font-semibold text-[var(--ink-900)] capitalize">{user?.role ?? "doctor"}</p>
                <p className="text-[10px] text-[var(--ink-500)] font-mono truncate">UID: {user?.id ?? "—"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Workstation Security & Session */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[var(--ink-900)] flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-[var(--clinical)]" />
            Workstation Terminal Security
          </h3>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            To protect patient confidentiality under hospital governance, sign out when leaving this clinical terminal unattended.
          </p>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out of Workstation
        </Button>
      </div>
    </div>
  );
}
