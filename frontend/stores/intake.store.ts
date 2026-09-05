"use client";
import { create } from "zustand";
import type { ExtractedEntitySummary, IntakeTurnResponse } from "@/types/intake";

interface IntakeState {
  encounterId: string | null;
  sessionId: string | null;
  currentQuestion: string | null;
  currentFieldName: string | null;
  turnNumber: number;
  pathwayComplete: boolean;
  rawTranscript: string | null;
  detectedLanguage: string | null;
  lastEntities: ExtractedEntitySummary[];
  isLoading: boolean;
  error: string | null;
  startSession: (encounterId: string, sessionId: string, firstQuestion: string | null, firstFieldName: string | null) => void;
  applyTurnResponse: (response: IntakeTurnResponse) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initial = { encounterId: null, sessionId: null, currentQuestion: null, currentFieldName: null, turnNumber: 0, pathwayComplete: false, rawTranscript: null, detectedLanguage: null, lastEntities: [], isLoading: false, error: null };

export const useIntakeStore = create<IntakeState>((set) => ({
  ...initial,
  startSession: (encounterId, sessionId, firstQuestion, firstFieldName) =>
    set({ ...initial, encounterId, sessionId, currentQuestion: firstQuestion, currentFieldName: firstFieldName }),
  applyTurnResponse: (r: IntakeTurnResponse) =>
    set({ currentQuestion: r.next_question, currentFieldName: r.next_question_field_name, turnNumber: r.turn_number, pathwayComplete: r.pathway_complete, rawTranscript: r.raw_transcript, detectedLanguage: r.detected_language, lastEntities: r.entities_extracted, isLoading: false, error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set(initial),
}));