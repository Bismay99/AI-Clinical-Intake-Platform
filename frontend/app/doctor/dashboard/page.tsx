"use client";
import React, { useState } from "react";
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
import { Button } from "@/components/ui/Button";
import { StatStripSkeleton, QueueListSkeleton } from "@/components/doctor/DoctorSkeletons";
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
} from "lucide-react";
import type { QueueItem } from "@/types/doctor";

function greet(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, Dr. ${name}`;
}

type QueueTab = "assigned" | "needs_review" | "available" | "completed";

export default function DoctorDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<QueueTab>("assigned");

  // 1. Queue Data
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
  });

  // 2. Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["doctor", "stats"],
    queryFn: getDashboardStats,
  });

  // 3. Recommended / Suggested
  const { data: recommended, isLoading: recLoading } = useQuery({
    queryKey: ["doctor", "recommended"],
    queryFn: getRecommended,
  });

  // 4. Available unassigned pool
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

  const displayName = user?.full_name ?? user?.email?.split("@")[0] ?? "Doctor";
  const departmentName = user?.hospital_affiliation ?? null;

  // Real derived subsets from authoritative queue
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

  // Render dense clinical queue row
  function renderQueueRow(item: {
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
    reason?: string;
  }, showClaimBtn = false) {
    const status = item.encounter_status ?? item.queue_status ?? "";
    const totalEntities = item.total_entities ?? 0;
    const unreviewed = item.unreviewed_count ?? 0;
    const verified = Math.max(0, totalEntities - unreviewed);
    const dateStr = item.updated_at || item.created_at;

    return (
      <div
        key={item.encounter_id}
        className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors border-l-2 border-transparent hover:border-[var(--clinical)]"
      >
        {/* Left clinical block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-bold text-[var(--ink-900)]">
              {item.patient_name}
            </span>
            {item.patient_id && (
              <span className="font-mono text-[11px] text-[var(--ink-500)] bg-[var(--ink-100)] px-1.5 py-0.5 rounded" title={`Patient UID: ${item.patient_id}`}>
                UID: {item.patient_id.slice(0, 8)}…
              </span>
            )}
            <StatusBadge status={status} />
            {item.reason && (
              <span className="text-[10px] bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)] rounded px-1.5 py-0.5 font-semibold">
                {item.reason}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-[var(--ink-500)]">
            <span className="font-mono text-[var(--ink-600)]">
              Encounter #{item.encounter_id.slice(0, 8)}
            </span>
            {item.opd_department && (
              <span className="flex items-center gap-1 text-[var(--ink-700)]">
                <Building2 className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                {item.opd_department}
              </span>
            )}
            {dateStr && (
              <span className="flex items-center gap-1 text-[var(--ink-500)]">
                <Clock className="w-3 h-3 text-[var(--ink-400)] shrink-0" aria-hidden="true" />
                {new Date(dateStr).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}

            {/* Verification State Pills */}
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
                    <span className="text-[var(--status-pending-fg)] font-semibold flex items-center gap-0.5">
                      {unreviewed} pending
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right action button */}
        <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
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
      {/* ── 1. Page Header ── */}
      <div className="border-b border-[var(--ink-200)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              {greet(displayName)}
            </h1>
            {departmentName && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)]">
                <Building2 className="w-3 h-3" aria-hidden="true" />
                {departmentName}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Clinical intake workstation • Real-time patient triage and AI verification queue
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
          <div className="px-4 py-2.5 border-b border-[var(--status-pending-bd)] flex items-center justify-between">
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

          <div className="divide-y divide-[var(--status-pending-bd)]/60 max-h-56 overflow-y-auto">
            {needsReview.slice(0, 5).map((item) => (
              <div
                key={item.encounter_id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-amber-100/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-xs text-[var(--ink-900)] truncate">
                    {item.patient_name}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--ink-500)] hidden sm:inline">
                    Encounter #{item.encounter_id.slice(0, 8)}
                  </span>
                  <span className="text-[11px] text-[var(--status-pending-fg)] font-semibold bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                    {item.unreviewed_count} unreviewed {item.unreviewed_count === 1 ? "finding" : "findings"}
                  </span>
                </div>
                <button
                  onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                  className="text-xs font-semibold text-[var(--clinical)] hover:text-[var(--clinical-hover)] flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  Review findings <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
        {/* Tab strip */}
        <div className="flex border-b border-[var(--ink-200)] bg-[var(--bg-surface-2)] px-2 pt-1.5 gap-1 overflow-x-auto">
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
                {allAssigned.map((item) => renderQueueRow(item))}
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
                {needsReview.map((item) => renderQueueRow(item))}
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
                {recommended.map((item) =>
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
                {completed.map((item) => renderQueueRow(item))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
