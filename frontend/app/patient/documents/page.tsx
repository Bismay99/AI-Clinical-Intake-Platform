"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileUp,
  ShieldCheck,
  HardDrive,
  FileCheck2,
  Plus,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { getPatientDocuments, uploadPatientDocument, deletePatientDocument } from "@/services/report.service";
import { getMyEncounters, createEncounter } from "@/services/patient.service";
import type { PatientDocumentItem } from "@/types/report";

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
  const [filterType, setFilterType] = useState<string>("all");
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<PatientDocumentItem | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deletePatientDocument(documentId),
    onMutate: (documentId: string) => {
      setIsDeletingId(documentId);
      setUploadError(null);
      setUploadSuccess(null);
    },
    onSuccess: () => {
      setIsDeletingId(null);
      setDeleteTargetDoc(null);
      setUploadSuccess("Document successfully deleted from your medical record.");
      qc.invalidateQueries({ queryKey: ["patient", "documents"] });
      qc.invalidateQueries({ queryKey: ["patient", "metrics"] });
      qc.invalidateQueries({ queryKey: ["patient", "reports"] });
      qc.invalidateQueries({ queryKey: ["patient", "encounters"] });
    },
    onError: (err: unknown) => {
      setIsDeletingId(null);
      setDeleteTargetDoc(null);
      if (err instanceof ApiError) {
        setUploadError(err.detail || "Failed to delete document.");
      } else if (err instanceof Error) {
        setUploadError(err.message || "Failed to delete document.");
      } else {
        setUploadError("Could not delete document. Please try again.");
      }
    },
  });

  // 1. Fetch patient documents with automatic polling when background processing is active
  const {
    data: documents = [],
    isLoading: isLoadingDocs,
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
      <div className="pb-3 border-b border-[var(--ink-200)]">
        <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
          <FileText className="w-6 h-6 text-[var(--clinical)]" />
          <span>Medical Documents</span>
        </h1>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          Upload prescriptions, lab investigations, and hospital records for AI clinical extraction and doctor review.
        </p>
      </div>

      {/* ── Section 1: Upload Document Card ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--clinical)]" />
            <span>Upload Clinical Document</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleUpload} className="space-y-4">
            {uploadSuccess && (
              <div className="p-3 rounded-md border border-[var(--status-success-bd)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-fg)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3 rounded-md border border-[var(--status-error-bd)] bg-[var(--status-error-bg)] text-xs text-[var(--status-error-fg)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Encounter selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[var(--ink-700)]">
                    Associated Consultation / Encounter
                  </label>
                  <button
                    type="button"
                    onClick={() => createEncounterMutation.mutate()}
                    disabled={createEncounterMutation.isPending}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--clinical)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{createEncounterMutation.isPending ? "Creating..." : "New Consultation"}</span>
                  </button>
                </div>

                {encounters.length === 0 ? (
                  <div className="p-3 bg-[var(--status-pending-bg)] rounded-md border border-[var(--status-pending-bd)] text-xs text-[var(--status-pending-fg)] flex items-center justify-between">
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
                    className="w-full text-xs p-2.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
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
                  <div className="mt-2 p-2.5 rounded-md border border-[var(--status-pending-bd)] bg-[var(--status-pending-bg)] text-[11px] text-[var(--status-pending-fg)] flex items-center justify-between">
                    <span>This consultation is completed and finalized.</span>
                    <button
                      type="button"
                      onClick={() => createEncounterMutation.mutate()}
                      className="text-[var(--clinical)] font-bold underline ml-1 hover:opacity-80 cursor-pointer"
                    >
                      Start New Consultation
                    </button>
                  </div>
                )}
              </div>

              {/* Document type selector */}
              <div>
                <label className="text-xs font-semibold text-[var(--ink-700)] block mb-1.5">
                  Document Type
                </label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface)] text-[var(--ink-900)] focus:outline-none focus:border-[var(--clinical)] focus:ring-1 focus:ring-[var(--clinical)] transition-colors"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* File picker */}
            <div>
              <label className="text-xs font-semibold text-[var(--ink-700)] block mb-1.5">
                Select File (PDF, PNG, JPG)
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={isEncounterCompleted}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-[var(--ink-500)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[var(--clinical-light)] file:text-[var(--clinical)] hover:file:bg-[var(--clinical-mid)] cursor-pointer disabled:opacity-50"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={uploadMutation.isPending || !selectedFile || !activeEncounterId || isEncounterCompleted}
                  isLoading={uploadMutation.isPending}
                  className="cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Upload &amp; Extract</span>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Section 2: Uploaded Documents List ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[var(--clinical)]" />
              <span>Clinical Documents ({documents.length})</span>
            </CardTitle>
            <span className="text-xs text-[var(--ink-500)]">
              Stored securely with full entity provenance
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoadingDocs ? (
            <div className="flex items-center gap-2 py-8 text-xs text-[var(--ink-500)] justify-center">
              <Spinner /> Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 max-w-sm mx-auto space-y-2">
              <FileText className="w-10 h-10 text-[var(--ink-400)] mx-auto" />
              <p className="text-sm font-semibold text-[var(--ink-900)]">No documents uploaded yet</p>
              <p className="text-xs text-[var(--ink-500)]">
                Upload medical prescriptions or lab reports above to automatically extract clinical findings for your doctor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Document Type Filter Tabs */}
              <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-[var(--ink-200)]">
                {[
                  { id: "all", label: "All Documents", count: documents.length },
                  { id: "prescription", label: "Prescriptions (Rx)", count: documents.filter(d => d.document_type === "prescription").length },
                  { id: "lab_report", label: "Lab Reports", count: documents.filter(d => d.document_type === "lab_report").length },
                  { id: "discharge_summary", label: "Discharge Summaries", count: documents.filter(d => d.document_type === "discharge_summary").length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      filterType === tab.id
                        ? "bg-[var(--clinical)] text-white"
                        : "bg-[var(--bg-surface-2)] text-[var(--ink-600)] hover:text-[var(--ink-900)] border border-[var(--ink-200)]"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      filterType === tab.id ? "bg-white/20 text-white" : "bg-[var(--ink-200)] text-[var(--ink-700)]"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Document List */}
              {documents.filter(d => filterType === "all" || d.document_type === filterType).length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--ink-500)]">
                  No documents found for this category.
                </div>
              ) : (
                <div className="space-y-3">
                  {documents
                    .filter(d => filterType === "all" || d.document_type === filterType)
                    .map((doc) => {
                      const isExpanded = !!expandedDocIds[doc.id];
                      const entityCount = doc.extracted_entities?.length ?? doc.entity_count ?? 0;
                      const isProcessing =
                        doc.processing_status === "processing" || doc.processing_status === "uploaded";
                      const isFailed = doc.processing_status === "failed";
                      const isProcessed = doc.processing_status === "processed";

                      return (
                        <div
                          key={doc.id}
                          className="border border-[var(--ink-200)] rounded-lg overflow-hidden bg-[var(--bg-surface)] hover:border-[var(--ink-400)] transition-colors"
                        >
                    {/* Main Row */}
                    <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-[var(--clinical-light)] text-[var(--clinical)] flex items-center justify-center flex-shrink-0 border border-[var(--clinical-mid)]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink-900)] truncate">
                            {doc.original_filename || doc.filename || "Clinical Document"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[var(--ink-500)] mt-0.5 flex-wrap">
                            <span className="capitalize font-medium">
                              {doc.document_type.replace(/_/g, " ")}
                            </span>
                            <span>·</span>
                            <span>{doc.upload_timestamp}</span>
                            {doc.file_size && (
                              <>
                                <span>·</span>
                                <span>{formatFileSize(doc.file_size)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Dynamic Processing Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            isProcessed
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-bd)]"
                              : isFailed
                              ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--status-error-bd)]"
                              : "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-bd)] animate-pulse"
                          }`}
                        >
                          {isProcessing ? (
                            <Spinner />
                          ) : isFailed ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <FileCheck2 className="w-3 h-3" />
                          )}
                          <span className="capitalize">
                            {isProcessing ? "AI Extracting..." : isFailed ? "Extraction Failed" : (doc.processing_status || "Processed")}
                          </span>
                        </span>

                        {/* Entities Badge */}
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--entity-verified-bg)] text-[var(--entity-verified-fg)] border border-[var(--entity-verified-bd)]">
                          <Sparkles className="w-3 h-3" />
                          <span>{entityCount} entities</span>
                        </span>

                        {/* Expand Button */}
                        <button
                          onClick={() => toggleExpand(doc.id)}
                          className="p-1.5 rounded-md border border-[var(--ink-200)] hover:bg-[var(--ink-100)] text-[var(--ink-500)] transition-colors cursor-pointer"
                          title={isExpanded ? "Collapse extracted fields" : "View extracted fields"}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {/* Delete Document Button */}
                        <button
                          type="button"
                          onClick={() => setDeleteTargetDoc(doc)}
                          disabled={isDeletingId === doc.id}
                          className="p-1.5 rounded-md border border-[var(--ink-200)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] hover:border-[var(--status-error-bd)] text-[var(--ink-500)] transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete document"
                          aria-label={`Delete ${doc.original_filename || "document"}`}
                        >
                          {isDeletingId === doc.id ? (
                            <Spinner />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Extraction Error Notice if failed */}
                    {isFailed && doc.processing_error && (
                      <div className="mx-4 mb-3 p-2.5 rounded-md bg-[var(--status-error-bg)] border border-[var(--status-error-bd)] text-xs text-[var(--status-error-fg)] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{doc.processing_error}</span>
                      </div>
                    )}

                    {/* Expandable Entity Details */}
                    {isExpanded && (
                      <div className="px-4 py-3 bg-[var(--bg-surface-2)] border-t border-[var(--ink-200)] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-semibold text-[var(--ink-500)] uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-[var(--clinical)]" />
                            <span>Extracted Clinical Facts &amp; Provenance</span>
                          </h4>
                          <span className="text-[10px] text-[var(--ink-500)]">
                            {entityCount} facts captured from this document
                          </span>
                        </div>

                        {doc.extracted_entities && doc.extracted_entities.length > 0 ? (
                          <div className="space-y-1.5">
                            {doc.extracted_entities.map((ent, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 bg-[var(--bg-surface)] rounded-md border border-[var(--ink-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-[var(--ink-800)]">{ent.label}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--ink-100)] text-[var(--ink-600)]">
                                      {ent.field_name}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-[var(--clinical)] mt-0.5">{ent.value}</p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                  {ent.confidence != null && (
                                    <span className="text-[10px] text-[var(--ink-500)]">
                                      AI confidence: {(ent.confidence * 100).toFixed(0)}%
                                    </span>
                                  )}
                                  {ent.evidence && ent.evidence.length > 0 && (
                                    <div className="inline-flex items-center gap-1 text-[10px] bg-[var(--clinical-light)] text-[var(--clinical)] px-2 py-0.5 rounded-md border border-[var(--clinical-mid)]">
                                      <HardDrive className="w-3 h-3" />
                                      <span>Evidence match</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--ink-500)] py-2">
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
        </div>
      )}
        </CardContent>
      </Card>

      {/* Confirmation Modal for Document Deletion */}
      <ConfirmDialog
        isOpen={deleteTargetDoc !== null}
        title="Delete this document?"
        description={
          deleteTargetDoc
            ? `Are you sure you want to delete "${deleteTargetDoc.original_filename || deleteTargetDoc.filename || "this document"}"? This will remove the uploaded file and any clinical findings extracted from it from your active consultation. This action cannot be undone.`
            : "Are you sure you want to delete this document?"
        }
        confirmText="Delete Document"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeletingId !== null}
        onConfirm={() => {
          if (deleteTargetDoc) {
            deleteMutation.mutate(deleteTargetDoc.id);
          }
        }}
        onCancel={() => {
          if (!isDeletingId) {
            setDeleteTargetDoc(null);
          }
        }}
      />
    </div>
  );
}
