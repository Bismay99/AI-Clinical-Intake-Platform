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
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-xl font-bold text-[#172033]">{greet(displayName)}</h1>
        <p className="text-sm text-[#667085] mt-1">Review patient information collected during pre-consultation.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Awaiting Review", value: stats?.awaiting_review, icon: ClipboardList, color: "text-amber-600 bg-amber-50 border-amber-100" },
          { label: "In Review",       value: stats?.in_review,       icon: Users,         color: "text-blue-600 bg-blue-50 border-blue-100"     },
          { label: "Completed",       value: stats?.completed,       icon: CheckCircle,   color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-[#E4E7EC] rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#172033] tracking-tight">{statsLoading ? "—" : (value ?? 0)}</p>
              <p className="text-xs text-[#667085] font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Assigned Patient Queue */}
      <Card className="shadow-xs">
        <CardHeader className="border-b border-[#E4E7EC] bg-white rounded-t-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#155EEF]" />
              Assigned Patient Queue
            </CardTitle>
            <span className="text-xs text-[#667085] font-medium">
              {queue?.total ?? 0} {queue?.total === 1 ? "encounter" : "encounters"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {queueLoading ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : !queue?.items.length ? (
            <div className="py-12 text-center">
              <ClipboardList className="w-9 h-9 mx-auto mb-2 text-[#D0D5DD]" />
              <p className="text-sm font-semibold text-[#172033]">No encounters assigned yet</p>
              <p className="text-xs text-[#667085] mt-1">Claim encounters from the Available Pool or search by Patient UID.</p>
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
            <div className="divide-y divide-[#E4E7EC]">
              {queue.items.map(item => (
                <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F9FC] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[#172033]">{item.patient_name}</p>
                      <StatusBadge status={item.encounter_status} />
                      {item.unreviewed_count > 0 && (
                        <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="w-2.5 h-2.5" />{item.unreviewed_count} unreviewed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[#667085]">
                      <span className="font-mono font-medium">UID: {item.patient_id.slice(0, 8)}…</span>
                      {item.opd_department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#98A2B3]" />{item.opd_department}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#98A2B3]" />{new Date(item.updated_at).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/doctor/patients/${item.encounter_id}`)}
                    className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold px-4"
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
      <Card className="shadow-xs">
        <CardHeader className="border-b border-[#E4E7EC] bg-white rounded-t-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0F9D8A]" />
              Recommended for Review
            </CardTitle>
            <span className="text-xs text-[#667085]">Operational prioritization</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recLoading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : !recommended?.length ? (
            <div className="py-8 text-center text-sm text-[#667085]">No recommendations available at this time.</div>
          ) : (
            <div className="divide-y divide-[#E4E7EC]">
              {recommended.map(item => (
                <div key={item.encounter_id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F9FC] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[#172033]">{item.patient_name}</p>
                      <StatusBadge status={item.queue_status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                      {item.opd_department && (
                        <span className="text-[#667085] flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#98A2B3]" />{item.opd_department}
                        </span>
                      )}
                      <span className="text-[#0F9D8A] font-medium bg-[#E6F4F2] px-2 py-0.5 rounded-full text-[11px]">
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
                    className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold"
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