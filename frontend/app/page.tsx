import Link from "next/link";
import { Mic, FileText, CheckCircle, ArrowRight, Stethoscope } from "lucide-react";

const features = [
  { icon: Mic, title: "Ambient Voice Intake", description: "Speak naturally in English, Hindi, or Hinglish. CareVoice transcribes and captures clinical facts in real time." },
  { icon: FileText, title: "Multimodal Document Intelligence", description: "Upload prescriptions, lab reports, or discharge summaries. Automatic extraction with exact source provenance." },
  { icon: CheckCircle, title: "Doctor-Verified Summaries", description: "Every extracted entity is verified by your physician before becoming an authoritative part of the consultation record." },
];

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[var(--ink-200)] bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[var(--clinical)] text-white flex items-center justify-center">
              <Stethoscope className="w-4 h-4" />
            </div>
            <span className="text-[var(--clinical)] font-bold text-xl tracking-tight">CareFlow AI</span>
            <span className="hidden sm:inline text-xs text-[var(--ink-400)] font-medium uppercase tracking-wider ml-2">Clinical Intake Platform</span>
          </div>
          <Link href="/login" className="text-sm text-[var(--clinical)] font-semibold hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block text-xs font-semibold text-[var(--clinical)] bg-[var(--clinical-light)] border border-[var(--clinical-mid)] rounded-md px-3 py-1 mb-6 uppercase tracking-wider">
            Clinical Workstation Platform
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-[var(--ink-900)] leading-tight mb-6">
            Institutional Clinical Intake<br />
            <span className="text-[var(--clinical)]">Governed by Clinicians</span>
          </h1>
          <p className="text-base sm:text-lg text-[var(--ink-500)] mb-10 leading-relaxed max-w-xl mx-auto">
            Ambient multimodal pre-consultation intelligence for hospitals. Faster patient intake, verified clinical evidence, focused consultations.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-[var(--clinical)] text-white font-semibold px-8 py-3 rounded-md hover:bg-[var(--clinical-dark)] active:opacity-90 transition-colors text-sm shadow-[var(--shadow-sm)]"
            >
              Access Clinical Portal
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-16 bg-[var(--bg-surface)] border-t border-[var(--ink-200)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-[var(--ink-900)] text-center mb-10">
            Core Clinical Capabilities
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex flex-col items-start p-6 rounded-lg border border-[var(--ink-200)] bg-[var(--bg-surface-2)]">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-[var(--clinical-light)] border border-[var(--clinical-mid)] mb-4">
                  <Icon className="w-5 h-5 text-[var(--clinical)]" />
                </div>
                <h3 className="font-semibold text-[var(--ink-900)] mb-2 text-sm">{title}</h3>
                <p className="text-xs text-[var(--ink-500)] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-[var(--ink-200)] bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto text-center text-xs text-[var(--ink-400)]">
          CareFlow AI — AI Clinical Intake Platform &nbsp;·&nbsp; For authorised hospital use only
        </div>
      </footer>
    </main>
  );
}