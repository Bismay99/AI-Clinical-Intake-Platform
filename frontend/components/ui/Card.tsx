import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Top-level card container */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-surface)] rounded-lg border border-[var(--ink-200)]",
        "shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    />
  );
}

/** Card header — separated by a bottom border */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-5 py-4 border-b border-[var(--ink-200)]", className)}
      {...props}
    />
  );
}

/** Card body content */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

/** Card section title */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold text-[var(--ink-900)]", className)}
      {...props}
    />
  );
}

/**
 * CardSection — inset section within a card (e.g., entity group,
 * document row, doctor annotation block). Uses surface-2 background.
 */
export function CardSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-5 py-3 bg-[var(--bg-surface-2)] border-b border-[var(--ink-200)] last:border-b-0",
        className
      )}
      {...props}
    />
  );
}