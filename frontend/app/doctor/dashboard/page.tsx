"use client";
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getQueue,
  getDashboardStats,
  getRecommended,
  getAvailableEncounters,
  assignEncounter,
} from "@/services/doctor.service";
import { useAuthStore } from "@/stores/auth.store";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { PriorityBadge } from "@/components/doctor/PriorityBadge";
import { IntakeCompletenessBadge } from "@/components/doctor/IntakeCompletenessBadge";
import { PatientQuickView } from "@/components/doctor/PatientQuickView";
import { Button } from "@/components/ui/Button";
import { StatStripSkeleton, QueueListSkeleton } from "@/components/doctor/DoctorSkeletons";
import {
  formatDoctorName,
  getDoctorGreeting,
  calculateAttentionPriority,
  formatWaitingTime,
  formatRelativeTime,
} from "@/lib/doctorUtils";
import {
  ClipboardList,
  Users,
  CheckCircle2,
  ArrowRight,
  Building2,
  Clock,
  AlertTriangle,
  Search,
  Plus,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Eye,
  ArrowUpDown,
  Activity,
} from "lucide-react";
import type { QueueItem } from "@/types/doctor";

type QueueTab = "assigned" | "needs_review" | "available" | "completed";
type SortOption = "priority" | "waiting" | "newest" | "updated";

function sortQueueItems<T extends {
  created_at?: string;
  updated_at?: string;
  unreviewed_count?: number;
  total_entities?: number;
  encounter_status?: string;
  queue_status?: string;
  reason?: string;
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
      return timeA - timeB; // Oldest waiting first
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

export default function DoctorDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<QueueTab>("assigned");
  const [sortBy, setSortBy] = useState<SortOption>("priority");

  // State for Patient Quick View Drawer
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

  // 1. Queue Data
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
  });

  // 2. Stats
  const { isLoading: statsLoading } = useQuery({
    queryKey: ["doctor", "stats"],
    queryFn: getDashboardStats,
  });

  // 3. Recommended / Suggested
  const { data: recommended, isLoading: recLoading } = useQuery({
    queryKey: ["doctor", "recommended"],
    queryFn: getRecommended,
  });

  // 4. Available unassigned pool
  const { data: available } = useQuery({
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

  const displayName = user?.full_name ?? user?.email?.split("@")[0] ?? "Doctor";
  const departmentName = user?.hospital_affiliation ?? null;

  // Authoritative subsets from queue
  const allAssigned = queue?.items ?? [];
  const needsReview = allAssigned.filter((i) => i.unreviewed_count > 0);
  const completed = allAssigned.filter((i) => i.encounter_status === "completed");

  const availableCount = available?.length ?? recommended?.length ?? 0;
  const attentionCount = needsReview.length;

  const TABS: { id: QueueTab; label: string; count?: number }[] = [
    { id: "assigned",     label: "Assigned to Me", count: allAssigned.length },
    { id: "needs_review", label: "Needs Review",   count: attentionCount },
    { id: "available",    label: "Suggested",      count: recommended?.length ?? 0 },
    { id: "completed",    label: "Completed",      count: completed.length },
  ];

  const sortedAssigned = useMemo(() => sortQueueItems(allAssigned, sortBy), [allAssigned, sortBy]);
  const sortedNeedsReview = useMemo(() => sortQueueItems(needsReview, sortBy), [needsReview, sortBy]);
  const sortedRecommended = useMemo(() => sortQueueItems(recommended ?? [], sortBy), [recommended, sortBy]);
  const sortedCompleted = useMemo(() => sortQueueItems(completed, sortBy), [completed, sortBy]);

  // Render dense clinical queue row with operational priority & waiting time
  function renderQueueRow(
    item: {
      encounter_id: string;
      patient_id?: string;
      patient_name: string;
      encounter_status?: string;
      queue_status?: string;
      unreviewed_count?: number;
      opd_department?: string | null;
      updated_at?: string;
      created_at?: string;
      total_entities?: number;
      has_summary?: boolean;
      reason?: string;
    },
    showClaimBtn = false
  ) {
    const status = item.encounter_status ?? item.queue_status ?? "";
    const totalEntities = item.total_entities ?? 0;
    const unreviewed = item.unreviewed_count ?? 0;
    const verified = Math.max(0, totalEntities - unreviewed);

    const operationalPriority = calculateAttentionPriority(item);
    const waitingStr = formatWaitingTime(item.created_at);

    return (
      <div
        key={item.encounter_id}
        className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors border-l-2 border-transparent hover:border-[var(--clinical)]"
      >
        {/* Left clinical block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-[var(--ink-900)]">
              {item.patient_name}
            </span>
            {item.patient_id && (
              <span
                className="font-mono text-[11px] text-[var(--ink-500)] bg-[var(--ink-100)] px-1.5 py-0.5 rounded"
                title={`Patient UID: ${item.patient_id}`}
              >
                UID: {item.patient_id.slice(0, 8)}…
              </span>
            )}
            <StatusBadge status={status} />
            <PriorityBadge level={operationalPriority.level} reason={operationalPriority.reason} />
            {item.reason && (
              <span className="text-[10px] bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)] rounded px-1.5 py-0.5 font-semibold">
                {item.reason}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3.5 mt-2 flex-wrap text-xs text-[var(--ink-500)]">
            <span className="font-mono text-[var(--ink-600)]">
              Encounter #{item.encounter_id.slice(0, 8)}
            </span>

            {item.opd_department && (
              <span className="flex items-center gap-1 text-[var(--ink-700)]">
                <Building2 className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                {item.opd_department}
              </span>
            )}

            {/* Waiting time badge */}
            <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-600)] bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
              <Clock className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
              {waitingStr}
            </span>

            {/* Verification State Breakdown */}
            {totalEntities > 0 && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 text-[var(--ink-700)] font-medium">
                  <Sparkles className="w-3 h-3 text-[var(--entity-ai-fg)]" aria-hidden="true" />
                  {totalEntities} findings
                </span>
                <span>•</span>
                <span className="text-[var(--status-success-fg)] font-medium">
                  {verified} verified
                </span>
                {unreviewed > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-[var(--status-pending-fg)] font-semibold">
                      {unreviewed} pending
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Intake Completeness Indicator */}
            <IntakeCompletenessBadge
              hasSummary={item.has_summary}
              totalEntities={totalEntities}
              documentsCount={0}
              showCategories={false}
            />
          </div>
        </div>

        {/* Right action button area */}
        <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setQuickViewItem({
                encounter_id: item.encounter_id,
                patient_id: item.patient_id,
                patient_name: item.patient_name,
                encounter_status: status,
                opd_department: item.opd_department,
                created_at: item.created_at,
                updated_at: item.updated_at,
                unreviewed_count: item.unreviewed_count,
                total_entities: item.total_entities,
              })
            }
            className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-700)] hover:bg-[var(--ink-100)]"
            title="Preview patient summary and findings"
          >
            <Eye className="w-3.5 h-3.5" /> Quick View
          </Button>

          {showClaimBtn ? (
            <Button
              size="sm"
              variant="secondary"
              isLoading={assignMut.isPending}
              onClick={async () => {
                await assignMut.mutateAsync(item.encounter_id);
                router.push(`/doctor/patients/${item.encounter_id}`);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Claim &amp; Open
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              Open Clinical Workspace <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 1. Page Header with Normalized Greeting ── */}
      <div className="border-b border-[var(--ink-200)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              {getDoctorGreeting(user?.full_name ?? displayName)}
            </h1>
            {departmentName && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)]">
                <Building2 className="w-3 h-3" aria-hidden="true" />
                {departmentName}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Clinical Command Center • Real-time patient triage, intake completeness, and physician verification
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/doctor/patients")}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Search className="w-3.5 h-3.5" /> Find Patient / Search UID
          </Button>
        </div>
      </div>

      {/* ── 2. Needs Attention Priority Section (Real Data Only) ── */}
      {!queueLoading && attentionCount > 0 && (
        <div className="rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 border-b border-[var(--status-pending-bd)] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[var(--status-pending-fg)]">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Needs Attention ({attentionCount} {attentionCount === 1 ? "case" : "cases"} awaiting review)
              </span>
            </div>
            <span className="text-[11px] text-[var(--ink-600)] font-medium">
              AI-extracted clinical findings requiring physician verification
            </span>
          </div>

          <div className="divide-y divide-[var(--status-pending-bd)]/60 max-h-60 overflow-y-auto">
            {sortedNeedsReview.slice(0, 5).map((item) => {
              const opPriority = calculateAttentionPriority(item);
              const waiting = formatWaitingTime(item.created_at);

              return (
                <div
                  key={item.encounter_id}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-amber-100/40 transition-colors flex-wrap sm:flex-nowrap"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <PriorityBadge level={opPriority.level} reason={opPriority.reason} />
                    <span className="font-semibold text-xs text-[var(--ink-900)] truncate">
                      {item.patient_name}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--ink-500)] hidden sm:inline">
                      #{item.encounter_id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-[var(--status-pending-fg)] font-semibold bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                      {item.unreviewed_count} unreviewed
                    </span>
                    <span className="text-[11px] text-[var(--ink-500)] hidden md:inline">
                      • {waiting}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
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
                      className="text-xs font-semibold text-[var(--ink-700)] hover:text-[var(--ink-900)] cursor-pointer"
                    >
                      Quick View
                    </button>
                    <button
                      onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                      className="text-xs font-semibold text-[var(--clinical)] hover:text-[var(--clinical-hover)] flex items-center gap-1 cursor-pointer ml-1"
                    >
                      Review findings <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Compact Horizontal Stat Strip ── */}
      {statsLoading ? (
        <StatStripSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--ink-200)] border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden">
          {[
            {
              label: "Assigned to Me",
              value: allAssigned.length,
              Icon: ClipboardList,
              fgCls: "text-[var(--clinical)]",
              sub: "Active clinical cases",
            },
            {
              label: "Needs Review",
              value: attentionCount,
              Icon: AlertTriangle,
              fgCls: attentionCount > 0 ? "text-[var(--status-pending-fg)]" : "text-[var(--ink-700)]",
              sub: "Pending entity verification",
            },
            {
              label: "Available Pool",
              value: availableCount,
              Icon: Users,
              fgCls: "text-[var(--status-info-fg)]",
              sub: "Ready for doctor claim",
            },
            {
              label: "Completed",
              value: completed.length,
              Icon: CheckCircle2,
              fgCls: "text-[var(--status-success-fg)]",
              sub: "Finalized consultations",
            },
          ].map(({ label, value, Icon, fgCls, sub }) => (
            <div key={label} className="py-3.5 px-5 flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-md bg-[var(--ink-100)] flex items-center justify-center shrink-0">
                <Icon className={`w-4 h-4 ${fgCls}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className={`text-2xl font-bold tracking-tight leading-none ${fgCls}`}>
                  {value}
                </p>
                <p className="text-[11px] font-semibold text-[var(--ink-900)] mt-1 truncate">
                  {label}
                </p>
                <p className="text-[10px] text-[var(--ink-400)] truncate">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Main Clinical Queue (Dominant Workstation Element) ── */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden">
        {/* Tab strip + Queue sorting controls */}
        <div className="flex border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-2 pt-1.5 gap-1 justify-between items-center overflow-x-auto">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2.5 pt-2 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 rounded-t-md ${
                    isActive
                      ? "border-[var(--clinical)] text-[var(--clinical)] bg-[var(--bg-surface)] font-bold shadow-xs"
                      : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
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

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs text-[var(--ink-600)] shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--ink-400)]" aria-hidden="true" />
            <span className="hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs bg-transparent font-semibold text-[var(--ink-800)] border border-[var(--ink-200)] rounded px-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="priority">Priority (Critical First)</option>
              <option value="waiting">Waiting Longest</option>
              <option value="newest">Newest First</option>
              <option value="updated">Recently Updated</option>
            </select>
          </div>
        </div>

        {/* Tab Header Description */}
        <div className="px-5 py-2.5 border-b border-[var(--ink-200)] bg-[var(--bg-surface)] flex items-center justify-between text-xs">
          <p className="font-medium text-[var(--ink-600)]">
            {activeTab === "assigned"     && `${allAssigned.length} patient${allAssigned.length !== 1 ? "s" : ""} assigned to your clinical care`}
            {activeTab === "needs_review" && `${needsReview.length} case${needsReview.length !== 1 ? "s" : ""} with unreviewed AI-extracted findings`}
            {activeTab === "available"    && `${recommended?.length ?? 0} recommended case${(recommended?.length ?? 0) !== 1 ? "s" : ""} matching your department`}
            {activeTab === "completed"    && `${completed.length} finalized case${completed.length !== 1 ? "s" : ""} archived as read-only`}
          </p>
          {activeTab === "available" && (
            <button
              onClick={() => router.push("/doctor/patients?tab=available")}
              className="text-xs text-[var(--clinical)] font-semibold hover:underline cursor-pointer flex items-center gap-1"
            >
              Browse entire available pool <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Tab Panes */}
        <div>
          {/* TAB 1: Assigned to Me */}
          {activeTab === "assigned" && (
            queueLoading ? (
              <QueueListSkeleton rows={5} />
            ) : allAssigned.length === 0 ? (
              <div className="py-16 text-center space-y-3 px-4">
                <ClipboardList className="w-10 h-10 mx-auto text-[var(--ink-400)]" aria-hidden="true" />
                <p className="text-sm font-bold text-[var(--ink-900)]">Your review queue is currently clear</p>
                <p className="text-xs text-[var(--ink-500)] max-w-md mx-auto">
                  No encounters are currently assigned to you. You can claim new encounters from the available pool or search a patient by UID.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push("/doctor/patients")}
                  className="text-xs font-semibold"
                >
                  Go to Clinical Queue &amp; Discovery
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {sortedAssigned.map((item) => renderQueueRow(item))}
              </div>
            )
          )}

          {/* TAB 2: Needs Review */}
          {activeTab === "needs_review" && (
            queueLoading ? (
              <QueueListSkeleton rows={4} />
            ) : needsReview.length === 0 ? (
              <div className="py-16 text-center space-y-2 px-4">
                <ShieldCheck className="w-10 h-10 mx-auto text-[var(--status-success-fg)]" aria-hidden="true" />
                <p className="text-sm font-bold text-[var(--ink-900)]">All clinical findings verified</p>
                <p className="text-xs text-[var(--ink-500)]">
                  There are no assigned encounters with pending AI-extracted entities.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {sortedNeedsReview.map((item) => renderQueueRow(item))}
              </div>
            )
          )}

          {/* TAB 3: Suggested / Available */}
          {activeTab === "available" && (
            recLoading ? (
              <QueueListSkeleton rows={3} />
            ) : !recommended?.length ? (
              <div className="py-16 text-center text-sm text-[var(--ink-500)] px-4">
                No departmental recommendations available right now. Check the full available pool in Patients.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {sortedRecommended.map((item) =>
                  renderQueueRow(item, !allAssigned.some((a) => a.encounter_id === item.encounter_id))
                )}
              </div>
            )
          )}

          {/* TAB 4: Completed */}
          {activeTab === "completed" && (
            queueLoading ? (
              <QueueListSkeleton rows={3} />
            ) : completed.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--ink-500)] px-4">
                No completed encounters in your current record.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink-200)]">
                {sortedCompleted.map((item) => renderQueueRow(item))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── 5. Real Encounter Activity Log (Strictly Authoritative Timestamps) ── */}
      {allAssigned.length > 0 && (
        <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--ink-200)] mb-3">
            <h3 className="text-xs font-bold text-[var(--ink-900)] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--clinical)]" aria-hidden="true" />
              Recent Case Updates
            </h3>
            <span className="text-[11px] text-[var(--ink-500)]">
              Authoritative encounter status events
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {allAssigned.slice(0, 6).map((enc) => (
              <div
                key={enc.encounter_id}
                onClick={() => router.push(`/doctor/patients/${enc.encounter_id}`)}
                className="p-2.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] hover:border-[var(--clinical)] hover:bg-white transition-colors cursor-pointer flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--ink-900)] truncate">
                    {enc.patient_name}
                  </p>
                  <p className="text-[11px] text-[var(--ink-500)] flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Updated {formatRelativeTime(enc.updated_at)}</span>
                  </p>
                </div>
                <StatusBadge status={enc.encounter_status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. Reusable Patient Quick View Drawer ── */}
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
