"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Stethoscope,
  Send,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Mic,
  X,
  Sparkles,
  Cpu,
  ClipboardList,
  Shield,
  Clock,
  Check,
  FileCheck2,
  Info,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ConversationHistory } from "@/components/patient/ConversationHistory";
import { ExtractedEntities } from "@/components/patient/ExtractedEntities";
import { VoiceRecorder } from "@/components/patient/VoiceRecorder";
import { CareVoiceConversation } from "@/components/patient/CareVoiceConversation";
import { CareVoiceLiveKitConversation } from "@/components/patient/CareVoiceLiveKitConversation";
import { useIntakeStore } from "@/stores/intake.store";
import { getMyEncounters } from "@/services/patient.service";
import { startSession, submitTurn, submitVoiceTurn, submitIntake } from "@/services/intake.service";
import { ApiError } from "@/lib/api";
import type { EncounterResponse } from "@/types/patient";

/** Schema picker for MVP — uses the two schemas defined in the backend. */
const SCHEMAS = [
  { id: "allopathic_chest_pain_v1", label: "General / Allopathic" },
  { id: "ayush_general_v1", label: "AYUSH / Ayurveda" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

const CLINICAL_STAGES = [
  { id: "chief_complaint", label: "Chief Complaint", match: ["chief", "complaint", "primary", "issue"] },
  { id: "duration", label: "Duration & Timeline", match: ["duration", "timeline", "when", "how_long"] },
  { id: "symptoms", label: "Associated Symptoms", match: ["symptom", "associated", "severity", "pain"] },
  { id: "medical_history", label: "Medical & Surgical History", match: ["history", "past", "chronic", "surger"] },
  { id: "medications", label: "Current Medications", match: ["medication", "medicine", "drug", "dose"] },
  { id: "allergies", label: "Allergies & Reactions", match: ["allergy", "reaction"] },
  { id: "investigations", label: "Previous Investigations", match: ["investigation", "test", "report", "scan", "xray"] },
];

function mapVoiceError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return "Your session has expired. Please sign in again.";
      case 403:
        return "You don't have permission to continue this intake.";
      case 404:
        return "This intake session could not be found.";
      case 409:
        return "This intake session is already being processed or completed.";
      case 413:
        return "Your recording is too large. Please record a shorter answer.";
      case 422:
        return "The recording could not be processed. Please try again.";
      case 429:
        return "The service is temporarily busy. Please try again in a moment.";
      default:
        if (err.status >= 500) {
          return "We couldn't process your answer right now. Please try again.";
        }
        return err.detail || "Failed to process audio.";
    }
  }
  if (err instanceof TypeError && (err as TypeError).message.includes("fetch")) {
    return "Unable to connect to the server. Please check your internet connection.";
  }
  return "An unexpected error occurred while processing your voice answer.";
}

export default function PatientIntakePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intake = useIntakeStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local state for setup form
  const [encounters, setEncounters] = useState<EncounterResponse[]>([]);
  const [allActiveEncounters, setAllActiveEncounters] = useState<EncounterResponse[]>([]);
  const [isLoadingEncounters, setIsLoadingEncounters] = useState(true);
  const [selectedEncounter, setSelectedEncounter] = useState<string>("");
  const [selectedSchema, setSelectedSchema] = useState(SCHEMAS[0].id);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [setupError, setSetupError] = useState<string | null>(null);

  // Local state for answering
  const [answerText, setAnswerText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputMode, setInputMode] = useState<"carevoice_cloud" | "turn_voice" | "text" | "carevoice_local">("carevoice_cloud");

  // Auto-scroll conversation to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [intake.conversationHistory, intake.currentQuestion]);

  // Load encounters on mount
  useEffect(() => {
    async function loadEncounters() {
      try {
        const enc = await getMyEncounters();
        // All active encounters (not finalized / completed)
        const active = enc.filter((e) => e.queue_status !== "completed");
        setAllActiveEncounters(active);

        // Encounters eligible for starting a new/resumed pre-consultation
        const openIntake = active.filter((e) => e.queue_status !== "ready_for_review");
        setEncounters(openIntake);

        const targetId = searchParams.get("encounter_id");
        if (targetId) {
          const matched = active.find((e) => e.id === targetId);
          if (matched) {
            setSelectedEncounter(matched.id);
            return;
          }
        }

        if (openIntake.length > 0) {
          setSelectedEncounter(openIntake[0].id);
        } else if (active.length > 0) {
          setSelectedEncounter(active[0].id);
        }
      } catch {
        setSetupError("Could not load your encounters. Please try again.");
      } finally {
        setIsLoadingEncounters(false);
      }
    }
    loadEncounters();
  }, [searchParams]);

  // ── Start session handler ──────────────────────────────────────────
  async function handleStartSession() {
    if (!selectedEncounter) {
      setSetupError("Please select or create a consultation first.");
      return;
    }
    setSetupError(null);
    intake.setLoading(true);
    intake.setPhase("starting");
    try {
      const resp = await startSession({
        encounter_id: selectedEncounter,
        language: selectedLanguage,
        schema_id: selectedSchema,
      });
      intake.startSession({
        encounterId: selectedEncounter,
        sessionId: resp.session_id,
        schemaId: resp.schema_id,
        language: resp.language,
        firstQuestion: resp.first_question,
        firstFieldName: resp.first_question_field_name,
      });
    } catch (err) {
      intake.setPhase("error");
      if (err instanceof ApiError) {
        if (err.status === 401) return; // AuthGuard handles redirect
        if (err.status === 409) setSetupError("An intake session already exists for this encounter.");
        else if (err.status === 422) setSetupError(err.detail);
        else if (err.status >= 500) setSetupError("Server error. Please try again later.");
        else setSetupError(err.detail);
      } else if (err instanceof TypeError) {
        setSetupError("Unable to connect to the hospital service.");
      } else {
        setSetupError("An unexpected error occurred.");
      }
    } finally {
      intake.setLoading(false);
    }
  }

  // ── Submit text answer handler ─────────────────────────────────────
  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (!trimmed || !intake.sessionId || !intake.encounterId || isSubmitting || intake.isVoiceUploading) return;

    const questionAsked = intake.currentQuestion || "";
    const fieldAnswered = intake.currentFieldName || "";

    setIsSubmitting(true);
    intake.setError(null);
    intake.setVoiceError(null);
    try {
      const resp = await submitTurn({
        session_id: intake.sessionId,
        encounter_id: intake.encounterId,
        touch_answer: trimmed,
        answering_field_name: fieldAnswered || undefined,
      });
      intake.applyTurnResponse(trimmed, questionAsked, fieldAnswered, resp, false);
      setAnswerText("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return;
        intake.setError(err.detail);
      } else if (err instanceof TypeError) {
        intake.setError("Unable to connect. Please check your network.");
      } else {
        intake.setError("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Submit voice answer handler ────────────────────────────────────
  async function handleVoiceRecorded(audioBlob: Blob, mimeType: string, extension: string) {
    if (!intake.sessionId || !intake.encounterId) {
      intake.setVoiceError("No active consultation session found. Please refresh or restart intake.");
      return;
    }

    if (isSubmitting || intake.isVoiceUploading) {
      return;
    }

    const questionAsked = intake.currentQuestion || "";
    const fieldAnswered = intake.currentFieldName || "";

    setIsSubmitting(true);
    intake.setVoiceUploading(true);
    intake.setError(null);
    intake.setVoiceError(null);

    try {
      const resp = await submitVoiceTurn({
        encounter_id: intake.encounterId,
        session_id: intake.sessionId,
        answering_field_name: fieldAnswered || undefined,
        language: intake.language || undefined,
        audio_file: audioBlob,
        audio_filename: `turn_${intake.turnNumber + 1}.${extension}`,
      });

      const transcript = resp.raw_transcript || "(Voice recorded)";
      intake.applyTurnResponse(transcript, questionAsked, fieldAnswered, resp, true);
    } catch (err) {
      const userMessage = mapVoiceError(err);
      intake.setVoiceError(userMessage);
    } finally {
      setIsSubmitting(false);
      intake.setVoiceUploading(false);
    }
  }

  // ── CareVoice integration handlers ─────────────────────────────────
  async function handleCareVoiceEnsureSession() {
    if (intake.sessionId && intake.encounterId) {
      return { sessionId: intake.sessionId, encounterId: intake.encounterId };
    }
    if (!selectedEncounter) {
      setSetupError("Please select a consultation first.");
      return null;
    }
    try {
      const resp = await startSession({
        encounter_id: selectedEncounter,
        language: selectedLanguage,
        schema_id: selectedSchema,
      });
      intake.startSession({
        encounterId: selectedEncounter,
        sessionId: resp.session_id,
        schemaId: resp.schema_id,
        language: resp.language,
        firstQuestion: resp.first_question,
        firstFieldName: resp.first_question_field_name,
      });
      return { sessionId: resp.session_id, encounterId: selectedEncounter };
    } catch {
      return null;
    }
  }

  async function handleCareVoiceTurnSubmit(transcript: string, answeringFieldName?: string | null) {
    if (!intake.sessionId || !intake.encounterId) {
      throw new Error("No active intake session.");
    }
    const questionAsked = intake.currentQuestion || "";
    const fieldAnswered = answeringFieldName || intake.currentFieldName || "";

    const resp = await submitTurn({
      session_id: intake.sessionId,
      encounter_id: intake.encounterId,
      touch_answer: transcript,
      answering_field_name: fieldAnswered || undefined,
    });

    intake.applyTurnResponse(transcript, questionAsked, fieldAnswered, resp, true);
    return resp;
  }

  async function handleCareVoiceIntakeComplete() {
    await handleSubmitIntake();
  }

  const hasSubmittedRef = useRef(false);

  // ── Submit intake handler ──────────────────────────────────────────
  async function handleSubmitIntake() {
    if (!intake.sessionId || !intake.encounterId || isSubmitting || intake.isVoiceUploading) return;
    if (hasSubmittedRef.current) {
      return;
    }
    hasSubmittedRef.current = true;

    setIsSubmitting(true);
    intake.setPhase("submitting");
    intake.setError(null);
    intake.setVoiceError(null);
    try {
      const resp = await submitIntake({
        session_id: intake.sessionId,
        encounter_id: intake.encounterId,
      });
      intake.applySubmitResponse(resp);
    } catch (err) {
      hasSubmittedRef.current = false;
      intake.setPhase("in_progress");
      if (err instanceof ApiError) {
        if (err.status === 401) return;
        intake.setError(err.detail);
      } else if (err instanceof TypeError) {
        intake.setError("Unable to connect. Please check your network.");
      } else {
        intake.setError("Failed to submit. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── RENDER: Submitted state (from in-memory submit or restored ready_for_review encounter) ──
  const currentEncounter = allActiveEncounters.find((e) => e.id === selectedEncounter) || allActiveEncounters[0];
  const isEncounterAwaitingReview = currentEncounter?.queue_status === "ready_for_review";

  if ((intake.phase === "submitted" && intake.submitResult) || (!intake.sessionId && isEncounterAwaitingReview)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--ink-200)]">
          <div>
            <h1 className="text-xl font-bold text-[var(--ink-900)] flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[var(--status-success-fg)]" />
              Pre-Consultation Submitted
            </h1>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">
              Your clinical history has been captured and submitted for attending physician review.
            </p>
          </div>
          <span className="px-3 py-1 rounded text-xs font-semibold bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-bd)] self-start sm:self-auto">
            Ready for Doctor Review
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Submission Status & Action Buttons (7 cols) */}
          <div className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-[var(--status-success-fg)]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[var(--ink-900)]">Pre-Consultation Complete</h2>
                <p className="text-xs text-[var(--ink-500)] leading-relaxed">
                  Your medical history has been structured. The doctor will review your clinical history during your consultation.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--clinical-light)]/50 border border-[var(--clinical-mid)] text-xs text-[var(--ink-700)] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[var(--clinical)]">
                <Shield className="w-4 h-4 text-[var(--clinical)]" />
                <span>Physician Governance Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                AI extraction structures your answers into clinical findings. All findings remain unverified until confirmed by your attending physician. AI findings are not medical diagnoses.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                onClick={() => {
                  const encId = currentEncounter?.id || intake.encounterId;
                  if (encId) router.push(`/patient/reports/${encId}`);
                  else router.push("/patient/reports");
                }}
                size="lg"
                className="w-full sm:w-auto font-semibold cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                View Structured Pre-Consultation Report
              </Button>
              <Button
                onClick={() => { intake.reset(); router.push("/patient/dashboard"); }}
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Return to Dashboard
              </Button>
            </div>
          </div>

          {/* RIGHT: Consultation Details (5 cols) */}
          <div className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)]">
                Consultation Details
              </h3>
              <span className="text-[10px] font-mono text-[var(--ink-400)]">
                {currentEncounter?.id ? `#${currentEncounter.id.slice(0, 8)}` : ""}
              </span>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--ink-200)]">
                <span className="text-[var(--ink-500)]">Department</span>
                <span className="font-semibold text-[var(--ink-900)]">{currentEncounter?.opd_department || "General OPD"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--ink-200)]">
                <span className="text-[var(--ink-500)]">Queue Status</span>
                <span className="font-semibold text-[var(--status-success-fg)]">Ready for Doctor Review</span>
              </div>
              {intake.submitResult ? (
                <>
                  <div className="flex justify-between py-1.5 border-b border-[var(--ink-200)]">
                    <span className="text-[var(--ink-500)]">Clinical Fields Captured</span>
                    <span className="font-semibold font-mono text-[var(--ink-900)]">{intake.submitResult.total_entities}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[var(--ink-200)]">
                    <span className="text-[var(--ink-500)]">Timeline Events</span>
                    <span className="font-semibold font-mono text-[var(--ink-900)]">{intake.submitResult.timeline_events}</span>
                  </div>
                  {intake.submitResult.summary_preview && (
                    <div className="pt-2">
                      <p className="text-[11px] font-semibold text-[var(--ink-700)] mb-1">Chief Complaint Summary</p>
                      <div className="p-2.5 rounded bg-[var(--bg-surface-2)] border border-[var(--ink-200)] text-[11px] text-[var(--ink-800)] leading-relaxed font-mono">
                        {intake.submitResult.summary_preview}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="pt-2 text-[11px] text-[var(--ink-500)] italic">
                  Your intake conversation was recorded and submitted. A doctor will review your clinical history during your consultation.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Session start / setup ──────────────────────────────────
  if (intake.phase === "idle" || intake.phase === "starting" || intake.phase === "error") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--ink-200)]">
          <div>
            <h1 className="text-xl font-bold text-[var(--ink-900)] flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-[var(--clinical)]" />
              Pre-Consultation Clinical Intake
            </h1>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">
              CareFlow AI clinical intake workstation — answer guided questions about your symptoms and medical history by voice or text.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-[var(--clinical)] bg-[var(--clinical-light)] px-2.5 py-1 rounded border border-[var(--clinical-mid)] self-start sm:self-auto">
            Clinical Workstation
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Setup form (7 cols) */}
          <div className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] mb-4 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-[var(--clinical)]" />
              Intake Configuration
            </h2>

            {isLoadingEncounters ? (
              <div className="flex items-center gap-3 text-[var(--ink-500)] py-8 justify-center text-xs">
                <Spinner /> Loading your consultations…
              </div>
            ) : allActiveEncounters.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-xs text-[var(--ink-500)]">No active consultation found.</p>
                <Button onClick={() => router.push("/patient/dashboard")} variant="secondary" size="sm" className="cursor-pointer">
                  Go to Dashboard to Start One
                </Button>
              </div>
            ) : encounters.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-xs text-[var(--ink-500)]">All your active consultations have been submitted for doctor review.</p>
                <Button onClick={() => router.push("/patient/dashboard")} variant="secondary" size="sm" className="cursor-pointer">
                  Return to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Encounter selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="encounter" className="text-xs font-semibold text-[var(--ink-900)]">
                    Select Consultation
                  </label>
                  <select
                    id="encounter"
                    value={selectedEncounter}
                    onChange={(e) => setSelectedEncounter(e.target.value)}
                    className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.opd_department || "General OPD"} — {enc.queue_status.replace(/_/g, " ")} (#{enc.id.slice(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Schema selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="schema" className="text-xs font-semibold text-[var(--ink-900)]">
                    Intake Protocol / Department
                  </label>
                  <select
                    id="schema"
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {SCHEMAS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Language selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="language" className="text-xs font-semibold text-[var(--ink-900)]">
                    Language Preference
                  </label>
                  <select
                    id="language"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="h-10 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {setupError && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)]">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full cursor-pointer font-semibold"
                  onClick={handleStartSession}
                  isLoading={intake.isLoading}
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Start Pre-Consultation
                </Button>
              </div>
            )}
          </div>

          {/* RIGHT: "How Pre-Consultation Works" Clinical Panel (5 cols) */}
          <div className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden space-y-0">
            <div className="px-4 py-3 bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--clinical)]" />
                How Pre-Consultation Works
              </h3>
            </div>
            <div className="p-4 space-y-4 text-xs text-[var(--ink-700)]">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-semibold text-[var(--ink-900)]">Conversational Intake</p>
                  <p className="text-[11px] text-[var(--ink-500)] leading-relaxed mt-0.5">
                    Speak naturally or type your responses. CareVoice guides you through questions regarding your symptoms and duration.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-semibold text-[var(--ink-900)]">Clinical Entity Structuring</p>
                  <p className="text-[11px] text-[var(--ink-500)] leading-relaxed mt-0.5">
                    Your answers are extracted in real-time into standardized medical findings (chief complaint, past history, medications).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--clinical-light)] text-[var(--clinical)] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-semibold text-[var(--ink-900)]">Physician Review &amp; Confirmation</p>
                  <p className="text-[11px] text-[var(--ink-500)] leading-relaxed mt-0.5">
                    All AI-extracted entities remain unverified until the doctor reviews and confirms them during your clinical encounter.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--ink-200)]">
                <div className="p-3 rounded bg-[var(--clinical-light)]/40 border border-[var(--clinical-mid)] text-[11px] text-[var(--ink-800)] leading-relaxed flex items-start gap-2">
                  <Shield className="w-4 h-4 text-[var(--clinical)] flex-shrink-0 mt-0.5" />
                  <span>
                    Supported in English, Hindi, and Hinglish. You can toggle between voice and text at any point during intake.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Active intake session ──────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Workstation Header */}
      <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-[var(--ink-900)] flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-[var(--clinical)]" />
              Pre-Consultation Intake
            </h1>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[var(--clinical-light)] text-[var(--clinical)] border border-[var(--clinical-mid)]">
              {currentEncounter?.opd_department || "General OPD"}
            </span>
          </div>
          <p className="text-[11px] text-[var(--ink-500)] mt-0.5">
            {intake.pathwayComplete ? "All questions completed · Ready for doctor review" : `Question ${intake.turnNumber + 1} in progress`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {intake.turnNumber > 0 && (
            <span className="text-[11px] font-mono font-semibold text-[var(--clinical)] bg-[var(--bg-surface-2)] px-2.5 py-1 rounded border border-[var(--ink-200)]">
              {intake.turnNumber} answered
            </span>
          )}
          {intake.language && (
            <span className="text-[11px] text-[var(--ink-500)] bg-[var(--bg-surface-2)] px-2.5 py-1 rounded border border-[var(--ink-200)] uppercase font-mono">
              {intake.language}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar across workspace */}
      {intake.turnNumber > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3 space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[var(--ink-700)]">Clinical Intake Progress</span>
            <span className="font-mono text-[var(--clinical)] font-bold">
              {intake.pathwayComplete ? "100%" : `${Math.min(90, intake.turnNumber * 18)}%`}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--ink-200)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--clinical)] rounded-full transition-all duration-500"
              style={{ width: intake.pathwayComplete ? "100%" : `${Math.min(90, intake.turnNumber * 18)}%` }}
            />
          </div>
        </div>
      )}

      {/* TWO-COLUMN CLINICAL WORKSTATION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: 65% (7 cols) — CareVoice, conversation history, controls */}
        <div className="lg:col-span-7 space-y-4">
          {/* Conversation history area */}
          <div
            ref={scrollRef}
            className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 max-h-[420px] overflow-y-auto space-y-4 scroll-smooth shadow-xs"
          >
            {/* History */}
            <ConversationHistory history={intake.conversationHistory} />

            {/* Current active question */}
            {intake.currentQuestion && !intake.pathwayComplete && (
              <div className="flex items-start gap-3 pt-2">
                <div className="flex-shrink-0 w-7 h-7 rounded-md bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center">
                  <Stethoscope className="w-3.5 h-3.5 text-[var(--clinical)]" />
                </div>
                <div className="flex-1 bg-[var(--bg-surface-2)] border border-[var(--clinical-mid)] rounded-lg px-3.5 py-3 shadow-xs">
                  <p className="text-xs font-bold text-[var(--clinical)] uppercase tracking-wider mb-1">Current Question</p>
                  <p className="text-xs font-semibold text-[var(--ink-900)] leading-relaxed">{intake.currentQuestion}</p>
                </div>
              </div>
            )}
          </div>

          {/* General error message */}
          {intake.error && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)]">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <span>{intake.error}</span>
                <button onClick={() => intake.setError(null)} className="ml-2 underline text-xs font-medium cursor-pointer">
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Real-time backend transcript feedback banner */}
          {intake.lastTranscript && !intake.pathwayComplete && (
            <div className="p-2.5 rounded-md bg-[var(--clinical-light)]/50 border border-[var(--clinical-mid)] text-xs text-[var(--ink-900)] flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Mic className="w-3.5 h-3.5 text-[var(--clinical)] mt-0.5 flex-shrink-0" />
                <div className="min-w-0 truncate">
                  <span className="font-semibold text-[var(--clinical)]">Captured transcript: </span>
                  <span className="italic font-medium">&ldquo;{intake.lastTranscript}&rdquo;</span>
                  {intake.lastDetectedLanguage && (
                    <span className="ml-2 text-[10px] text-[var(--ink-500)] bg-[var(--bg-surface)] px-1.5 py-0.2 rounded border border-[var(--ink-200)] font-normal">
                      {intake.lastDetectedLanguage}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => intake.clearLastTranscript()}
                className="text-[var(--ink-500)] hover:text-[var(--ink-900)] p-0.5 cursor-pointer flex-shrink-0"
                aria-label="Dismiss transcript preview"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Answer Input or Completion Card */}
          {intake.pathwayComplete ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--clinical-mid)] rounded-lg p-6 text-center space-y-3 shadow-xs">
              <CheckCircle2 className="w-9 h-9 text-[var(--status-success-fg)] mx-auto" />
              <h2 className="text-base font-bold text-[var(--ink-900)]">All Questions Completed</h2>
              <p className="text-xs text-[var(--ink-500)] max-w-md mx-auto">
                Your pre-consultation responses have been recorded and structured. Submit now for attending physician review.
              </p>
              <Button
                size="lg"
                onClick={handleSubmitIntake}
                isLoading={isSubmitting || intake.phase === "submitting"}
                className="w-full sm:w-auto px-8 cursor-pointer font-semibold"
              >
                Submit for Doctor Review
              </Button>
            </div>
          ) : intake.currentQuestion ? (
            <div className="space-y-3">
              {/* Method Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[var(--bg-surface-2)] rounded-lg border border-[var(--ink-200)]">
                <button
                  type="button"
                  onClick={() => setInputMode("carevoice_cloud")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    inputMode === "carevoice_cloud"
                      ? "bg-[var(--bg-surface)] text-[var(--clinical)] shadow-xs"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                  }`}
                  aria-label="Switch to CareVoice AI voice"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>CareVoice AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("turn_voice")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    inputMode === "turn_voice"
                      ? "bg-[var(--bg-surface)] text-[var(--ink-900)] shadow-xs"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                  }`}
                  aria-label="Switch to Push-to-Talk voice intake"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Push-to-Talk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    inputMode === "text"
                      ? "bg-[var(--bg-surface)] text-[var(--ink-900)] shadow-xs"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                  }`}
                  aria-label="Switch to typed text answer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Type Answer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("carevoice_local")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    inputMode === "carevoice_local"
                      ? "bg-[var(--bg-surface)] text-[var(--clinical)] shadow-xs"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                  }`}
                  aria-label="Switch to CareVoice local fallback"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Local Fallback</span>
                </button>
              </div>

              {/* Mode 1: CareVoice AI (ElevenLabs Conversational AI) */}
              {inputMode === "carevoice_cloud" && (
                <div className="space-y-2">
                  <CareVoiceConversation
                    sessionId={intake.sessionId}
                    encounterId={intake.encounterId}
                    currentQuestion={intake.currentQuestion}
                    currentFieldName={intake.currentFieldName}
                    initialLanguage={intake.conversationHistory.length > 0 ? intake.lastDetectedLanguage : null}
                    pathwayComplete={intake.pathwayComplete}
                    onEnsureSession={handleCareVoiceEnsureSession}
                    onTurnSubmit={handleCareVoiceTurnSubmit}
                    onIntakeComplete={handleCareVoiceIntakeComplete}
                  />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setInputMode("text")}
                      className="text-[11px] text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                    >
                      Prefer to type your answer instead? Switch to text intake
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 2: Push-to-Talk Voice Turn */}
              {inputMode === "turn_voice" && (
                <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 shadow-xs space-y-3">
                  <div className="w-full">
                    <VoiceRecorder
                      onRecorded={handleVoiceRecorded}
                      disabled={isSubmitting || !!answerText.trim()}
                      isUploading={intake.isVoiceUploading}
                      uploadError={intake.voiceError}
                      onClearError={() => intake.setVoiceError(null)}
                    />
                  </div>
                  <div className="text-center pt-1 border-t border-[var(--ink-200)]">
                    <button
                      type="button"
                      onClick={() => setInputMode("text")}
                      className="text-[11px] text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                    >
                      Or type your response
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 3: Text Input */}
              {inputMode === "text" && (
                <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-3.5 shadow-xs space-y-2.5">
                  <form onSubmit={handleSubmitAnswer} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label htmlFor="answer-input" className="sr-only">
                        Your answer
                      </label>
                      <textarea
                        id="answer-input"
                        rows={2}
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Type your medical answer here… (e.g., 3 days, mild, worse when walking)"
                        className="w-full resize-none rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] p-2.5 text-xs text-[var(--ink-900)] placeholder-[var(--ink-400)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition"
                        disabled={isSubmitting || intake.isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitAnswer(e);
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="md"
                      disabled={!answerText.trim() || isSubmitting || intake.isLoading}
                      isLoading={isSubmitting}
                      className="h-9 px-3.5 flex-shrink-0 cursor-pointer text-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </form>
                  <p className="text-[10px] text-[var(--ink-500)]">
                    Press <kbd className="px-1 py-0.5 bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded text-[10px] font-mono text-[var(--ink-700)]">Enter</kbd> to send,{" "}
                    <kbd className="px-1 py-0.5 bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded text-[10px] font-mono text-[var(--ink-700)]">Shift+Enter</kbd> for a new line
                  </p>
                </div>
              )}

              {/* Mode 4: Self-Hosted CareVoice Local (LiveKit Fallback) */}
              {inputMode === "carevoice_local" && (
                <div className="space-y-2">
                  <CareVoiceLiveKitConversation
                    sessionId={intake.sessionId}
                    encounterId={intake.encounterId}
                    currentQuestion={intake.currentQuestion}
                    currentFieldName={intake.currentFieldName}
                    initialLanguage={intake.language}
                    pathwayComplete={intake.pathwayComplete}
                    onEnsureSession={handleCareVoiceEnsureSession}
                    onTurnSubmit={handleCareVoiceTurnSubmit}
                    onTurnResult={(resp) => {
                      intake.applyTurnResponse(
                        resp.raw_transcript || "Voice response",
                        intake.currentQuestion || "",
                        intake.currentFieldName || "",
                        resp,
                        true
                      );
                    }}
                    onIntakeComplete={handleCareVoiceIntakeComplete}
                  />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setInputMode("text")}
                      className="text-[11px] text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                    >
                      Prefer to type your answer instead? Switch to text intake
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* RIGHT COLUMN: 35% (5 cols) — Clinical intake progress & AI extraction */}
        <div className="lg:col-span-5 space-y-4">
          {/* INTAKE PROGRESS PANEL */}
          <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[var(--clinical)]" />
                Intake Progress
              </h3>
              <span className="text-[10px] font-mono text-[var(--ink-400)]">
                {intake.turnNumber} turns recorded
              </span>
            </div>

            <div className="p-3.5 space-y-2 text-xs">
              {CLINICAL_STAGES.map((stg, idx) => {
                const isAnswered =
                  intake.conversationHistory.some((h) =>
                    stg.match.some((m) => (h.fieldName || "").toLowerCase().includes(m))
                  ) || idx < intake.turnNumber;

                const isCurrent =
                  !isAnswered &&
                  (!intake.pathwayComplete && (
                    stg.match.some((m) => (intake.currentFieldName || "").toLowerCase().includes(m)) ||
                    idx === intake.turnNumber
                  ));

                return (
                  <div
                    key={stg.id}
                    className={`flex items-center justify-between p-2 rounded-md transition-colors ${
                      isCurrent
                        ? "bg-[var(--clinical-light)] text-[var(--clinical)] font-semibold border border-[var(--clinical-mid)]"
                        : isAnswered
                        ? "text-[var(--ink-900)] bg-[var(--bg-surface-2)]"
                        : "text-[var(--ink-400)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isAnswered ? (
                        <div className="w-4 h-4 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-bd)] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-4 h-4 rounded-full bg-[var(--clinical)] flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[var(--ink-200)] flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-[var(--ink-300)]" />
                        </div>
                      )}
                      <span className="text-xs">{stg.label}</span>
                    </div>

                    <span className="text-[10px] font-mono">
                      {isAnswered ? (
                        <span className="text-[var(--status-success-fg)] font-semibold">Captured</span>
                      ) : isCurrent ? (
                        <span className="text-[var(--clinical)] font-semibold">In Progress</span>
                      ) : (
                        <span className="text-[var(--ink-400)]">Pending</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Extracted Entities Panel */}
          {intake.allEntities.length > 0 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-[var(--clinical-light)]/50 border-b border-[var(--clinical-mid)] flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--clinical)] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--clinical)]" />
                  AI Extraction · Physician Verify
                </h3>
                <span className="text-[10px] font-bold text-[var(--clinical)] bg-white px-1.5 py-0.2 rounded border border-[var(--clinical-mid)]">
                  {intake.allEntities.length} findings
                </span>
              </div>
              <div className="p-3">
                <ExtractedEntities entities={intake.allEntities} />
              </div>
            </div>
          )}

          {/* Clinical Governance Notice */}
          <div className="rounded-lg bg-[var(--clinical-light)]/30 border border-[var(--clinical-mid)] p-3 text-[11px] text-[var(--ink-700)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[var(--clinical)] text-xs">
              <Shield className="w-3.5 h-3.5 text-[var(--clinical)]" />
              <span>Attending Physician Review</span>
            </div>
            <p className="leading-relaxed">
              CareFlow AI structures your answers into clinical findings. All findings remain unverified until explicitly confirmed by your doctor during OPD consultation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}