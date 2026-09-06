import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  AssignResponse, DoctorQueueResponse, SummaryDetailResponse, TimelineEventResponse,
  DocumentDetailResponse, EntityDetail, VerifyRequest, VerifyResponse, FinalizeResponse,
  DoctorStats, PatientSearchResult, AvailableEncounterItem, RecommendedItem,
} from "@/types/doctor";

export async function assignEncounter(encounterId: string): Promise<AssignResponse> {
  return apiPost<AssignResponse>(`/doctor/encounter/${encounterId}/assign`);
}
export async function getQueue(): Promise<DoctorQueueResponse> {
  return apiGet<DoctorQueueResponse>("/doctor/queue");
}
export async function getSummary(encounterId: string): Promise<SummaryDetailResponse> {
  return apiGet<SummaryDetailResponse>(`/doctor/patient/${encounterId}/summary`);
}
export async function getTimeline(encounterId: string): Promise<TimelineEventResponse[]> {
  return apiGet<TimelineEventResponse[]>(`/doctor/patient/${encounterId}/timeline`);
}
export async function getDocument(encounterId: string, docId: string): Promise<DocumentDetailResponse> {
  return apiGet<DocumentDetailResponse>(`/doctor/patient/${encounterId}/document/${docId}`);
}
export async function getEntities(encounterId: string): Promise<EntityDetail[]> {
  return apiGet<EntityDetail[]>(`/doctor/patient/${encounterId}/entities`);
}
export async function verifyEntity(entityId: string, request: VerifyRequest): Promise<VerifyResponse> {
  return apiPatch<VerifyResponse>(`/doctor/entity/${entityId}/verify`, request);
}
export async function finalizeEncounter(encounterId: string): Promise<FinalizeResponse> {
  return apiPost<FinalizeResponse>(`/doctor/encounter/${encounterId}/finalize`);
}

// --- New: Dashboard Stats ---
export async function getDashboardStats(): Promise<DoctorStats> {
  return apiGet<DoctorStats>("/doctor/dashboard/stats");
}

// --- New: Patient Search by UID ---
export async function searchPatientByUid(patientUid: string): Promise<PatientSearchResult> {
  return apiGet<PatientSearchResult>(`/doctor/patients/search?patient_uid=${encodeURIComponent(patientUid)}`);
}

// --- New: Available Encounter Pool ---
export async function getAvailableEncounters(): Promise<AvailableEncounterItem[]> {
  return apiGet<AvailableEncounterItem[]>("/doctor/available");
}

// --- New: Recommended for Review ---
export async function getRecommended(): Promise<RecommendedItem[]> {
  return apiGet<RecommendedItem[]>("/doctor/patients/recommended");
}