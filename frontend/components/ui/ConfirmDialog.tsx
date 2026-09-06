"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog adhering to WAI-ARIA alertdialog pattern.
 *
 * Requirements satisfied:
 * - role="alertdialog" with aria-modal="true"
 * - aria-labelledby and aria-describedby linked to heading and paragraph
 * - Autofocuses the Cancel button on open (preventing accidental Enter keypress from deleting)
 * - Traps Tab focus inside the dialog while open
 * - Escape key closes the dialog
 * - Backdrop click closes the dialog
 */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = "Delete Document",
  cancelText = "Cancel",
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus Cancel button on open (explicit safety to prevent accidental Enter deletion)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Keyboard navigation: Escape key closes; Tab traps focus
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (!isLoading) {
          onCancel();
        }
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return;
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [isOpen, isLoading, onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scrolling while modal is open
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 text-[var(--ink-800)]"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-[var(--ink-900)]">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="text-xs text-[var(--ink-500)] leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--ink-200)]">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-[var(--ink-700)] hover:text-[var(--ink-900)] bg-[var(--bg-surface-2)] hover:bg-[var(--ink-100)] border border-[var(--ink-200)] rounded-md transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--clinical)]"
          >
            {cancelText}
          </button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            isLoading={isLoading}
            className={
              isDestructive
                ? "bg-[var(--status-error-fg)] hover:bg-red-700 text-white font-semibold text-xs px-4 py-2 border-transparent cursor-pointer shadow-xs"
                : "text-xs px-4 py-2 font-semibold cursor-pointer"
            }
          >
            {isLoading ? "Deleting..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
