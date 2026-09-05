import { Mic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
export default function PatientIntake() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Mic className="w-6 h-6 text-blue-600" /> Intake Session</h1>
        <p className="text-gray-500 mt-1 text-sm">Answer the AI clinical questions by voice or text.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Start your intake</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">The voice intake interface will be built in the next step. The service layer is already wired to POST /intake/session/start, POST /intake/turn, and POST /intake/turn/voice.</p>
          <div className="h-32 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
            Intake interface — Step 2
          </div>
        </CardContent>
      </Card>
    </div>
  );
}