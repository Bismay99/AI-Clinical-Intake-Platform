import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { variant?: BadgeVariant; }

const variantStyles: Record<BadgeVariant, string> = {
  default: "text-gray-700 bg-gray-100 border-gray-200",
  success: "text-green-700 bg-green-50 border-green-200",
  warning: "text-amber-700 bg-amber-50 border-amber-200",
  error: "text-red-700 bg-red-50 border-red-200",
  info: "text-blue-700 bg-blue-50 border-blue-200",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", variantStyles[variant], className)} {...props} />;
}