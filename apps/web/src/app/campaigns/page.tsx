"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CampaignChart } from "@/components/campaign-chart";
import { StatsCard } from "@/components/stats-card";
import { EmptyState } from "@/components/empty-state";
import { CardSkeleton } from "@/components/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Eye, Reply, BarChart3 } from "lucide-react";
import Link from "next/link";

interface EmailStats {
  draft: number;
  approved: number;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

export default function CampaignsPage() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<EmailStats>("/emails/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasData = stats && stats.sent > 0;

  const chartData = stats
    ? [{ name: "All Outreach", sent: stats.sent, opened: stats.opened, replied: stats.replied }]
    : [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Campaigns</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#344767]">Campaigns</h1>
        <p className="text-sm text-[#7b809a]">Track your outreach performance</p>
      </div>

      {loading ? (
        <>
          <CardSkeleton count={3} />
          <div className="material-card p-6">
            <Skeleton className="h-[320px] w-full" />
          </div>
        </>
      ) : !hasData ? (
        <div className="material-card">
          <EmptyState
            icon={BarChart3}
            title="No campaign data yet"
            description="Start sending emails to see campaign analytics here."
          />
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid gap-6 sm:grid-cols-3">
            <StatsCard
              title="Total Sent"
              value={stats.sent}
              icon={Send}
              subtitle={`${stats.opened} opened`}
              gradient="info"
            />
            <StatsCard
              title="Open Rate"
              value={`${stats.open_rate}%`}
              icon={Eye}
              subtitle={`${stats.opened} of ${stats.sent} emails`}
              gradient="success"
            />
            <StatsCard
              title="Reply Rate"
              value={`${stats.reply_rate}%`}
              icon={Reply}
              subtitle={`${stats.replied} replies`}
              gradient="warning"
            />
          </div>

          {/* Performance Chart */}
          <div className="material-card p-6">
            <h2 className="mb-4 text-sm font-bold text-[#344767]">Outreach Performance</h2>
            <CampaignChart campaigns={chartData} />
          </div>
        </>
      )}
    </div>
  );
}
