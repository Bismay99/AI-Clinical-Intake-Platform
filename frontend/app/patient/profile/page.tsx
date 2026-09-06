"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Calendar,
  Phone,
  Globe,
  Mail,
  Shield,
  FileText,
  ClipboardList,
  LogOut,
  ArrowRight,
  Fingerprint,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getPatientProfile, updatePatientProfile } from "@/services/patient.service";
import { getPatientDashboardMetrics } from "@/services/report.service";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse, PatientProfileUpdate } from "@/types/patient";
import type { PatientDashboardMetrics } from "@/types/report";

function languageLabel(code: string): string {
  switch (code) {
    case "en": return "English";
    case "hi": return "Hindi";
    case "hinglish": return "Hinglish";
    default: return code;
  }
}

export default function PatientProfile() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, setUser, logout } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<PatientProfileUpdate>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // TanStack Query for Patient Profile
  const {
    data: profile,
    isLoading: isLoadingProfile,
    error: profileError,
  } = useQuery<PatientProfileResponse>({
    queryKey: ["patient", "profile"],
    queryFn: getPatientProfile,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  // TanStack Query for Metrics
  const { data: metrics } = useQuery<PatientDashboardMetrics | null>({
    queryKey: ["patient", "metrics"],
    queryFn: () => getPatientDashboardMetrics().catch(() => null),
  });

  // Mutation for updating profile
  const updateMutation = useMutation({
    mutationFn: (payload: PatientProfileUpdate) => updatePatientProfile(payload),
    onSuccess: (updatedProfile) => {
      setSaveSuccess(true);
      setIsEditing(false);
      setFormError(null);
      // Update auth store user full_name if changed
      if (user && updatedProfile.full_name) {
        setUser({ ...user, full_name: updatedProfile.full_name });
      }
      // Invalidate relevant TanStack Query caches
      qc.setQueryData(["patient", "profile"], updatedProfile);
      qc.invalidateQueries({ queryKey: ["patient", "profile"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["patient", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["patient", "reports"] });
      setTimeout(() => setSaveSuccess(false), 4000);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setFormError(err.detail || "Failed to update profile.");
      } else {
        setFormError("An unexpected error occurred while saving profile.");
      }
    },
  });

  function startEdit() {
    if (!profile) return;
    setFormData({
      full_name: profile.full_name,
      date_of_birth: profile.date_of_birth || "",
      gender: profile.gender || "",
      phone: profile.phone || "",
      preferred_language: profile.preferred_language || "en",
      hospital_identifier: profile.hospital_identifier || "",
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
      date_of_birth: formData.date_of_birth?.trim() || null,
      gender: formData.gender?.trim() || null,
      phone: formData.phone?.trim() || null,
      preferred_language: formData.preferred_language?.trim() || "en",
      hospital_identifier: formData.hospital_identifier?.trim() || null,
    });
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-[var(--ink-500)] bg-[var(--bg-surface)] p-5 rounded-lg border border-[var(--ink-200)] shadow-[var(--shadow-sm)]">
          <Spinner />
          <span className="text-sm font-medium">Loading patient profile…</span>
        </div>
      </div>
    );
  }

  if (profileError instanceof ApiError && profileError.status === 404) {
    router.replace("/patient/onboarding");
    return null;
  }

  if (profileError) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="p-4 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)]">
          Could not load your profile details. Please try refreshing.
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Title & Actions */}
      <div className="pb-3 border-b border-[var(--ink-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <User className="w-6 h-6 text-[var(--clinical)]" />
            <span>Patient Profile</span>
          </h1>
          <p className="text-sm text-[var(--ink-500)] mt-1">
            Your registered identity and clinical healthcare portal credentials.
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            className="flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-3 rounded-md border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-sm text-[var(--status-success-fg)] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold">Profile updated successfully. Changes are now active across your portal.</span>
        </div>
      )}

      {/* ── Section 1: Personal Information (View or Edit) ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--ink-200)] flex flex-row items-center justify-between">
          <CardTitle>Personal Information</CardTitle>
          {isEditing && (
            <span className="text-xs font-medium text-[var(--clinical)] bg-[var(--clinical-light)] border border-[var(--clinical-mid)] px-2 py-0.5 rounded">
              Editing Mode
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Full Name */}
              <Input
                id="full_name"
                label="Full Name *"
                value={formData.full_name || ""}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. John Doe"
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
                  value={user?.email || "—"}
                  className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-3 text-sm text-[var(--ink-500)] cursor-not-allowed"
                />
              </div>

              {/* Date of Birth & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="date_of_birth"
                  label="Date of Birth (YYYY-MM-DD)"
                  type="date"
                  value={formData.date_of_birth || ""}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gender" className="text-sm font-medium text-[var(--ink-700)]">Gender</label>
                  <select
                    id="gender"
                    value={formData.gender || ""}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              {/* Phone & Preferred Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="phone"
                  label="Phone Number"
                  type="tel"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                />

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="preferred_language" className="text-sm font-medium text-[var(--ink-700)]">Preferred Language</label>
                  <select
                    id="preferred_language"
                    value={formData.preferred_language || "en"}
                    onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value })}
                    className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </div>
              </div>

              {/* Hospital Identifier */}
              <Input
                id="hospital_identifier"
                label="Hospital Identifier (HIS / MRN)"
                value={formData.hospital_identifier || ""}
                onChange={(e) => setFormData({ ...formData, hospital_identifier: e.target.value })}
                placeholder="e.g. HIS-98421"
              />

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--ink-200)]">
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
                  className="flex items-center gap-1.5"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Spinner />
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
            <div className="divide-y divide-[var(--ink-200)]">
              {[
                { icon: User, label: "Full Name", value: profile.full_name },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-[var(--ink-400)]" />
                    <span className="text-xs font-semibold text-[var(--ink-500)]">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-[var(--ink-900)]">{value}</span>
                </div>
              ))}

              <div className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[var(--ink-400)]" />
                  <span className="text-xs font-semibold text-[var(--ink-500)]">Email Address</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-[var(--ink-900)]">{user?.email || "Not available"}</span>
                  <span className="block text-[11px] text-[var(--ink-400)]">Managed by login account</span>
                </div>
              </div>

              <div className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Fingerprint className="w-4 h-4 text-[var(--clinical)]" />
                  <span className="text-xs font-semibold text-[var(--ink-500)]">Patient UID</span>
                </div>
                <span className="font-mono text-xs text-[var(--clinical)] font-bold bg-[var(--clinical-light)] px-2 py-0.5 rounded border border-[var(--clinical-mid)]">
                  {profile.id}
                </span>
              </div>

              {[
                { icon: Calendar, label: "Date of Birth", value: profile.date_of_birth || "Not provided" },
                { icon: User, label: "Gender", value: profile.gender ? profile.gender.replace(/_/g, " ") : "Not provided", className: "capitalize" },
                { icon: Phone, label: "Phone", value: profile.phone || "Not provided" },
                { icon: Globe, label: "Preferred Language", value: languageLabel(profile.preferred_language) },
              ].map(({ icon: Icon, label, value, className }) => (
                <div key={label} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-[var(--ink-400)]" />
                    <span className="text-xs font-semibold text-[var(--ink-500)]">{label}</span>
                  </div>
                  <span className={`text-sm text-[var(--ink-900)] ${className || ""}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Health Identity & Hospital Integration ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--clinical)]" />
            <span>Health Identity &amp; Hospital Integration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-[var(--ink-500)]">Hospital Identifier (HIS):</span>
            <span className="font-mono text-[var(--ink-800)] font-medium">
              {profile.hospital_identifier || "Assigned by hospital on check-in"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-[var(--ink-500)]">ABHA Health ID:</span>
            <span className="text-[var(--ink-400)] italic">Not linked yet</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Clinical Records Quick Access ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[var(--clinical)]" />
                <span className="text-xs font-bold text-[var(--ink-900)]">Health Reports</span>
              </div>
              <p className="text-xs text-[var(--ink-500)]">
                {metrics ? `${metrics.reports_count} completed reports` : "View past reports"}
              </p>
            </div>
            <Link href="/patient/reports" className="text-xs font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1">
              <span>View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--clinical)]" />
                <span className="text-xs font-bold text-[var(--ink-900)]">Medical Documents</span>
              </div>
              <p className="text-xs text-[var(--ink-500)]">
                {metrics ? `${metrics.documents_count} uploaded files` : "Manage files"}
              </p>
            </div>
            <Link href="/patient/documents" className="text-xs font-semibold text-[var(--clinical)] hover:underline flex items-center gap-1">
              <span>View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Security & Sign Out ── */}
      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--ink-900)]">Security &amp; Account Session</p>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">
              Securely terminate your current session on this device.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
