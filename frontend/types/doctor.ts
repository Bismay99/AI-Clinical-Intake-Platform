export type VerificationStatus = "unreviewed" | "accepted" | "edited" | "rejected";
export type VerifyAction = "accept" | "edit" | "reject";
export interface EntityDetail { id: string; field_name: string; value: string; original_ai_value: string | null; confidence: number; low_confidence_flag: boolean; verification_status: VerificationStatus; source_type: string; source_id: string; source_location: string | null; reviewed_by: string | null; reviewed_at: string | null; }
export interface QueueItem { encounter_id: string; patient_id: string; patient_name: string; encounter_status: string; opd_department: string | null; created_at: string; updated_at: string; has_summary: boolean; total_entities: number; unreviewed_count: number; }
export interface DoctorQueueResponse { doctor_user_id: string; items: QueueItem[]; total: number; }
export interface AssignResponse { encounter_id: string; doctor_user_id: string; queue_status: string; message: string; }
export interface SummaryDetailResponse { encounter_id: string; summary_id: string; summary_text: string; generated_at: string; regenerated_at: string | null; used_entity_fields: string[] | null; entities: EntityDetail[]; }
export interface TimelineEventResponse { id: string; event_type: string; date: string | null; date_confidence: number; date_uncertain: boolean; source_entity_id: string | null; created_at: string; }
export interface DocumentDetailResponse { id: string; encounter_id: string; document_type: string; original_filename: string | null; language_hint: string; upload_timestamp: string; extracted_entities: EntityDetail[]; }
export interface VerifyRequest { action: VerifyAction; new_value?: string | null; }
export interface VerifyResponse { entity_id: string; field_name: string; action: string; verification_status: VerificationStatus; value: string; original_ai_value: string | null; reviewed_by: string; reviewed_at: string; }
export interface FinalizeResponse { encounter_id: string; status: string; finalized_by: string; audit_log_id: string; reviewed_entity_count: number; unreviewed_entity_count: number; }

// --- New: Dashboard Stats ---
export interface DoctorStats { awaiting_review: number; in_review: number; completed: number; }

// --- New: Patient Search ---
export interface EncounterSummary {
  encounter_id: string;
  queue_status: string;
  opd_department: string | null;
  submitted_at: string | null;
  total_entities: number;
  unreviewed_count: number;
}
export interface PatientSearchResult {
  patient_id: string;
  patient_name: string;
  date_of_birth: string | null;
  gender: string | null;
  preferred_language: string;
  encounters: EncounterSummary[];
}

// --- New: Available Encounter Pool ---
export interface AvailableEncounterItem {
  encounter_id: string;
  patient_name: string;
  opd_department: string | null;
  queue_status: string;
  created_at: string;
  updated_at: string;
  total_entities: number;
}

// --- New: Recommended for Review ---
export interface RecommendedItem {
  encounter_id: string;
  patient_id: string;
  patient_name: string;
  opd_department: string | null;
  queue_status: string;
  updated_at: string;
  reason: string;
}