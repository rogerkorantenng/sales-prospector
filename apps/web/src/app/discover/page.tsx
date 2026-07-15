"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { DiscoveryForm } from "@/components/discovery-form";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import Link from "next/link";

interface DiscoveryRun {
  id: string;
  config: { regions: string[]; industries: string[] };
  status: string;
  companies_found: number;
  started_at: string;
  completed_at: string | null;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "--";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function statusVariant(status: string) {
  switch (status) {
    case "running": return "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white";
    case "completed": return "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white";
    case "failed": return "bg-gradient-to-r from-[#f44335] to-[#d32f2f] text-white";
    default: return "bg-[#f0f2f5] text-[#7b809a]";
  }
}

export default function DiscoverPage() {
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRuns = useCallback(() => {
    api<DiscoveryRun[]>("/discovery/runs")
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Discover</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#344767]">Discover Companies</h1>
        <p className="text-sm text-[#7b809a]">Find new prospects by region and industry</p>
      </div>

      {/* Discovery Config */}
      <DiscoveryForm onComplete={loadRuns} />

      {/* Run History */}
      <div className="material-card overflow-hidden">
        <div className="border-b border-[#e9ecef] px-5 py-4">
          <h2 className="text-sm font-bold text-[#344767]">Run History</h2>
        </div>

        {loading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={6} /></div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No discovery runs yet"
            description="Configure and start your first discovery run above."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#e9ecef]">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Regions</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Industries</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70 text-right">Found</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Duration</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id} className="border-[#f0f2f5] hover:bg-[#f8f9fa]">
                  <TableCell>
                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusVariant(run.status)}`}>
                      {run.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {run.config.regions?.map((r) => (
                        <Badge key={r} variant="outline" className="px-1.5 py-0 text-[10px] font-normal border-[#e9ecef] text-[#7b809a]">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {run.config.industries?.map((i) => (
                        <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[10px] capitalize font-normal bg-[#f0f2f5] text-[#7b809a]">
                          {i}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-[#344767]">
                    {run.companies_found}
                  </TableCell>
                  <TableCell className="text-xs text-[#7b809a] tabular-nums">
                    {formatDuration(run.started_at, run.completed_at)}
                  </TableCell>
                  <TableCell className="text-xs text-[#7b809a]">
                    {new Date(run.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
