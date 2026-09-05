import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function verificationStatusColor(status: string): string {
  switch (status) {
    case "accepted": return "text-green-700 bg-green-50 border-green-200";
    case "edited": return "text-blue-700 bg-blue-50 border-blue-200";
    case "rejected": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-amber-700 bg-amber-50 border-amber-200";
  }
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-green-700";
  if (confidence >= 0.5) return "text-amber-700";
  return "text-red-700";
}