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

  const isCaseOpen = pathname.startsWith("/doctor/patients/") && pathname !== "/doctor/patients";
  const currentCaseId = isCaseOpen ? pathname.split("/doctor/patients/")[1]?.split("/")[0] : null;

  function handleLogout() { logout(); router.push("/login"); }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const renderNavLinks = (
    <div className="space-y-4">
      <div>
        <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)] select-none">
          Command Rail
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-[var(--sidebar-active)] text-white font-semibold border-l-2 border-[#0F8FA8] pl-2"
                    : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
                )}
              >
                <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#63E6BE]" : "text-[var(--sidebar-muted)]")} />
                <span className="flex-1">{label}</span>
                {href === "/doctor/dashboard" && pendingCount > 0 && (
                  <span className="bg-[#B7791F] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Contextual Current Case Sub-Navigation (Section 8.1) */}
      {isCaseOpen && currentCaseId && (
        <div className="pt-2 border-t border-[var(--sidebar-border)]">
          <div className="flex items-center justify-between px-2.5 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#A5D8F3]">
              Active Case
            </span>
            <span className="text-[9px] font-mono text-[var(--sidebar-muted)]">
              #{currentCaseId.slice(0, 6)}
            </span>
          </div>
          <div className="space-y-0.5 text-xs text-[var(--sidebar-muted)]">
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#63E6BE]" />
              <span>Consolidated Report</span>
            </Link>
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#5CC8D7]" />
              <span>Clinical Findings</span>
            </Link>
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F8FA8]" />
              <span>Document Evidence</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Desktop sidebar — Dark Institutional Clinical Teal */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] fixed inset-y-0 z-30 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base tracking-tight">CareFlow AI</span>
            <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
              Clinician
            </span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 overflow-y-auto">{renderNavLinks}</nav>
        <div className="px-3 py-3 border-t border-[var(--sidebar-border)] bg-[rgba(0,0,0,0.12)]">
          <div className="px-2 py-1 mb-1">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name ?? user?.email ?? "Physician"}</p>
            <p className="text-[10px] text-[var(--sidebar-muted)] truncate">{user?.hospital_affiliation ?? user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--sidebar-muted)] hover:text-white hover:bg-[rgba(197,48,48,0.3)] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white">CareFlow AI</span>
          <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
            Clinician
          </span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-1 rounded-md text-[var(--sidebar-muted)] hover:text-white cursor-pointer">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)}>
          <aside className="absolute left-0 top-0 h-full w-64 bg-[var(--sidebar-bg)] shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--sidebar-border)]">
              <span className="text-white font-bold text-base">CareFlow AI</span>
              <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
                Clinician
              </span>
            </div>
            <nav className="flex-1 px-3 py-3 overflow-y-auto">{renderNavLinks}</nav>
            <div className="px-3 py-3 border-t border-[var(--sidebar-border)] bg-[rgba(0,0,0,0.12)]">
              <div className="px-2 py-1 mb-1">
                <p className="text-xs font-semibold text-white truncate">{user?.full_name ?? user?.email}</p>
                <p className="text-[10px] text-[var(--sidebar-muted)] truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--sidebar-muted)] hover:text-white hover:bg-[rgba(197,48,48,0.3)] transition-colors cursor-pointer">
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 min-w-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}