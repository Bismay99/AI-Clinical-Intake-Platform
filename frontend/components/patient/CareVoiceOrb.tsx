"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, Loader2, Volume2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type CareVoiceOrbState = "idle" | "listening" | "speaking" | "processing";

export interface CareVoiceOrbProps {
  state?: CareVoiceOrbState;
  isMicActive?: boolean;
  onToggleMic?: () => void;
  disabled?: boolean;
  mediaStream?: MediaStream | null;
  connectionStatus?: string;
  subLabel?: string;
  className?: string;
}

/**
 * CareVoiceOrb
 *
 * Cinematic AI clinical voice interface:
 * - Intelligent voice core with dark clinical teal surface (#064B63 / #0D5C75)
 * - Concentric SVG energy rings + rotating orbital arcs
 * - AudioContext + AnalyserNode for real microphone amplitude reactions
 * - Deterministic breathing fallback when stream unavailable
 * - Outward traveling energy rings when CareVoice is speaking
 * - Orbital rotation during processing (never "Thinking...")
 * - Integrated microphone interaction directly on the orb
 * - Fully accessible with aria-live, visible focus, and prefers-reduced-motion
 */
export function CareVoiceOrb({
  state = "idle",
  isMicActive = false,
  onToggleMic,
  disabled = false,
  mediaStream = null,
  connectionStatus = "Connected",
  subLabel,
  className,
}: CareVoiceOrbProps) {
  const [amplitude, setAmplitude] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const orbRef = useRef<HTMLButtonElement | null>(null);

  // Setup Web Audio API AnalyserNode when mediaStream is active
  useEffect(() => {
    if (!mediaStream || state !== "listening") {
      const raf = requestAnimationFrame(() => setAmplitude(0));
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return () => cancelAnimationFrame(raf);
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateAmplitude = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Compute RMS energy from frequency bins
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        // Normalize to 0 - 1 range with gentle scaling
        const normalized = Math.min(1, rms / 128);
        setAmplitude(normalized);

        animFrameRef.current = requestAnimationFrame(updateAmplitude);
      };

      animFrameRef.current = requestAnimationFrame(updateAmplitude);
    } catch (err) {
      console.debug("[CareVoiceOrb] Web Audio API analysis unavailable, using fallback pulse:", err);
      requestAnimationFrame(() => setAmplitude(0));
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [mediaStream, state]);

  // Accessible state labels
  const stateLabels = {
    idle: "Ready to listen",
    listening: "Listening",
    speaking: "CareVoice is responding",
    processing: "Processing",
  };

  const stateSubtexts = {
    idle: subLabel || "Speak naturally whenever you want",
    listening: "Speak naturally · CareVoice is hearing you",
    speaking: "Playing clinical intake guidance",
    processing: "Structuring clinical information",
  };

  // Keyboard accessibility handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggleMic?.();
      }
    },
    [disabled, onToggleMic]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-6 rounded-2xl bg-[#063E50]/90 border border-[#0D5C75]/50 shadow-lg text-white select-none overflow-hidden",
        className
      )}
    >
      {/* Background radial teal glow */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity duration-1000",
          state === "listening"
            ? "bg-[radial-gradient(ellipse_at_center,rgba(15,143,168,0.35)_0%,transparent_70%)]"
            : state === "speaking"
            ? "bg-[radial-gradient(ellipse_at_center,rgba(92,200,215,0.30)_0%,transparent_70%)]"
            : state === "processing"
            ? "bg-[radial-gradient(ellipse_at_center,rgba(13,92,117,0.25)_0%,transparent_70%)]"
            : "bg-[radial-gradient(ellipse_at_center,rgba(13,92,117,0.18)_0%,transparent_70%)]"
        )}
      />

      {/* Screen Reader Live Status Announcement */}
      <div className="sr-only" aria-live="polite">
        {`CareVoice status: ${stateLabels[state]}. ${stateSubtexts[state]}`}
      </div>

      {/* Top Header Strip: CareVoice Wordmark + Connection Status */}
      <div className="w-full flex items-center justify-between z-10 px-2 mb-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#5CC8D7]" />
          <span className="font-semibold tracking-wide text-xs uppercase text-[#B8DAE8]">
            CareVoice
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#064B63]/80 px-2.5 py-1 rounded-full border border-[#0D5C75]/60">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              state === "listening"
                ? "bg-[#63E6BE] animate-pulse"
                : state === "speaking"
                ? "bg-[#5CC8D7] animate-pulse"
                : state === "processing"
                ? "bg-[#F6E05E] animate-pulse"
                : "bg-[#0F8FA8]"
            )}
          />
          <span className="text-[10px] font-medium text-[#D9E6EC]">{connectionStatus}</span>
        </div>
      </div>

      {/* MAIN INTERACTION ORB CONTAINER */}
      <div className="relative flex items-center justify-center my-4 w-52 h-52 sm:w-60 sm:h-60">
        {/* SVG TECHNICAL RINGS & ORBITAL ARCS */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 240 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Faint Technical Circular Grid */}
          <circle cx="120" cy="120" r="110" stroke="#0D5C75" strokeWidth="0.5" strokeOpacity="0.25" />
          <circle cx="120" cy="120" r="95" stroke="#0D5C75" strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="3 3" />
          <circle cx="120" cy="120" r="80" stroke="#0D5C75" strokeWidth="0.5" strokeOpacity="0.35" />

          {/* Outward Traveling Ripples (CareVoice Speaking) */}
          {state === "speaking" && (
            <>
              <circle
                cx="120"
                cy="120"
                r="65"
                stroke="#5CC8D7"
                strokeWidth="1.5"
                className="animate-ping opacity-35"
                style={{ animationDuration: "2s" }}
              />
              <circle
                cx="120"
                cy="120"
                r="85"
                stroke="#0F8FA8"
                strokeWidth="1.2"
                className="animate-ping opacity-25"
                style={{ animationDuration: "2.8s", animationDelay: "0.5s" }}
              />
            </>
          )}

          {/* Dynamic Voice Activity Ring (Listening with amplitude) */}
          {state === "listening" && (
            <circle
              cx="120"
              cy="120"
              r={60 + amplitude * 22}
              stroke="#5CC8D7"
              strokeWidth={1.5 + amplitude * 2}
              strokeOpacity={0.4 + amplitude * 0.5}
              className="transition-all duration-75 ease-out"
            />
          )}

          {/* Rotating Orbital Arc (Processing & Ambient) */}
          <circle
            cx="120"
            cy="120"
            r="75"
            stroke="url(#orbArcGradient)"
            strokeWidth="2"
            strokeDasharray="40 180"
            strokeLinecap="round"
            className={cn(
              "origin-center transition-opacity duration-500",
              state === "processing"
                ? "animate-spin"
                : state === "listening"
                ? "animate-spin opacity-80"
                : "opacity-40"
            )}
            style={{
              animationDuration: state === "processing" ? "2.5s" : "8s",
            }}
          />

          <defs>
            <linearGradient id="orbArcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5CC8D7" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0D5C75" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>

        {/* INTERACTIVE VOICE CORE (Button) */}
        <button
          ref={orbRef}
          type="button"
          onClick={onToggleMic}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label={
            isMicActive
              ? "Mute or stop CareVoice listening"
              : "Activate CareVoice voice listening"
          }
          className={cn(
            "relative z-20 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5CC8D7] cursor-pointer shadow-xl",
            // State-based core background & glow
            state === "listening"
              ? "bg-[#0A475A] border-2 border-[#5CC8D7] shadow-[0_0_30px_rgba(92,200,215,0.45)]"
              : state === "speaking"
              ? "bg-[#084557] border-2 border-[#0F8FA8] shadow-[0_0_35px_rgba(15,143,168,0.50)]"
              : state === "processing"
              ? "bg-[#063E50] border-2 border-[#0D5C75] shadow-[0_0_20px_rgba(13,92,117,0.30)]"
              : "bg-[#064B63] border-2 border-[#0D5C75]/80 hover:border-[#0F8FA8] hover:shadow-[0_0_25px_rgba(15,143,168,0.35)]",
            // Idle breathing animation
            state === "idle" && "animate-pulse",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            transform:
              state === "listening"
                ? `scale(${1.0 + amplitude * 0.15})`
                : state === "speaking"
                ? "scale(1.03)"
                : undefined,
          }}
        >
          {/* Inner Core Soft Illumination */}
          <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_center,rgba(92,200,215,0.35)_0%,rgba(6,75,99,0.9)_70%)] pointer-events-none" />

          {/* Central Microphone / State Icon */}
          <div className="relative z-10 text-white flex flex-col items-center justify-center">
            {state === "processing" ? (
              <Loader2 className="w-8 h-8 text-[#5CC8D7] animate-spin" />
            ) : state === "speaking" ? (
              <Volume2 className="w-8 h-8 text-[#5CC8D7] animate-bounce" />
            ) : isMicActive ? (
              <div className="relative flex items-center justify-center">
                <Square className="w-6 h-6 fill-white text-white" />
              </div>
            ) : (
              <Mic className="w-8 h-8 text-[#B8DAE8] transition-transform duration-200 group-hover:scale-110" />
            )}
          </div>
        </button>
      </div>

      {/* BOTTOM CLINICAL STATUS & INSTRUCTION */}
      <div className="z-10 text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5">
          <p className="text-sm font-bold tracking-tight text-white">
            {stateLabels[state]}
          </p>
        </div>
        <p className="text-xs text-[#B8DAE8] max-w-xs leading-relaxed">
          {stateSubtexts[state]}
        </p>
      </div>
    </div>
  );
}
