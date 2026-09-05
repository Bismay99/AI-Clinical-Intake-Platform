"use client";
import { LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/stores/auth.store";

export default function DoctorDashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-[#155EEF]" /> Patient Queue
        </h1>
        <p className="text-[#667085] mt-1 text-sm">
          Welcome{user?.full_name ? `, Dr. ${user.full_name}` : ""}. Encounters assigned to you will appear here.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Assigned Encounters</CardTitle></CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <p className="text-sm text-[#667085] mb-2">No encounters assigned yet.</p>
            <p className="text-xs text-[#667085]">Patient queue, entity verification, and finalization will be built in Step 3.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}