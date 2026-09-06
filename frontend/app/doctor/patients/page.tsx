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
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-xl font-bold text-[#172033]">Patients & Discovery</h1>
        <p className="text-sm text-[#667085] mt-1">Search authorized patients by UID, view your assigned cases, or claim unassigned encounters.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E4E7EC] gap-6">
        <button
          onClick={() => setActiveTab("search")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "search" ? "border-[#155EEF] text-[#155EEF]" : "border-transparent text-[#667085] hover:text-[#172033]"
          }`}
        >
          <Search className="w-4 h-4" />
          Find Patient by UID
        </button>
        <button
          onClick={() => setActiveTab("mine")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "mine" ? "border-[#155EEF] text-[#155EEF]" : "border-transparent text-[#667085] hover:text-[#172033]"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          My Assigned Patients ({queue?.total ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("available")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "available" ? "border-[#155EEF] text-[#155EEF]" : "border-transparent text-[#667085] hover:text-[#172033]"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Available Pool ({available?.length ?? 0})
        </button>
      </div>

      {/* TAB 1: Search Patient by UID */}
      {activeTab === "search" && (
        <div className="space-y-5">
          <Card className="shadow-xs">
            <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
              <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
                <Search className="w-4 h-4 text-[#155EEF]" />
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#98A2B3] hover:text-[#172033]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Button type="submit" isLoading={isSearching} className="text-xs font-semibold px-6">
                  Search Patient
                </Button>
              </form>
              <p className="text-xs text-[#667085] mt-2.5">
                Note: Searches are strictly authorized. Results are returned only if the patient has encounters assigned to your account.
              </p>
            </CardContent>
          </Card>

          {/* Search Error / Not Found */}
          {searchError && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-xs text-amber-900">Patient not found or unauthorized</p>
                <p className="text-xs mt-0.5 text-amber-800">{searchError}</p>
              </div>
            </div>
          )}

          {/* Search Result Card */}
          {searchResult && (
            <Card className="border-[#155EEF] shadow-sm">
              <CardHeader className="bg-blue-50/50 border-b border-[#E4E7EC] px-5 py-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User2 className="w-5 h-5 text-[#155EEF]" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#172033]">{searchResult.patient_name}</h2>
                      <p className="text-xs text-[#667085] font-mono">UID: {searchResult.patient_id}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authorized
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-xs bg-[#F7F9FC] p-3 rounded-lg border border-[#E4E7EC]">
                  <div>
                    <span className="text-[#667085] font-medium">Date of Birth</span>
                    <p className="font-semibold text-[#172033]">{searchResult.date_of_birth ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[#667085] font-medium">Gender</span>
                    <p className="font-semibold text-[#172033] capitalize">{searchResult.gender ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[#667085] font-medium">Preferred Language</span>
                    <p className="font-semibold text-[#172033] uppercase">{searchResult.preferred_language}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] mb-2.5">
                    Authorized Encounters ({searchResult.encounters.length})
                  </h3>
                  <div className="space-y-2">
                    {searchResult.encounters.map(enc => (
                      <div
                        key={enc.encounter_id}
                        className="border border-[#E4E7EC] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[#172033] font-mono">#{enc.encounter_id.slice(0, 8)}</span>
                            <StatusBadge status={enc.queue_status} />
                            {enc.unreviewed_count > 0 && (
                              <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold">
                                {enc.unreviewed_count} unreviewed
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[#667085]">
                            {enc.opd_department && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-[#98A2B3]" />{enc.opd_department}
                              </span>
                            )}
                            {enc.submitted_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#98A2B3]" />{new Date(enc.submitted_at).toLocaleDateString("en-IN")}
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
        <Card className="shadow-xs">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
            <CardTitle className="text-sm font-bold text-[#172033]">Your Assigned Encounters</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queueLoading ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : !queue?.items.length ? (
              <div className="py-12 text-center text-sm text-[#667085]">No encounters assigned to your account.</div>
            ) : (
              <div className="divide-y divide-[#E4E7EC]">
                {queue.items.map(item => (
                  <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F9FC] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#172033]">{item.patient_name}</p>
                        <StatusBadge status={item.encounter_status} />
                        {item.unreviewed_count > 0 && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold">
                            {item.unreviewed_count} unreviewed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#667085]">
                        <span className="font-mono">UID: {item.patient_id.slice(0, 8)}…</span>
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
        <Card className="shadow-xs">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-[#172033]">Unassigned Ready Encounters</CardTitle>
              <span className="text-xs text-[#667085]">Ready for doctor claim</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {availLoading ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : !available?.length ? (
              <div className="py-12 text-center text-sm text-[#667085]">No unassigned encounters in the pool.</div>
            ) : (
              <div className="divide-y divide-[#E4E7EC]">
                {available.map(item => (
                  <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F9FC] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#172033]">{item.patient_name}</p>
                        <StatusBadge status={item.queue_status} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#667085]">
                        {item.opd_department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-[#98A2B3]" />{item.opd_department}</span>}
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
                      Claim & Review <ArrowRight className="w-3.5 h-3.5" />
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