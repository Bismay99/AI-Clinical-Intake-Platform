"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
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
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getToken } from "@/lib/api";
import type { IntakeTurnResponse } from "@/types/intake";
import type { ConversationalLanguage } from "@/lib/languageDetection";

export interface CareVoiceLiveKitProps {
  sessionId?: string | null;
  encounterId?: string | null;
  currentQuestion?: string | null;
  currentFieldName?: string | null;
  initialLanguage?: string | null;
  pathwayComplete?: boolean;
  onEnsureSession?: () => Promise<{ sessionId: string; encounterId: string } | null>;
  onTurnSubmit?: (transcript: string, answeringFieldName?: string | null) => Promise<IntakeTurnResponse>;
  onTurnResult?: (resp: IntakeTurnResponse) => void;
  onIntakeComplete?: () => Promise<void>;
  className?: string;
}

type LiveKitAgentState = "disconnected" | "connecting" | "listening" | "thinking" | "speaking";

export function CareVoiceLiveKitConversation({
  sessionId,
  encounterId,
  currentQuestion,
  currentFieldName,
  initialLanguage,
  pathwayComplete = false,
  onEnsureSession,
  onTurnSubmit,
  onTurnResult,
  onIntakeComplete,
  className = "",
}: CareVoiceLiveKitProps) {
  const [agentState, setAgentState] = useState<LiveKitAgentState>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastPatientUtterance, setLastPatientUtterance] = useState<string | null>(null);
  const [lastAgentUtterance, setLastAgentUtterance] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<ConversationalLanguage>(() => {
    if (initialLanguage === "hi" || initialLanguage === "hinglish" || initialLanguage === "en") {
      return initialLanguage;
    }
    return "hi";
  });

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const hasCompletedSubmissionRef = useRef(false);

  // Stable references for state inside event handlers
  const currentQuestionRef = useRef(currentQuestion);
  const currentFieldNameRef = useRef(currentFieldName);
  const onTurnResultRef = useRef(onTurnResult);
  const onIntakeCompleteRef = useRef(onIntakeComplete);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
    currentFieldNameRef.current = currentFieldName;
    onTurnResultRef.current = onTurnResult;
    onIntakeCompleteRef.current = onIntakeComplete;
  }, [currentQuestion, currentFieldName, onTurnResult, onIntakeComplete]);

  // Clean up audio elements & room on unmount
  const cleanupRoom = useCallback(async () => {
    audioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {}
    });
    audioElementsRef.current = [];

    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    setAgentState("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      cleanupRoom();
    };
  }, [cleanupRoom]);

  // Handle connecting to LiveKit room
  const handleStartConversation = async () => {
    setErrorMessage(null);
    setAgentState("connecting");
    hasCompletedSubmissionRef.current = false;

    try {
      // 1. Ensure active intake session exists
      let activeSessionId = sessionId;
      let activeEncounterId = encounterId;

      if (!activeSessionId && onEnsureSession) {
        const sessionInfo = await onEnsureSession();
        if (!sessionInfo) {
          throw new Error("Could not initialize hospital intake consultation.");
        }
        activeSessionId = sessionInfo.sessionId;
        activeEncounterId = sessionInfo.encounterId;
      }

      if (!activeSessionId) {
        throw new Error("Active intake session required. Please start consultation first.");
      }

      // 2. Request LiveKit room access token from local server endpoint
      const userAuthToken = getToken() || "";
      const tokenResp = await fetch(
        `/api/livekit/token?sessionId=${encodeURIComponent(activeSessionId)}&encounterId=${encodeURIComponent(activeEncounterId || "")}&authToken=${encodeURIComponent(userAuthToken)}&currentFieldName=${encodeURIComponent(currentFieldNameRef.current || "chief_complaint")}&currentQuestion=${encodeURIComponent(currentQuestionRef.current || "")}&language=${encodeURIComponent(detectedLanguage)}`
      );

      if (!tokenResp.ok) {
        const errData = await tokenResp.json().catch(() => ({}));
        throw new Error(errData.error || `LiveKit token request failed (HTTP ${tokenResp.status})`);
      }

      const { token, url, room: roomName } = await tokenResp.json();

      // 3. Instantiate LiveKit room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Handle subscribed remote audio tracks from the CareVoice agent
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.debug("[LiveKit CareVoice] Track subscribed:", track.kind, "from", participant.identity);
          if (track.kind === "audio") {
            const audioElement = track.attach();
            document.body.appendChild(audioElement);
            audioElement.play().catch((err) => console.warn("[LiveKit CareVoice] Audio play error:", err));
            audioElementsRef.current.push(audioElement);
          }
        }
      );

      // Handle incoming data channel packets (transcripts, language detection, clinical turn results)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const str = new TextDecoder().decode(payload);
          const packet = JSON.parse(str);
          console.debug("[LiveKit CareVoice] Data packet received:", packet);

          if (packet.type === "status") {
            if (packet.status === "speaking") {
              setAgentState("speaking");
              if (packet.text) {
                setLastAgentUtterance(packet.text);
              }
            } else if (packet.status === "thinking") {
              setAgentState("thinking");
            } else if (packet.status === "listening") {
              setAgentState("listening");
            }
          } else if (packet.type === "user_transcript") {
            setLastPatientUtterance(packet.text);
          } else if (packet.type === "language_detected") {
            if (packet.language === "hi" || packet.language === "hinglish" || packet.language === "en") {
              setDetectedLanguage(packet.language);
            }
          } else if (packet.type === "turn_result") {
            const turnResponse = packet.response as IntakeTurnResponse;
            if (turnResponse) {
              if (turnResponse.next_question_field_name) {
                currentFieldNameRef.current = turnResponse.next_question_field_name;
              }
              if (turnResponse.next_question) {
                currentQuestionRef.current = turnResponse.next_question;
              }
              if (onTurnResultRef.current) {
                onTurnResultRef.current(turnResponse);
              }
            }
          } else if (packet.type === "intake_completed") {
            if (!hasCompletedSubmissionRef.current) {
              hasCompletedSubmissionRef.current = true;
              if (onIntakeCompleteRef.current) {
                onIntakeCompleteRef.current();
              }
            }
          } else if (packet.type === "error") {
            setErrorMessage(packet.detail || "Voice agent encountered an error.");
          }
        } catch (e) {
          console.error("[LiveKit CareVoice] Error parsing data packet:", e);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        console.debug("[LiveKit CareVoice] Room disconnected.");
        setAgentState("disconnected");
      });

      // 4. Connect to local LiveKit server
      await room.connect(url, token);
      console.debug("[LiveKit CareVoice] Connected to room:", roomName);

      // 5. Capture microphone track and publish
      const localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await room.localParticipant.publishTrack(localAudioTrack);
      console.debug("[LiveKit CareVoice] Patient microphone track published.");

      // 6. Send initial greeting context packet over data channel
      try {
        const initPacket = JSON.stringify({
          type: "init",
          sessionId: activeSessionId,
          encounterId: activeEncounterId,
          authToken: userAuthToken,
          currentQuestion: currentQuestionRef.current || "What brings you in today?",
          currentFieldName: currentFieldNameRef.current || "chief_complaint",
          language: detectedLanguage,
        });
        await room.localParticipant.publishData(new TextEncoder().encode(initPacket), {
          reliable: true,
        });
      } catch (sendErr) {
        console.warn("[LiveKit CareVoice] Could not send initial data packet:", sendErr);
      }

      setAgentState("listening");
    } catch (err: unknown) {
      console.error("[LiveKit CareVoice] Failed to start conversation:", err);
      const msg = err instanceof Error ? err.message : "Failed to connect to local CareVoice agent.";
      setErrorMessage(msg);
      setAgentState("disconnected");
      await cleanupRoom();
    }
  };

  const handleStopConversation = async () => {
    await cleanupRoom();
  };

  const isConnected = agentState !== "disconnected" && agentState !== "connecting";

  return (
    <div className={`rounded-2xl border border-[#E4E7EC] bg-white p-5 shadow-xs ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#155EEF]">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#172033]">CareVoice Local Engine</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LiveKit + Piper
              </span>
            </div>
            <p className="text-xs text-[#667085]">
              100% On-Device / Self-Hosted WebRTC Clinical Voice
            </p>
          </div>
        </div>

        {/* Dynamic Conversational Language Indicator */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#667085]">Language:</span>
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#155EEF]">
            {detectedLanguage === "hi"
              ? "हिन्दी (Hindi)"
              : detectedLanguage === "hinglish"
              ? "Hinglish"
              : "English"}
          </span>
        </div>
      </div>

      {/* Main interactive state card */}
      <div className="flex flex-col items-center justify-center py-6 text-center">
        {agentState === "disconnected" && (
          <div className="max-w-md space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-[#155EEF]">
              <Mic className="h-8 w-8" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-[#172033]">
                Speak Naturally with CareVoice
              </h4>
              <p className="mt-1 text-xs text-[#667085]">
                Runs fully locally on your hospital server. Zero cloud voice APIs. Supports Hindi, Indian Hinglish, and English with instant turn-taking.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleStartConversation}
              className="bg-[#155EEF] hover:bg-[#124bbf] text-white px-6 shadow-sm"
            >
              <Mic className="mr-2 h-4 w-4" /> Start Voice Consultation
            </Button>
          </div>
        )}

        {agentState === "connecting" && (
          <div className="space-y-3 py-4">
            <Loader2 className="mx-auto h-10 w-10 text-[#155EEF] animate-spin" />
            <p className="text-sm font-medium text-[#172033]">Connecting to CareVoice LiveKit room…</p>
            <p className="text-xs text-[#667085]">Setting up real-time audio pipeline and VAD</p>
          </div>
        )}

        {isConnected && (
          <div className="w-full space-y-5">
            {/* Live State Visualizer */}
            <div className="flex items-center justify-center gap-3">
              {agentState === "listening" && (
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse">
                  <Radio className="h-4 w-4" />
                  <span>Listening… (Speak in Hindi, Hinglish, or English)</span>
                </div>
              )}
              {agentState === "thinking" && (
                <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Transcribing &amp; verifying clinical symptoms…</span>
                </div>
              )}
              {agentState === "speaking" && (
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <Volume2 className="h-4 w-4 animate-bounce" />
                  <span>CareVoice speaking… (You can interrupt anytime)</span>
                </div>
              )}
            </div>

            {/* Conversation Preview Bubbles */}
            <div className="space-y-2.5 text-left max-w-lg mx-auto w-full">
              {lastAgentUtterance && (
                <div className="rounded-xl bg-[#F7F9FC] border border-[#E4E7EC] p-3 text-xs">
                  <span className="font-semibold text-[#155EEF] block mb-1">CareVoice:</span>
                  <p className="text-[#172033] font-medium leading-relaxed">{lastAgentUtterance}</p>
                </div>
              )}
              {lastPatientUtterance && (
                <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3 text-xs">
                  <span className="font-semibold text-emerald-700 block mb-1">You:</span>
                  <p className="text-[#172033] font-medium leading-relaxed">{lastPatientUtterance}</p>
                </div>
              )}
            </div>

            {/* Stop / Hang up Button */}
            <div className="pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleStopConversation}
                className="gap-1.5"
              >
                <PhoneOff className="h-4 w-4" /> End Voice Session
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#D92D20]">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Connection Error: </span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="underline font-medium hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
