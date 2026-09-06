"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  searchPatientByUid,
  getQueue,
  getSummary,
  getTimeline,
} from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { EvidenceProvenanceSummary } from "@/components/doctor/EvidenceProvenanceSummary";
import { SafetyAttentionFlags } from "@/components/doctor/SafetyAttentionFlags";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import {
  FolderHeart,
  Search,
  User,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  FolderOpen,
  ArrowRight,
  History,
  X,
} from "lucide-react";
import type {
  PatientSearchResult,
  EncounterSummary,
  SummaryDetailResponse,
  TimelineEventResponse,
  EntityDetail,
} from "@/types/doctor";

function RecordsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUid = searchParams.get("uid") || "";

  // Search & patient selection state
  const [searchUid, setSearchUid] = useState(initialUid);
  const [activePatient, setActivePatient] = useState<PatientSearchResult | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Findings filter inside selected encounter: "all" | "reviewed" | "pending"
  const [findingsTab, setFindingsTab] = useState<"all" | "reviewed" | "pending">("all");

  // Fetch doctor's assigned queue for one-click quick select of authorized patients
  const { data: queueData } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
    staleTime: 60_000,
  });

  // Automatically execute search if initialUid is provided in query params
  useEffect(() => {
    if (initialUid && !activePatient) {
      handleSearch(initialUid);
    }
  }, [initialUid]);

  // Execute patient lookup via existing authoritative backend endpoint
  async function handleSearch(uidToSearch?: string) {
    const q = (uidToSearch || searchUid).trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await searchPatientByUid(q);
      setActivePatient(res);
      // Auto-select first encounter by default if available
      if (res.encounters && res.encounters.length > 0) {
        setSelectedEncounterId(res.encounters[0].encounter_id);
      } else {
        setSelectedEncounterId(null);
      }
    } catch (err: unknown) {
      const e = err as { status?: number; detail?: string };
      setActivePatient(null);
      setSelectedEncounterId(null);
      if (e?.status === 404 || e?.status === 403) {
        setSearchError("No authorized patient record found for this UID.");
      } else {
        setSearchError("Unable to load patient records. Please try again.");
      }
    } finally {
      setIsSearching(false);
    }
  }

  function handleClear() {
    setSearchUid("");
    setActivePatient(null);
    setSelectedEncounterId(null);
    setSearchError(null);
  }

  // Fetch encounter-specific summary when an encounter is selected (progressive disclosure)
  const {
    data: summary,
    isLoading: sumLoading,
    error: sumError,
  } = useQuery<SummaryDetailResponse>({
    queryKey: ["doctor", "summary", selectedEncounterId],
    queryFn: () =>
      selectedEncounterId ? getSummary(selectedEncounterId) : Promise.reject("No ID"),
    enabled: !!selectedEncounterId,
    staleTime: 30_000,
  });

  // Fetch encounter-specific timeline
  const { data: timeline, isLoading: timeLoading } = useQuery<TimelineEventResponse[]>({
    queryKey: ["doctor", "timeline", selectedEncounterId],
    queryFn: () =>
      selectedEncounterId ? getTimeline(selectedEncounterId) : Promise.reject("No ID"),
    enabled: !!selectedEncounterId,
    staleTime: 30_000,
  });

  // Categorize clinical findings strictly according to physician review hierarchy
  const entities = summary?.entities ?? [];
  const acceptedFindings = entities.filter((e) => e.verification_status === "accepted");
  const editedFindings = entities.filter((e) => e.verification_status === "edited");
  const rejectedFindings = entities.filter((e) => e.verification_status === "rejected");
  const unreviewedFindings = entities.filter((e) => e.verification_status === "unreviewed");
  const reviewedTotal = acceptedFindings.length + editedFindings.length + rejectedFindings.length;

  const documents = summary?.documents ?? [];

  // Filter findings based on active findings tab
  const displayedFindings = entities.filter((e) => {
    if (findingsTab === "reviewed") return e.verification_status !== "unreviewed";
    if (findingsTab === "pending") return e.verification_status === "unreviewed";
    return true;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* ── 1. Page Header ── */}
      <div className="border-b border-[var(--ink-200)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center text-[var(--clinical)] shrink-0">
              <FolderHeart className="w-4 h-4" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              Patient Records
            </h1>
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-1">
            Longitudinal patient history and verified clinical information • Review authorized patient information across encounters, documents, and verified findings.
          </p>
        </div>
      </div>

      {/* ── 2. Patient Discovery: Find by UID ── */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 shadow-xs space-y-3.5">
        <div>
          <label className="text-xs font-bold text-[var(--ink-900)] flex items-center gap-1.5 uppercase tracking-wider">
            <Search className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
            Find by UID
          </label>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Search patient records by unique patient identifier. In accordance with clinical governance, access is restricted to patients assigned to your care.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="flex-1 relative">
            <Input
              value={searchUid}
              onChange={(e) => setSearchUid(e.target.value)}
              placeholder="Enter exact Patient UID (e.g. 752d024e-55ce-40df-9edc-f710c6ec501e)"
              className="pr-12 text-xs font-mono"
            />
            {searchUid && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-400)] hover:text-[var(--ink-800)] cursor-pointer"
                title="Clear UID input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            isLoading={isSearching}
            className="text-xs font-semibold px-5 cursor-pointer shrink-0"
          >
            Find Patient Record
          </Button>
        </form>

        {/* Quick-Select Chips from Doctor's Assigned Queue */}
        {queueData && queueData.items.length > 0 && (
          <div className="pt-2 border-t border-[var(--ink-200)] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-[var(--ink-500)]">
              Quick select assigned:
            </span>
            {queueData.items.slice(0, 5).map((item) => (
              <button
                key={item.encounter_id}
                type="button"
                onClick={() => {
                  setSearchUid(item.patient_id);
                  handleSearch(item.patient_id);
                }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  activePatient?.patient_id === item.patient_id
                    ? "bg-[var(--clinical-light)] text-[var(--clinical)] border-[var(--clinical-mid)] font-bold"
                    : "bg-[var(--bg-surface-2)] text-[var(--ink-700)] border-[var(--ink-200)] hover:border-[var(--clinical)]"
                }`}
                title={`UID: ${item.patient_id}`}
              >
                {item.patient_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Error State (404 / 403 / Network Error) ── */}
      {searchError && (
        <div className="p-4 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-xs text-[var(--status-pending-fg)] flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-xs">{searchError}</p>
            <p className="text-[11px] mt-0.5 text-[var(--ink-600)]">
              The requested identifier is either invalid or you do not have clinical authorization to access this record under hospital policy.
            </p>
          </div>
        </div>
      )}

      {/* ── 4. Initial Empty State (No Patient Selected Yet) ── */}
      {!activePatient && !searchError && !isSearching && (
        <div className="py-20 text-center space-y-3 border border-dashed border-[var(--ink-300)] rounded-lg bg-[var(--bg-surface)] p-6">
          <FolderHeart className="w-12 h-12 mx-auto text-[var(--ink-300)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--ink-800)]">
            Find a patient by UID to view their records.
          </p>
          <p className="text-xs text-[var(--ink-500)] max-w-md mx-auto">
            Enter an authorized Patient UID above or select a patient from your assigned clinical queue to review longitudinal history, previous encounters, and verified clinical findings.
          </p>
        </div>
      )}

      {/* ── 5. Patient Longitudinal Record Workspace ── */}
      {activePatient && (
        <div className="space-y-6">
          {/* Patient Overview Banner */}
          <div className="border border-[var(--clinical-mid)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
            <div className="h-1 bg-[var(--clinical)]" />

            <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)]">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center text-[var(--clinical)] shrink-0">
                  <User className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-[var(--ink-900)] leading-none truncate">
                      {activePatient.patient_name}
                    </h2>
                    <span className="text-xs font-semibold text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Authorized Record
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-500)] font-mono mt-1 truncate">
                    Patient UID: {activePatient.patient_id}
                  </p>
                </div>
              </div>

              {selectedEncounterId && (
                <Button
                  size="sm"
                  onClick={() => router.push(`/doctor/patients/${selectedEncounterId}`)}
                  className="flex items-center gap-1.5 text-xs font-semibold self-start md:self-auto shrink-0"
                >
                  Open Clinical Workspace <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {/* Demographics Strip */}
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                  Date of Birth
                </span>
                <span className="font-semibold text-[var(--ink-900)] mt-0.5 block">
                  {activePatient.date_of_birth ?? "Not recorded"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                  Gender
                </span>
                <span className="font-semibold text-[var(--ink-900)] capitalize mt-0.5 block">
                  {activePatient.gender ?? "Not recorded"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                  Preferred Language
                </span>
                <span className="font-semibold text-[var(--ink-900)] uppercase mt-0.5 block">
                  {activePatient.preferred_language || "English"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--ink-400)] block">
                  Encounters On Record
                </span>
                <span className="font-semibold text-[var(--clinical)] mt-0.5 block">
                  {activePatient.encounters.length} consultation{activePatient.encounters.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* ── 6. Encounter History (Timeline of Authorized Consultations) ── */}
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                  Encounter History ({activePatient.encounters.length})
                </h3>
                <p className="text-[11px] text-[var(--ink-500)] mt-0.5">
                  Select an encounter below to inspect its longitudinal clinical summary, documents, and verified findings.
                </p>
              </div>
            </div>

            {activePatient.encounters.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--ink-500)]">
                No encounters recorded.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {activePatient.encounters.map((enc: EncounterSummary) => {
                  const isSelected = enc.encounter_id === selectedEncounterId;

                  return (
                    <div
                      key={enc.encounter_id}
                      onClick={() => setSelectedEncounterId(enc.encounter_id)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer border-l-3 ${
                        isSelected
                          ? "bg-[var(--clinical-light)]/30 border-[var(--clinical)]"
                          : "bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-2)] border-transparent"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold font-mono text-[var(--ink-900)]">
                            Encounter #{enc.encounter_id.slice(0, 8)}
                          </span>
                          <StatusBadge status={enc.queue_status} />
                          {isSelected && (
                            <span className="text-[10px] bg-[var(--clinical)] text-white px-1.5 py-0.2 rounded font-semibold">
                              Inspecting
                            </span>
                          )}
                          {enc.unreviewed_count > 0 && (
                            <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded px-1.5 py-0.2 font-semibold">
                              {enc.unreviewed_count} unreviewed
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3.5 text-xs text-[var(--ink-500)] flex-wrap">
                          {enc.opd_department && (
                            <span className="flex items-center gap-1 text-[var(--ink-700)]">
                              <Building2 className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                              {enc.opd_department}
                            </span>
                          )}

                          {enc.submitted_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                              {new Date(enc.submitted_at).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-[var(--entity-ai-fg)]" aria-hidden="true" />
                            {enc.total_entities} extracted findings
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <Button
                          size="xs"
                          variant={isSelected ? "secondary" : "ghost"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEncounterId(enc.encounter_id);
                          }}
                          className="text-xs font-medium"
                        >
                          {isSelected ? "Active Record" : "View Record"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 7. Progressive Disclosure: Encounter Longitudinal Deep Dive ── */}
          {selectedEncounterId && (
            <div className="space-y-6 pt-2">
              {sumLoading ? (
                <div className="p-12 text-center text-xs text-[var(--ink-500)] border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4" />
                  <span>Loading encounter records and verified clinical findings…</span>
                </div>
              ) : sumError || !summary ? (
                <div className="p-4 rounded-lg border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)]">
                  Unable to load clinical findings for encounter #{selectedEncounterId.slice(0, 8)}.
                </div>
              ) : (
                <>
                  {/* Encounter Status & Governance Ribbon */}
                  <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--ink-900)]">
                          Encounter #{summary.encounter_id.slice(0, 8)} Longitudinal Record
                        </span>
                        <span className="text-xs text-[var(--ink-500)]">• {summary.opd_department || "General OPD"}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--ink-500)] flex-wrap">
                        <span className="text-[var(--status-success-fg)] font-semibold">
                          {acceptedFindings.length} Accepted
                        </span>
                        <span>·</span>
                        <span className="text-[var(--status-info-fg)] font-semibold">
                          {editedFindings.length} Edited
                        </span>
                        <span>·</span>
                        <span className="text-[var(--status-error-fg)] font-semibold">
                          {rejectedFindings.length} Rejected
                        </span>
                        <span>·</span>
                        <span className="text-[var(--status-pending-fg)] font-semibold">
                          {unreviewedFindings.length} Pending Review
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => router.push(`/doctor/patients/${summary.encounter_id}`)}
                      className="text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                    >
                      Open Clinical Workspace <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Clinical Summary Card */}
                  <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                      AI Intake Summary
                    </h3>

                    {summary.summary_text ? (
                      <div className="p-3.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--ink-200)] text-xs leading-relaxed text-[var(--ink-800)] font-sans whitespace-pre-line">
                        {summary.summary_text}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--ink-500)] italic">
                        Intake summary not recorded for this encounter.
                      </p>
                    )}

                    {/* Evidence Provenance & Workflow / Safety Flags */}
                    <div className="pt-2 border-t border-[var(--ink-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <EvidenceProvenanceSummary entities={entities} />
                      <SafetyAttentionFlags
                        unreviewedCount={unreviewedFindings.length}
                        entities={entities}
                        hasSummary={!!summary.summary_text}
                      />
                    </div>
                  </div>

                  {/* ── 8. Clinical Findings Hierarchy (Reviewed vs Pending Verification) ── */}
                  <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
                    {/* Findings Header with Filter Tabs */}
                    <div className="px-5 py-3 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[var(--entity-ai-fg)]" aria-hidden="true" />
                          Clinical Findings ({entities.length})
                        </h3>
                        <p className="text-[11px] text-[var(--ink-500)] mt-0.5">
                          Physician-reviewed clinical facts strictly separated from pending AI extractions.
                        </p>
                      </div>

                      {/* Tab Filter */}
                      <div className="flex items-center gap-1 bg-[var(--ink-100)] p-0.5 rounded-md text-xs">
                        <button
                          type="button"
                          onClick={() => setFindingsTab("all")}
                          className={`px-2 py-1 rounded font-semibold transition-colors cursor-pointer ${
                            findingsTab === "all"
                              ? "bg-white text-[var(--ink-900)] shadow-xs"
                              : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                          }`}
                        >
                          All ({entities.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFindingsTab("reviewed")}
                          className={`px-2 py-1 rounded font-semibold transition-colors cursor-pointer ${
                            findingsTab === "reviewed"
                              ? "bg-white text-[var(--ink-900)] shadow-xs"
                              : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                          }`}
                        >
                          Reviewed ({reviewedTotal})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFindingsTab("pending")}
                          className={`px-2 py-1 rounded font-semibold transition-colors cursor-pointer ${
                            findingsTab === "pending"
                              ? "bg-white text-[var(--ink-900)] shadow-xs"
                              : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                          }`}
                        >
                          Pending ({unreviewedFindings.length})
                        </button>
                      </div>
                    </div>

                    {displayedFindings.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--ink-500)]">
                        {findingsTab === "reviewed"
                          ? "No reviewed findings recorded."
                          : findingsTab === "pending"
                          ? "No pending unreviewed findings."
                          : "No clinical findings recorded."}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--ink-200)]">
                        {displayedFindings.map((ent: EntityDetail) => {
                          const isAccepted = ent.verification_status === "accepted";
                          const isEdited = ent.verification_status === "edited";
                          const isRejected = ent.verification_status === "rejected";
                          const isUnreviewed = ent.verification_status === "unreviewed";

                          return (
                            <div
                              key={ent.id}
                              className={`p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                isAccepted
                                  ? "bg-emerald-50/40"
                                  : isEdited
                                  ? "bg-blue-50/40"
                                  : isRejected
                                  ? "bg-red-50/30 opacity-75"
                                  : "bg-[var(--bg-surface)]"
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-[10px] text-[var(--ink-500)] uppercase tracking-wider">
                                    {ent.field_name.replace(/_/g, " ")}:
                                  </span>
                                  <span
                                    className={`font-semibold ${
                                      isRejected
                                        ? "line-through text-[var(--ink-500)]"
                                        : "text-[var(--ink-900)]"
                                    }`}
                                  >
                                    {ent.value}
                                  </span>
                                </div>

                                {isEdited && ent.original_ai_value && (
                                  <div className="text-[11px] text-[var(--ink-600)] flex items-center gap-1 font-mono">
                                    <span>Original AI:</span>
                                    <span className="line-through">{ent.original_ai_value}</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2 text-[10px] text-[var(--ink-500)] mt-0.5">
                                  <span>
                                    Confidence: {Math.round(ent.confidence * 100)}%
                                  </span>
                                  <span>•</span>
                                  <span>
                                    Source:{" "}
                                    {ent.source_document_name ? (
                                      <span className="text-teal-700 font-medium">
                                        Doc: {ent.source_document_name}
                                      </span>
                                    ) : (
                                      <span className="capitalize">{ent.source_type}</span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0 self-start sm:self-auto">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                    isAccepted
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : isEdited
                                      ? "bg-blue-50 text-blue-800 border-blue-300"
                                      : isRejected
                                      ? "bg-red-50 text-red-800 border-red-300"
                                      : "bg-amber-50 text-amber-800 border-amber-300"
                                  }`}
                                >
                                  {isAccepted && "Accepted"}
                                  {isEdited && "Edited by Doctor"}
                                  {isRejected && "Rejected / Excluded"}
                                  {isUnreviewed && "Pending Verification"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── 9. Documents on Record ── */}
                  <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                      Documents on Record ({documents.length})
                    </h3>

                    {documents.length === 0 ? (
                      <p className="text-xs text-[var(--ink-500)] italic">
                        No documents recorded.
                      </p>
                    ) : (
                      <div className="border border-[var(--ink-200)] rounded-md divide-y divide-[var(--ink-200)]">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="p-3 text-xs flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                              <div className="truncate">
                                <p className="font-semibold text-[var(--ink-900)] truncate">
                                  {doc.original_filename || "Document"}
                                </p>
                                <p className="text-[10px] text-[var(--ink-500)] uppercase font-mono">
                                  {doc.document_type.replace(/_/g, " ")} •{" "}
                                  {new Date(doc.upload_timestamp).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                                doc.processing_status === "processed"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : doc.processing_status === "failed"
                                  ? "bg-red-50 text-red-800 border-red-300"
                                  : "bg-blue-50 text-blue-800 border-blue-300"
                              }`}
                            >
                              {doc.processing_status || "available"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── 10. Clinical Timeline Events ── */}
                  <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
                      Clinical Timeline Events
                    </h3>

                    {timeLoading ? (
                      <div className="py-4 text-xs text-[var(--ink-500)] flex items-center gap-2">
                        <Spinner className="w-3.5 h-3.5" /> Loading timeline events…
                      </div>
                    ) : !timeline || timeline.length === 0 ? (
                      <p className="text-xs text-[var(--ink-500)] italic">
                        No timeline events recorded.
                      </p>
                    ) : (
                      <div className="space-y-2 border-l-2 border-[var(--ink-200)] ml-2 pl-3">
                        {timeline.map((ev) => (
                          <div key={ev.id} className="relative text-xs">
                            <span className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-[var(--clinical)]" />
                            <p className="font-semibold text-[var(--ink-900)] capitalize">
                              {ev.event_type.replace(/_/g, " ")}
                            </p>
                            <p className="text-[10px] text-[var(--ink-500)]">
                              {ev.date
                                ? new Date(ev.date).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : new Date(ev.created_at).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                              {ev.date_uncertain && " (approximate date)"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DoctorRecordsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-xs text-[var(--ink-500)]">Loading Patient Records…</div>}>
      <RecordsContent />
    </Suspense>
  );
}
