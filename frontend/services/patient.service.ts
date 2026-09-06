import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { PatientProfileCreate, PatientProfileUpdate, PatientProfileResponse, EncounterCreate, EncounterResponse } from "@/types/patient";

/** POST /patients/profile */
export async function createPatientProfile(payload: PatientProfileCreate): Promise<PatientProfileResponse> {
  return apiPost<PatientProfileResponse>("/patients/profile", payload);
}

/** GET /patients/profile */
export async function getPatientProfile(): Promise<PatientProfileResponse> {
  return apiGet<PatientProfileResponse>("/patients/profile");
}

/** PATCH /patients/profile */
export async function updatePatientProfile(payload: PatientProfileUpdate): Promise<PatientProfileResponse> {
  return apiPatch<PatientProfileResponse>("/patients/profile", payload);
}

/** POST /encounters */
export async function createEncounter(payload: EncounterCreate = {}): Promise<EncounterResponse> {
  return apiPost<EncounterResponse>("/encounters", payload);
}

/** GET /encounters/mine */
export async function getMyEncounters(): Promise<EncounterResponse[]> {
  return apiGet<EncounterResponse[]>("/encounters/mine");
}