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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { getPatientDocuments, uploadPatientDocument } from "@/services/report.service";
import { getMyEncounters } from "@/services/patient.service";
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

  // 1. Fetch patient documents with TanStack Query
  const {
    data: documents = [],
    isLoading: isLoadingDocs,
    error: docsError,
  } = useQuery({
    queryKey: ["patient", "documents"],
    queryFn: getPatientDocuments,
  });

  // 2. Fetch patient encounters for selection
  const { data: encounters = [] } = useQuery({
    queryKey: ["patient", "encounters"],
    queryFn: getMyEncounters,
  });

  // Set default encounter when loaded
  const activeEncounterId = selectedEncounterId || (encounters.length > 0 ? encounters[0].id : "");

  // 3. Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: uploadPatientDocument,
    onSuccess: (resp) => {
      setUploadSuccess(`Document uploaded successfully. ${resp.entity_count} clinical entities extracted.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Invalidate queries across the platform
      qc.invalidateQueries({ queryKey: ["patient", "documents"] });
      qc.invalidateQueries({ queryKey: ["patient", "metrics"] });
      qc.invalidateQueries({ queryKey: ["patient", "reports"] });
    },
    onError: (err: unknown) => {
      console.error("Document upload error:", err);
      setUploadError("Failed to upload document. Please ensure it is a valid PDF or image.");
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
                <label className="text-xs font-semibold text-[#667085] block mb-1.5">
                  Associated Consultation / Encounter
                </label>
                {encounters.length === 0 ? (
                  <p className="text-xs text-[#667085] italic">No active consultations found.</p>
                ) : (
                  <select
                    value={activeEncounterId}
                    onChange={(e) => setSelectedEncounterId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-[#E4E7EC] bg-white text-[#172033] focus:outline-none focus:border-[#155EEF]"
                  >
                    {encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>
                        {enc.opd_department || "General OPD"} — {enc.id.slice(0, 8)}... ({enc.queue_status})
                      </option>
                    ))}
                  </select>
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
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-[#667085] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#155EEF] hover:file:bg-blue-100 cursor-pointer"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={uploadMutation.isPending || !selectedFile || !activeEncounterId}
                  isLoading={uploadMutation.isPending}
                  className="text-xs font-semibold px-5"
                >
                  <FileUp className="w-3.5 h-3.5 mr-1.5" />
                  <span>Upload & Extract</span>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Section 2: Uploaded Documents List with Expandable Provenance ── */}
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
                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                            doc.processing_status === "processed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : doc.processing_status === "failed"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          <FileCheck2 className="w-3 h-3" />
                          <span className="capitalize">{doc.processing_status || "Processed"}</span>
                        </span>

                        {/* Entities Extracted Badge */}
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>{entityCount} entities</span>
                        </span>

                        {/* Expand Button */}
                        <button
                          onClick={() => toggleExpand(doc.id)}
                          className="p-1.5 rounded-lg border border-[#E4E7EC] hover:bg-gray-50 text-[#667085] transition-colors ml-1"
                          title={isExpanded ? "Collapse extracted fields" : "View extracted fields"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

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
                                    <span className="text-[#667085] font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
                                      {ent.source_location || "page 1"}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-[#172033] mt-0.5">{ent.value}</p>
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="text-[11px] font-mono text-[#12B76A] font-semibold">
                                    {Math.round(ent.confidence * 100)}% conf
                                  </span>

                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                      ent.verification_status === "accepted"
                                        ? "bg-green-100 text-green-800"
                                        : ent.verification_status === "edited"
                                        ? "bg-blue-100 text-blue-800"
                                        : ent.verification_status === "rejected"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {ent.verification_status === "unreviewed"
                                      ? "AI extracted — awaiting doctor verification"
                                      : `Doctor ${ent.verification_status}`}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#667085] italic py-2">
                            No discrete clinical entities recorded for this document yet.
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
