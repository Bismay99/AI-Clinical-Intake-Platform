"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileUp,
  ShieldCheck,
  HardDrive,
  FileCheck2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { ApiError } from "@/lib/api";
import { getPatientDocuments, uploadPatientDocument } from "@/services/report.service";
import { getMyEncounters, createEncounter } from "@/services/patient.service";
import type { PatientDocumentItem, PatientEntityEvidence } from "@/types/report";
import type { EncounterResponse } from "@/types/patient";

const DOC_TYPES = [
  { id: "prescription", label: "Prescription (Rx)" },
  { id: "lab_report", label: "Laboratory Report" },
  { id: "discharge_summary", label: "Discharge Summary" },
];

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PatientDocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("prescription");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expandedDocIds, setExpandedDocIds] = useState<Record<string, boolean>>({});
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 1. Fetch patient documents with automatic polling when background processing is active
  const {
    data: documents = [],
    isLoading: isLoadingDocs,
    error: docsError,
  } = useQuery({
    queryKey: ["patient", "documents"],
    queryFn: getPatientDocuments,
    refetchInterval: (query) => {
      const docs = query.state.data;
      const isProcessing = docs?.some(
        (d: PatientDocumentItem) =>
          d.processing_status === "processing" || d.processing_status === "uploaded"
      );
      // Fast 2.5s polling while OCR/Gemini background extraction runs
      return isProcessing ? 2500 : false;
    },
  });

  // 2. Fetch patient encounters for selection
  const { data: rawEncounters = [] } = useQuery({
    queryKey: ["patient", "encounters"],
    queryFn: getMyEncounters,
  });

  // Sort encounters so active/open ones appear first
  const encounters = [...rawEncounters].sort((a, b) => {
    const aCompleted = a.queue_status === "completed" ? 1 : 0;
    const bCompleted = b.queue_status === "completed" ? 1 : 0;
    return aCompleted - bCompleted;
  });

  // Set default encounter to the first active encounter (or first encounter)
  const currentEncounter = encounters.find((e) => e.id === selectedEncounterId) || encounters[0];
  const activeEncounterId = currentEncounter?.id || "";
  const isEncounterCompleted = currentEncounter?.queue_status === "completed";

  // Create new consultation mutation
  const createEncounterMutation = useMutation({
    mutationFn: () => createEncounter({ opd_department: "General OPD" }),
    onSuccess: (newEnc) => {
      qc.invalidateQueries({ queryKey: ["patient", "encounters"] });
      setSelectedEncounterId(newEnc.id);
      setUploadSuccess(`New consultation (${newEnc.id.slice(0, 8)}) created. You can now upload documents.`);
      setUploadError(null);
    },
    onError: (err: unknown) => {
      console.error("Failed to create encounter:", err);
      if (err instanceof ApiError) {
        setUploadError(err.detail || "Failed to start a new consultation.");
      } else {
        setUploadError("Could not start consultation. Please try again.");
      }
    },
  });

  // 3. Document upload mutation (decoupled fast upload)
  const uploadMutation = useMutation({
    mutationFn: uploadPatientDocument,
    onSuccess: (resp) => {
      if (resp.processing_status === "processing") {
        setUploadSuccess(
          "Document securely stored. AI clinical OCR and entity extraction is processing in the background..."
        );
      } else {
        setUploadSuccess(`Document uploaded successfully. ${resp.entity_count} clinical entities extracted.`);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Invalidate queries across the platform to reflect immediately
      qc.invalidateQueries({ queryKey: ["patient", "documents"] });
      qc.invalidateQueries({ queryKey: ["patient", "metrics"] });
      qc.invalidateQueries({ queryKey: ["patient", "reports"] });
    },
    onError: (err: unknown) => {
      console.error("Document upload error:", err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setUploadError(
            err.detail ||
              "This encounter has already been completed and cannot be modified. Please select or start an active consultation."
          );
        } else if (err.status === 401) {
          setUploadError("Session expired. Please log in again.");
        } else if (err.status === 403) {
          setUploadError("You do not have permission to upload documents to this encounter.");
        } else if (err.status === 404) {
          setUploadError("Encounter not found.");
        } else if (err.status === 413) {
          setUploadError("The file is too large. Maximum size is 10MB.");
        } else if (err.status === 415) {
          setUploadError("Unsupported file type. Please upload a PDF, PNG, or JPG.");
        } else if (err.status === 422) {
          setUploadError(err.detail || "Validation error with the uploaded document.");
        } else if (err.status >= 500) {
          setUploadError("Server error while processing document. Please try again.");
        } else {
          setUploadError(err.detail || "Failed to upload document.");
        }
      } else if (err instanceof Error) {
        setUploadError(err.message || "Failed to upload document.");
      } else {
        setUploadError("Failed to upload document. Please check your connection.");
      }
    },
  });

  function toggleExpand(id: string) {
    setExpandedDocIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !activeEncounterId) {
      setUploadError("Please select an encounter and choose a file to upload.");
      return;
    }
    if (isEncounterCompleted) {
      setUploadError(
        "This consultation has been completed and is read-only. Please start or select an active consultation to upload documents."
      );
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);

    uploadMutation.mutate({
      encounterId: activeEncounterId,
      documentType: selectedDocType,
      file: selectedFile,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-3 border-b border-[#E4E7EC]">
        <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2">
          <FileText className="w-6 h-6 text-[#155EEF]" />
          <span>Medical Documents</span>
        </h1>
        <p className="text-sm text-[#667085] mt-1">
          Upload prescriptions, lab investigations, and hospital records for AI clinical extraction and doctor review.
        </p>
      </div>

      {/* ── Section 1: Upload Document Card ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7EC]">
          <CardTitle className="text-sm font-bold text-[#172033] flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#155EEF]" />
            <span>Upload Clinical Document</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleUpload} className="space-y-4">
            {uploadSuccess && (
              <div className="p-3.5 rounded-xl border border-green-200 bg-green-50 text-xs text-[#12B76A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#D92D20] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Encounter selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#667085]">
                    Associated Consultation / Encounter
                  </label>
                  <button
                    type="button"
                    onClick={() => createEncounterMutation.mutate()}
                    disabled={createEncounterMutation.isPending}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155EEF] hover:text-[#004EEB] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{createEncounterMutation.isPending ? "Creating..." : "New Consultation"}</span>
                  </button>
                </div>

                {encounters.length === 0 ? (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                    <span>No consultation active.</span>
                    <button
                      type="button"
                      onClick={() => createEncounterMutation.mutate()}
                      className="font-bold underline ml-2 cursor-pointer"
                    >
                      Start One
                    </button>
                  </div>
                ) : (
                  <select
                    value={activeEncounterId}
                    onChange={(e) => setSelectedEncounterId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-[#E4E7EC] bg-white text-[#172033] focus:outline-none focus:border-[#155EEF]"
                  >
                    {encounters.map((enc) => {
                      const isDone = enc.queue_status === "completed";
                      return (
                        <option key={enc.id} value={enc.id}>
                          {enc.opd_department || "General OPD"} — {enc.id.slice(0, 8)}... {isDone ? "(Completed — Read-only)" : `(${enc.queue_status})`}
                        </option>
                      );
                    })}
                  </select>
                )}

                {isEncounterCompleted && (
                  <div className="mt-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-800 flex items-center justify-between">
                    <span>This consultation is completed and finalized.</span>
                    <button
                      type="button"
                      onClick={() => createEncounterMutation.mutate()}
                      className="text-[#155EEF] font-bold underline ml-1 hover:text-[#004EEB] cursor-pointer"
                    >
                      Start New Consultation
                    </button>
                  </div>
                )}
              </div>

              {/* Document type selector */}
              <div>
                <label className="text-xs font-semibold text-[#667085] block mb-1.5">
                  Document Type
                </label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[#E4E7EC] bg-white text-[#172033] focus:outline-none focus:border-[#155EEF]"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* File drop / picker */}
            <div>
              <label className="text-xs font-semibold text-[#667085] block mb-1.5">
                Select File (PDF, PNG, JPG)
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={isEncounterCompleted}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-[#667085] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#155EEF] hover:file:bg-blue-100 cursor-pointer disabled:opacity-50"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={uploadMutation.isPending || !selectedFile || !activeEncounterId || isEncounterCompleted}
                  isLoading={uploadMutation.isPending}
                  className="text-xs font-semibold px-5 cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5 mr-1.5" />
                  <span>Upload & Extract</span>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Section 2: Uploaded Documents List with Live Processing Badges & Provenance ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7EC]">
          <CardTitle className="text-sm font-bold text-[#172033] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#0F9D8A]" />
              <span>Clinical Documents ({documents.length})</span>
            </span>
            <span className="text-xs text-[#667085] font-normal">
              Stored securely with full entity provenance
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoadingDocs ? (
            <div className="flex items-center gap-2 py-8 text-xs text-[#667085] justify-center">
              <Spinner className="text-[#155EEF]" /> Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 max-w-sm mx-auto space-y-2">
              <FileText className="w-10 h-10 text-[#667085]/40 mx-auto" />
              <p className="text-sm font-semibold text-[#172033]">No documents uploaded yet</p>
              <p className="text-xs text-[#667085]">
                Upload medical prescriptions or lab reports above to automatically extract clinical findings for your doctor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const isExpanded = !!expandedDocIds[doc.id];
                const entityCount = doc.extracted_entities?.length ?? doc.entity_count ?? 0;
                const isProcessing =
                  doc.processing_status === "processing" || doc.processing_status === "uploaded";
                const isFailed = doc.processing_status === "failed";
                const isProcessed = doc.processing_status === "processed";

                return (
                  <div
                    key={doc.id}
                    className="border border-[#E4E7EC] rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors"
                  >
                    {/* Main Row */}
                    <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155EEF] flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#172033] truncate">
                            {doc.original_filename || doc.filename || "Clinical Document"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[#667085] mt-0.5 flex-wrap">
                            <span className="capitalize font-medium">
                              {doc.document_type.replace(/_/g, " ")}
                            </span>
                            <span>•</span>
                            <span>{doc.upload_timestamp}</span>
                            {doc.file_size && (
                              <>
                                <span>•</span>
                                <span>{formatFileSize(doc.file_size)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {/* Dynamic Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                            isProcessed
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : isFailed
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
                          }`}
                        >
                          {isProcessing ? (
                            <Spinner className="w-3 h-3 text-blue-600" />
                          ) : isFailed ? (
                            <AlertCircle className="w-3 h-3 text-red-600" />
                          ) : (
                            <FileCheck2 className="w-3 h-3 text-emerald-600" />
                          )}
                          <span className="capitalize">
                            {isProcessing ? "AI Extracting..." : (doc.processing_status || "Processed")}
                          </span>
                        </span>

                        {/* Entities Extracted Badge */}
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>{entityCount} entities</span>
                        </span>

                        {/* Expand Button */}
                        <button
                          onClick={() => toggleExpand(doc.id)}
                          className="p-1.5 rounded-lg border border-[#E4E7EC] hover:bg-gray-50 text-[#667085] transition-colors ml-1 cursor-pointer"
                          title={isExpanded ? "Collapse extracted fields" : "View extracted fields"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Extraction Error Notice if failed */}
                    {isFailed && doc.processing_error && (
                      <div className="mx-4 mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{doc.processing_error}</span>
                      </div>
                    )}

                    {/* Expandable Entity Details */}
                    {isExpanded && (
                      <div className="p-4 bg-[#F7F9FC] border-t border-[#E4E7EC] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#155EEF]" />
                            <span>Extracted Clinical Facts & Provenance</span>
                          </h4>
                          <span className="text-[11px] text-[#667085]">
                            {entityCount} facts captured from this document
                          </span>
                        </div>

                        {doc.extracted_entities && doc.extracted_entities.length > 0 ? (
                          <div className="space-y-2">
                            {doc.extracted_entities.map((ent, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-white rounded-lg border border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-[#172033]">{ent.label}</span>
                                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                      {ent.field_name}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-[#155EEF] mt-1">{ent.value}</p>
                                </div>

                                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                                  {ent.confidence != null && (
                                    <span className="text-[11px] text-[#667085]">
                                      Conf: {(ent.confidence * 100).toFixed(0)}%
                                    </span>
                                  )}
                                  {ent.evidence && ent.evidence.length > 0 && (
                                    <div className="flex items-center gap-1 text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                      <HardDrive className="w-3 h-3" />
                                      <span>Evidence match</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#667085] py-2">
                            {isProcessing
                              ? "AI clinical OCR and entity extraction is currently analyzing this file. Extracted entities will populate shortly."
                              : "No clinical entities extracted for this document."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
