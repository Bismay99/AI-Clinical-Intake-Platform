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

// Mobile bottom nav — 5 key items only
const mobileNavItems = [
  { href: "/patient/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/patient/intake", label: "Intake", icon: Mic },
  { href: "/patient/reports", label: "Reports", icon: ClipboardList },
  { href: "/patient/health-record", label: "Health", icon: Activity },
  { href: "/patient/profile", label: "Profile", icon: User },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Desktop sidebar — Dark Institutional Clinical Teal */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] fixed inset-y-0 z-30 shadow-sm">
        {/* Logo / wordmark */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base tracking-tight">CareFlow AI</span>
            <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
              Patient
            </span>
          </div>
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 px-3 py-3 space-y-3.5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              {/* Group label */}
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
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors",
                        active
                          ? "bg-[var(--sidebar-active)] text-white font-semibold border-l-2 border-[#0F8FA8] pl-2"
                          : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#63E6BE]" : "text-[var(--sidebar-muted)]")} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User identity + sign-out */}
        <div className="px-3 py-3 border-t border-[var(--sidebar-border)] bg-[rgba(0,0,0,0.12)]">
          <div className="px-2 py-1 mb-1">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name ?? user?.email ?? "Patient"}</p>
            <p className="text-[10px] text-[var(--sidebar-muted)] truncate">{user?.email}</p>
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

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-10 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] px-4 h-14 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white">CareFlow AI</span>
          <span className="text-[10px] font-semibold text-[#A5D8F3] bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 rounded">
            Patient
          </span>
        </div>
        <button onClick={handleLogout} className="text-[var(--sidebar-muted)] hover:text-white p-1 cursor-pointer">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile bottom nav — 5 key items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-[var(--bg-surface)] border-t border-[var(--ink-200)] flex safe-area-bottom">
        {mobileNavItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
              isActive(href) ? "text-[var(--clinical)] font-semibold" : "text-[var(--ink-500)]"
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Main content — shell provides all padding, max-width, sidebar offset */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 min-w-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}