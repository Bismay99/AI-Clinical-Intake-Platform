"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { createPatientProfile } from "@/services/patient.service";
import { ApiError } from "@/lib/api";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export default function PatientOnboarding() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("en");
  const [hospitalId, setHospitalId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setError("Full name is required."); return; }
    setIsLoading(true);
    setError(null);
    try {
      await createPatientProfile({
        full_name: fullName.trim(),
        date_of_birth: dob || null,
        gender: gender || null,
        phone: phone || null,
        preferred_language: language,
        hospital_identifier: hospitalId || null,
      });
      router.push("/patient/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("A profile already exists for this account.");
        else setError(err.detail);
      } else if (err instanceof TypeError) {
        setError("Unable to connect to the server. Please check your network.");
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-[var(--clinical-light)] border border-[var(--clinical-mid)] mb-4">
          <UserPlus className="w-7 h-7 text-[var(--clinical)]" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">Complete Your Profile</h1>
        <p className="text-[var(--ink-500)] mt-2 text-sm">
          We need a few details before you can start your pre-consultation intake.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input id="fullName" label="Full Name *" placeholder="Enter your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <Input id="dob" label="Date of Birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="gender" className="text-sm font-medium text-[var(--ink-900)]">Gender</label>
              <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors">
                <option value="">Select gender</option>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            <Input id="phone" label="Phone Number" type="tel" placeholder="+91 XXXXX XXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="language" className="text-sm font-medium text-[var(--ink-900)]">Preferred Language *</label>
              <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors">
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            <Input id="hospitalId" label="Hospital Identifier (optional)" placeholder="HIS ID or MRN" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} />

            {error && (
              <p className="text-sm text-[var(--status-error-fg)] bg-[var(--status-error-bg)] border border-[var(--status-error-bd)] rounded-md px-3 py-2">{error}</p>
            )}

            <Button type="submit" isLoading={isLoading} size="lg" className="w-full mt-2 cursor-pointer">
              Save Profile &amp; Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}