"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Accessibility,
  Type,
  Contrast,
  Wind,
  Hand,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

const PREFS_KEY = "careflow_accessibility_prefs";

interface Prefs {
  largerText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  largerTouch: boolean;
}

const DEFAULT_PREFS: Prefs = {
  largerText: false,
  highContrast: false,
  reducedMotion: false,
  largerTouch: false,
};

function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  if (prefs.largerText) root.setAttribute("data-text-size", "large");
  else root.removeAttribute("data-text-size");

  if (prefs.highContrast) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");

  if (prefs.reducedMotion) root.setAttribute("data-reduced-motion", "true");
  else root.removeAttribute("data-reduced-motion");

  if (prefs.largerTouch) root.setAttribute("data-touch", "large");
  else root.removeAttribute("data-touch");
}

export default function AccessibilityPage() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });
  const [saved, setSaved] = useState(false);

  // Apply prefs on mount
  useEffect(() => {
    applyPrefs(prefs);
  }, []);

  const toggle = useCallback((key: keyof Prefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      applyPrefs(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);

  const resetAll = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
    applyPrefs(DEFAULT_PREFS);
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      // ignore
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);

  const controls = [
    {
      key: "largerText" as keyof Prefs,
      icon: Type,
      label: "Larger Text",
      description:
        "Increases base font size by 2px across the entire portal. Recommended for users who find default text difficult to read.",
    },
    {
      key: "highContrast" as keyof Prefs,
      icon: Contrast,
      label: "High Contrast",
      description:
        "Switches to a high-contrast dark colour palette with bright accents. Designed for users with low vision or light sensitivity.",
    },
    {
      key: "reducedMotion" as keyof Prefs,
      icon: Wind,
      label: "Reduced Motion",
      description:
        "Disables animations, transitions, and scroll effects across the portal. Always active when your OS has 'Reduce Motion' enabled.",
    },
    {
      key: "largerTouch" as keyof Prefs,
      icon: Hand,
      label: "Larger Touch Targets",
      description:
        "Increases the minimum tap area of all buttons, links, and interactive controls to 48×48 px. Recommended on touchscreen devices.",
    },
  ];

  const anyEnabled = Object.values(prefs).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-3 border-b border-[var(--ink-200)] flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-900)] flex items-center gap-2">
            <Accessibility className="w-6 h-6 text-[var(--clinical)]" />
            Accessibility
          </h1>
          <p className="text-sm text-[var(--ink-500)] mt-1">
            Personalise your CareFlow AI experience. All preferences are saved locally on this device.
          </p>
        </div>
        {saved && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border border-[var(--status-success-bd)] px-3 py-1.5 rounded-full flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Saved
          </div>
        )}
      </div>

      {/* Persistence notice */}
      <div className="p-3 rounded-md border border-[var(--ink-200)] bg-[var(--bg-surface-2)] flex items-start gap-2.5 text-xs">
        <Info className="w-4 h-4 text-[var(--ink-400)] flex-shrink-0 mt-0.5" />
        <span className="text-[var(--ink-600)]">
          These preferences are stored in your browser and will be automatically restored the next time you open CareFlow AI on this device. Clearing browser data will reset them.
        </span>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {controls.map(({ key, icon: Icon, label, description }) => {
          const isOn = prefs[key];
          return (
            <Card key={key}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${isOn ? "bg-[var(--clinical-light)] text-[var(--clinical)]" : "bg-[var(--bg-surface-2)] text-[var(--ink-400)]"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink-900)]">{label}</p>
                      <p className="text-xs text-[var(--ink-500)] mt-0.5 leading-relaxed">{description}</p>
                    </div>
                  </div>

                  {/* Toggle switch */}
                  <button
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`${isOn ? "Disable" : "Enable"} ${label}`}
                    onClick={() => toggle(key)}
                    className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--clinical)] focus:ring-offset-2 cursor-pointer ${
                      isOn ? "bg-[var(--clinical)]" : "bg-[var(--ink-200)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                        isOn ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                    <span className="sr-only">{isOn ? "On" : "Off"}</span>
                  </button>
                </div>

                {isOn && (
                  <div className="mt-3 pt-3 border-t border-[var(--ink-200)]">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--clinical)] bg-[var(--clinical-light)] border border-[var(--clinical-mid)] px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      Active — applied to this session
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reset all */}
      {anyEnabled && (
        <div className="flex justify-end">
          <button
            onClick={resetAll}
            className="text-xs font-medium text-[var(--ink-500)] hover:text-[var(--status-error-fg)] transition-colors underline underline-offset-2 cursor-pointer"
          >
            Reset all accessibility preferences
          </button>
        </div>
      )}

      {/* System note */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--ink-200)]">
          <CardTitle className="text-sm">System Accessibility</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs text-[var(--ink-700)] space-y-2">
          <p>
            CareFlow AI also respects your operating system accessibility settings:
          </p>
          <ul className="space-y-1.5 list-none">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)] mt-1.5 flex-shrink-0" />
              <span><strong>OS Reduced Motion</strong> (macOS, iOS, Windows, Android) — animations are automatically disabled regardless of the toggle above.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)] mt-1.5 flex-shrink-0" />
              <span><strong>Screen Reader</strong> — all interactive elements include proper ARIA labels and roles for screen reader compatibility.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--clinical)] mt-1.5 flex-shrink-0" />
              <span><strong>Keyboard Navigation</strong> — the portal is fully navigable using Tab, Enter, Space, and arrow keys.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
