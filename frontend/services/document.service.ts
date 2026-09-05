import { apiPostForm } from "@/lib/api";
import type { DocumentType, DocumentUploadResponse } from "@/types/intake";

/** POST /intake/document/upload — multipart/form-data */
export async function uploadDocument(params: { encounter_id: string; document_type: DocumentType; language_hint?: string; file: Blob; filename?: string; }): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append("encounter_id", params.encounter_id);
  form.append("document_type", params.document_type);
  if (params.language_hint) form.append("language_hint", params.language_hint);
  form.append("file", params.file, params.filename ?? "document");
  return apiPostForm<DocumentUploadResponse>("/intake/document/upload", form);
}