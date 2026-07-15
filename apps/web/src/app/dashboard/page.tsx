"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import {
  Users,
  Send,
  Mail,
  Brain,
  Sparkles,
  MessageSquare,
  Loader2,
  Search,
  TrendingUp,
  Activity,
  Clock,
  ArrowUpRight,
  Zap,
  Radar,
  FileEdit,
  ChevronRight,
  MailOpen,
  RefreshCw,
  Inbox,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats-card";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProspectStats {
  total: number;
  enriched: number;
  analyzed: number;
  contacted: number;
}

interface EmailStats {
  draft: number;
  approved: number;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

interface DiscoveryRun {
  id: string;
  config: Record<string, unknown>;
  status: string;
  companies_found: number;
  started_at: string;
  completed_at?: string;
}

interface AiAnalysis {
  confidence_score?: number;
}

interface Contact {
  id?: string;
  email?: string;
  name?: string;
}

interface Prospect {
  id: string;
  name: string;
  website?: string;
  phone?: string;
  industry: string;
  region: string;
  city?: string;
  status: string;
  contacts: Contact[];
  ai_analyses: AiAnalysis[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-72 animate-pulse rounded-lg bg-[#e9ecef]" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-[#e9ecef]" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 h-96 animate-pulse rounded-xl bg-white shadow-sm" />
        <div className="col-span-4 h-96 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline Progress                                                  */
/* ------------------------------------------------------------------ */

interface PipelineStepDef {
  name: string;
  icon: typeof Radar;
  count: number;
  gradient: string;
  actionLabel: string;
  actionKey: string;
  isLink?: boolean;
  href?: string;
}

function PipelineProgress({
  steps,
  onAction,
  loadingAction,
}: {
  steps: PipelineStepDef[];
  onAction: (key: string) => void;
  loadingAction: string | null;
}) {
  return (
    <div className="material-card p-5">
      <div className="flex items-center gap-2 mb-5">
        <div className="icon-shape icon-shape-dark" style={{ width: 36, height: 36, borderRadius: 8 }}>
          <Zap className="size-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#344767]">Pipeline Progress</h3>
          <p className="text-xs text-[#7b809a]">Your prospecting workflow</p>
        </div>
      </div>

      <div className="flex items-center">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isLoading = loadingAction === step.actionKey;

          return (
            <div key={step.actionKey} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2 flex-1">
                {/* Icon circle */}
                <div
                  className="flex size-12 items-center justify-center rounded-xl shadow-md"
                  style={{ background: step.gradient }}
                >
                  <Icon className="size-5 text-white" />
                </div>

                {/* Count */}
                <p className="text-xl font-bold tabular-nums text-[#344767]">
                  {formatNumber(step.count)}
                </p>

                {/* Label */}
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]">
                  {step.name}
                </p>

                {/* Action */}
                {step.isLink ? (
                  <Link href={step.href ?? "#"}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] border-[#e9ecef] text-[#7b809a] hover:text-[#344767] hover:border-[#344767]"
                    >
                      {step.actionLabel}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-[#e9ecef] text-[#7b809a] hover:text-[#344767] hover:border-[#344767]"
                    disabled={isLoading || step.count === 0}
                    onClick={() => onAction(step.actionKey)}
                  >
                    {isLoading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      step.actionLabel
                    )}
                  </Button>
                )}
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="flex items-center px-2 -mt-10">
                  <div className="w-8 h-px bg-[#e9ecef]" />
                  <ChevronRight className="size-3 text-[#7b809a]/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity Feed                                                      */
/* ------------------------------------------------------------------ */

function DashboardActivityFeed({
  discoveryRuns,
  emailStats,
  enrichedCount,
  analyzedCount,
}: {
  discoveryRuns: DiscoveryRun[];
  emailStats: EmailStats;
  enrichedCount: number;
  analyzedCount: number;
}) {
  interface FeedItem {
    id: string;
    dotColor: string;
    text: string;
    timestamp: string;
  }

  const items: FeedItem[] = [];

  for (const run of discoveryRuns) {
    const region = (run.config as Record<string, string>)?.region || "target region";
    items.push({
      id: `discovery-${run.id}`,
      dotColor: "bg-[#1a73e8]",
      text: `Discovery ${run.status} -- found ${run.companies_found} companies in ${region}`,
      timestamp: run.started_at,
    });
  }

  if (enrichedCount > 0) {
    items.push({
      id: "enriched",
      dotColor: "bg-[#e91e63]",
      text: `${enrichedCount} companies enriched with contact data`,
      timestamp: new Date().toISOString(),
    });
  }

  if (analyzedCount > 0) {
    items.push({
      id: "analyzed",
      dotColor: "bg-[#fb8c00]",
      text: `${analyzedCount} companies analyzed by AI`,
      timestamp: new Date().toISOString(),
    });
  }

  if (emailStats.sent > 0) {
    items.push({
      id: "sent",
      dotColor: "bg-[#4caf50]",
      text: `${emailStats.sent} emails sent -- ${emailStats.open_rate}% open rate`,
      timestamp: new Date().toISOString(),
    });
  }

  if (emailStats.draft > 0) {
    items.push({
      id: "drafts",
      dotColor: "bg-[#1a73e8]",
      text: `${emailStats.draft} email drafts pending review`,
      timestamp: new Date().toISOString(),
    });
  }

  if (emailStats.replied > 0) {
    items.push({
      id: "replied",
      dotColor: "bg-[#4caf50]",
      text: `${emailStats.replied} replies received`,
      timestamp: new Date().toISOString(),
    });
  }

  return (
    <div className="max-h-[400px] overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="size-8 text-[#e9ecef]" />
          <p className="mt-3 text-sm text-[#7b809a]">No recent activity</p>
          <p className="mt-1 text-xs text-[#7b809a]/60">Run a discovery to get started</p>
        </div>
      ) : (
        <div className="relative space-y-0">
          {/* Vertical timeline line */}
          <div className="absolute top-2 bottom-2 left-[5px] w-px bg-[#e9ecef]" />
          {items.map((item) => (
            <div
              key={item.id}
              className="relative flex items-start gap-3 py-2.5 pl-0 transition-colors hover:bg-[#f8f9fa] rounded-md px-1"
            >
              <div className={`relative z-10 mt-1.5 size-[10px] shrink-0 rounded-full ${item.dotColor} ring-2 ring-white`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-[#344767]">
                  {item.text}
                </p>
                <p className="mt-0.5 text-[11px] text-[#7b809a]">
                  {relativeTime(item.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Outreach Performance Panel                                         */
/* ------------------------------------------------------------------ */

function OutreachPerformance({ emailStats }: { emailStats: EmailStats }) {
  if (emailStats.sent === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#f8f9fa]">
          <MailOpen className="size-7 text-[#e9ecef]" />
        </div>
        <p className="mt-4 text-sm font-medium text-[#7b809a]">No emails sent yet</p>
        <p className="mt-1 max-w-xs text-xs text-[#7b809a]/60">
          Once you start sending outreach emails, performance metrics and charts will appear here.
        </p>
      </div>
    );
  }

  const chartData = [
    { name: "Sent", value: emailStats.sent },
    { name: "Opened", value: emailStats.opened },
    { name: "Replied", value: emailStats.replied },
  ];

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e91e63" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#e91e63" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#7b809a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#7b809a" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#344767",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#e91e63"
                strokeWidth={2}
                fill="url(#areaGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex w-40 flex-col gap-3">
        <div className="rounded-xl bg-[#4caf50]/10 p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#4caf50]">
            {emailStats.open_rate}%
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7b809a]">Open Rate</p>
        </div>
        <div className="rounded-xl bg-[#fb8c00]/10 p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#fb8c00]">
            {emailStats.reply_rate}%
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7b809a]">Reply Rate</p>
        </div>
        <div className="rounded-xl bg-[#e91e63]/10 p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#e91e63]">
            {emailStats.replied}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7b809a]">Replies</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MAIN DASHBOARD                                                     */
/* ================================================================== */

export default function DashboardPage() {
  const [prospectStats, setProspectStats] = useState<ProspectStats | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [discoveryRuns, setDiscoveryRuns] = useState<DiscoveryRun[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<ProspectStats>("/prospects/stats"),
      api<EmailStats>("/emails/stats"),
      api<DiscoveryRun[]>("/discovery/runs"),
      api<Prospect[]>("/prospects/?limit=10"),
    ])
      .then(([ps, es, dr, allProspects]) => {
        setProspectStats(ps);
        setEmailStats(es);
        setDiscoveryRuns(dr);
        setProspects(allProspects);
      })
      .catch(() => {
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handlePipelineAction(actionKey: string) {
    const actionMap: Record<string, { endpoint: string; label: string }> = {
      enrich: { endpoint: "/enrichment/batch?limit=50", label: "Enrichment" },
      analyze: { endpoint: "/analysis/batch?limit=50", label: "Analysis" },
      draft: { endpoint: "/emails/batch", label: "Email drafting" },
    };

    const action = actionMap[actionKey];
    if (!action) return;

    setActionLoading(actionKey);
    try {
      const result = await apiPost<{ count: number }>(action.endpoint, {});
      toast.success(`${action.label} started for ${result.count} items`);
      fetchData();
    } catch {
      toast.error(`Failed to start ${action.label.toLowerCase()}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleQuickAction(prospect: Prospect) {
    const status = prospect.status?.toLowerCase() ?? "new";

    if (status === "new") {
      setActionLoading(`enrich-${prospect.id}`);
      try {
        await apiPost("/enrichment/batch?limit=1", {});
        toast.success(`Enrichment started for ${prospect.name}`);
        fetchData();
      } catch {
        toast.error("Failed to start enrichment");
      } finally {
        setActionLoading(null);
      }
    } else if (status === "enriched") {
      setActionLoading(`analyze-${prospect.id}`);
      try {
        await apiPost("/analysis/batch?limit=1", {});
        toast.success(`Analysis started for ${prospect.name}`);
        fetchData();
      } catch {
        toast.error("Failed to start analysis");
      } finally {
        setActionLoading(null);
      }
    } else if (status === "analyzed") {
      setActionLoading(`draft-${prospect.id}`);
      try {
        await apiPost(`/emails/draft/${prospect.id}`, {});
        toast.success(`Email drafted for ${prospect.name}`);
        fetchData();
      } catch {
        toast.error("Failed to draft email");
      } finally {
        setActionLoading(null);
      }
    }
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  const ps = prospectStats ?? { total: 0, enriched: 0, analyzed: 0, contacted: 0 };
  const es = emailStats ?? { draft: 0, approved: 0, sent: 0, opened: 0, replied: 0, open_rate: 0, reply_rate: 0 };

  const totalEmails = prospects.reduce(
    (sum, p) => sum + (p.contacts?.filter((c) => c.email).length ?? 0),
    0
  );

  const topProspects = [...prospects]
    .sort((a, b) => {
      const aScore = a.ai_analyses?.[0]?.confidence_score ?? 0;
      const bScore = b.ai_analyses?.[0]?.confidence_score ?? 0;
      return bScore - aScore;
    })
    .slice(0, 8);

  const pipelineSteps: PipelineStepDef[] = [
    {
      name: "Discover",
      icon: Radar,
      count: ps.total,
      gradient: "linear-gradient(135deg, #1a73e8, #1557b0)",
      actionLabel: "Run",
      actionKey: "discover",
      isLink: true,
      href: "/discover",
    },
    {
      name: "Enrich",
      icon: Sparkles,
      count: ps.enriched,
      gradient: "linear-gradient(135deg, #e91e63, #c2185b)",
      actionLabel: "Enrich All",
      actionKey: "enrich",
    },
    {
      name: "Analyze",
      icon: Brain,
      count: ps.analyzed,
      gradient: "linear-gradient(135deg, #fb8c00, #ef6c00)",
      actionLabel: "Analyze All",
      actionKey: "analyze",
    },
    {
      name: "Draft",
      icon: FileEdit,
      count: es.draft,
      gradient: "linear-gradient(135deg, #344767, #1f283e)",
      actionLabel: "Draft All",
      actionKey: "draft",
    },
    {
      name: "Send",
      icon: Send,
      count: es.sent,
      gradient: "linear-gradient(135deg, #4caf50, #388e3c)",
      actionLabel: "Go to Outreach",
      actionKey: "outreach",
      isLink: true,
      href: "/outreach",
    },
  ];

  const statusBadgeMap: Record<string, string> = {
    new: "bg-gradient-to-r from-[#7b809a] to-[#5c5f6e] text-white",
    enriched: "bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white",
    analyzed: "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white",
    contacted: "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white",
  };

  return (
    <div className="space-y-6">
      {/* ===== HEADER / BREADCRUMB ===== */}
      <div className="animate-fade-in">
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Dashboard</span>
        </p>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-bold text-[#344767]">Dashboard</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="h-8 gap-1.5 border-[#e9ecef] bg-white text-xs text-[#7b809a] hover:bg-[#f8f9fa] hover:text-[#344767] shadow-sm"
          >
            <RefreshCw className="size-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ===== ROW 1: STAT CARDS ===== */}
      <section className="grid grid-cols-4 gap-6">
        <StatsCard
          title="Prospects"
          value={formatNumber(ps.total)}
          subtitle={`+${ps.enriched} enriched`}
          icon={Users}
          gradient="info"
          trend="up"
          delay={1}
        />
        <StatsCard
          title="Emails Found"
          value={formatNumber(totalEmails)}
          subtitle="Contact emails"
          icon={Mail}
          gradient="primary"
          delay={2}
        />
        <StatsCard
          title="AI Analyzed"
          value={formatNumber(ps.analyzed)}
          subtitle={`${ps.total > 0 ? Math.round((ps.analyzed / ps.total) * 100) : 0}% of total`}
          icon={Brain}
          gradient="warning"
          delay={3}
        />
        <StatsCard
          title="Emails Sent"
          value={formatNumber(es.sent)}
          subtitle={`${es.opened} opened`}
          icon={Send}
          gradient="success"
          trend="up"
          delay={4}
        />
      </section>

      {/* ===== ROW 2: PIPELINE PROGRESS ===== */}
      <section className="animate-slide-up delay-3">
        <PipelineProgress
          steps={pipelineSteps}
          onAction={handlePipelineAction}
          loadingAction={actionLoading}
        />
      </section>

      {/* ===== ROW 3: TABLE + QUICK ACTIONS ===== */}
      <section className="grid grid-cols-12 gap-6">
        {/* Left: Top Prospects (8/12) */}
        <div className="col-span-8 animate-slide-up delay-5">
          <div className="material-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9ecef]">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-[#e91e63]" />
                <h2 className="text-sm font-bold text-[#344767]">Top Prospects</h2>
              </div>
              <Link
                href="/prospects"
                className="flex items-center gap-1 text-xs text-[#7b809a] transition-colors hover:text-[#e91e63]"
              >
                View All
                <ArrowUpRight className="size-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e9ecef]">
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">#</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Company</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Industry</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Status</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Confidence</th>
                    <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {topProspects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <Inbox className="mx-auto size-8 text-[#e9ecef]" />
                        <p className="mt-3 text-sm text-[#7b809a]">No prospects yet</p>
                        <p className="mt-1 text-xs text-[#7b809a]/60">Run a discovery to get started</p>
                      </td>
                    </tr>
                  ) : (
                    topProspects.map((prospect, index) => {
                      const score = prospect.ai_analyses?.[0]?.confidence_score ?? 0;
                      const scorePercent = Math.round(score * 100);
                      const status = prospect.status?.toLowerCase() ?? "new";
                      const isItemLoading =
                        actionLoading === `enrich-${prospect.id}` ||
                        actionLoading === `analyze-${prospect.id}` ||
                        actionLoading === `draft-${prospect.id}`;

                      const initials = prospect.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase();

                      const barColor =
                        scorePercent >= 70
                          ? "#4caf50"
                          : scorePercent >= 40
                            ? "#fb8c00"
                            : scorePercent > 0
                              ? "#f44335"
                              : "#e9ecef";

                      const actionLabel =
                        status === "new"
                          ? "Enrich"
                          : status === "enriched"
                            ? "Analyze"
                            : status === "analyzed"
                              ? "Draft"
                              : "View";

                      return (
                        <tr
                          key={prospect.id}
                          className="group border-b border-[#f0f2f5] transition-colors hover:bg-[#f8f9fa]"
                        >
                          <td className="px-5 py-3 text-xs tabular-nums text-[#7b809a] font-medium">
                            {index + 1}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#344767] to-[#1f283e] text-[10px] font-bold text-white">
                                {initials}
                              </div>
                              <p className="text-sm font-semibold text-[#344767] group-hover:text-[#e91e63] transition-colors">
                                {prospect.name}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs text-[#7b809a] capitalize">
                              {prospect.industry || "---"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadgeMap[status] ?? statusBadgeMap.new}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#e9ecef]">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${scorePercent}%`,
                                    backgroundColor: barColor,
                                  }}
                                />
                              </div>
                              <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-[#344767]">
                                {scorePercent > 0 ? `${scorePercent}%` : "---"}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {status === "contacted" ? (
                              <Link href={`/outreach?prospect=${prospect.id}`}>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  className="border-[#e9ecef] text-[11px] text-[#7b809a] hover:text-[#344767] hover:border-[#344767]"
                                >
                                  View
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                variant="outline"
                                size="xs"
                                className="border-[#e9ecef] text-[11px] text-[#7b809a] hover:text-[#e91e63] hover:border-[#e91e63]"
                                disabled={isItemLoading}
                                onClick={() => handleQuickAction(prospect)}
                              >
                                {isItemLoading ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  actionLabel
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Quick Actions + Activity (4/12) */}
        <div className="col-span-4 space-y-6">
          {/* Quick Actions */}
          <div className="material-card animate-slide-up delay-5">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e9ecef]">
              <Zap className="size-4 text-[#fb8c00]" />
              <h2 className="text-sm font-bold text-[#344767]">Quick Actions</h2>
            </div>
            <div className="p-4 space-y-2">
              <Link href="/discover">
                <Button className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white text-xs font-semibold shadow-md shadow-[#1a73e8]/20 hover:shadow-lg hover:shadow-[#1a73e8]/30 rounded-lg border-0">
                  <Search className="size-4" />
                  Run Discovery
                </Button>
              </Link>
              <Button
                onClick={() => handlePipelineAction("enrich")}
                disabled={actionLoading === "enrich"}
                className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white text-xs font-semibold shadow-md shadow-[#e91e63]/20 hover:shadow-lg hover:shadow-[#e91e63]/30 rounded-lg border-0"
              >
                <Sparkles className="size-4" />
                Enrich All
              </Button>
              <Button
                onClick={() => handlePipelineAction("analyze")}
                disabled={actionLoading === "analyze"}
                className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white text-xs font-semibold shadow-md shadow-[#fb8c00]/20 hover:shadow-lg hover:shadow-[#fb8c00]/30 rounded-lg border-0"
              >
                <Brain className="size-4" />
                Analyze All
              </Button>
              <Button
                onClick={() => handlePipelineAction("draft")}
                disabled={actionLoading === "draft"}
                className="w-full justify-start gap-2 h-10 bg-gradient-to-r from-[#344767] to-[#1f283e] text-white text-xs font-semibold shadow-md shadow-[#344767]/20 hover:shadow-lg hover:shadow-[#344767]/30 rounded-lg border-0"
              >
                <FileEdit className="size-4" />
                Draft All
              </Button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="material-card animate-slide-up delay-6 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e9ecef]">
              <Clock className="size-4 text-[#1a73e8]" />
              <h2 className="text-sm font-bold text-[#344767]">Recent Activity</h2>
            </div>
            <div className="p-4">
              <DashboardActivityFeed
                discoveryRuns={discoveryRuns.slice(0, 5)}
                emailStats={es}
                enrichedCount={ps.enriched}
                analyzedCount={ps.analyzed}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== ROW 4: OUTREACH PERFORMANCE ===== */}
      <section className="animate-slide-up delay-7">
        <div className="material-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e9ecef]">
            <TrendingUp className="size-4 text-[#e91e63]" />
            <h2 className="text-sm font-bold text-[#344767]">Outreach Performance</h2>
          </div>
          <div className="p-5">
            <OutreachPerformance emailStats={es} />
          </div>
        </div>
      </section>
    </div>
  );
}
