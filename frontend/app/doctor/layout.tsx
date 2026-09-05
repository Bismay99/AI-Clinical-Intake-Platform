"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, ClipboardList, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/doctor/dashboard", label: "Patient Queue", icon: LayoutDashboard },
  { href: "/doctor/patients", label: "Patients", icon: Users },
  { href: "/doctor/review", label: "Review", icon: ClipboardList },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
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
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-[#E4E7EC] fixed inset-y-0">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-[#E4E7EC]">
          <span className="text-[#155EEF] font-bold text-lg">PS47</span>
          <span className="text-xs text-[#667085] font-medium">Doctor</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(href) ? "bg-blue-50 text-[#155EEF]" : "text-[#667085] hover:bg-gray-50 hover:text-[#172033]"
            )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-[#E4E7EC]">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[#172033] truncate">{user?.full_name ?? user?.email ?? "Doctor"}</p>
            <p className="text-xs text-[#667085] truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#667085] hover:bg-gray-50 transition-colors">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 md:ml-60">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}