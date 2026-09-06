"use client";
import { useEffect, useState, useRef } from "react";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  FileUp,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getPatientDocuments, uploadPatientDocument } from "@/services/report.service";
import { getMyEncounters } from "@/services/patient.service";
import type { PatientDocumentItem } from "@/types/report";
import type { EncounterResponse } from "@/types/patient";

const DOC_TYPES = [
  { id: "prescription", label: "Prescription (Rx)" },
  { id: "lab_report", label: "Laboratory Report" },
  { id: "discharge_summary", label: "Discharge Summary" },
];

export default function PatientDocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<PatientDocumentItem[]>([]);
  const [encounters, setEncounters] = useState<EncounterResponse[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("prescription");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [docs, encs] = await Promise.all([
          getPatientDocuments(),
          getMyEncounters(),
        ]);
        setDocuments(docs);
        setEncounters(encs);
        if (encs.length > 0) {
          setSelectedEncounterId(encs[0].id);
        }
      } catch (err) {
        console.error("Failed to load documents data:", err);
      } finally {
        setIsLoadingDocs(false);
      }
    }
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !selectedEncounterId) {
      setUploadError("Please select an encounter and choose a file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const resp = await uploadPatientDocument({
        encounterId: selectedEncounterId,
        documentType: selectedDocType,
        file: selectedFile,
      });

      setUploadSuccess(`Document uploaded successfully. ${resp.entity_count} clinical entities extracted.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Refresh documents list
      const updatedDocs = await getPatientDocuments();
      setDocuments(updatedDocs);
    } catch (err: unknown) {
      console.error("Document upload failed:", err);
      setUploadError("Failed to upload document. Please ensure it is a valid PDF or image.");
    } finally {
      setIsUploading(false);
    }
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
          Upload prescriptions, lab investigations, and hospital records for AI clinical extraction.
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
                    value={selectedEncounterId}
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
                    <option key={t.id} value={t.id}>{t.label}</option>
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
                  disabled={isUploading || !selectedFile || !selectedEncounterId}
                  isLoading={isUploading}
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

      {/* ── Section 2: Uploaded Documents List ── */}
      <Card className="border-[#E4E7EC] shadow-xs">
        <CardHeader className="pb-3 border-b border-[#E4E7EC]">
          <CardTitle className="text-sm font-bold text-[#172033] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#0F9D8A]" />
              <span>Uploaded Documents ({documents.length})</span>
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
                Upload medical prescriptions or lab reports above to keep your health history organized.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E7EC]">
              {documents.map((doc) => (
                <div key={doc.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#155EEF] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-[#172033] truncate">
                        {doc.original_filename || "Clinical Document"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-[#667085] mt-0.5">
                        <span className="capitalize font-medium">{doc.document_type.replace(/_/g, " ")}</span>
                        <span>•</span>
                        <span>{doc.upload_timestamp}</span>
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>{doc.entity_count} entities extracted</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
