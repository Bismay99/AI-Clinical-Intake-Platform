export interface SessionStartRequest { encounter_id: string; language: string; schema_id: string; }
export interface SessionStartResponse { session_id: string; encounter_id: string; schema_id: string; language: string; first_question: string | null; first_question_field_name: string | null; status: string; }
export interface IntakeTurnRequest { session_id: string; encounter_id: string; touch_answer?: string | null; answering_field_name?: string | null; }
export interface ExtractedEntitySummary { field_name: string; value: string; confidence: number; low_confidence_flag: boolean; source_type: string; source_location: string | null; }
export interface IntakeTurnResponse { session_id: string; next_question: string | null; next_question_field_name: string | null; pathway_complete: boolean; entities_extracted: ExtractedEntitySummary[]; turn_number: number; raw_transcript: string | null; detected_language: string | null; }
export type DocumentType = "prescription" | "lab_report" | "discharge_summary";
export interface DocumentUploadResponse {
  document_id: string;
  encounter_id: string;
  document_type: string;
  original_filename?: string | null;
  processing_status?: string | null;
  processing_error?: string | null;
  file_size?: number | null;
  entities_extracted: ExtractedEntitySummary[];
  entity_count: number;
}
export interface IntakeSubmitRequest { session_id: string; encounter_id: string; }
export interface IntakeSubmitResponse { encounter_id: string; session_id: string; status: string; total_entities: number; timeline_events: number; summary_preview: string; }