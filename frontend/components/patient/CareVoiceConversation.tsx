"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { Callbacks } from "@elevenlabs/react";

type MessagePayload = Parameters<NonNullable<Callbacks["onMessage"]>>[0];
import {
  Mic,
  PhoneOff,
  Radio,
  Volume2,
  AlertCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { IntakeTurnResponse } from "@/types/intake";
import {
  type ConversationalLanguage,
  detectConversationalLanguage,
  buildImmediateLanguageLockUpdate,
  buildCareVoiceContextualUpdate,
  buildPathwayCompleteUpdate,
  formatQuestionForLanguage,
} from "@/lib/languageDetection";

export interface CareVoiceProps {
  sessionId?: string | null;
  encounterId?: string | null;
  currentQuestion?: string | null;
  currentFieldName?: string | null;
  initialLanguage?: string | null;
  pathwayComplete?: boolean;
  onEnsureSession?: () => Promise<{ sessionId: string; encounterId: string } | null>;
  onTurnSubmit?: (transcript: string, answeringFieldName?: string | null) => Promise<IntakeTurnResponse>;
  onIntakeComplete?: () => Promise<void>;
  className?: string;
}


function CareVoiceSession({
  sessionId,
  encounterId,
  currentQuestion,
  currentFieldName,
  initialLanguage,
  pathwayComplete = false,
  onEnsureSession,
  onTurnSubmit,
  onIntakeComplete,
  className = "",
}: CareVoiceProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAnalyzingTurn, setIsAnalyzingTurn] = useState(false);
  const [lastUserTranscript, setLastUserTranscript] = useState<string | null>(null);
  const [lastCareVoiceTranscript, setLastCareVoiceTranscript] = useState<string | null>(null);

  // Conversational Language tracking — determined dynamically from latest meaningful utterance
  const [activeLanguage, setActiveLanguage] = useState<ConversationalLanguage | null>(() => {
    if (initialLanguage === "hi" || initialLanguage === "hinglish" || initialLanguage === "en") {
      return initialLanguage;
    }
    return null;
  });
  const activeLanguageRef = useRef<ConversationalLanguage | null>(activeLanguage);

  // Turn accumulation and settlement refs
  const pendingTurnTranscriptRef = useRef<string>("");
  const turnDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingTurnRef = useRef(false);
  const submittedFieldsForSessionRef = useRef<Set<string>>(new Set());
  const hasCompletedSubmissionRef = useRef(false);

  // Stable references for current state inside async callbacks
  const currentFieldNameRef = useRef(currentFieldName);
  const currentQuestionRef = useRef(currentQuestion);
  const onTurnSubmitRef = useRef(onTurnSubmit);
  const onIntakeCompleteRef = useRef(onIntakeComplete);
  const pathwayCompleteRef = useRef(pathwayComplete);

  useEffect(() => {
    currentFieldNameRef.current = currentFieldName;
    currentQuestionRef.current = currentQuestion;
    onTurnSubmitRef.current = onTurnSubmit;
    onIntakeCompleteRef.current = onIntakeComplete;
    pathwayCompleteRef.current = pathwayComplete;
  }, [currentFieldName, currentQuestion, onTurnSubmit, onIntakeComplete, pathwayComplete]);

  useEffect(() => {
    activeLanguageRef.current = activeLanguage;
  }, [activeLanguage]);

  // Settle and submit exactly ONE conversational turn to the clinical backend
  const settleCurrentTurn = async (sendContextualUpdate: (text: string) => void) => {
    if (turnDebounceTimerRef.current) {
      clearTimeout(turnDebounceTimerRef.current);
      turnDebounceTimerRef.current = null;
    }

    const transcriptToSubmit = pendingTurnTranscriptRef.current.trim();
    pendingTurnTranscriptRef.current = "";

    if (!transcriptToSubmit || transcriptToSubmit.length < 2) {
      return;
    }

    if (isSubmittingTurnRef.current) {
      console.debug("[CareVoice] Turn submission already in flight. Queuing transcript:", transcriptToSubmit);
      pendingTurnTranscriptRef.current = transcriptToSubmit;
      return;
    }

    const activeField = currentFieldNameRef.current || "";
    // Per-field lock: Avoid duplicate submission for the same field
    if (activeField && submittedFieldsForSessionRef.current.has(activeField)) {
      console.debug(`[CareVoice] Field '${activeField}' already answered. Waiting for backend to advance question.`);
      return;
    }

    if (pathwayCompleteRef.current || hasCompletedSubmissionRef.current) {
      console.debug("[CareVoice] Intake already complete. Skipping turn submission.");
      return;
    }

    isSubmittingTurnRef.current = true;
    setIsAnalyzingTurn(true);
    setTurnError(null);

    try {
      if (!onTurnSubmitRef.current) {
        console.warn("[CareVoice] onTurnSubmit handler not provided.");
        return;
      }

      console.debug("[CareVoice] Submitting patient turn for field:", activeField, "transcript:", transcriptToSubmit);
      const resp = await onTurnSubmitRef.current(
        transcriptToSubmit,
        activeField || undefined
      );

      if (activeField) {
        submittedFieldsForSessionRef.current.add(activeField);
      }

      // Exact required debug log
      console.log("[CareVoice DEBUG] turn response:", {
        complete: resp.pathway_complete,
        nextQuestion: resp.next_question,
        entitiesCount: resp.entities_extracted?.length ?? 0,
        sessionId: resp.session_id,
      });

      // ── Clinical completion vs Next question ──
      if (resp.pathway_complete) {
        if (!hasCompletedSubmissionRef.current) {
          hasCompletedSubmissionRef.current = true;
          try {
            const closingUpdate = buildPathwayCompleteUpdate(activeLanguageRef.current || "en");
            sendContextualUpdate(closingUpdate);
          } catch (updateErr) {
            console.warn("[CareVoice] sendContextualUpdate failed:", updateErr);
          }
          if (onIntakeCompleteRef.current) {
            await onIntakeCompleteRef.current();
          }
        }
      } else if (resp.next_question) {
        try {
          const lang = activeLanguageRef.current || "en";
          const contextualInstruction = buildCareVoiceContextualUpdate(
            resp.next_question,
            lang
          );
          console.log("[CareVoice] Detected language:", lang);
          console.log("[CareVoice] Sending language instruction:", contextualInstruction);
          sendContextualUpdate(contextualInstruction);
        } catch (updateErr) {
          console.warn("[CareVoice] sendContextualUpdate failed:", updateErr);
        }
      }
    } catch (err: unknown) {
      console.error("[CareVoice] Error submitting turn to FastAPI:", err);
      const userMsg =
        err instanceof Error
          ? err.message
          : "Failed to record your answer with the hospital system.";
      setTurnError(userMsg);
    } finally {
      setIsAnalyzingTurn(false);
      isSubmittingTurnRef.current = false;

      // If more speech accumulated during async processing, schedule settlement
      if (pendingTurnTranscriptRef.current.trim().length > 2) {
        turnDebounceTimerRef.current = setTimeout(() => {
          settleCurrentTurn(sendContextualUpdate);
        }, 1200);
      }
    }
  };

  const conversation = useConversation({
    onConnect: () => {
      setIsInitializing(false);
      setErrorMessage(null);
      setTurnError(null);
      hasCompletedSubmissionRef.current = false;
      pendingTurnTranscriptRef.current = "";
      submittedFieldsForSessionRef.current.clear();

      // When CareVoice connects, only send contextual update if language is already known.
      if (activeLanguageRef.current && currentQuestionRef.current) {
        try {
          const initialUpdate = buildCareVoiceContextualUpdate(
            currentQuestionRef.current,
            activeLanguageRef.current
          );
          console.log("[CareVoice] Detected language onConnect:", activeLanguageRef.current);
          console.log("[CareVoice] Sending language instruction:", initialUpdate);
          conversation.sendContextualUpdate(initialUpdate);
        } catch {
          /* pre-connect update */
        }
      }
    },
    onDisconnect: () => {
      setIsInitializing(false);
      setIsAnalyzingTurn(false);
      isSubmittingTurnRef.current = false;
      if (turnDebounceTimerRef.current) {
        clearTimeout(turnDebounceTimerRef.current);
        turnDebounceTimerRef.current = null;
      }
      // CRITICAL GUARDRAIL: Disconnect must NEVER auto-submit the intake session!
      // Session remains active and resumable.
    },
    onError: (error) => {
      setIsInitializing(false);
      setIsAnalyzingTurn(false);
      isSubmittingTurnRef.current = false;
      const msg =
        typeof error === "string"
          ? error
          : (error as Error)?.message || "CareVoice encountered a connection error.";
      setErrorMessage(msg);
    },
    onMessage: (payload: MessagePayload) => {
      console.debug("[CareVoice onMessage]", {
        role: payload.role,
        source: payload.source,
        eventId: payload.event_id,
        messageLength: payload.message?.length,
      });

      // When agent starts speaking, patient turn is definitely complete — trigger settlement!
      if (payload.role === "agent") {
        setLastCareVoiceTranscript(payload.message);
        if (pendingTurnTranscriptRef.current.trim().length > 0) {
          settleCurrentTurn((txt) => conversation.sendContextualUpdate(txt));
        }
        return;
      }

      // ── Process Patient Voice Utterance ─────────────────────────────────
      if (payload.role === "user") {
        const text = payload.message?.trim();
        if (!text || text.length < 2) return;

        // ── Determine conversational language dynamically ──
        const detected = detectConversationalLanguage(text, activeLanguageRef.current || "en");
        console.log("[CareVoice] Detected language:", detected);
        setActiveLanguage(detected);
        activeLanguageRef.current = detected;

        // Send immediate language lock update to ElevenLabs
        try {
          const immediateLock = buildImmediateLanguageLockUpdate(detected);
          console.log("[CareVoice] Sending language instruction:", immediateLock);
          conversation.sendContextualUpdate(immediateLock);
        } catch (lockErr) {
          console.warn("[CareVoice] Immediate language lock send failed:", lockErr);
        }

        setLastUserTranscript(text);

        // Do not process further turns if intake is already marked complete
        if (pathwayCompleteRef.current || hasCompletedSubmissionRef.current) {
          console.debug("[CareVoice] Intake is already complete. Ignoring turn.");
          return;
        }

        // Accumulate transcript: ElevenLabs emits fragments as patient speaks.
        // If current pending already contains this fragment or vice-versa, keep the longest/most complete version.
        if (!pendingTurnTranscriptRef.current) {
          pendingTurnTranscriptRef.current = text;
        } else if (text.startsWith(pendingTurnTranscriptRef.current)) {
          // Extension of existing transcript
          pendingTurnTranscriptRef.current = text;
        } else if (!pendingTurnTranscriptRef.current.includes(text)) {
          // Additional spoken words in the same turn
          pendingTurnTranscriptRef.current = `${pendingTurnTranscriptRef.current} ${text}`.trim();
        }

        // Reset debounce timer to settle 1800ms after patient stops speaking
        if (turnDebounceTimerRef.current) {
          clearTimeout(turnDebounceTimerRef.current);
        }
        turnDebounceTimerRef.current = setTimeout(() => {
          settleCurrentTurn((txt) => conversation.sendContextualUpdate(txt));
        }, 1800);
      }
    },
  });

  const { status, isSpeaking, isListening, mode } = conversation;
  const isConnected = status === "connected";
  const isConnecting = status === "connecting" || isInitializing;

  const lastSentSyncQuestionRef = useRef<string | null>(null);

  // Sync context when the current question changes from outside
  useEffect(() => {
    if (isConnected && currentQuestion && !pathwayComplete && activeLanguageRef.current) {
      if (lastSentSyncQuestionRef.current === currentQuestion) return;
      lastSentSyncQuestionRef.current = currentQuestion;
      try {
        const update = buildCareVoiceContextualUpdate(currentQuestion, activeLanguageRef.current);
        console.log("[CareVoice] Detected language (external sync):", activeLanguageRef.current);
        console.log("[CareVoice] Sending language instruction:", update);
        conversation.sendContextualUpdate(update);
      } catch {
        /* ignore */
      }
    }
  }, [currentQuestion, isConnected, pathwayComplete, conversation]);

  // ── Start conversation handler ───────────────────────────────────────
  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    setTurnError(null);
    setIsInitializing(true);

    // 1. Ensure a valid active intake session exists in FastAPI
    if (!sessionId || !encounterId) {
      if (onEnsureSession) {
        try {
          const session = await onEnsureSession();
          if (!session) {
            setIsInitializing(false);
            setErrorMessage("Please select an encounter and start your intake session first.");
            return;
          }
        } catch {
          setIsInitializing(false);
          setErrorMessage("Could not initialize hospital intake session. Please try again.");
          return;
        }
      } else {
        setIsInitializing(false);
        setErrorMessage("No active consultation session found. Please restart intake.");
        return;
      }
    }

    // 2. Verify and request microphone permissions
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setIsInitializing(false);
      setErrorMessage("Voice conversation is not supported on this device/browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: unknown) {
      setIsInitializing(false);
      const error = err as { name?: string };
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setErrorMessage(
          "Microphone access was denied. Please allow microphone permissions in your browser to speak with CareVoice."
        );
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setErrorMessage("No microphone detected. Please connect a microphone to continue.");
      } else {
        setErrorMessage("Could not initialize microphone. Please check your device audio settings.");
      }
      return;
    }

    // 3. Fetch signed URL (or agent ID fallback) from secure server-side route
    try {
      const res = await fetch("/api/elevenlabs/signed-url");
      const data = await res.json();

      if (!res.ok || data.error) {
        setIsInitializing(false);
        setErrorMessage(
          data.error || "Could not initialize CareVoice. Please verify server configuration."
        );
        return;
      }

      if (data.signedUrl) {
        await conversation.startSession({ signedUrl: data.signedUrl });
      } else if (data.agentId) {
        await conversation.startSession({ agentId: data.agentId });
      } else {
        setIsInitializing(false);
        setErrorMessage("CareVoice configuration is incomplete. Agent ID is required.");
      }
    } catch (err: unknown) {
      setIsInitializing(false);
      console.error("[CareVoice] Failed to start conversation:", err);
      setErrorMessage("Unable to connect to CareVoice server. Please check your internet connection.");
    }
  }, [conversation, sessionId, encounterId, onEnsureSession]);

  // ── Stop conversation handler ────────────────────────────────────────
  const handleStop = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error("[CareVoice] Error ending session:", err);
    }
  }, [conversation]);

  return (
    <div
      className={`rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-sm transition-all ${className}`}
      role="region"
      aria-label="CareVoice Conversational Intake"
    >
      {/* Screen reader live announcements */}
      <div className="sr-only" aria-live="polite">
        {isConnected && "CareVoice conversational agent is connected."}
        {isConnecting && "Connecting to CareVoice."}
        {status === "disconnected" && "CareVoice conversation ended."}
        {isSpeaking && "CareVoice is speaking."}
        {isListening && "CareVoice is listening to you."}
        {isAnalyzingTurn && "Hospital clinical system is processing your answer."}
        {errorMessage && `CareVoice error: ${errorMessage}`}
        {turnError && `Turn processing error: ${turnError}`}
      </div>

      {/* Header with Agent Branding & Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F2F4F7]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#155EEF] to-[#0F9D8A] flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--ink-900)]">CareVoice — Clinical Intake Assistant</h2>
              <span className="text-[11px] font-medium bg-[var(--clinical-light)] text-[var(--clinical)] px-2 py-0.5 rounded-full border border-[var(--clinical-mid)]">
                Connected to Clinical Engine
              </span>
            </div>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">
              Speak naturally in Hindi (हिंदी), English, or Hinglish.
            </p>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {isConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>In Call</span>
            </div>
          ) : isConnecting ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Connecting…</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium text-gray-600">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span>Ready to Start</span>
            </div>
          )}
        </div>
      </div>

      {/* Active Conversation Stage / Status Indicator */}
      <div className="py-5 flex flex-col items-center justify-center text-center">
        {isConnected ? (
          <div className="w-full max-w-md flex flex-col items-center space-y-4">
            {/* Animated Soundwave / Activity Visualization */}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-blue-50 to-teal-50 border-2 border-[#155EEF]/20">
              {isSpeaking ? (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-6 bg-[#155EEF] rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-10 bg-[#0F9D8A] rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-7 bg-[#155EEF] rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                  <span className="w-1.5 h-9 bg-[#0F9D8A] rounded-full animate-pulse" style={{ animationDelay: "75ms" }} />
                  <span className="w-1.5 h-5 bg-[#155EEF] rounded-full animate-pulse" style={{ animationDelay: "225ms" }} />
                </div>
              ) : isListening ? (
                <div className="relative">
                  <span className="absolute -inset-2 rounded-full bg-blue-400/20 animate-ping" />
                  <Mic className="w-7 h-7 text-[#155EEF]" />
                </div>
              ) : (
                <Radio className="w-7 h-7 text-[#0F9D8A] animate-pulse" />
              )}
            </div>

            {/* Speaking / Listening Activity Pill */}
            <div>
              {isAnalyzingTurn ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-xs font-semibold text-purple-700 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Processing clinical response with CareFlow AI engine…</span>
                </div>
              ) : isSpeaking || mode === "speaking" ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-[#155EEF]">
                  <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                  <span>CareVoice is speaking…</span>
                </div>
              ) : isListening || mode === "listening" ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                  <Mic className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>Listening to your answer…</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-medium text-[#667085]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0F9D8A]" />
                  <span>Ready • Speak naturally whenever you want</span>
                </div>
              )}
            </div>

            {/* Dynamic Conversational Language Indicator */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#155EEF] border border-blue-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#155EEF] animate-pulse" />
                <span>
                  Conversational Language:{" "}
                  <strong>
                    {activeLanguage === null
                      ? "Detecting..."
                      : activeLanguage === "hi"
                      ? "Hindi"
                      : activeLanguage === "hinglish"
                      ? "Hinglish"
                      : "English"}
                  </strong>
                </span>
              </span>
            </div>

            {/* Authoritative Current Question from Backend */}
            {currentQuestion && !pathwayComplete && (
              <div className="w-full bg-[#F7F9FC] border border-[#E4E7EC] rounded-xl p-3 text-left">
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#155EEF]">
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Target Clinical Question:</span>
                  </div>
                  <span className="text-[11px] font-medium text-[#667085] bg-white px-2 py-0.5 rounded border border-[#E4E7EC]">
                    {activeLanguage === null
                      ? "Clinical Intent"
                      : activeLanguage === "hi"
                      ? "Hindi"
                      : activeLanguage === "hinglish"
                      ? "Hinglish"
                      : "English"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#172033]">
                  {activeLanguage ? formatQuestionForLanguage(currentQuestion, activeLanguage) : currentQuestion}
                </p>
                {activeLanguage && activeLanguage !== "en" && formatQuestionForLanguage(currentQuestion, activeLanguage) !== currentQuestion && (
                  <p className="text-xs text-[#667085] mt-1 italic">
                    Original intent: &ldquo;{currentQuestion}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Live Captured Speech Transcript Preview */}
            {lastUserTranscript && (
              <div className="w-full bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-left">
                <p className="text-[11px] font-semibold text-[#155EEF] uppercase tracking-wider mb-0.5">
                  Captured Voice:
                </p>
                <p className="text-xs text-[#172033] italic">&ldquo;{lastUserTranscript}&rdquo;</p>
              </div>
            )}

            {/* Live CareVoice AI Speech Preview */}
            {lastCareVoiceTranscript && (
              <div className="w-full bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-left">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">
                  CareVoice:
                </p>
                <p className="text-xs text-[#172033]">{lastCareVoiceTranscript}</p>
              </div>
            )}
          </div>
        ) : isConnecting ? (
          <div className="flex flex-col items-center space-y-3 py-3">
            <Loader2 className="w-8 h-8 text-[#155EEF] animate-spin" />
            <p className="text-sm font-medium text-[#172033]">Establishing real-time voice stream…</p>
            <p className="text-xs text-[#667085]">Connecting with CareVoice conversational AI.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center space-y-2 max-w-md py-1">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#155EEF] mb-1">
              <Mic className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#172033]">
              Start Interactive Voice Pre-Consultation
            </h3>
            <p className="text-xs text-[#667085]">
              CareVoice conducts a real-time clinical dialogue and transmits each verified answer directly to the CareFlow AI adaptive clinical engine.
            </p>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        {isConnected ? (
          <Button
            type="button"
            onClick={handleStop}
            variant="danger"
            size="lg"
            className="w-full sm:w-auto min-w-[220px] bg-[#D92D20] hover:bg-[#B42318] text-white shadow-sm flex items-center justify-center gap-2"
            aria-label="End CareVoice voice conversation"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Voice Conversation</span>
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleStart}
            disabled={isConnecting || pathwayComplete}
            size="lg"
            className="w-full sm:w-auto min-w-[240px] bg-[#155EEF] hover:bg-[#124bbf] text-white shadow-sm flex items-center justify-center gap-2.5 font-medium disabled:opacity-50"
            aria-label="Start CareVoice voice conversation"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to CareVoice…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span>Start CareVoice Conversation</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Error Message Display */}
      {(errorMessage || turnError) && (
        <div
          className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-[#D92D20] flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Notice: </span>
            <span>{errorMessage || turnError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setTurnError(null);
            }}
            className="text-[#D92D20] hover:underline font-medium ml-2 text-xs"
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable CareVoice conversational component.
 * Wraps inner session with ElevenLabs ConversationProvider.
 */
export function CareVoiceConversation(props: CareVoiceProps) {
  return (
    <ConversationProvider>
      <CareVoiceSession {...props} />
    </ConversationProvider>
  );
}
