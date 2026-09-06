"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FileText,
  User,
  LogOut,
  Activity,
  Shield,
  Accessibility,
  Clock,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Home",
    items: [
      { href: "/patient/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Consultation",
    items: [
      { href: "/patient/intake", label: "Pre-Consultation", icon: Mic },
      { href: "/patient/reports", label: "Health Reports", icon: ClipboardList },
      { href: "/patient/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Health",
    items: [
      { href: "/patient/health-record", label: "Health Record", icon: Activity },
      { href: "/patient/timeline", label: "Timeline", icon: Clock },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/patient/profile", label: "Profile", icon: User },
      { href: "/patient/privacy", label: "Privacy", icon: Shield },
      { href: "/patient/accessibility", label: "Accessibility", icon: Accessibility },
    ],
  },
];

// Mobile bottom nav — 5 key items
const mobileNavItems = [
  { href: "/patient/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/patient/intake", label: "Intake", icon: Mic },
  { href: "/patient/documents", label: "Documents", icon: FileText },
  { href: "/patient/reports", label: "Reports", icon: ClipboardList },
  { href: "/patient/profile", label: "Profile", icon: User },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() { logout(); router.push("/login"); }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const renderSidebarShell = () => (
    <div className="flex flex-col h-full" style={{ background: "var(--sidebar-bg)" }}>
      {/* Wordmark */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-base tracking-tight">CareFlow AI</span>
          <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
            Patient
          </span>
        </div>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 px-3 py-3 space-y-3.5 overflow-y-auto" aria-label="Patient navigation">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)] select-none">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors",
                      active
                        ? "text-white font-semibold"
                        : "text-[var(--sidebar-muted)] hover:text-white"
                    )}
                    style={{
                      background: active ? "var(--sidebar-active)" : undefined,
                      color: active ? "var(--sidebar-fg)" : "rgba(255,255,255,0.75)",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[#0F8FA8]" aria-hidden="true" />
                    )}
                    <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#63E6BE]" : "text-[var(--sidebar-muted)]")} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Identity + sign out */}
      <div className="px-3 py-3 border-t border-[var(--sidebar-border)] bg-[rgba(0,0,0,0.12)]">
        <div className="px-2 py-1 mb-1">
          <p className="text-xs font-semibold text-white truncate" style={{ color: "var(--sidebar-fg)" }}>{user?.full_name ?? user?.email ?? "Patient"}</p>
          <p className="text-[10px] truncate" style={{ color: "var(--sidebar-muted)" }}>{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
          style={{ color: "rgba(255,255,255,0.65)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.2)"; (e.currentTarget as HTMLElement).style.color = "#fca5a5"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"; }}
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-[var(--sidebar-border)] fixed inset-y-0 z-30 shadow-sm" aria-label="Patient navigation sidebar">
        {renderSidebarShell()}
      </aside>

      {/* Mobile header */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-10 px-4 h-14 flex items-center justify-between text-white"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white">CareFlow AI</span>
          <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
            Patient
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-[var(--sidebar-muted)] hover:text-white p-1 cursor-pointer transition-colors"
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
        {mobileNavItems.map(({ href, label, icon: Icon }) => {
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

      {/* Main content — shell provides all padding, max-width, sidebar offset */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 min-w-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
