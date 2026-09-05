import Link from "next/link";
import { Mic, FileText, CheckCircle, ArrowRight } from "lucide-react";

const features = [
  { icon: Mic, title: "Voice Intake", description: "Speak naturally in English, Hindi, or Hinglish. Our AI transcribes and understands your symptoms in real time." },
  { icon: FileText, title: "Medical Records", description: "Upload prescriptions, lab reports, or discharge summaries. AI extracts the key clinical information automatically." },
  { icon: CheckCircle, title: "Doctor-Verified Summary", description: "Every AI finding is reviewed and verified by your doctor before it becomes part of your medical record." },
];

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 font-bold text-xl tracking-tight">PS47</span>
            <span className="hidden sm:inline text-xs text-gray-400 font-medium uppercase tracking-widest ml-2">AI Clinical Intake</span>
          </div>
          <Link href="/login" className="text-sm text-blue-600 font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 mb-6 uppercase tracking-wider">
            Pre-Consultation Platform
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
            AI-Powered<br />Pre-Consultation<br />
            <span className="text-blue-600">Clinical Intake</span>
          </h1>
          <p className="text-lg text-gray-600 mb-10 leading-relaxed">
            Speak naturally. Upload your medical records. Get a structured history ready for your doctor.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors text-base"
            >
              Start Consultation
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 font-semibold px-8 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-base"
            >
              Doctor Login
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-16 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex flex-col items-start p-6 rounded-xl border border-gray-200 bg-slate-50 hover:border-blue-200 transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 mb-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto text-center text-xs text-gray-400">
          PS47 — AI Clinical Intake Platform &nbsp;·&nbsp; For authorised use only
        </div>
      </footer>
    </main>
  );
}