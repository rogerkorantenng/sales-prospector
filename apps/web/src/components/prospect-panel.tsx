"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Globe,
  Phone,
  MapPin,
  Building2,
  Users,
  Mail,
  Sparkles,
  ArrowRight,
  Loader2,
  Wand2,
  Layout,
} from "lucide-react";

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  source?: string;
  verified?: boolean;
  confidence?: number;
}

interface RecommendedService {
  service_name: string;
  relevance: string;
  reason: string;
}

interface AiAnalysis {
  confidence_score: number;
  reasoning: string;
  recommended_services: RecommendedService[];
  pain_points: string[];
}

interface Email {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
}

interface ProspectData {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  industry: string;
  region: string;
  city: string;
  address: string;
  size_estimate: string | null;
  about_text: string | null;
  status: string;
  contacts: Contact[];
  ai_analyses: AiAnalysis[];
  emails: Email[];
}

interface ProspectPanelProps {
  prospectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProspectUpdated: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-gradient-to-r from-[#7b809a] to-[#5c5f6e] text-white" },
  enriched: { label: "Enriched", className: "bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white" },
  analyzed: { label: "Analyzed", className: "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white" },
  contacted: { label: "Contacted", className: "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white" },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.new;
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${config.className}`}>
      {config.label}
    </span>
  );
}

function RelevanceBadge({ relevance }: { relevance: string }) {
  const cls =
    relevance === "high"
      ? "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white"
      : relevance === "medium"
        ? "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white"
        : "bg-gradient-to-r from-[#7b809a] to-[#5c5f6e] text-white";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {relevance}
    </span>
  );
}

export function ProspectPanel({
  prospectId,
  open,
  onOpenChange,
  onProspectUpdated,
}: ProspectPanelProps) {
  const router = useRouter();
  const [prospect, setProspect] = useState<ProspectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDemoDialog, setShowDemoDialog] = useState(false);
  const [demoType, setDemoType] = useState<"landing_page" | "saas_dashboard">("landing_page");
  const [demoName, setDemoName] = useState("");
  const [hunterLoading, setHunterLoading] = useState(false);
  const [showFindDialog, setShowFindDialog] = useState(false);
  const [findFirstName, setFindFirstName] = useState("");
  const [findLastName, setFindLastName] = useState("");
  const [findLoading, setFindLoading] = useState(false);

  const loadProspect = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await api<ProspectData>(`/prospects/${id}`);
      setProspect(data);
    } catch {
      toast.error("Failed to load prospect details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (prospectId && open) loadProspect(prospectId);
    if (!open) setProspect(null);
  }, [prospectId, open, loadProspect]);

  const handleEnrich = async () => {
    if (!prospectId) return;
    setBusy(true);
    try {
      await apiPost(`/enrichment/${prospectId}`, {});
      toast.success("Enrichment started. Data will update shortly.");
      setTimeout(() => { loadProspect(prospectId); onProspectUpdated(); }, 8000);
    } catch { toast.error("Enrichment failed"); } finally { setBusy(false); }
  };

  const handleHunterSearch = async () => {
    if (!prospectId) return;
    setHunterLoading(true);
    try {
      const result = await apiPost<{ found: number }>(`/enrichment/${prospectId}/hunter`, {});
      if (result.found > 0) {
        toast.success(`Found ${result.found} owner/staff contact${result.found > 1 ? "s" : ""} via Hunter`);
      } else {
        toast.info("No new contacts found via Hunter for this domain");
      }
      loadProspect(prospectId);
      onProspectUpdated();
    } catch { toast.error("Hunter search failed"); } finally { setHunterLoading(false); }
  };

  const handleHunterFind = async () => {
    if (!prospectId || !findFirstName || !findLastName) return;
    setFindLoading(true);
    try {
      const result = await apiPost<{ found: boolean; email?: string; name?: string }>(`/enrichment/${prospectId}/hunter/find`, { first_name: findFirstName, last_name: findLastName });
      if (result.found) {
        toast.success(`Found email for ${findFirstName} ${findLastName}`);
        setShowFindDialog(false);
        setFindFirstName(""); setFindLastName("");
        loadProspect(prospectId);
        onProspectUpdated();
      } else {
        toast.info("No email found for that name on this domain");
      }
    } catch { toast.error("Hunter search failed"); } finally { setFindLoading(false); }
  };

  const handleAnalyze = async () => {
    if (!prospectId) return;
    setBusy(true);
    try {
      await apiPost(`/analysis/${prospectId}`, {});
      toast.success("AI analysis started. Results will appear shortly.");
      setTimeout(() => { loadProspect(prospectId); onProspectUpdated(); }, 12000);
    } catch { toast.error("Analysis failed"); } finally { setBusy(false); }
  };

  const handleDraftEmail = async () => {
    if (!prospectId) return;
    setBusy(true);
    try {
      await apiPost(`/emails/draft/${prospectId}`, {});
      toast.success("Email drafted successfully");
      setTimeout(() => { loadProspect(prospectId); onProspectUpdated(); }, 3000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Draft failed"); } finally { setBusy(false); }
  };

  const handleBuildDemo = async () => {
    if (!prospectId || !demoName.trim()) return;
    setBusy(true);
    try {
      const result = await apiPost<{ id: string }>("/demos", {
        prospect_id: prospectId,
        name: demoName.trim(),
        demo_type: demoType,
      });
      toast.success("Demo created! Opening builder...");
      setShowDemoDialog(false);
      setDemoName("");
      router.push(`/demos?id=${result.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create demo");
    } finally {
      setBusy(false);
    }
  };

  const nextAction = prospect
    ? prospect.status === "new"
      ? { label: "Enrich", handler: handleEnrich, icon: Sparkles }
      : prospect.status === "enriched"
        ? { label: "Analyze", handler: handleAnalyze, icon: Sparkles }
        : prospect.status === "analyzed"
          ? { label: "Draft Email", handler: handleDraftEmail, icon: Mail }
          : null
    : null;

  const analysis = prospect?.ai_analyses?.[0];

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[50vw] overflow-y-auto p-0 bg-white"
        showCloseButton={true}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[#7b809a]" />
          </div>
        ) : !prospect ? (
          <div className="flex h-full items-center justify-center text-[#7b809a]">
            Prospect not found
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="border-b border-[#e9ecef] px-6 py-4">
              <div className="flex items-start justify-between pr-8">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <SheetTitle className="text-lg font-bold text-[#344767]">
                      {prospect.name}
                    </SheetTitle>
                    <StatusBadge status={prospect.status} />
                  </div>
                  <SheetDescription className="text-sm text-[#7b809a]">
                    {prospect.industry} &middot; {prospect.city}, {prospect.region}
                  </SheetDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {prospect.status === "analyzed" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDemoName(`${prospect.name} Demo`);
                        setShowDemoDialog(true);
                      }}
                      disabled={busy}
                      className="bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20"
                    >
                      <Wand2 className="size-3.5 mr-1.5" /> Build Demo
                    </Button>
                  )}
                  {nextAction && (
                    <Button
                      size="sm"
                      onClick={nextAction.handler}
                      disabled={busy}
                      className="bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <nextAction.icon className="size-3.5" />
                      )}
                      {busy ? "Working..." : nextAction.label}
                      {!busy && <ArrowRight className="size-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Tabbed content */}
            <div className="px-6 pt-4 pb-6">
              <Tabs defaultValue="overview">
                <TabsList variant="line" className="mb-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="contacts">
                    Contacts
                    {prospect.contacts.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] bg-[#f0f2f5] text-[#344767]">
                        {prospect.contacts.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
                  <TabsTrigger value="emails">
                    Emails
                    {prospect.emails.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] bg-[#f0f2f5] text-[#344767]">
                        {prospect.emails.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview">
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {prospect.website && (
                        <div className="flex items-center gap-3 text-sm">
                          <Globe className="size-4 shrink-0 text-[#7b809a]" />
                          <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="text-[#1a73e8] hover:underline truncate">
                            {prospect.website}
                          </a>
                        </div>
                      )}
                      {prospect.phone && (
                        <div className="flex items-center gap-3 text-sm">
                          <Phone className="size-4 shrink-0 text-[#7b809a]" />
                          <span className="text-[#344767]">{prospect.phone}</span>
                        </div>
                      )}
                      {prospect.address && (
                        <div className="flex items-center gap-3 text-sm">
                          <MapPin className="size-4 shrink-0 text-[#7b809a]" />
                          <span className="text-[#344767]">{prospect.address}</span>
                        </div>
                      )}
                      {prospect.size_estimate && (
                        <div className="flex items-center gap-3 text-sm">
                          <Building2 className="size-4 shrink-0 text-[#7b809a]" />
                          <span className="text-[#344767]">{prospect.size_estimate}</span>
                        </div>
                      )}
                    </div>
                    {prospect.about_text && (
                      <>
                        <Separator className="bg-[#e9ecef]" />
                        <div>
                          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">About</h4>
                          <p className="text-sm leading-relaxed text-[#7b809a]">{prospect.about_text}</p>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Contacts Tab */}
                <TabsContent value="contacts">
                  <div className="space-y-4">
                    {/* Hunter — Staff/Owner Emails */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Staff / Owner Email</span>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setShowFindDialog(true)} disabled={hunterLoading} className="h-6 px-2 text-[10px] border-[#e9ecef] text-[#7b809a] hover:text-[#344767]">
                            Search by Name
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleHunterSearch} disabled={hunterLoading} className="h-6 px-2 text-[10px] border-[#e9ecef] text-[#7b809a] hover:text-[#344767]">
                            {hunterLoading ? <Loader2 className="size-3 animate-spin" /> : "Search Domain"}
                          </Button>
                        </div>
                      </div>
                      {prospect.contacts.filter(c => c.source === "hunter").length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#e9ecef] px-4 py-4 text-center">
                          <p className="text-xs text-[#7b809a]">No owner/staff emails found yet</p>
                          <p className="text-[10px] text-[#7b809a]/60 mt-0.5">Use Hunter to search by domain or name</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {prospect.contacts.filter(c => c.source === "hunter").map((c) => (
                            <div key={c.id} className="flex items-center justify-between rounded-lg border border-[#1a73e8]/20 bg-[#1a73e8]/5 px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-[#344767] truncate">{c.name || "Unknown"}</div>
                                  {c.verified && <span className="text-[9px] font-bold uppercase tracking-wide text-[#4caf50] bg-[#4caf50]/10 px-1.5 py-0.5 rounded">Verified</span>}
                                </div>
                                {c.role && <div className="text-xs text-[#7b809a]">{c.role}</div>}
                              </div>
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="ml-3 shrink-0 text-xs text-[#1a73e8] hover:underline">
                                  {c.email}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Website contacts */}
                    <div>
                      <div className="mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Website Contacts</span>
                      </div>
                      {prospect.contacts.filter(c => c.source !== "hunter").length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Users className="mb-3 size-8 text-[#e9ecef]" />
                          <p className="text-sm text-[#7b809a]">No contacts found</p>
                          <p className="text-xs text-[#7b809a]/60">Enrich this prospect to discover contacts</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {prospect.contacts.filter(c => c.source !== "hunter").map((c) => (
                            <div key={c.id} className="flex items-center justify-between rounded-lg border border-[#e9ecef] bg-[#f8f9fa] px-4 py-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[#344767] truncate">{c.name || "Unknown"}</div>
                                {c.role && <div className="text-xs text-[#7b809a]">{c.role}</div>}
                              </div>
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="ml-3 shrink-0 text-xs text-[#1a73e8] hover:underline">
                                  {c.email}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* AI Analysis Tab */}
                <TabsContent value="analysis">
                  {!analysis ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Sparkles className="mb-3 size-8 text-[#e9ecef]" />
                      <p className="text-sm text-[#7b809a]">No analysis yet</p>
                      <p className="text-xs text-[#7b809a]/60">Run AI analysis to get insights</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="rounded-lg border border-[#e9ecef] bg-[#f8f9fa] p-4">
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Confidence Score</span>
                          <span className={`text-2xl font-bold tabular-nums ${
                            analysis.confidence_score >= 80 ? "text-[#4caf50]" : analysis.confidence_score >= 60 ? "text-[#fb8c00]" : "text-[#f44335]"
                          }`}>
                            {analysis.confidence_score}%
                          </span>
                        </div>
                        <Progress value={analysis.confidence_score} className="[&_[data-slot=progress-track]]:h-2" />
                      </div>

                      {analysis.reasoning && (
                        <div>
                          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Reasoning</h4>
                          <p className="text-sm leading-relaxed text-[#7b809a]">{analysis.reasoning}</p>
                        </div>
                      )}

                      {analysis.recommended_services?.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Recommended Services</h4>
                          <div className="space-y-2">
                            {analysis.recommended_services.map((s, i) => (
                              <div key={i} className="rounded-lg border border-[#e9ecef] bg-[#f8f9fa] px-4 py-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold text-[#344767]">{s.service_name}</span>
                                  <RelevanceBadge relevance={s.relevance} />
                                </div>
                                <p className="text-xs text-[#7b809a]">{s.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.pain_points?.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Pain Points</h4>
                          <ul className="space-y-1.5">
                            {analysis.pain_points.map((p, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-[#7b809a]">
                                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#f44335]" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Emails Tab */}
                <TabsContent value="emails">
                  {prospect.emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Mail className="mb-3 size-8 text-[#e9ecef]" />
                      <p className="text-sm text-[#7b809a]">No emails yet</p>
                      <p className="text-xs text-[#7b809a]/60">Draft an email after AI analysis</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {prospect.emails.map((e) => (
                        <div key={e.id} className="flex items-center justify-between rounded-lg border border-[#e9ecef] bg-[#f8f9fa] px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#344767] truncate">{e.subject}</div>
                            {e.sent_at && <div className="text-xs text-[#7b809a]">{new Date(e.sent_at).toLocaleDateString()}</div>}
                          </div>
                          <span className={`shrink-0 ml-3 inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            e.status === "sent"
                              ? "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white"
                              : e.status === "draft"
                                ? "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white"
                                : "bg-gradient-to-r from-[#7b809a] to-[#5c5f6e] text-white"
                          }`}>
                            {e.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}

        {/* Build Demo Dialog */}
        <Dialog open={showDemoDialog} onOpenChange={setShowDemoDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#344767]">Build a Demo</DialogTitle>
              <DialogDescription>
                Choose a demo type and name for {prospect?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a] mb-2 block">
                  Demo Name
                </label>
                <Input
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  placeholder="e.g. Acme Corp Dashboard"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a] mb-2 block">
                  Demo Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDemoType("landing_page")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                      demoType === "landing_page"
                        ? "border-[#e91e63] bg-[#e91e63]/5"
                        : "border-[#e9ecef] hover:border-[#e91e63]/30"
                    }`}
                  >
                    <Globe className={`size-6 ${demoType === "landing_page" ? "text-[#e91e63]" : "text-[#7b809a]"}`} />
                    <span className={`text-xs font-semibold ${demoType === "landing_page" ? "text-[#e91e63]" : "text-[#344767]"}`}>
                      Landing Page
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoType("saas_dashboard")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                      demoType === "saas_dashboard"
                        ? "border-[#e91e63] bg-[#e91e63]/5"
                        : "border-[#e9ecef] hover:border-[#e91e63]/30"
                    }`}
                  >
                    <Layout className={`size-6 ${demoType === "saas_dashboard" ? "text-[#e91e63]" : "text-[#7b809a]"}`} />
                    <span className={`text-xs font-semibold ${demoType === "saas_dashboard" ? "text-[#e91e63]" : "text-[#344767]"}`}>
                      SaaS Dashboard
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleBuildDemo}
                disabled={busy || !demoName.trim()}
                className="bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Wand2 className="size-3.5 mr-1.5" />}
                {busy ? "Creating..." : "Create Demo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>

    <Dialog open={showFindDialog} onOpenChange={setShowFindDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find Owner / Staff Email</DialogTitle>
          <DialogDescription>Enter the name of the owner, CEO, or decision-maker to search for their email via Hunter.io.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#344767]">First Name</label>
            <Input value={findFirstName} onChange={(e) => setFindFirstName(e.target.value)} placeholder="e.g. James" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#344767]">Last Name</label>
            <Input value={findLastName} onChange={(e) => setFindLastName(e.target.value)} placeholder="e.g. Mensah" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowFindDialog(false)}>Cancel</Button>
          <Button onClick={handleHunterFind} disabled={findLoading || !findFirstName || !findLastName}>
            {findLoading ? <><Loader2 className="mr-2 size-4 animate-spin" />Searching...</> : "Find Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
