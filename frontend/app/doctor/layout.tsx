"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, UserCircle, LogOut, Menu, X, Stethoscope, FolderHeart,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getQueue } from "@/services/doctor.service";
import { formatDoctorName } from "@/lib/doctorUtils";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/doctor/dashboard", label: "Command Center", icon: LayoutDashboard },
      { href: "/doctor/patients",  label: "Clinical Queue",  icon: Users },
      { href: "/doctor/records",   label: "Patient Records", icon: FolderHeart },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/doctor/profile", label: "Profile", icon: UserCircle },
    ],
  },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
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

  const SidebarNav = ({ onClose }: { onClose?: () => void }) => (
    <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Doctor navigation">
      {navGroups.map(group => (
        <div key={group.label}>
          <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--sidebar-muted)" }}>
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "text-white"
                      : "hover:text-white"
                  )}
                  style={{
                    background: active ? "var(--sidebar-active)" : undefined,
                    color: active ? "var(--sidebar-fg)" : "rgba(255,255,255,0.75)",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r" style={{ background: "#0F8FA8" }} aria-hidden="true" />
                  )}
                  <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {href === "/doctor/dashboard" && pendingCount > 0 && (
                    <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none" aria-label={`${pendingCount} pending`}>
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Contextual Current Case Sub-Navigation */}
      {isCaseOpen && currentCaseId && (
        <div className="pt-3 border-t border-[var(--sidebar-border)]">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#A5D8F3]">
              Active Case
            </span>
            <span className="text-[9px] font-mono text-[var(--sidebar-muted)]">
              #{currentCaseId.slice(0, 6)}
            </span>
          </div>
          <div className="space-y-0.5 text-xs text-[var(--sidebar-muted)]">
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#63E6BE]" />
              <span>Consolidated Report</span>
            </Link>
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#5CC8D7]" />
              <span>Clinical Findings</span>
            </Link>
            <Link
              href={`/doctor/patients/${currentCaseId}`}
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] hover:text-white transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F8FA8]" />
              <span>Document Evidence</span>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );

  const renderSidebarShell = (onClose?: () => void) => (
    <div className="flex flex-col h-full" style={{ background: "var(--sidebar-bg)" }}>
      {/* Wordmark */}
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "#0F8FA8" }}>
          <Stethoscope className="w-4 h-4 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-white font-bold text-sm tracking-tight leading-tight">CareFlow AI</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight" style={{ color: "var(--sidebar-muted)" }}>
            Clinical Workstation
          </p>
        </div>
      </div>

      <SidebarNav onClose={onClose} />

      {/* Identity + sign out */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div className="px-3 py-2 mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-fg)" }}>{formatDoctorName(user?.full_name)}</p>
            <p className="text-[10px] truncate" style={{ color: "var(--sidebar-muted)" }}>{user?.hospital_affiliation ?? user?.email}</p>
          </div>
          {pendingCount > 0 && (
            <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" aria-label={`${pendingCount} pending`}>
              {pendingCount}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
          style={{ color: "rgba(255,255,255,0.65)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.2)"; (e.currentTarget as HTMLElement).style.color = "#fca5a5"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"; }}
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 fixed inset-y-0 z-30" aria-label="Doctor workstation navigation">
        {renderSidebarShell()}
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4" style={{ color: "#0F8FA8" }} aria-hidden="true" />
          <span className="text-white font-bold text-sm">CareFlow AI</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sidebar-muted)" }}>Clinical</span>
        </div>
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 rounded-md transition-colors cursor-pointer"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true">
          <aside className="absolute left-0 top-0 h-full w-64 shadow-2xl" onClick={e => e.stopPropagation()} aria-label="Mobile navigation">
            {renderSidebarShell(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 flex safe-area-bottom"
        style={{ background: "var(--sidebar-bg)", borderTop: "1px solid var(--sidebar-border)" }}
        aria-label="Mobile bottom navigation"
      >
        {navGroups.flatMap(g => g.items).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors"
              style={{ color: active ? "#0F8FA8" : "var(--sidebar-muted)" }}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 min-w-0">
        <div className="px-5 md:px-8 py-5 md:py-6">{children}</div>
      </main>
    </div>
  );
}
