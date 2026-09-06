import { apiGet, apiPostForm } from "@/lib/api";
import type {
  PatientReportSummaryItem,
  PatientReportDetailResponse,
  PatientDocumentItem,
  PatientDashboardMetrics,
} from "@/types/report";
import type { DocumentUploadResponse } from "@/types/intake";

/** GET /patients/reports */
export async function getPatientReports(): Promise<PatientReportSummaryItem[]> {
  return apiGet<PatientReportSummaryItem[]>("/patients/reports");
}

/** GET /patients/reports/{encounter_id} */
export async function getPatientReport(encounterId: string): Promise<PatientReportDetailResponse> {
  return apiGet<PatientReportDetailResponse>(`/patients/reports/${encounterId}`);
}

/** GET /patients/documents */
export async function getPatientDocuments(): Promise<PatientDocumentItem[]> {
  return apiGet<PatientDocumentItem[]>("/patients/documents");
}

/** GET /patients/dashboard/metrics */
export async function getPatientDashboardMetrics(): Promise<PatientDashboardMetrics> {
  return apiGet<PatientDashboardMetrics>("/patients/dashboard/metrics");
}

/** GET /patients/documents/{document_id} */
export async function getPatientDocument(documentId: string): Promise<PatientDocumentItem> {
  return apiGet<PatientDocumentItem>(`/patients/documents/${documentId}`);
}

/** POST /intake/document/upload */
export async function uploadPatientDocument(params: {
  encounterId: string;
  documentType: string;
  file: File;
  languageHint?: string;
}): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append("encounter_id", params.encounterId);
  form.append("document_type", params.documentType);
  form.append("file", params.file);
  form.append("language_hint", params.languageHint || "en");
  return apiPostForm<DocumentUploadResponse>("/intake/document/upload", form);
}
