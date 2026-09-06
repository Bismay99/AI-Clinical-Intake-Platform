import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PS47 — AI Clinical Intake",
  description: "AI-Powered Pre-Consultation Clinical Intake Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-800)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}