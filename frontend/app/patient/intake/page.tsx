"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, Send, CheckCircle2, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ConversationHistory } from "@/components/patient/ConversationHistory";
import { ExtractedEntities } from "@/components/patient/ExtractedEntities";
import { useAuthStore } from "@/stores/auth.store";
import { useIntakeStore } from "@/stores/intake.store";
import { getMyEncounters } from "@/services/patient.service";
import { startSession, submitTurn, submitIntake } from "@/services/intake.service";
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

export default function PatientIntakePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const intake = useIntakeStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local state for setup form
  const [encounters, setEncounters] = useState<EncounterResponse[]>([]);
  const [isLoadingEncounters, setIsLoadingEncounters] = useState(true);
  const [selectedEncounter, setSelectedEncounter] = useState<string>("");
  const [selectedSchema, setSelectedSchema] = useState(SCHEMAS[0].id);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [setupError, setSetupError] = useState<string | null>(null);

  // Local state for answering
  const [answerText, setAnswerText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        // Show non-completed encounters
        const active = enc.filter(
          (e) => e.queue_status !== "completed" && e.queue_status !== "ready_for_review"
        );
        setEncounters(active);
        if (active.length > 0) {
          setSelectedEncounter(active[0].id);
        }
      } catch {
        setSetupError("Could not load your encounters. Please try again.");
      } finally {
        setIsLoadingEncounters(false);
      }
    }
    loadEncounters();
  }, []);

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

  // ── Submit answer handler ──────────────────────────────────────────
  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (!trimmed || !intake.sessionId || !intake.encounterId || isSubmitting) return;

    const questionAsked = intake.currentQuestion || "";
    const fieldAnswered = intake.currentFieldName || "";

    setIsSubmitting(true);
    intake.setError(null);
    try {
      const resp = await submitTurn({
        session_id: intake.sessionId,
        encounter_id: intake.encounterId,
        touch_answer: trimmed,
        answering_field_name: fieldAnswered || undefined,
      });
      intake.applyTurnResponse(trimmed, questionAsked, fieldAnswered, resp);
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

  // ── Submit intake handler ──────────────────────────────────────────
  async function handleSubmitIntake() {
    if (!intake.sessionId || !intake.encounterId || isSubmitting) return;
    setIsSubmitting(true);
    intake.setPhase("submitting");
    intake.setError(null);
    try {
      const resp = await submitIntake({
        session_id: intake.sessionId,
        encounter_id: intake.encounterId,
      });
      intake.applySubmitResponse(resp);
    } catch (err) {
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

  // ── RENDER: Submitted state ────────────────────────────────────────
  if (intake.phase === "submitted" && intake.submitResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-[#12B76A] border-opacity-40">
          <CardContent className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-6">
              <CheckCircle2 className="w-8 h-8 text-[#12B76A]" />
            </div>
            <h1 className="text-2xl font-bold text-[#172033] mb-2">Pre-Consultation Complete</h1>
            <p className="text-[#667085] mb-8">
              Your medical history has been securely submitted for doctor review.
            </p>

            <div className="bg-[#F7F9FC] rounded-xl p-6 text-left space-y-3 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-[#667085]">Status</span>
                <span className="font-medium text-[#12B76A]">Ready for Doctor Review</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#667085]">Clinical fields captured</span>
                <span className="font-medium text-[#172033]">{intake.submitResult.total_entities}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#667085]">Timeline events</span>
                <span className="font-medium text-[#172033]">{intake.submitResult.timeline_events}</span>
              </div>
              {intake.submitResult.summary_preview && (
                <div className="pt-3 border-t border-[#E4E7EC]">
                  <p className="text-xs text-[#667085] mb-1">Summary preview</p>
                  <p className="text-sm text-[#172033]">{intake.submitResult.summary_preview}</p>
                </div>
              )}
            </div>

            <Button onClick={() => { intake.reset(); router.push("/patient/dashboard"); }} variant="secondary" size="lg">
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </Button>
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
          <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-[#155EEF]" />
            Pre-Consultation
          </h1>
          <p className="text-[#667085] mt-1 text-sm">
            Begin your clinical intake. Answer questions about your symptoms and medical history.
          </p>
        </div>

        <Card>
          <CardContent className="py-6">
            {isLoadingEncounters ? (
              <div className="flex items-center gap-3 text-[#667085] py-8 justify-center">
                <Spinner className="text-[#155EEF]" /> Loading your consultations…
              </div>
            ) : encounters.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#667085] mb-4">No active consultation found.</p>
                <Button onClick={() => router.push("/patient/dashboard")} variant="secondary">
                  Go to Dashboard to Start One
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Encounter selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="encounter" className="text-sm font-medium text-[#172033]">Consultation</label>
                  <select
                    id="encounter"
                    value={selectedEncounter}
                    onChange={(e) => setSelectedEncounter(e.target.value)}
                    className="h-12 w-full rounded-lg border border-[#E4E7EC] bg-white px-3 text-sm text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#155EEF]"
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
                  <label htmlFor="schema" className="text-sm font-medium text-[#172033]">Intake Type</label>
                  <select
                    id="schema"
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    className="h-12 w-full rounded-lg border border-[#E4E7EC] bg-white px-3 text-sm text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#155EEF]"
                  >
                    {SCHEMAS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Language selector */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="language" className="text-sm font-medium text-[#172033]">Language</label>
                  <select
                    id="language"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="h-12 w-full rounded-lg border border-[#E4E7EC] bg-white px-3 text-sm text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#155EEF]"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {setupError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-[#D92D20]">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full"
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
          <h1 className="text-xl font-bold text-[#172033] flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[#155EEF]" />
            Pre-Consultation
          </h1>
          <p className="text-xs text-[#667085] mt-0.5">
            {intake.pathwayComplete ? "All questions completed" : `Question ${intake.turnNumber + 1} in progress`}
          </p>
        </div>
        {intake.turnNumber > 0 && (
          <span className="text-xs text-[#667085] bg-[#F7F9FC] px-3 py-1.5 rounded-lg border border-[#E4E7EC]">
            {intake.turnNumber} answered
          </span>
        )}
      </div>

      {/* Progress bar — based on turn count, capped proportionally */}
      {intake.turnNumber > 0 && (
        <div className="mb-6">
          <div className="h-2 bg-[#E4E7EC] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#155EEF] rounded-full transition-all duration-500"
              style={{ width: intake.pathwayComplete ? "100%" : `${Math.min(90, intake.turnNumber * 18)}%` }}
            />
          </div>
          <p className="text-xs text-[#667085] mt-1.5">
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
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-[#155EEF]" />
            </div>
            <div className="flex-1 bg-white border border-[#155EEF] border-opacity-30 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-sm text-[#172033] font-medium">{intake.currentQuestion}</p>
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

      {/* Error */}
      {intake.error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-[#D92D20]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span>{intake.error}</span>
            <button onClick={() => intake.setError(null)} className="ml-2 underline text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {/* Answer input or completion actions */}
      {intake.pathwayComplete ? (
        <Card className="border-[#0F9D8A] border-opacity-30">
          <CardContent className="py-5">
            <div className="text-center">
              <CheckCircle2 className="w-8 h-8 text-[#0F9D8A] mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-[#172033] mb-1">All Questions Completed</h2>
              <p className="text-sm text-[#667085] mb-5">
                Your history has been captured. Submit it for doctor review.
              </p>
              <Button
                size="lg"
                onClick={handleSubmitIntake}
                isLoading={isSubmitting || intake.phase === "submitting"}
                className="w-full sm:w-auto px-10"
              >
                Submit for Doctor Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : intake.currentQuestion ? (
        <form onSubmit={handleSubmitAnswer} className="flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="answer" className="sr-only">Your answer</label>
            <textarea
              id="answer"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer here…"
              rows={2}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-[#E4E7EC] bg-white px-4 py-3 text-sm text-[#172033] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#155EEF] focus:border-transparent resize-none disabled:opacity-50"
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
            size="lg"
            disabled={!answerText.trim() || isSubmitting}
            className="flex-shrink-0 h-[52px] px-5"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </form>
      ) : null}
    </div>
  );
}