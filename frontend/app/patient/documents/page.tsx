import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
export default function PatientDocuments() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText className="w-6 h-6 text-blue-600" /> Documents</h1>
        <p className="text-gray-500 mt-1 text-sm">Upload prescriptions, lab reports, and discharge summaries for AI extraction.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Upload a document</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">Document uploader (POST /intake/document/upload) will be built in a later step.</p>
          <div className="h-32 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
            Document uploader — Later step
          </div>
        </CardContent>
      </Card>
    </div>
  );
}