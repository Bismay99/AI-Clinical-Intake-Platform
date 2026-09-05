import { apiGet, apiPost } from "@/lib/api";
import type { PatientProfileCreate, PatientProfileResponse, EncounterCreate, EncounterResponse } from "@/types/patient";

/** POST /patients/profile */
export async function createPatientProfile(payload: PatientProfileCreate): Promise<PatientProfileResponse> {
  return apiPost<PatientProfileResponse>("/patients/profile", payload);
}

/** GET /patients/profile */
export async function getPatientProfile(): Promise<PatientProfileResponse> {
  return apiGet<PatientProfileResponse>("/patients/profile");
}

/** POST /encounters */
export async function createEncounter(payload: EncounterCreate = {}): Promise<EncounterResponse> {
  return apiPost<EncounterResponse>("/encounters", payload);
}

/** GET /encounters/mine */
export async function getMyEncounters(): Promise<EncounterResponse[]> {
  return apiGet<EncounterResponse[]>("/encounters/mine");
}