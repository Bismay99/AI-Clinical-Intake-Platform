"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, Send, CheckCircle2, AlertCircle, ArrowLeft, Mic, X, Sparkles, Cpu, ClipboardList } from "lucide-react";
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
    console.debug("[handleVoiceRecorded] Voice recorded event received:", {
      blobSize: audioBlob.size,
      mimeType,
      extension,
      sessionId: intake.sessionId,
      encounterId: intake.encounterId,
      isSubmitting,
      isVoiceUploading: intake.isVoiceUploading,
    });

    if (!intake.sessionId || !intake.encounterId) {
      console.warn("[handleVoiceRecorded] Missing sessionId or encounterId. Cannot submit voice turn.", {
        sessionId: intake.sessionId,
        encounterId: intake.encounterId,
      });
      intake.setVoiceError("No active consultation session found. Please refresh or restart intake.");
      return;
    }

    if (isSubmitting || intake.isVoiceUploading) {
      console.warn("[handleVoiceRecorded] Submission already in progress. Ignoring duplicate trigger.");
      return;
    }

    const questionAsked = intake.currentQuestion || "";
    const fieldAnswered = intake.currentFieldName || "";

    setIsSubmitting(true);
    intake.setVoiceUploading(true);
    intake.setError(null);
    intake.setVoiceError(null);

    try {
      console.debug("[handleVoiceRecorded] Calling submitVoiceTurn with encounterId:", intake.encounterId, "sessionId:", intake.sessionId);
      const resp = await submitVoiceTurn({
        encounter_id: intake.encounterId,
        session_id: intake.sessionId,
        answering_field_name: fieldAnswered || undefined,
        language: intake.language || undefined,
        audio_file: audioBlob,
        audio_filename: `turn_${intake.turnNumber + 1}.${extension}`,
      });

      const transcript = resp.raw_transcript || "(Voice recorded)";
      console.debug("[handleVoiceRecorded] Voice turn submitted successfully. Transcript:", transcript);
      intake.applyTurnResponse(transcript, questionAsked, fieldAnswered, resp, true);
    } catch (err) {
      console.error("[handleVoiceRecorded] Error during submitVoiceTurn:", err);
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
      console.warn("[CareVoice] Intake already submitted. Skipping duplicate submission.");
      return;
    }
    hasSubmittedRef.current = true;

    console.log("[CareVoice DEBUG] SUBMIT INTAKE:", {
      reason: "backend_confirmed_pathway_complete",
      sessionId: intake.sessionId,
      encounterId: intake.encounterId,
      completionState: intake.pathwayComplete,
    });

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
      <div className="max-w-2xl mx-auto">
        <Card className="border-[var(--status-success-bd)]">
          <CardContent className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] mb-6">
              <CheckCircle2 className="w-8 h-8 text-[var(--status-success-fg)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--ink-900)] mb-2">Pre-Consultation Complete</h1>
            <p className="text-[var(--ink-500)] mb-8">
              Your medical history has been securely submitted for doctor review.
            </p>

            <div className="bg-[var(--bg-surface-2)] rounded-lg p-6 text-left space-y-3 mb-8 border border-[var(--ink-200)]">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-500)]">Department</span>
                <span className="font-medium text-[var(--ink-900)]">{currentEncounter?.opd_department || "General"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--ink-500)]">Status</span>
                <span className="font-medium text-[var(--status-success-fg)]">Ready for Doctor Review</span>
              </div>
              {intake.submitResult ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--ink-500)]">Clinical fields captured</span>
                    <span className="font-medium text-[var(--ink-900)]">{intake.submitResult.total_entities}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--ink-500)]">Timeline events</span>
                    <span className="font-medium text-[var(--ink-900)]">{intake.submitResult.timeline_events}</span>
                  </div>
                  {intake.submitResult.summary_preview && (
                    <div className="pt-3 border-t border-[var(--ink-200)]">
                      <p className="text-xs text-[var(--ink-500)] mb-1">Summary preview</p>
                      <p className="text-sm text-[var(--ink-900)]">{intake.submitResult.summary_preview}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="pt-3 border-t border-[var(--ink-200)]">
                  <p className="text-xs text-[var(--ink-500)]">
                    Your intake conversation was recorded and submitted. A doctor will review your clinical history during your consultation.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── RENDER: Session start / setup ──────────────────────────────────
  if (intake.phase === "idle" || intake.phase === "starting" || intake.phase === "error") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-[var(--clinical)]" />
            Pre-Consultation
          </h1>
          <p className="text-[var(--ink-500)] mt-1 text-sm">
            Begin your clinical intake. Answer questions about your symptoms and medical history by voice or text.
          </p>
        </div>

        <Card>
          <CardContent className="py-6">
            {isLoadingEncounters ? (
              <div className="flex items-center gap-3 text-[var(--ink-500)] py-8 justify-center">
                <Spinner /> Loading your consultations…
              </div>
            ) : allActiveEncounters.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[var(--ink-500)] mb-4">No active consultation found.</p>
                <Button onClick={() => router.push("/patient/dashboard")} variant="secondary" className="cursor-pointer">
                  Go to Dashboard to Start One
                </Button>
              </div>
            ) : encounters.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[var(--ink-500)] mb-4">All your active consultations have been submitted for doctor review.</p>
                <Button onClick={() => router.push("/patient/dashboard")} variant="secondary" className="cursor-pointer">
                  Return to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Encounter selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="encounter" className="text-sm font-medium text-[var(--ink-900)]">Consultation</label>
                  <select
                    id="encounter"
                    value={selectedEncounter}
                    onChange={(e) => setSelectedEncounter(e.target.value)}
                    className="h-11 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.opd_department || "General"} — {enc.queue_status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Schema selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="schema" className="text-sm font-medium text-[var(--ink-900)]">Intake Type</label>
                  <select
                    id="schema"
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    className="h-11 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {SCHEMAS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Language selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="language" className="text-sm font-medium text-[var(--ink-900)]">Language</label>
                  <select
                    id="language"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="h-11 w-full rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {setupError && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)]">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full cursor-pointer"
                  onClick={handleStartSession}
                  isLoading={intake.isLoading}
                >
                  Start Pre-Consultation
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── RENDER: Active intake session ──────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: "calc(100vh - 180px)" }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[var(--clinical)]" />
            Pre-Consultation
          </h1>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            {intake.pathwayComplete ? "All questions completed" : `Question ${intake.turnNumber + 1} in progress`}
          </p>
        </div>
        {intake.turnNumber > 0 && (
          <span className="text-xs text-[var(--ink-500)] bg-[var(--bg-surface-2)] px-3 py-1.5 rounded-md border border-[var(--ink-200)]">
            {intake.turnNumber} answered
          </span>
        )}
      </div>

      {/* Progress bar — based on turn count, capped proportionally */}
      {intake.turnNumber > 0 && (
        <div className="mb-6">
          <div className="h-2 bg-[var(--ink-200)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--clinical)] rounded-full transition-all duration-500"
              style={{ width: intake.pathwayComplete ? "100%" : `${Math.min(90, intake.turnNumber * 18)}%` }}
            />
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-1.5">
            {intake.pathwayComplete ? "History complete — ready to submit" : "History in progress"}
          </p>
        </div>
      )}

      {/* Conversation area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 mb-6 scroll-smooth">
        {/* History */}
        <ConversationHistory history={intake.conversationHistory} />

        {/* Current question */}
        {intake.currentQuestion && !intake.pathwayComplete && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-[var(--clinical-light)] border border-[var(--clinical-mid)] flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-[var(--clinical)]" />
            </div>
            <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--clinical-mid)] rounded-lg px-4 py-3.5 shadow-[var(--shadow-xs)]">
              <p className="text-sm font-semibold text-[var(--ink-900)]">{intake.currentQuestion}</p>
            </div>
          </div>
        )}
      </div>

      {/* Extracted entities panel */}
      {intake.allEntities.length > 0 && (
        <div className="mb-6">
          <ExtractedEntities entities={intake.allEntities} />
        </div>
      )}

      {/* General error message */}
      {intake.error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-sm text-[var(--status-error-fg)]">
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
        <div className="mb-4 p-3 rounded-lg bg-[var(--clinical-light)]/50 border border-[var(--clinical-mid)] text-xs text-[var(--ink-900)] flex items-start justify-between gap-2 animate-fadeIn">
          <div className="flex items-start gap-2">
            <Mic className="w-4 h-4 text-[var(--clinical)] mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-[var(--clinical)]">Captured voice transcript: </span>
              <span className="italic font-medium">&ldquo;{intake.lastTranscript}&rdquo;</span>
              {intake.lastDetectedLanguage && (
                <span className="ml-2 text-[var(--ink-500)] bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--ink-200)] font-normal">
                  Language: {intake.lastDetectedLanguage}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => intake.clearLastTranscript()}
            className="text-[var(--ink-500)] hover:text-[var(--ink-900)] p-1 cursor-pointer"
            aria-label="Dismiss transcript preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Answer input or completion actions */}
      {intake.pathwayComplete ? (
        <Card className="border-[var(--clinical-mid)]">
          <CardContent className="py-6">
            <div className="text-center">
              <CheckCircle2 className="w-9 h-9 text-[var(--status-success-fg)] mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-1">All Questions Completed</h2>
              <p className="text-sm text-[var(--ink-500)] mb-6">
                Your history has been captured and structured. Submit it for doctor review.
              </p>
              <Button
                size="lg"
                onClick={handleSubmitIntake}
                isLoading={isSubmitting || intake.phase === "submitting"}
                className="w-full sm:w-auto px-10 cursor-pointer"
              >
                Submit for Doctor Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : intake.currentQuestion ? (
        <div className="space-y-4">
          {/* Method Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[var(--bg-surface-2)] rounded-lg border border-[var(--ink-200)]">
            <button
              type="button"
              onClick={() => setInputMode("carevoice_cloud")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                inputMode === "carevoice_cloud"
                  ? "bg-[var(--bg-surface)] text-[var(--clinical)] shadow-[var(--shadow-xs)]"
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                inputMode === "turn_voice"
                  ? "bg-[var(--bg-surface)] text-[var(--ink-900)] shadow-[var(--shadow-xs)]"
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                inputMode === "text"
                  ? "bg-[var(--bg-surface)] text-[var(--ink-900)] shadow-[var(--shadow-xs)]"
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
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                inputMode === "carevoice_local"
                  ? "bg-[var(--bg-surface)] text-[var(--clinical)] shadow-[var(--shadow-xs)]"
                  : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
              }`}
              aria-label="Switch to CareVoice local self-hosted fallback"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>CareVoice (Local)</span>
            </button>
          </div>

          {/* Mode 1: CareVoice AI (ElevenLabs Conversational AI) */}
          {inputMode === "carevoice_cloud" && (
            <div className="space-y-3">
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
                  className="text-xs text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                >
                  Prefer to type your answer instead? Switch to text intake
                </button>
              </div>
            </div>
          )}

          {/* Mode 2: Push-to-Talk Voice Turn */}
          {inputMode === "turn_voice" && (
            <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 shadow-[var(--shadow-sm)] space-y-4">
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
                  className="text-xs text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                >
                  Or type your response
                </button>
              </div>
            </div>
          )}

          {/* Mode 3: Text Input */}
          {inputMode === "text" && (
            <div className="bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-lg p-4 shadow-[var(--shadow-sm)] space-y-3">
              <form onSubmit={handleSubmitAnswer} className="flex gap-2.5 items-end">
                <div className="flex-1">
                  <label htmlFor="answer-input" className="sr-only">
                    Your answer
                  </label>
                  <textarea
                    id="answer-input"
                    rows={2}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Type your medical answer here… (e.g. 3 days, mild, worse when walking)"
                    className="w-full resize-none rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--ink-900)] placeholder-[var(--ink-400)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition"
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
                  className="h-11 px-4 flex-shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <p className="text-[11px] text-[var(--ink-500)]">
                Press <kbd className="px-1 py-0.5 bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded text-[10px] font-mono text-[var(--ink-700)]">Enter</kbd> to send,{" "}
                <kbd className="px-1 py-0.5 bg-[var(--bg-surface-2)] border border-[var(--ink-200)] rounded text-[10px] font-mono text-[var(--ink-700)]">Shift+Enter</kbd> for a new line
              </p>
            </div>
          )}

          {/* Mode 4: Self-Hosted CareVoice Local (LiveKit Fallback) */}
          {inputMode === "carevoice_local" && (
            <div className="space-y-3">
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
                  className="text-xs text-[var(--ink-500)] hover:text-[var(--clinical)] hover:underline cursor-pointer"
                >
                  Prefer to type your answer instead? Switch to text intake
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}