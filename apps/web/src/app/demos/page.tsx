"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { DemoCard } from "@/components/demo-card";
import { DemoBuilder } from "@/components/demo-builder";
import { EmptyState } from "@/components/empty-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { Wand2 } from "lucide-react";

interface Demo {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
  created_at: string;
}

function DemosContent() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDemos = useCallback(() => {
    api<Demo[]>("/demos")
      .then(setDemos)
      .catch(() => toast.error("Failed to load demos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDemos(); }, [loadDemos]);

  if (selectedId) {
    return <DemoBuilder projectId={selectedId} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-[#7b809a] mb-1">Home / Demos</p>
          <h1 className="text-xl font-bold text-[#344767]">Demo Builder</h1>
          <p className="text-xs text-[#7b809a] mt-1">AI-powered demo applications for your prospects</p>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={6} />
      ) : demos.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No demos yet"
          description="Build your first AI-powered demo from the Prospects page — click on a prospect and select 'Build Demo'."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {demos.map((demo) => (
            <DemoCard key={demo.id} {...demo} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DemosPage() {
  return (
    <Suspense fallback={<CardSkeleton count={6} />}>
      <DemosContent />
    </Suspense>
  );
}
