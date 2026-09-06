"use client";
import React from "react";

export function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--ink-200)] border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] overflow-hidden animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="py-3.5 px-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[var(--ink-100)] shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-6 w-12 bg-[var(--ink-200)] rounded" />
            <div className="h-3 w-20 bg-[var(--ink-100)] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QueueListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--ink-200)] animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)]">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-36 bg-[var(--ink-200)] rounded" />
              <div className="h-4 w-20 bg-[var(--ink-100)] rounded" />
              <div className="h-4 w-16 bg-[var(--ink-100)] rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-24 bg-[var(--ink-100)] rounded" />
              <div className="h-3 w-28 bg-[var(--ink-100)] rounded" />
              <div className="h-3 w-16 bg-[var(--ink-100)] rounded" />
            </div>
          </div>
          <div className="h-8 w-24 bg-[var(--ink-100)] rounded" />
        </div>
      ))}
    </div>
  );
}

export function ClinicalSummarySkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Banner skeleton */}
      <div className="h-14 bg-[var(--ink-100)] rounded-lg border border-[var(--ink-200)]" />
      {/* Narrative skeleton */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] p-5 space-y-3">
        <div className="h-4 w-40 bg-[var(--ink-200)] rounded" />
        <div className="h-3 w-full bg-[var(--ink-100)] rounded" />
        <div className="h-3 w-4/5 bg-[var(--ink-100)] rounded" />
      </div>
      {/* Structured sections skeleton */}
      <div className="border border-[var(--ink-200)] rounded-lg bg-[var(--bg-surface)] divide-y divide-[var(--ink-200)]">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 flex gap-4">
            <div className="w-28 h-4 bg-[var(--ink-200)] rounded shrink-0" />
            <div className="flex-1 h-4 bg-[var(--ink-100)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FindingsSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 bg-[var(--bg-surface)] border border-[var(--ink-200)] rounded-md p-4 flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-3 w-32 bg-[var(--ink-200)] rounded" />
            <div className="h-4 w-64 bg-[var(--ink-100)] rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-7 bg-[var(--ink-100)] rounded" />
            <div className="h-7 w-7 bg-[var(--ink-100)] rounded" />
            <div className="h-7 w-7 bg-[var(--ink-100)] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
