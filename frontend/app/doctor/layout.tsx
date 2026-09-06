"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, UserCircle, LogOut, Menu, X } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getQueue } from "@/services/doctor.service";

const navItems = [
  { href: "/doctor/dashboard", label: "Patient Queue", icon: LayoutDashboard },
  { href: "/doctor/patients",  label: "Patients",       icon: Users },
  { href: "/doctor/profile",   label: "Profile",        icon: UserCircle },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: queueData } = useQuery({
    queryKey: ["doctor", "queue"],
    queryFn: getQueue,
    staleTime: 30_000,
  });
  const pendingCount = queueData?.items.filter(i => i.encounter_status === "ready_for_review").length ?? 0;

  function handleLogout() { logout(); router.push("/login"); }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const renderNavLinks = (
    <>
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isActive(href) ? "bg-blue-50 text-[#155EEF]" : "text-[#667085] hover:bg-gray-50 hover:text-[#172033]"
        )}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{label}</span>
          {href === "/doctor/dashboard" && pendingCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-[#E4E7EC] fixed inset-y-0 z-30">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-[#E4E7EC]">
          <span className="text-[#155EEF] font-bold text-lg">PS47</span>
          <span className="text-xs text-[#667085] font-medium">Doctor</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">{renderNavLinks}</nav>
        <div className="px-3 py-4 border-t border-[#E4E7EC]">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[#172033] truncate">{user?.full_name ?? user?.email ?? "Doctor"}</p>
            <p className="text-xs text-[#667085] truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#667085] hover:bg-gray-50 transition-colors">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-[#E4E7EC] flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[#155EEF] font-bold text-base">PS47</span>
          <span className="text-xs text-[#667085] font-medium">Doctor</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-lg text-[#667085] hover:bg-gray-100">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setMobileOpen(false)}>
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-6 py-5 border-b border-[#E4E7EC]">
              <span className="text-[#155EEF] font-bold text-lg">PS47</span>
              <span className="text-xs text-[#667085] font-medium">Doctor</span>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">{renderNavLinks}</nav>
            <div className="px-3 py-4 border-t border-[#E4E7EC]">
              <div className="px-3 py-2 mb-1">
                <p className="text-xs font-medium text-[#172033] truncate">{user?.full_name ?? user?.email}</p>
                <p className="text-xs text-[#667085] truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#667085] hover:bg-gray-50 transition-colors">
                <LogOut className="w-4 h-4" />Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}