"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Mic, ClipboardList, FileText, User, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/patient/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patient/intake", label: "Pre-Consultation", icon: Mic },
  { href: "/patient/reports", label: "Health Reports", icon: ClipboardList },
  { href: "/patient/documents", label: "Documents", icon: FileText },
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--bg-surface)] border-r border-[var(--ink-200)] fixed inset-y-0 z-30">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-[var(--ink-200)]">
          <span className="text-[var(--clinical)] font-bold text-lg tracking-tight">CareFlow AI</span>
          <span className="text-xs text-[var(--ink-500)] font-medium">Patient</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-[var(--clinical-light)] text-[var(--clinical)] font-semibold"
                : "text-[var(--ink-500)] hover:bg-[var(--ink-100)] hover:text-[var(--ink-900)]"
            )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-[var(--ink-200)]">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[var(--ink-900)] truncate">{user?.full_name ?? user?.email ?? "Patient"}</p>
            <p className="text-xs text-[var(--ink-500)] truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--ink-500)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--ink-200)] px-4 h-14 flex items-center justify-between">
        <span className="text-[var(--clinical)] font-bold text-lg">CareFlow AI</span>
        <button onClick={handleLogout} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] p-1 cursor-pointer">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-[var(--bg-surface)] border-t border-[var(--ink-200)] flex safe-area-bottom">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
            isActive(href) ? "text-[var(--clinical)] font-semibold" : "text-[var(--ink-500)]"
          )}>
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Main content — Section 7.0 spacing fix: eliminate dead gutter and artificial max-width constraints */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 pb-20 md:pb-0 min-w-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}