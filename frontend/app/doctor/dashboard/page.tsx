"use client";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueue, getDashboardStats, getRecommended, assignEncounter } from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Users,
  CheckCircle,
  ArrowRight,
  Building2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Search,
  Sparkles,
  Calendar,
} from "lucide-react";

function greet(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, Dr. ${name}`;
}

export default function DoctorDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();

  const [queueFilter, setQueueFilter] = useState<"all" | "awaiting" | "completed">("all");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["doctor", "stats"],
    queryFn: getDashboardStats,
  });
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
  });
  const { data: recommended, isLoading: recLoading } = useQuery({
    queryKey: ["doctor", "recommended"],
    queryFn: getRecommended,
  });

  const assignMut = useMutation({
    mutationFn: assignEncounter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor"] });
    },
  });

  const displayName = user?.full_name ?? user?.email?.split("@")[0] ?? "Physician";
  const hospitalAffiliation = user?.hospital_affiliation ?? "General OPD Division";
  const todayDate = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Filter items in queue
  const queueItems = queue?.items ?? [];
  const filteredQueue = queueItems.filter((item) => {
    if (queueFilter === "awaiting") return item.encounter_status === "ready_for_review";
    if (queueFilter === "completed") return item.encounter_status === "completed";
    return true;
  });

  // Needs attention items: unreviewed AI findings > 0
  const needsAttentionItems = queueItems.filter((i) => i.unreviewed_count > 0);

  return (
    <div className="space-y-6">
      {/* ── A. CLINICAL WORKSTATION HEADER ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
              {greet(displayName)}
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)]">
              Attending Physician
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--ink-500)] flex-wrap">
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[var(--clinical)]" />
              <span>{hospitalAffiliation}</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[var(--ink-400)]" />
              <span>{todayDate}</span>
            </span>
            <span>·</span>
            <span className="font-semibold text-[var(--ink-700)]">
              {queue?.total ?? 0} active case{queue?.total === 1 ? "" : "s"} in queue
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/doctor/patients")}
            className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Patient by UID</span>
          </Button>
        </div>
      </div>

      {/* ── B. SUBORDINATE METRIC STRIP (Compact 3-Col, Not Large Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Awaiting Verification",
            value: stats?.awaiting_review,
            icon: ClipboardList,
            bgCls: "bg-[var(--status-pending-bg)]",
            fgCls: "text-[var(--status-pending-fg)]",
            bdCls: "border-[var(--status-pending-bd)]",
            desc: "Ready for doctor review",
          },
          {
            label: "In Review / Active",
            value: stats?.in_review,
            icon: Users,
            bgCls: "bg-[var(--status-info-bg)]",
            fgCls: "text-[var(--status-info-fg)]",
            bdCls: "border-[var(--status-info-bd)]",
            desc: "Assigned clinical cases",
          },
          {
            label: "Finalized & Completed",
            value: stats?.completed,
            icon: CheckCircle,
            bgCls: "bg-[var(--status-success-bg)]",
            fgCls: "text-[var(--status-success-fg)]",
            bdCls: "border-[var(--status-success-bd)]",
            desc: "Read-only finalized encounters",
          },
        ].map(({ label, value, icon: Icon, bgCls, fgCls, bdCls, desc }) => (
          <div
            key={label}
            className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3.5 flex items-center justify-between shadow-xs"
          >
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-[var(--ink-500)]">{label}</span>
              <p className="text-xl font-bold text-[var(--ink-900)] tracking-tight">
                {statsLoading ? "—" : value ?? 0}
              </p>
              <span className="text-[10px] text-[var(--ink-400)] block">{desc}</span>
            </div>
            <div
              className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 border ${bgCls} ${fgCls} ${bdCls}`}
            >
              <Icon className="w-4 h-4" />
            </div>
          </div>
        ))}
      </div>

      {/* ── C. NEEDS ATTENTION / VERIFICATION PENDING ALERT ── */}
      {needsAttentionItems.length > 0 && (
        <div className="p-3.5 rounded-lg border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)]/40 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[var(--status-pending-fg)] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-[var(--ink-900)]">
                Review Required: {needsAttentionItems.length} patient case{needsAttentionItems.length === 1 ? "" : "s"} have unverified AI clinical findings
              </p>
              <p className="text-[11px] text-[var(--ink-500)] mt-0.5">
                All AI-extracted entities must be verified, edited, or rejected by an attending clinician before encounter finalization.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setQueueFilter("awaiting")}
            className="text-[11px] py-1 h-7 border-[var(--status-pending-bd)] text-[var(--status-pending-fg)] bg-white cursor-pointer"
          >
            Filter Queue
          </Button>
        </div>
      )}

      {/* ── D. DOMINANT CLINICAL WORKSTATION QUEUE ── */}
      <Card className="border-[var(--ink-200)] shadow-xs">
        <CardHeader className="border-b border-[var(--ink-200)] px-5 py-3.5 bg-[var(--bg-surface-2)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[var(--clinical)]" />
              <CardTitle className="text-sm font-bold text-[var(--ink-900)]">
                Assigned Clinical Queue
              </CardTitle>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[var(--ink-100)] text-[var(--ink-700)] border border-[var(--ink-200)]">
                {filteredQueue.length}
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-md border border-[var(--ink-200)]">
              <button
                type="button"
                onClick={() => setQueueFilter("all")}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  queueFilter === "all"
                    ? "bg-[var(--clinical)] text-white font-semibold"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                }`}
              >
                All Cases ({queueItems.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter("awaiting")}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  queueFilter === "awaiting"
                    ? "bg-[var(--clinical)] text-white font-semibold"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                }`}
              >
                Awaiting Review
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter("completed")}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  queueFilter === "completed"
                    ? "bg-[var(--clinical)] text-white font-semibold"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                }`}
              >
                Completed
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {queueLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[var(--ink-500)]">
              <Spinner />
              <span>Loading clinical workstation queue…</span>
            </div>
          ) : !filteredQueue.length ? (
            <div className="py-12 text-center space-y-2">
              <ClipboardList className="w-8 h-8 mx-auto text-[var(--ink-400)]" />
              <p className="text-sm font-semibold text-[var(--ink-900)]">
                No encounters in this queue view
              </p>
              <p className="text-xs text-[var(--ink-500)] max-w-sm mx-auto">
                {queueFilter === "all"
                  ? "Claim unassigned patient encounters from the Available Pool or search by Patient UID."
                  : "No cases currently match this queue filter."}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/doctor/patients")}
                className="mt-2 text-xs"
              >
                Go to Available Pool
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ink-200)]">
              {filteredQueue.map((item) => (
                <div
                  key={item.encounter_id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-sm font-bold text-[var(--ink-900)]">
                        {item.patient_name}
                      </p>
                      <StatusBadge status={item.encounter_status} />
                      {item.unreviewed_count > 0 && (
                        <span className="text-[10px] bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border border-[var(--status-pending-bd)] rounded-md px-2 py-0.5 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-[var(--status-pending-fg)]" />
                          <span>{item.unreviewed_count} unreviewed</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[var(--ink-500)]">
                      <span className="font-mono text-[11px] font-medium bg-[var(--ink-100)] px-1.5 py-0.5 rounded border border-[var(--ink-200)]">
                        UID: {item.patient_id.slice(0, 8)}…
                      </span>
                      {item.opd_department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[var(--ink-400)]" />
                          <span>{item.opd_department}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--ink-400)]" />
                        <span>{new Date(item.updated_at).toLocaleDateString("en-IN")}</span>
                      </span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                    className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold cursor-pointer"
                  >
                    <span>Open Case</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── E. RECOMMENDED FOR CLINICAL REVIEW ── */}
      <Card className="border-[var(--ink-200)] shadow-xs">
        <CardHeader className="border-b border-[var(--ink-200)] px-5 py-3.5 bg-[var(--bg-surface-2)]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--clinical)]" />
              <span>Recommended for Priority Review</span>
            </CardTitle>
            <span className="text-[11px] text-[var(--ink-500)]">
              AI intake completed · Clinician verification required
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          ) : !recommended?.length ? (
            <div className="py-8 text-center text-xs text-[var(--ink-500)]">
              No priority recommendations in queue at this time.
            </div>
          ) : (
            <div className="divide-y divide-[var(--ink-200)]">
              {recommended.map((item) => (
                <div
                  key={item.encounter_id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--ink-900)]">
                        {item.patient_name}
                      </p>
                      <StatusBadge status={item.queue_status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                      {item.opd_department && (
                        <span className="text-[var(--ink-500)] flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[var(--ink-400)]" />
                          <span>{item.opd_department}</span>
                        </span>
                      )}
                      <span className="text-[var(--clinical)] font-medium bg-[var(--clinical-light)] px-2 py-0.5 rounded-md text-[10px] border border-[var(--clinical-mid)]">
                        {item.reason}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (item.reason.includes("Recently submitted")) {
                        await assignMut.mutateAsync(item.encounter_id);
                      }
                      router.push(`/doctor/patients/${item.encounter_id}`);
                    }}
                    className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold cursor-pointer"
                    isLoading={assignMut.isPending}
                  >
                    <span>Review Case</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}