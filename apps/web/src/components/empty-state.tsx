"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon, title, description, actionLabel, onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#f0f2f5]">
        <Icon className="size-6 text-[#7b809a]" />
      </div>
      <h3 className="mb-1 text-sm font-bold text-[#344767]">{title}</h3>
      <p className="max-w-sm text-sm text-[#7b809a]">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-4 border-[#e9ecef] text-[#7b809a] hover:text-[#344767]" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
