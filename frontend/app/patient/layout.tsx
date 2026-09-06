"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Mic, ClipboardList, FileText, User, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/patient/dashboard",  label: "Dashboard",       icon: LayoutDashboard },
  { href: "/patient/intake",     label: "Pre-Consultation", icon: Mic },
  { href: "/patient/reports",    label: "Health Reports",   icon: ClipboardList },
  { href: "/patient/documents",  label: "Documents",        icon: FileText },
  { href: "/patient/profile",    label: "Profile",          icon: User },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() { logout(); router.push("/login"); }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const SidebarShell = () => (
    <div className="flex flex-col h-full" style={{ background: "var(--sidebar-bg)" }}>
      {/* Wordmark */}
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <span className="text-white font-bold text-sm tracking-tight">CareFlow AI</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--sidebar-muted)" }}>Patient</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Patient navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors")}
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
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Identity + sign out */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-fg)" }}>{user?.full_name ?? user?.email ?? "Patient"}</p>
          <p className="text-[10px] truncate" style={{ color: "var(--sidebar-muted)" }}>{user?.email}</p>
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
      <aside className="hidden md:flex flex-col w-60 fixed inset-y-0 z-30" aria-label="Patient navigation sidebar">
        <SidebarShell />
      </aside>

      {/* Mobile header */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-10 px-4 h-14 flex items-center justify-between"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <span className="text-white font-bold text-sm">CareFlow AI</span>
        <button
          onClick={handleLogout}
          className="p-1 cursor-pointer transition-colors"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-10 flex safe-area-bottom"
        style={{ background: "var(--sidebar-bg)", borderTop: "1px solid var(--sidebar-border)" }}
        aria-label="Mobile bottom navigation"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
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
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
