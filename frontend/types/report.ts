export interface PatientEntityEvidence {
  field_name: string;
  label: string;
  value: string;
  original_ai_value?: string | null;
  confidence: number;
  low_confidence_flag: boolean;
  verification_status: string; // 'unreviewed' | 'accepted' | 'edited' | 'rejected'
  source_type: string;
  source_location?: string | null;
  source_document_id?: string | null;
  source_document_name?: string | null;
  evidence?: string[] | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface PatientDocumentItem {
  id: string;
  document_id?: string | null;
  encounter_id: string;
  patient_id?: string | null;
  document_type: string;
  original_filename?: string | null;
  filename?: string | null;
  upload_timestamp: string;
  uploaded_at?: string | null;
  processing_status: string; // 'uploaded' | 'processing' | 'processed' | 'failed'
  processing_error?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  entity_count: number;
  extracted_entity_count?: number | null;
  extracted_entities: PatientEntityEvidence[];
}

export interface PatientTimelineItem {
  id: string;
  event_type: string;
  date?: string | null;
  date_confidence: number;
  date_uncertain: boolean;
  created_at: string;
}

export interface PatientReportSummaryItem {
  encounter_id: string;
  patient_id: string;
  opd_department?: string | null;
  consultation_date: string;
  queue_status: string;
  doctor_review_status: string;
  has_summary: boolean;
  total_entities: number;
  unreviewed_count: number;
  summary_preview?: string | null;
}

export interface PatientMissingField {
  field_name: string;
  label: string;
  status: string;
}

export interface PatientReportDetailResponse {
  patient_id: string;
  patient_name: string;
  patient_uid: string;
  encounter_id: string;
  opd_department?: string | null;
  consultation_date: string;
  created_at: string;
  queue_status: string;
  doctor_review_status: string;
  doctor_notes?: string | null;
  doctor_user_id?: string | null;
  summary_text?: string | null;
  summary_generated_at?: string | null;
  chief_complaint?: string | null;
  hpi_details: Record<string, string>;
  medical_history: string[];
  medications: string[];
  allergies: string[];
  investigations: string[];
  investigation_details: Record<string, string>;
  other_history: Record<string, string>;
  missing_fields: PatientMissingField[];
  extracted_entities: PatientEntityEvidence[];
  documents_count: number;
  documents: PatientDocumentItem[];
  timeline: PatientTimelineItem[];
}

export interface PatientDashboardMetrics {
  consultations_count: number;
  documents_count: number;
  reports_count: number;
}
