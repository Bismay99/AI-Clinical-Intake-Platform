"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { searchPatientByUid, getQueue, getAvailableEncounters, assignEncounter } from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Search, User2, Building2, Clock, AlertCircle, ArrowRight, CheckCircle2, UserCheck } from "lucide-react";
import type { PatientSearchResult } from "@/types/doctor";

export default function DoctorPatientsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"search" | "mine" | "available">("search");
  const [searchUid, setSearchUid] = useState("");
  const [searchResult, setSearchResult] = useState<PatientSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // My assigned encounters
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
  });

  // Available unassigned encounters pool
  const { data: available, isLoading: availLoading } = useQuery({
    queryKey: ["doctor", "available"],
    queryFn: getAvailableEncounters,
  });

  const assignMut = useMutation({
    mutationFn: assignEncounter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
  });

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = searchUid.trim();
    if (!q) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await searchPatientByUid(q);
      setSearchResult(res);
    } catch (err: unknown) {
      const e = err as { status?: number; detail?: string };
      if (e?.status === 404) {
        setSearchError("No authorized patient found for this UID. A patient record is accessible only when an encounter is assigned to you.");
      } else {
        setSearchError(e?.detail || "Search failed. Please verify the UID and try again.");
      }
    } finally {
      setIsSearching(false);
    }
  }

  async function handleClaimAndReview(encounterId: string) {
    try {
      await assignMut.mutateAsync(encounterId);
      router.push(`/doctor/patients/${encounterId}`);
    } catch (err: unknown) {
      const e = err as { detail?: string };
      alert(e?.detail || "Failed to assign encounter.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="border-b border-[var(--ink-200)] pb-5">
        <h1 className="text-xl font-bold text-[var(--ink-900)]">Patients &amp; Discovery</h1>
        <p className="text-sm text-[var(--ink-500)] mt-1">Search authorized patients by UID, view your assigned cases, or claim unassigned encounters.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--ink-200)] gap-6">
        <button
          onClick={() => setActiveTab("search")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === "search" ? "border-[var(--clinical)] text-[var(--clinical)]" : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)]"
          }`}
        >
          <Search className="w-4 h-4" />
          Find Patient by UID
        </button>
        <button
          onClick={() => setActiveTab("mine")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === "mine" ? "border-[var(--clinical)] text-[var(--clinical)]" : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)]"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          My Assigned Patients ({queue?.total ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("available")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === "available" ? "border-[var(--clinical)] text-[var(--clinical)]" : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)]"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Available Pool ({available?.length ?? 0})
        </button>
      </div>

      {/* TAB 1: Search Patient by UID */}
      {activeTab === "search" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4">
              <CardTitle className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--clinical)]" />
                Authorized Patient Search
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Input
                    value={searchUid}
                    onChange={e => setSearchUid(e.target.value)}
                    placeholder="Enter Patient UID (e.g. 752d024e-55ce-40df-9edc-f710c6ec501e)"
                    className="pr-10 text-sm font-mono"
                  />
                  {searchUid && (
                    <button
                      type="button"
                      onClick={() => { setSearchUid(""); setSearchResult(null); setSearchError(null); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-400)] hover:text-[var(--ink-900)] cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Button type="submit" isLoading={isSearching} className="text-xs font-semibold px-6 cursor-pointer">
                  Search Patient
                </Button>
              </form>
              <p className="text-xs text-[var(--ink-500)] mt-2.5">
                Note: Searches are strictly authorized. Results are returned only if the patient has encounters assigned to your account.
              </p>
            </CardContent>
          </Card>

          {/* Search Error / Not Found */}
          {searchError && (
            <div className="p-4 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-sm text-[var(--status-pending-fg)] flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-[var(--status-pending-fg)] mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Patient not found or unauthorized</p>
                <p className="text-xs mt-0.5">{searchError}</p>
              </div>
            </div>
          )}

          {/* Search Result Card */}
          {searchResult && (
            <Card className="border-[var(--clinical-mid)] shadow-[var(--shadow-sm)]">
              <CardHeader className="bg-[var(--clinical-light)]/40 border-b border-[var(--ink-200)] px-5 py-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center">
                      <User2 className="w-5 h-5 text-[var(--clinical)]" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[var(--ink-900)]">{searchResult.patient_name}</h2>
                      <p className="text-xs text-[var(--ink-500)] font-mono">UID: {searchResult.patient_id}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2.5 py-1 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authorized
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-xs bg-[var(--bg-surface-2)] p-3 rounded-md border border-[var(--ink-200)]">
                  <div>
                    <span className="text-[var(--ink-500)] font-medium">Date of Birth</span>
                    <p className="font-semibold text-[var(--ink-900)]">{searchResult.date_of_birth ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[var(--ink-500)] font-medium">Gender</span>
                    <p className="font-semibold text-[var(--ink-900)] capitalize">{searchResult.gender ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[var(--ink-500)] font-medium">Preferred Language</span>
                    <p className="font-semibold text-[var(--ink-900)] uppercase">{searchResult.preferred_language}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] mb-2.5">
                    Authorized Encounters ({searchResult.encounters.length})
                  </h3>
                  <div className="space-y-2">
                    {searchResult.encounters.map(enc => (
                      <div
                        key={enc.encounter_id}
                        className="border border-[var(--ink-200)] rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-2)] transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[var(--ink-900)] font-mono">#{enc.encounter_id.slice(0, 8)}</span>
                            <StatusBadge status={enc.queue_status} />
                            {enc.unreviewed_count > 0 && (
                              <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded-md px-1.5 py-0.5 font-semibold">
                                {enc.unreviewed_count} unreviewed
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[var(--ink-500)]">
                            {enc.opd_department && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-[var(--ink-400)]" />{enc.opd_department}
                              </span>
                            )}
                            {enc.submitted_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[var(--ink-400)]" />{new Date(enc.submitted_at).toLocaleDateString("en-IN")}
                              </span>
                            )}
                            <span>{enc.total_entities} entities</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/doctor/patients/${enc.encounter_id}`)}
                          className="flex items-center gap-1.5 text-xs font-semibold"
                        >
                          Open Patient Record <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: My Assigned Patients */}
      {activeTab === "mine" && (
        <Card>
          <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4">
            <CardTitle>Your Assigned Encounters</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queueLoading ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : !queue?.items.length ? (
              <div className="py-12 text-center text-sm text-[var(--ink-500)]">No encounters assigned to your account.</div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {queue.items.map(item => (
                  <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--ink-900)]">{item.patient_name}</p>
                        <StatusBadge status={item.encounter_status} />
                        {item.unreviewed_count > 0 && (
                          <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded-md px-1.5 py-0.5 font-semibold">
                            {item.unreviewed_count} unreviewed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[var(--ink-500)]">
                        <span className="font-mono select-all" title={item.patient_id}>Patient UID: {item.patient_id}</span>
                        {item.opd_department && <span>{item.opd_department}</span>}
                        <span>{new Date(item.updated_at).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      Review <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Available Unassigned Pool */}
      {activeTab === "available" && (
        <Card>
          <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4">
            <div className="flex items-center justify-between">
              <CardTitle>Unassigned Ready Encounters</CardTitle>
              <span className="text-xs text-[var(--ink-500)]">Ready for doctor claim</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {availLoading ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : !available?.length ? (
              <div className="py-12 text-center text-sm text-[var(--ink-500)]">No unassigned encounters in the pool.</div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {available.map(item => (
                  <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--ink-900)]">{item.patient_name}</p>
                        <StatusBadge status={item.queue_status} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-500)]">
                        {item.opd_department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-[var(--ink-400)]" />{item.opd_department}</span>}
                        <span>{item.total_entities} extracted entities</span>
                        <span>{new Date(item.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleClaimAndReview(item.encounter_id)}
                      isLoading={assignMut.isPending}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      Claim &amp; Review <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}