"use client";
import { User, Stethoscope } from "lucide-react";
import type { ConversationEntry } from "@/stores/intake.store";

interface Props {
  history: ConversationEntry[];
}

export function ConversationHistory({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="space-y-4">
      {history.map((entry, i) => (
        <div key={i} className="space-y-3">
          {/* Question from PS47 */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-[#155EEF]" />
            </div>
            <div className="flex-1 bg-white border border-[#E4E7EC] rounded-xl px-4 py-3">
              <p className="text-sm text-[#172033]">{entry.question}</p>
            </div>
          </div>

          {/* Patient answer */}
          <div className="flex items-start gap-3 pl-11">
            <div className="flex-1 bg-[#155EEF] bg-opacity-5 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-sm text-[#172033]">{entry.answer}</p>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-[#667085]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}