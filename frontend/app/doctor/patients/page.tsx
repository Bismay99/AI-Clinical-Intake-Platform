"use client";
import React, { useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  searchPatientByUid,
  getQueue,
  getAvailableEncounters,
  assignEncounter,
} from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { PriorityBadge } from "@/components/doctor/PriorityBadge";
import { IntakeCompletenessBadge } from "@/components/doctor/IntakeCompletenessBadge";
import { PatientQuickView } from "@/components/doctor/PatientQuickView";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { QueueListSkeleton } from "@/components/doctor/DoctorSkeletons";
import {
  calculateAttentionPriority,
  formatWaitingTime,
} from "@/lib/doctorUtils";
import {
  Search,
  UserCheck,
  Building2,
  Clock,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Filter,
  User,
  Sparkles,
  Eye,
  ArrowUpDown,
} from "lucide-react";
import type { PatientSearchResult, QueueItem, AvailableEncounterItem } from "@/types/doctor";

type SortOption = "priority" | "waiting" | "newest" | "updated";

function sortPatientItems<T extends {
  created_at?: string;
  updated_at?: string;
  unreviewed_count?: number;
  total_entities?: number;
  encounter_status?: string;
  queue_status?: string;
}>(items: T[], sortBy: SortOption): T[] {
  return [...items].sort((a, b) => {
    if (sortBy === "priority") {
      const priorityRank: Record<string, number> = {
        CRITICAL: 4,
        HIGH: 3,
        NORMAL: 2,
        LOW: 1,
      };
      const pA = calculateAttentionPriority(a).level;
      const pB = calculateAttentionPriority(b).level;
      const diff = (priorityRank[pB] || 0) - (priorityRank[pA] || 0);
      if (diff !== 0) return diff;
    }
    if (sortBy === "waiting") {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    }
    if (sortBy === "newest") {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    }
    if (sortBy === "updated") {
      const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return timeB - timeA;
    }
    return 0;
  });
}

function PatientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const initialTab = (searchParams.get("tab") as "mine" | "available" | "search") || "mine";
  const [activeTab, setActiveTab] = useState<"mine" | "available" | "search">(initialTab);

  // Filters & Sorting
  const [filterText, setFilterText] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("priority");

  // State for Quick View
  const [quickViewItem, setQuickViewItem] = useState<{
    encounter_id: string;
    patient_id?: string | null;
    patient_name: string;
    encounter_status?: string;
    opd_department?: string | null;
    created_at?: string;
    updated_at?: string;
    unreviewed_count?: number;
    total_entities?: number;
  } | null>(null);

  // Search by UID state
  const [searchUid, setSearchUid] = useState("");
  const [searchResult, setSearchResult] = useState<PatientSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 1. My Assigned Encounters
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
  });

  // 2. Available Unassigned Pool
  const { data: available, isLoading: availLoading } = useQuery({
    queryKey: ["doctor", "available"],
    queryFn: getAvailableEncounters,
  });

  // Assign mutation
  const assignMut = useMutation({
    mutationFn: assignEncounter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
  });

  // Extract unique departments for filtering
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    queue?.items.forEach((i) => {
      if (i.opd_department) depts.add(i.opd_department);
    });
    available?.forEach((i) => {
      if (i.opd_department) depts.add(i.opd_department);
    });
    return Array.from(depts);
  }, [queue, available]);

  // Filtered and sorted assigned items
  const filteredAssigned = useMemo(() => {
    let items = queue?.items || [];
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.patient_name.toLowerCase().includes(q) ||
          i.patient_id.toLowerCase().includes(q) ||
          i.encounter_id.toLowerCase().includes(q)
      );
    }
    if (filterDept !== "all") {
      items = items.filter((i) => i.opd_department === filterDept);
    }
    if (filterStatus !== "all") {
      items = items.filter((i) => i.encounter_status === filterStatus);
    }
    return sortPatientItems(items, sortBy);
  }, [queue, filterText, filterDept, filterStatus, sortBy]);

  // Filtered and sorted available pool items
  const filteredAvailable = useMemo(() => {
    let items = available || [];
    if (filterText.trim()) {
      const q = filterText.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.patient_name.toLowerCase().includes(q) ||
          i.encounter_id.toLowerCase().includes(q)
      );
    }
    if (filterDept !== "all") {
      items = items.filter((i) => i.opd_department === filterDept);
    }
    return sortPatientItems(items, sortBy);
  }, [available, filterText, filterDept, sortBy]);

  // Search by UID handler
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
      if (e?.status === 404 || e?.status === 403) {
        setSearchError(
          "Patient not found or you are not authorized to access this record."
        );
      } else {
        setSearchError(
          e?.detail || "Search failed. Please verify the UID and try again."
        );
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
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <div className="border-b border-[var(--ink-200)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
            Clinical Queue &amp; Patient Discovery
          </h1>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Central clinical registry: search authorized patients, manage active assignments, or claim encounters from the hospital pool.
          </p>
        </div>
      </div>

      {/* ── Main Tab Bar ── */}
      <div className="flex border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-2 pt-1.5 gap-1 overflow-x-auto">
        {[
          {
            id: "mine",
            label: "Assigned Patients",
            Icon: UserCheck,
            count: queue?.total ?? 0,
          },
          {
            id: "available",
            label: "Available Pool",
            Icon: Building2,
            count: available?.length ?? 0,
          },
          {
            id: "search",
            label: "Find by UID",
            Icon: Search,
            count: null,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "mine" | "available" | "search")}
              className={`pb-2.5 pt-2 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 rounded-t-md ${
                isActive
                  ? "border-[var(--clinical)] text-[var(--clinical)] bg-[var(--bg-surface)] font-bold shadow-xs"
                  : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <tab.Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-[var(--clinical)] text-white"
                      : "bg-[var(--ink-200)] text-[var(--ink-700)]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: Assigned Patients (Active Clinical Registry) ── */}
      {activeTab === "mine" && (
        <div className="space-y-4">
          {/* Filter Bar with Sort Dropdown */}
          <div className="p-3 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-[var(--ink-400)] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                placeholder="Filter by patient name, UID, or encounter ID..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-[var(--ink-200)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--clinical)] bg-[var(--bg-surface)]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1 text-[var(--ink-500)]">
                <Filter className="w-3 h-3" aria-hidden="true" />
                <span>Dept:</span>
              </div>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="text-xs border border-[var(--ink-200)] rounded-md px-2 py-1 bg-[var(--bg-surface)] text-[var(--ink-800)] focus:outline-none cursor-pointer"
              >
                <option value="all">All Departments</option>
                {allDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs border border-[var(--ink-200)] rounded-md px-2 py-1 bg-[var(--bg-surface)] text-[var(--ink-800)] focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="ready_for_review">Ready for Review</option>
                <option value="submitted">Submitted</option>
                <option value="completed">Completed</option>
              </select>

              <div className="flex items-center gap-1 pl-2 border-l border-[var(--ink-200)]">
                <ArrowUpDown className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="text-xs border border-[var(--ink-200)] rounded-md px-2 py-1 bg-[var(--bg-surface)] text-[var(--ink-800)] focus:outline-none cursor-pointer font-medium"
                >
                  <option value="priority">Priority First</option>
                  <option value="waiting">Waiting Longest</option>
                  <option value="newest">Newest First</option>
                  <option value="updated">Recently Updated</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table / List Workspace */}
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between text-xs text-[var(--ink-600)]">
              <span className="font-semibold">
                Showing {filteredAssigned.length} of {queue?.items.length ?? 0} assigned encounters
              </span>
              {(filterText || filterDept !== "all" || filterStatus !== "all") && (
                <button
                  onClick={() => {
                    setFilterText("");
                    setFilterDept("all");
                    setFilterStatus("all");
                  }}
                  className="text-[var(--clinical)] hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>

            {queueLoading ? (
              <QueueListSkeleton rows={5} />
            ) : filteredAssigned.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--ink-500)] space-y-1">
                <p className="font-semibold text-sm text-[var(--ink-800)]">No assigned encounters match criteria</p>
                <p>Try clearing your filters or browse the Available Pool.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {filteredAssigned.map((item: QueueItem) => {
                  const total = item.total_entities ?? 0;
                  const unreviewed = item.unreviewed_count ?? 0;
                  const verified = Math.max(0, total - unreviewed);
                  const operationalPriority = calculateAttentionPriority(item);
                  const waitingStr = formatWaitingTime(item.created_at);

                  return (
                    <div
                      key={item.encounter_id}
                      className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[var(--ink-900)]">
                            {item.patient_name}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--ink-500)] bg-[var(--ink-100)] px-1.5 py-0.5 rounded">
                            UID: {item.patient_id.slice(0, 8)}…
                          </span>
                          <StatusBadge status={item.encounter_status} />
                          <PriorityBadge
                            level={operationalPriority.level}
                            reason={operationalPriority.reason}
                          />
                          {unreviewed > 0 && (
                            <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded px-1.5 py-0.5 font-semibold">
                              {unreviewed} awaiting review
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3.5 mt-2 flex-wrap text-xs text-[var(--ink-500)]">
                          <span className="font-mono">Encounter #{item.encounter_id.slice(0, 8)}</span>
                          {item.opd_department && (
                            <span className="flex items-center gap-1 text-[var(--ink-700)]">
                              <Building2 className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                              {item.opd_department}
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-600)] bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            <Clock className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                            {waitingStr}
                          </span>

                          {total > 0 && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="inline-flex items-center gap-1 text-[var(--ink-700)] font-medium">
                                <Sparkles className="w-3 h-3 text-[var(--entity-ai-fg)]" aria-hidden="true" />
                                {total} findings
                              </span>
                              <span>•</span>
                              <span className="text-[var(--status-success-fg)] font-medium">
                                {verified} verified
                              </span>
                            </div>
                          )}

                          <IntakeCompletenessBadge
                            hasSummary={item.has_summary}
                            totalEntities={total}
                            documentsCount={0}
                            showCategories={false}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setQuickViewItem({
                              encounter_id: item.encounter_id,
                              patient_id: item.patient_id,
                              patient_name: item.patient_name,
                              encounter_status: item.encounter_status,
                              opd_department: item.opd_department,
                              created_at: item.created_at,
                              updated_at: item.updated_at,
                              unreviewed_count: item.unreviewed_count,
                              total_entities: item.total_entities,
                            })
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-700)] hover:bg-[var(--ink-100)]"
                        >
                          <Eye className="w-3.5 h-3.5" /> Quick View
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                          className="flex items-center gap-1.5 text-xs font-semibold"
                        >
                          Review Patient <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: Available Pool (Unassigned Hospital Cases) ── */}
      {activeTab === "available" && (
        <div className="space-y-4">
          {/* Filter Bar with Sort */}
          <div className="p-3 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-[var(--ink-400)] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search unassigned pool by patient name or encounter ID..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-[var(--ink-200)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--clinical)] bg-[var(--bg-surface)]"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--ink-500)]">Department:</span>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="text-xs border border-[var(--ink-200)] rounded-md px-2 py-1 bg-[var(--bg-surface)] text-[var(--ink-800)] focus:outline-none cursor-pointer"
              >
                <option value="all">All Departments</option>
                {allDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 pl-2 border-l border-[var(--ink-200)]">
                <ArrowUpDown className="w-3 h-3 text-[var(--ink-400)]" aria-hidden="true" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="text-xs border border-[var(--ink-200)] rounded-md px-2 py-1 bg-[var(--bg-surface)] text-[var(--ink-800)] focus:outline-none cursor-pointer font-medium"
                >
                  <option value="priority">Priority First</option>
                  <option value="waiting">Waiting Longest</option>
                  <option value="newest">Newest First</option>
                  <option value="updated">Recently Updated</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table / List Workspace */}
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-center justify-between text-xs text-[var(--ink-600)]">
              <span className="font-semibold">
                {filteredAvailable.length} unassigned encounter{filteredAvailable.length !== 1 ? "s" : ""} ready for doctor claim
              </span>
            </div>

            {availLoading ? (
              <QueueListSkeleton rows={4} />
            ) : filteredAvailable.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--ink-500)] space-y-1">
                <p className="font-semibold text-sm text-[var(--ink-800)]">No unassigned encounters in the pool</p>
                <p>All submitted clinical intake sessions have been assigned to clinicians.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {filteredAvailable.map((item: AvailableEncounterItem) => {
                  const operationalPriority = calculateAttentionPriority(item);
                  const waitingStr = formatWaitingTime(item.created_at);

                  return (
                    <div
                      key={item.encounter_id}
                      className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-bold text-[var(--ink-900)]">
                            {item.patient_name}
                          </span>
                          <StatusBadge status={item.queue_status} />
                          <PriorityBadge
                            level={operationalPriority.level}
                            reason={operationalPriority.reason}
                          />
                        </div>
                        <div className="flex items-center gap-3.5 mt-2 flex-wrap text-xs text-[var(--ink-500)]">
                          <span className="font-mono">Encounter #{item.encounter_id.slice(0, 8)}</span>
                          {item.opd_department && (
                            <span className="flex items-center gap-1 text-[var(--ink-700)]">
                              <Building2 className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                              {item.opd_department}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-600)] bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            <Clock className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                            {waitingStr}
                          </span>
                          <span>{item.total_entities} extracted entities</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setQuickViewItem({
                              encounter_id: item.encounter_id,
                              patient_name: item.patient_name,
                              encounter_status: item.queue_status,
                              opd_department: item.opd_department,
                              created_at: item.created_at,
                              updated_at: item.updated_at,
                              total_entities: item.total_entities,
                            })
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-700)] hover:bg-[var(--ink-100)]"
                        >
                          <Eye className="w-3.5 h-3.5" /> Quick View
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          isLoading={assignMut.isPending}
                          onClick={() => handleClaimAndReview(item.encounter_id)}
                          className="text-xs font-semibold flex items-center gap-1.5"
                        >
                          Claim &amp; Review <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: Authorized Patient Search by UID ── */}
      {activeTab === "search" && (
        <div className="space-y-4">
          <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink-900)] flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--clinical)]" aria-hidden="true" />
                Authorized Patient Search
              </h3>
              <p className="text-xs text-[var(--ink-500)] mt-0.5">
                Search patients by their unique hospital identifier (Patient UID). Access is strictly restricted to assigned records.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1 relative">
                <Input
                  value={searchUid}
                  onChange={(e) => setSearchUid(e.target.value)}
                  placeholder="Enter exact Patient UID (e.g. 752d024e-55ce-40df-9edc-f710c6ec501e)"
                  className="pr-12 text-sm font-mono"
                />
                {searchUid && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchUid("");
                      setSearchResult(null);
                      setSearchError(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-400)] hover:text-[var(--ink-800)] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Button
                type="submit"
                isLoading={isSearching}
                className="text-xs font-semibold px-5 cursor-pointer shrink-0"
              >
                Search Patient
              </Button>
            </form>
          </div>

          {/* Search Error State */}
          {searchError && (
            <div className="p-4 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-sm text-[var(--status-pending-fg)] flex items-start gap-2.5 shadow-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[var(--status-pending-fg)]" aria-hidden="true" />
              <div>
                <p className="font-semibold text-xs">Search Restricted or Record Not Found</p>
                <p className="text-xs mt-0.5">{searchError}</p>
              </div>
            </div>
          )}

          {/* Search Result Card */}
          {searchResult && (
            <div className="border border-[var(--clinical-mid)] rounded-lg bg-[var(--bg-surface)] shadow-xs overflow-hidden">
              <div className="bg-[var(--clinical-light)]/40 border-b border-[var(--clinical-mid)] px-5 py-3.5 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[var(--clinical)]" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink-900)]">
                      {searchResult.patient_name}
                    </h2>
                    <p className="text-xs text-[var(--ink-500)] font-mono">
                      UID: {searchResult.patient_id}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-semibold text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-2.5 py-1 rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Authorized Clinical Record
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Demographics Strip */}
                <div className="grid grid-cols-3 gap-3 text-xs bg-[var(--bg-surface-2)] p-3 rounded-md border border-[var(--ink-200)]">
                  <div>
                    <span className="text-[var(--ink-500)] font-medium block">Date of Birth</span>
                    <span className="font-semibold text-[var(--ink-900)]">
                      {searchResult.date_of_birth ?? "Not recorded"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-500)] font-medium block">Gender</span>
                    <span className="font-semibold text-[var(--ink-900)] capitalize">
                      {searchResult.gender ?? "Not recorded"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-500)] font-medium block">Preferred Language</span>
                    <span className="font-semibold text-[var(--ink-900)] uppercase">
                      {searchResult.preferred_language || "English"}
                    </span>
                  </div>
                </div>

                {/* Encounters List */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-500)] mb-2">
                    Authorized Encounters ({searchResult.encounters.length})
                  </h4>
                  <div className="border border-[var(--ink-200)] rounded-md divide-y divide-[var(--ink-200)] overflow-hidden">
                    {searchResult.encounters.map((enc) => (
                      <div
                        key={enc.encounter_id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-2)] transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold font-mono text-[var(--ink-900)]">
                              #{enc.encounter_id.slice(0, 8)}
                            </span>
                            <StatusBadge status={enc.queue_status} />
                            {enc.unreviewed_count > 0 && (
                              <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded px-1.5 py-0.5 font-semibold">
                                {enc.unreviewed_count} unreviewed
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[var(--ink-500)]">
                            {enc.opd_department && <span>{enc.opd_department}</span>}
                            {enc.submitted_at && (
                              <span>
                                {new Date(enc.submitted_at).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            )}
                            <span>{enc.total_entities} extracted entities</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setQuickViewItem({
                                encounter_id: enc.encounter_id,
                                patient_id: searchResult.patient_id,
                                patient_name: searchResult.patient_name,
                                encounter_status: enc.queue_status,
                                opd_department: enc.opd_department,
                                created_at: enc.submitted_at || undefined,
                                unreviewed_count: enc.unreviewed_count,
                                total_entities: enc.total_entities,
                              })
                            }
                            className="text-xs font-semibold text-[var(--ink-700)]"
                          >
                            <Eye className="w-3.5 h-3.5" /> Quick View
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => router.push(`/doctor/patients/${enc.encounter_id}`)}
                            className="text-xs font-semibold flex items-center gap-1.5 shrink-0"
                          >
                            Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reusable Patient Quick View Drawer ── */}
      <PatientQuickView
        isOpen={!!quickViewItem}
        onClose={() => setQuickViewItem(null)}
        encounterId={quickViewItem?.encounter_id ?? null}
        patientName={quickViewItem?.patient_name ?? ""}
        patientId={quickViewItem?.patient_id}
        opdDepartment={quickViewItem?.opd_department}
        status={quickViewItem?.encounter_status}
        createdAt={quickViewItem?.created_at}
        updatedAt={quickViewItem?.updated_at}
        unreviewedCount={quickViewItem?.unreviewed_count}
        totalEntities={quickViewItem?.total_entities}
      />
    </div>
  );
}

export default function DoctorPatientsPage() {
  return (
    <Suspense fallback={<div className="py-12"><QueueListSkeleton rows={4} /></div>}>
      <PatientsContent />
    </Suspense>
  );
}
