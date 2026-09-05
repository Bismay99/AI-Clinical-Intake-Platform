"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Calendar, Phone, Globe, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientProfile } from "@/services/patient.service";
import { ApiError } from "@/lib/api";
import type { PatientProfileResponse } from "@/types/patient";

function languageLabel(code: string): string {
  switch (code) {
    case "en": return "English";
    case "hi": return "Hindi";
    case "hinglish": return "Hinglish";
    default: return code;
  }
}

export default function PatientProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const p = await getPatientProfile();
        setProfile(p);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/patient/onboarding");
          return;
        }
        setError("Could not load your profile.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[#667085]"><Spinner className="text-[#155EEF]" /> Loading profile…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#D92D20]">{error}</div>
      </div>
    );
  }

  if (!profile) return null;

  const fields = [
    { icon: User, label: "Full Name", value: profile.full_name },
    { icon: Calendar, label: "Date of Birth", value: profile.date_of_birth || "Not provided" },
    { icon: User, label: "Gender", value: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : "Not provided" },
    { icon: Phone, label: "Phone", value: profile.phone || "Not provided" },
    { icon: Globe, label: "Preferred Language", value: languageLabel(profile.preferred_language) },
    { icon: Hash, label: "Hospital Identifier", value: profile.hospital_identifier || "Not assigned" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
          <User className="w-6 h-6 text-[#155EEF]" /> Profile
        </h1>
        <p className="text-[#667085] mt-1 text-sm">Your registered patient information.</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-[#667085] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-[#667085] font-medium">{label}</p>
                  <p className="text-sm text-[#172033]">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-[#667085] border-t border-[#E4E7EC] pt-4">
            Profile information is set during onboarding. Contact the hospital to update your details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}