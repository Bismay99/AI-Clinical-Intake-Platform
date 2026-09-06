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
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
          isActive(href)
            ? "bg-[var(--clinical-light)] text-[var(--clinical)] font-semibold"
            : "text-[var(--ink-500)] hover:bg-[var(--ink-100)] hover:text-[var(--ink-900)]"
        )}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{label}</span>
          {href === "/doctor/dashboard" && pendingCount > 0 && (
            <span className="bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)] border border-[var(--status-pending-bd)] text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--bg-surface)] border-r border-[var(--ink-200)] fixed inset-y-0 z-30">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-[var(--ink-200)]">
          <span className="text-[var(--clinical)] font-bold text-lg tracking-tight">CareFlow AI</span>
          <span className="text-xs text-[var(--ink-500)] font-medium">Doctor</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">{renderNavLinks}</nav>
        <div className="px-3 py-4 border-t border-[var(--ink-200)]">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[var(--ink-900)] truncate">{user?.full_name ?? user?.email ?? "Doctor"}</p>
            <p className="text-xs text-[var(--ink-500)] truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--ink-500)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-[var(--bg-surface)] border-b border-[var(--ink-200)] flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[var(--clinical)] font-bold text-base">CareFlow AI</span>
          <span className="text-xs text-[var(--ink-500)] font-medium">Doctor</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-md text-[var(--ink-500)] hover:bg-[var(--ink-100)] cursor-pointer">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setMobileOpen(false)}>
          <aside className="absolute left-0 top-0 h-full w-64 bg-[var(--bg-surface)] shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-6 py-5 border-b border-[var(--ink-200)]">
              <span className="text-[var(--clinical)] font-bold text-lg">CareFlow AI</span>
              <span className="text-xs text-[var(--ink-500)] font-medium">Doctor</span>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">{renderNavLinks}</nav>
            <div className="px-3 py-4 border-t border-[var(--ink-200)]">
              <div className="px-3 py-2 mb-1">
                <p className="text-xs font-medium text-[var(--ink-900)] truncate">{user?.full_name ?? user?.email}</p>
                <p className="text-xs text-[var(--ink-500)] truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--ink-500)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] transition-colors cursor-pointer">
                <LogOut className="w-4 h-4" />Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}