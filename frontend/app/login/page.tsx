"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";
import { login, getMe } from "@/services/auth.service";
import { ApiError } from "@/lib/api";

type SelectedRole = "patient" | "doctor" | null;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [selectedRole, setSelectedRole] = useState<SelectedRole>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRole) {
      setError("Please select whether you are a Patient or Doctor.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const tokenResp = await login({ email, password });

      // Backend role is authoritative — selected role is only a UI hint
      if (tokenResp.role !== selectedRole && tokenResp.role !== "admin") {
        setError(
          `Your account role is "${tokenResp.role}", but you selected "${selectedRole}". Please select the correct role.`
        );
        setIsLoading(false);
        return;
      }

      // Fetch full user profile
      const user = await getMe();
      setAuth(tokenResp.access_token, user);

      // Route based on the BACKEND role
      if (tokenResp.role === "patient") {
        router.push("/patient/dashboard");
      } else {
        router.push("/doctor/dashboard");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Invalid email or password.");
        } else if (err.status >= 500) {
          setError("Server error. Please try again later.");
        } else {
          setError(err.detail);
        }
      } else if (err instanceof TypeError && (err as TypeError).message.includes("fetch")) {
        setError("Unable to connect to the server. Please check your network connection.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F7F9FC] px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <span className="text-[#155EEF] font-bold text-2xl tracking-tight">PS47</span>
          <p className="text-[#667085] text-sm mt-1">AI-assisted clinical intake before the doctor consultation</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-8">
          <h1 className="text-lg font-semibold text-[#172033] mb-6">Sign in</h1>

          {/* Role selection */}
          <p className="text-sm text-[#667085] mb-3 font-medium">I am a</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              { value: "patient" as const, label: "Patient", icon: User },
              { value: "doctor" as const, label: "Doctor", icon: Stethoscope },
            ]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setSelectedRole(value); setError(null); }}
                className={[
                  "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
                  selectedRole === value
                    ? "border-[#155EEF] bg-blue-50 text-[#155EEF]"
                    : "border-[#E4E7EC] hover:border-gray-300 text-[#667085]",
                ].join(" ")}
              >
                <Icon className="w-6 h-6" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* Password with show/hide toggle */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[#172033]">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-[#E4E7EC] bg-white px-3 pr-10 text-sm text-[#172033] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#155EEF] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#172033]"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-[#D92D20] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#667085] mt-6">
          PS47 is for authorised hospital use only.
        </p>
      </div>
    </main>
  );
}