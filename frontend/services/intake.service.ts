import { apiPost, apiPostForm } from "@/lib/api";
import type { SessionStartRequest, SessionStartResponse, IntakeTurnRequest, IntakeTurnResponse, IntakeSubmitRequest, IntakeSubmitResponse } from "@/types/intake";

/** POST /intake/session/start */
export async function startSession(payload: SessionStartRequest): Promise<SessionStartResponse> {
  return apiPost<SessionStartResponse>("/intake/session/start", payload);
}

/** POST /intake/turn */
export async function submitTurn(payload: IntakeTurnRequest): Promise<IntakeTurnResponse> {
  return apiPost<IntakeTurnResponse>("/intake/turn", payload);
}

/**
 * POST /intake/turn/voice — multipart/form-data.
 * Voice recorder UI added in a later step; service layer is ready now.
 */
export async function submitVoiceTurn(params: { encounter_id: string; session_id: string; answering_field_name?: string; touch_answer?: string; language?: string; audio_file: Blob; audio_filename?: string; }): Promise<IntakeTurnResponse> {
  const form = new FormData();
  form.append("encounter_id", params.encounter_id);
  form.append("session_id", params.session_id);
  if (params.answering_field_name) form.append("answering_field_name", params.answering_field_name);
  if (params.touch_answer) form.append("touch_answer", params.touch_answer);
  if (params.language) form.append("language", params.language);
  form.append("audio_file", params.audio_file, params.audio_filename ?? "recording.wav");
  return apiPostForm<IntakeTurnResponse>("/intake/turn/voice", form);
}

/** POST /intake/submit */
export async function submitIntake(payload: IntakeSubmitRequest): Promise<IntakeSubmitResponse> {
  return apiPost<IntakeSubmitResponse>("/intake/submit", payload);
}