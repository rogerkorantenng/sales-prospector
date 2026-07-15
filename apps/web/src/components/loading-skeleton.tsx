"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2">
      <div className="flex gap-4 border-b border-[#e9ecef] pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 bg-[#e9ecef]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1 bg-[#f0f2f5]" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="material-card p-4 space-y-3">
          <Skeleton className="h-4 w-2/3 bg-[#e9ecef]" />
          <Skeleton className="h-3 w-full bg-[#f0f2f5]" />
          <Skeleton className="h-3 w-4/5 bg-[#f0f2f5]" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[#e9ecef] p-3">
          <Skeleton className="size-4 shrink-0 rounded bg-[#e9ecef]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3 bg-[#e9ecef]" />
            <Skeleton className="h-3 w-2/3 bg-[#f0f2f5]" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full bg-[#f0f2f5]" />
        </div>
      ))}
    </div>
  );
}
