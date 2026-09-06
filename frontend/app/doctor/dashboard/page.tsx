"use client";
import { useAuthStore } from "@/stores/auth.store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueue, getDashboardStats, getRecommended, assignEncounter } from "@/services/doctor.service";
import { StatusBadge } from "@/components/doctor/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useRouter } from "next/navigation";
import { ClipboardList, Users, CheckCircle, ArrowRight, Building2, Clock, AlertCircle } from "lucide-react";

function greet(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, Dr. ${name}`;
}

export default function DoctorDashboard() {
  const user = useAuthStore(s => s.user);
  const router = useRouter();
  const qc = useQueryClient();

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["doctor"] }); },
  });

  const displayName = user?.full_name ?? user?.email?.split("@")[0] ?? "Doctor";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[var(--ink-200)] pb-5">
        <h1 className="text-xl font-bold text-[var(--ink-900)]">{greet(displayName)}</h1>
        <p className="text-sm text-[var(--ink-500)] mt-1">Review patient information collected during pre-consultation.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Awaiting Review", value: stats?.awaiting_review, icon: ClipboardList, colorCls: "text-[var(--status-pending-fg)] bg-[var(--status-pending-bg)] border-[var(--status-pending-bd)]" },
          { label: "In Review",       value: stats?.in_review,       icon: Users,         colorCls: "text-[var(--status-info-fg)] bg-[var(--status-info-bg)] border-[var(--status-info-bd)]" },
          { label: "Completed",       value: stats?.completed,       icon: CheckCircle,   colorCls: "text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border-[var(--status-success-bd)]" },
        ].map(({ label, value, icon: Icon, colorCls }) => (
          <div key={label} className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 flex items-center gap-3.5 shadow-[var(--shadow-xs)]">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 border ${colorCls}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--ink-900)] tracking-tight">{statsLoading ? "—" : (value ?? 0)}</p>
              <p className="text-xs text-[var(--ink-500)] font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Assigned Patient Queue */}
      <Card>
        <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[var(--clinical)]" />
              Assigned Patient Queue
            </CardTitle>
            <span className="text-xs text-[var(--ink-500)] font-medium">
              {queue?.total ?? 0} {queue?.total === 1 ? "encounter" : "encounters"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {queueLoading ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : !queue?.items.length ? (
            <div className="py-12 text-center">
              <ClipboardList className="w-9 h-9 mx-auto mb-2 text-[var(--ink-400)]" />
              <p className="text-sm font-semibold text-[var(--ink-900)]">No encounters assigned yet</p>
              <p className="text-xs text-[var(--ink-500)] mt-1">Claim encounters from the Available Pool or search by Patient UID.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/doctor/patients")}
                className="mt-3 text-xs"
              >
                Go to Patients
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ink-200)]">
              {queue.items.map(item => (
                <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--ink-900)]">{item.patient_name}</p>
                      <StatusBadge status={item.encounter_status} />
                      {item.unreviewed_count > 0 && (
                        <span className="text-[10px] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] rounded-md px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="w-2.5 h-2.5" />{item.unreviewed_count} unreviewed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[var(--ink-500)]">
                      <span className="font-mono font-medium">UID: {item.patient_id.slice(0, 8)}…</span>
                      {item.opd_department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[var(--ink-400)]" />{item.opd_department}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--ink-400)]" />{new Date(item.updated_at).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                    className="flex items-center gap-1.5 flex-shrink-0"
                  >
                    Review <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommended for Review */}
      <Card>
        <CardHeader className="border-b border-[var(--ink-200)] px-5 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--clinical)]" />
              Recommended for Review
            </CardTitle>
            <span className="text-xs text-[var(--ink-500)]">Operational prioritization</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recLoading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : !recommended?.length ? (
            <div className="py-8 text-center text-sm text-[var(--ink-500)]">No recommendations available at this time.</div>
          ) : (
            <div className="divide-y divide-[var(--ink-200)]">
              {recommended.map(item => (
                <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-2)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--ink-900)]">{item.patient_name}</p>
                      <StatusBadge status={item.queue_status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                      {item.opd_department && (
                        <span className="text-[var(--ink-500)] flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[var(--ink-400)]" />{item.opd_department}
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
                    className="flex items-center gap-1.5 flex-shrink-0"
                    isLoading={assignMut.isPending}
                  >
                    Review <ArrowRight className="w-3.5 h-3.5" />
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