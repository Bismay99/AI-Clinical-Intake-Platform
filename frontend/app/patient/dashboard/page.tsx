"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Plus, ArrowRight, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth.store";
import { getPatientProfile } from "@/services/patient.service";
import { getMyEncounters, createEncounter } from "@/services/patient.service";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse, EncounterResponse } from "@/types/patient";

const DEPARTMENTS = [
  "General Medicine",
  "General OPD",
  "Pediatrics",
  "Orthopedics",
  "Other",
];

function statusBadgeVariant(status: string): "default" | "success" | "warning" | "info" {
  switch (status) {
    case "registered": return "default";
    case "intake_in_progress": return "info";
    case "ready_for_review": return "warning";
    case "completed": return "success";
    default: return "default";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "registered": return "Registered";
    case "intake_in_progress": return "Intake In Progress";
    case "ready_for_review": return "Awaiting Doctor Review";
    case "completed": return "Completed";
    default: return status;
  }
}

export default function PatientDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
  const [encounters, setEncounters] = useState<EncounterResponse[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingEncounters, setIsLoadingEncounters] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profile — redirect to onboarding if missing
  useEffect(() => {
    async function loadProfile() {
      try {
        const p = await getPatientProfile();
        setProfile(p);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/patient/onboarding");
          return;
        }
        // Other errors — profile might exist but network failed
        setError("Could not load your profile. Please try again.");
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  // Load encounters after profile loaded
  useEffect(() => {
    if (!profile) return;
    async function loadEncounters() {
      try {
        const enc = await getMyEncounters();
        setEncounters(enc);
      } catch {
        // Non-critical: show empty state
      } finally {
        setIsLoadingEncounters(false);
      }
    }
    loadEncounters();
  }, [profile]);

  async function handleCreateEncounter(dept: string) {
    setIsCreating(true);
    setError(null);
    setShowDeptPicker(false);
    try {
      const enc = await createEncounter({ opd_department: dept || null });
      setEncounters(prev => [enc, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Failed to create encounter. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  // Active encounters = not completed
  const activeEncounters = encounters.filter(e => e.queue_status !== "completed");
  const pastEncounters = encounters.filter(e => e.queue_status === "completed");

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[#667085]">
          <Spinner className="text-[#155EEF]" />
          <span>Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-[#155EEF]" />
          Dashboard
        </h1>
        <p className="text-[#667085] mt-1 text-sm">
          Welcome{profile ? `, ${profile.full_name}` : " back"}. Manage your pre-consultation intake here.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary CTA */}
      <Card className="mb-6 border-[#155EEF] border-opacity-30">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#172033]">
                {activeEncounters.length > 0 ? "Continue Pre-Consultation" : "Start New Consultation"}
              </h2>
              <p className="text-sm text-[#667085] mt-1">
                {activeEncounters.length > 0
                  ? "You have an active consultation. Continue your intake session."
                  : "Begin a new pre-consultation to prepare your medical history for the doctor."
                }
              </p>
            </div>
            {activeEncounters.length > 0 ? (
              <Button size="lg" onClick={() => router.push("/patient/intake")} className="flex-shrink-0">
                Continue Intake <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => setShowDeptPicker(true)}
                isLoading={isCreating}
                className="flex-shrink-0"
              >
                <Plus className="w-4 h-4" /> Start New Consultation
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Department picker modal */}
      {showDeptPicker && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Select Department</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DEPARTMENTS.map(dept => (
                <button
                  key={dept}
                  onClick={() => handleCreateEncounter(dept)}
                  className="p-3 rounded-lg border border-[#E4E7EC] text-sm font-medium text-[#172033] hover:bg-blue-50 hover:border-[#155EEF] transition-colors"
                >
                  {dept}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDeptPicker(false)}
              className="mt-3 text-sm text-[#667085] hover:text-[#172033]"
            >
              Cancel
            </button>
          </CardContent>
        </Card>
      )}

      {/* Active encounters */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Active Consultations</CardTitle></CardHeader>
          <CardContent>
            {isLoadingEncounters ? (
              <div className="flex items-center gap-2 text-[#667085] text-sm"><Spinner className="text-[#155EEF]" /> Loading…</div>
            ) : activeEncounters.length === 0 ? (
              <p className="text-sm text-[#667085]">No active consultations. Start one above.</p>
            ) : (
              <div className="space-y-3">
                {activeEncounters.map(enc => (
                  <div key={enc.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E4E7EC] bg-[#F7F9FC]">
                    <div>
                      <p className="text-sm font-medium text-[#172033]">{enc.opd_department || "General"}</p>
                      <Badge variant={statusBadgeVariant(enc.queue_status)} className="mt-1">{statusLabel(enc.queue_status)}</Badge>
                    </div>
                    <button
                      onClick={() => router.push("/patient/intake")}
                      className="text-[#155EEF] hover:underline text-sm font-medium"
                    >
                      Continue →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Previous Consultations</CardTitle></CardHeader>
          <CardContent>
            {isLoadingEncounters ? (
              <div className="flex items-center gap-2 text-[#667085] text-sm"><Spinner className="text-[#155EEF]" /> Loading…</div>
            ) : pastEncounters.length === 0 ? (
              <p className="text-sm text-[#667085]">No past consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {pastEncounters.slice(0, 5).map(enc => (
                  <div key={enc.id} className="flex items-center justify-between p-3 rounded-lg border border-[#E4E7EC]">
                    <div>
                      <p className="text-sm font-medium text-[#172033]">{enc.opd_department || "General"}</p>
                      <Badge variant="success" className="mt-1"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}