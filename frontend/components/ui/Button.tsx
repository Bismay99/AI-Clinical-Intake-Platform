import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    const base = [
      "inline-flex items-center justify-center gap-1.5 font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      "focus-visible:ring-[var(--clinical)]",
      "disabled:opacity-50 disabled:pointer-events-none select-none",
    ].join(" ");

    const variants: Record<string, string> = {
      // Clinical teal-blue — primary action
      primary:
        "bg-[var(--clinical)] text-white hover:bg-[var(--clinical-hover)] active:bg-[var(--clinical-dark)] rounded-md shadow-[var(--shadow-xs)]",
      // Secondary — bordered, no fill
      secondary:
        "bg-white text-[var(--ink-700)] border border-[var(--ink-200)] hover:bg-[var(--ink-100)] active:bg-[var(--ink-200)] rounded-md",
      // Ghost — text-only, no border
      ghost:
        "text-[var(--ink-700)] hover:bg-[var(--ink-100)] active:bg-[var(--ink-200)] rounded-md",
      // Destructive / danger — reserved for irreversible actions
      destructive:
        "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] hover:bg-red-100 active:bg-red-200 rounded-md",
      danger:
        "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border border-[var(--status-error-bd)] hover:bg-red-100 active:bg-red-200 rounded-md",
    };

    const sizes: Record<string, string> = {
      xs: "text-xs px-2.5 py-1 leading-none",
      sm: "text-sm px-3 py-1.5",
      md: "text-sm px-4 py-2",
      lg: "text-base px-6 py-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span
            className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";