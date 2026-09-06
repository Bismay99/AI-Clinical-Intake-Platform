"use client";
import {
  Shield,
  Brain,
  Users,
  Scale,
  Mail,
  Info,
  Lock,
  Eye,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface SectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}

function InfoSection({ icon: Icon, title, children }: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-4 h-4 text-[var(--clinical)]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 text-sm text-[var(--ink-700)] leading-relaxed space-y-3">
        {children}
      </CardContent>
    </Card>
  );
}

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-3 border-b border-[var(--ink-200)]">
        <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
          <Shield className="w-6 h-6 text-[var(--clinical)]" />
          Privacy & Data Disclosure
        </h1>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          How CareFlow AI collects, processes, and protects your clinical information.
        </p>
      </div>

      {/* Informational notice banner */}
      <div className="p-4 rounded-lg border border-[var(--clinical-mid)] bg-[var(--clinical-light)] flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-[var(--clinical)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-[var(--ink-900)] mb-0.5">Informational Notice</p>
          <p className="text-[var(--ink-700)]">
            This page describes how your data is handled. It is purely informational. CareFlow AI does not expose consent toggle controls in this panel — all data rights requests must be submitted to your care team or the CareFlow AI support contact listed below.
          </p>
        </div>
      </div>

      {/* ── Section 1: Data Collection ── */}
      <InfoSection icon={Database} title="What We Collect">
        <p>
          CareFlow AI collects the following information when you use the patient portal:
        </p>
        <ul className="space-y-2 list-none">
          {[
            { label: "Identity Information", desc: "Your full name, date of birth, gender, contact number, and preferred language as registered during onboarding." },
            { label: "Intake Conversations", desc: "Transcripts and responses from your CareVoice pre-consultation sessions. Voice data is processed in real-time and is not stored as audio." },
            { label: "Uploaded Medical Documents", desc: "Prescriptions, lab reports, and discharge summaries you upload. These are stored securely and processed to extract clinical entities." },
            { label: "Extracted Clinical Entities", desc: "Structured medical facts (symptoms, diagnoses, medications, allergies, investigations) identified by AI from your intake and documents." },
            { label: "Session and Access Logs", desc: "Login timestamps and API access logs for security auditing. No browsing behavior or third-party tracking is performed." },
          ].map(({ label, desc }) => (
            <li key={label} className="flex gap-3 p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <Lock className="w-3.5 h-3.5 text-[var(--clinical)] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--ink-900)]">{label}:</span>{" "}
                <span>{desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </InfoSection>

      {/* ── Section 2: AI Processing ── */}
      <InfoSection icon={Brain} title="AI Processing Disclosure">
        <p>
          CareFlow AI uses the following AI technologies to process your clinical information:
        </p>
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
            <p className="font-semibold text-[var(--ink-900)] mb-1">Google Gemini (Generative AI)</p>
            <p>Used to extract structured clinical entities from your intake conversations and uploaded documents. Extractions are clearly labeled as <em>AI Extracted — Awaiting Physician Verification</em> until reviewed by your doctor.</p>
          </div>
          <div className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
            <p className="font-semibold text-[var(--ink-900)] mb-1">Optical Character Recognition (OCR)</p>
            <p>Applied to uploaded document images (JPEG, PNG, PDF pages) to convert scanned text into machine-readable form before AI entity extraction.</p>
          </div>
          <div className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
            <p className="font-semibold text-[var(--ink-900)] mb-1">CareVoice (LiveKit / Speech Processing)</p>
            <p>Your voice during pre-consultation is transcribed in real-time. Audio streams are not retained after the session ends. Only text transcripts are stored.</p>
          </div>
        </div>
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-800">
            <strong>Important:</strong> AI-extracted clinical information is never presented as medical fact until verified by a licensed physician. Your doctor reviews, accepts, edits, or rejects every AI-extracted value before it is used clinically.
          </p>
        </div>
      </InfoSection>

      {/* ── Section 3: Data Sharing ── */}
      <InfoSection icon={Users} title="Who Can See Your Data">
        <div className="space-y-3">
          {[
            {
              who: "Your Treating Physician",
              what: "Your assigned doctor can view your complete pre-consultation report, extracted entities, uploaded documents, and AI analysis. This is the intended use of CareFlow AI.",
              permitted: true,
            },
            {
              who: "Hospital Administration",
              what: "Encounter metadata (date, department, status) may be visible to hospital administrative staff for scheduling and queue management.",
              permitted: true,
            },
            {
              who: "CareFlow AI Engineering",
              what: "De-identified, aggregated usage statistics may be reviewed to improve platform performance. No identifiable patient data is accessed for product development.",
              permitted: true,
            },
            {
              who: "Third Parties / Advertisers",
              what: "Your clinical data is never sold, shared with, or licensed to any third-party commercial entity, advertiser, or insurer.",
              permitted: false,
            },
          ].map(({ who, what, permitted }) => (
            <div key={who} className={`p-3 rounded-lg border flex items-start gap-3 ${permitted ? "border-[var(--ink-200)] bg-[var(--bg-surface-2)]" : "border-[var(--status-error-bd)] bg-[var(--status-error-bg)]"}`}>
              <Eye className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${permitted ? "text-[var(--ink-500)]" : "text-[var(--status-error-fg)]"}`} />
              <div>
                <p className={`font-semibold mb-0.5 ${permitted ? "text-[var(--ink-900)]" : "text-[var(--status-error-fg)]"}`}>
                  {who} {!permitted && "— Never"}
                </p>
                <p>{what}</p>
              </div>
            </div>
          ))}
        </div>
      </InfoSection>

      {/* ── Section 4: Your Rights ── */}
      <InfoSection icon={Scale} title="Your Data Rights">
        <p>
          Under applicable privacy frameworks (DPDPA 2023, and international standards including HIPAA where applicable), you have the following rights with respect to your clinical data:
        </p>
        <ul className="space-y-2">
          {[
            { right: "Right of Access", desc: "You may request a complete export of all data held about you." },
            { right: "Right to Correction", desc: "You may request correction of factually incorrect personal information (e.g., date of birth, name spelling)." },
            { right: "Right to Erasure", desc: "You may request deletion of your account and associated clinical data, subject to any mandatory retention periods required by law." },
            { right: "Right to Portability", desc: "You may request your data in a structured, machine-readable format (JSON or PDF report)." },
            { right: "Right to Withdraw", desc: "You may withdraw from the CareFlow AI platform at any time. Withdrawal does not affect care provided by your hospital or physician." },
          ].map(({ right, desc }) => (
            <li key={right} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <p className="font-semibold text-[var(--ink-900)] text-xs mb-0.5">{right}</p>
              <p className="text-xs">{desc}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-500)] italic">
          To exercise any of these rights, contact CareFlow AI support or your treating hospital's patient services team.
        </p>
      </InfoSection>

      {/* ── Section 5: Contact ── */}
      <InfoSection icon={Mail} title="Contact & Support">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Data Privacy Officer", value: "privacy@careflow.ai" },
            { label: "Patient Support", value: "support@careflow.ai" },
            { label: "Security Issues", value: "security@careflow.ai" },
            { label: "Last Updated", value: "September 2026" },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
              <p className="text-xs text-[var(--ink-500)] mb-0.5">{label}</p>
              <p className="text-sm font-medium text-[var(--ink-900)]">{value}</p>
            </div>
          ))}
        </div>
      </InfoSection>
    </div>
  );
}
