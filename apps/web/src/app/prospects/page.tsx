"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { api, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProspectPanel } from "@/components/prospect-panel";
import {
  Search,
  X,
  MoreHorizontal,
  Sparkles,
  Brain,
  Mail,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import Link from "next/link";

// Types

interface Prospect {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  industry: string;
  region: string;
  city: string;
  status: string;
  contacts: Array<{ id: string; email: string | null }>;
  ai_analyses: Array<{ confidence_score: number }>;
}

type PipelineStatus = "all" | "new" | "enriched" | "analyzed" | "contacted";
type SortField = "name" | "industry" | "region" | "status" | "confidence" | "emails";
type SortDir = "asc" | "desc";

const PIPELINE_TABS: { value: PipelineStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "enriched", label: "Enriched" },
  { value: "analyzed", label: "Analyzed" },
  { value: "contacted", label: "Contacted" },
];

const REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
  "Northern", "Volta", "Upper East", "Upper West", "Bono",
  "Bono East", "Ahafo", "Savannah", "North East", "Oti", "Western North",
];

const INDUSTRIES = [
  "healthcare", "education", "finance", "technology", "agriculture",
  "manufacturing", "retail", "hospitality", "real estate", "logistics",
  "media", "construction", "energy", "legal", "consulting",
];

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-gradient-to-r from-[#7b809a] to-[#5c5f6e] text-white" },
  enriched: { label: "Enriched", className: "bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white" },
  analyzed: { label: "Analyzed", className: "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white" },
  contacted: { label: "Contacted", className: "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white" },
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineTab, setPipelineTab] = useState<PipelineStatus>("all");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [industryFilter, setIndustryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadProspects = useCallback(async () => {
    try {
      const data = await api<Prospect[]>("/prospects/?limit=200");
      setProspects(data);
    } catch {
      toast.error("Failed to load prospects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  const counts = useMemo(() => {
    const c = { all: 0, new: 0, enriched: 0, analyzed: 0, contacted: 0 };
    for (const p of prospects) {
      c.all++;
      if (p.status in c) c[p.status as keyof typeof c]++;
    }
    return c;
  }, [prospects]);

  const filtered = useMemo(() => {
    let result = prospects;
    if (pipelineTab !== "all") result = result.filter((p) => p.status === pipelineTab);
    if (regionFilter) result = result.filter((p) => p.region === regionFilter);
    if (industryFilter) result = result.filter((p) => p.industry.toLowerCase() === industryFilter.toLowerCase());
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "industry": cmp = a.industry.localeCompare(b.industry); break;
        case "region": cmp = a.region.localeCompare(b.region); break;
        case "status": {
          const order = { new: 0, enriched: 1, analyzed: 2, contacted: 3 };
          cmp = (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
          break;
        }
        case "confidence": {
          const ac = a.ai_analyses?.[0]?.confidence_score ?? -1;
          const bc = b.ai_analyses?.[0]?.confidence_score ?? -1;
          cmp = ac - bc;
          break;
        }
        case "emails": {
          const ae = a.contacts.filter((c) => c.email).length;
          const be = b.contacts.filter((c) => c.email).length;
          cmp = ae - be;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [prospects, pipelineTab, regionFilter, industryFilter, search, sortField, sortDir]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [pipelineTab, regionFilter, industryFilter, search]);

  const hasFilters = regionFilter || industryFilter || search;
  const allSelected = paginatedData.length > 0 && paginatedData.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(paginatedData.map((p) => p.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="size-3 text-[#7b809a]/50" />;
    return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  };

  const openPanel = (id: string) => { setSelectedProspectId(id); setPanelOpen(true); };

  const handleSingleEnrich = async (id: string) => {
    try { await apiPost(`/enrichment/${id}`, {}); toast.success("Enrichment started"); setTimeout(loadProspects, 8000); } catch { toast.error("Enrichment failed"); }
  };
  const handleSingleAnalyze = async (id: string) => {
    try { await apiPost(`/analysis/${id}`, {}); toast.success("Analysis started"); setTimeout(loadProspects, 12000); } catch { toast.error("Analysis failed"); }
  };
  const handleSingleDraft = async (id: string) => {
    try { await apiPost(`/emails/draft/${id}`, {}); toast.success("Email drafted"); setTimeout(loadProspects, 3000); } catch { toast.error("Draft failed"); }
  };
  const handleSingleDelete = async (id: string) => {
    try {
      await api(`/prospects/${id}`, { method: "DELETE" });
      toast.success("Prospect deleted");
      setProspects((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch { toast.error("Delete failed"); }
  };

  const handleBulkEnrich = async () => {
    setBulkBusy(true);
    try {
      const res = await apiPost<{ count: number }>("/enrichment/batch?limit=50", {});
      toast.success(`Enriching ${res.count} prospects`);
      setSelected(new Set()); setTimeout(loadProspects, 10000);
    } catch { toast.error("Batch enrichment failed"); } finally { setBulkBusy(false); }
  };
  const handleBulkAnalyze = async () => {
    setBulkBusy(true);
    try {
      const res = await apiPost<{ count: number }>("/analysis/batch?limit=50", {});
      toast.success(`Analyzing ${res.count} prospects`);
      setSelected(new Set()); setTimeout(loadProspects, 15000);
    } catch { toast.error("Batch analysis failed"); } finally { setBulkBusy(false); }
  };
  const handleBulkDraft = async () => {
    setBulkBusy(true);
    const ids = Array.from(selected); let count = 0;
    for (const id of ids) { try { await apiPost(`/emails/draft/${id}`, {}); count++; } catch { /* skip */ } }
    toast.success(`Drafted ${count} emails`);
    setSelected(new Set()); setBulkBusy(false); loadProspects();
  };
  const handleBulkDelete = async () => {
    setBulkBusy(true);
    const ids = Array.from(selected); let count = 0;
    for (const id of ids) { try { await api(`/prospects/${id}`, { method: "DELETE" }); count++; } catch { /* skip */ } }
    toast.success(`Deleted ${count} prospects`);
    setSelected(new Set()); setProspects((prev) => prev.filter((p) => !ids.includes(p.id))); setBulkBusy(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#7b809a]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb + Header */}
      <div>
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Prospects</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#344767]">Prospects</h1>
        <p className="text-sm text-[#7b809a]">
          Manage your sales pipeline and prospect intelligence
        </p>
      </div>

      {/* White card container */}
      <div className="material-card">
        {/* Pipeline Tabs */}
        <div className="flex items-center gap-1 px-5 pt-4 pb-0">
          {PIPELINE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setPipelineTab(tab.value); setSelected(new Set()); }}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                pipelineTab === tab.value
                  ? "text-[#e91e63] bg-[#e91e63]/5"
                  : "text-[#7b809a] hover:text-[#344767]"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                  pipelineTab === tab.value
                    ? "bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white"
                    : "bg-[#f0f2f5] text-[#7b809a]"
                }`}
              >
                {counts[tab.value]}
              </span>
              {pipelineTab === tab.value && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#e91e63]" />
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-[#e9ecef]" />

        {/* Filters Bar */}
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#7b809a]" />
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 bg-[#f8f9fa] border-[#e9ecef]"
            />
          </div>

          <Select value={regionFilter} onValueChange={(v) => setRegionFilter(v ?? "")}>
            <SelectTrigger size="sm" className="w-auto min-w-[140px] bg-[#f8f9fa] border-[#e9ecef]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={industryFilter} onValueChange={(v) => setIndustryFilter(v ?? "")}>
            <SelectTrigger size="sm" className="w-auto min-w-[140px] bg-[#f8f9fa] border-[#e9ecef]">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  <span className="capitalize">{ind}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setRegionFilter(""); setIndustryFilter(""); setSearch(""); }}
              className="h-7 px-2 text-xs text-[#7b809a]"
            >
              <X className="size-3 mr-1" />
              Clear filters
            </Button>
          )}

          <div className="ml-auto text-xs text-[#7b809a] tabular-nums">
            {filtered.length} prospect{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mx-5 mb-3 rounded-lg bg-[#f8f9fa] border border-[#e9ecef] px-4 py-2">
            <span className="text-sm font-semibold text-[#344767]">
              {selected.size} selected
            </span>
            <div className="h-4 w-px bg-[#e9ecef]" />
            <Button variant="outline" size="sm" onClick={handleBulkEnrich} disabled={bulkBusy} className="h-7 text-xs border-[#e9ecef]">
              <Sparkles className="size-3" /> Enrich Selected
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkAnalyze} disabled={bulkBusy} className="h-7 text-xs border-[#e9ecef]">
              <Brain className="size-3" /> Analyze Selected
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkDraft} disabled={bulkBusy} className="h-7 text-xs border-[#e9ecef]">
              <Mail className="size-3" /> Draft Emails
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkDelete} disabled={bulkBusy} className="h-7 text-xs text-[#f44335] hover:text-[#d32f2f] border-[#e9ecef]">
              <Trash2 className="size-3" /> Delete
            </Button>
            {bulkBusy && <Loader2 className="size-3.5 animate-spin text-[#7b809a]" />}
          </div>
        )}

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-[#e9ecef]">
              <TableHead className="w-10 px-5">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("name")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Company <SortIcon field="name" />
                </button>
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("industry")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Industry <SortIcon field="industry" />
                </button>
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("region")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Region <SortIcon field="region" />
                </button>
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("status")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Status <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("confidence")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Confidence <SortIcon field="confidence" />
                </button>
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b809a]/70">
                <button onClick={() => handleSort("emails")} className="inline-flex items-center gap-1.5 hover:text-[#344767]">
                  Emails <SortIcon field="emails" />
                </button>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-[#7b809a]">
                  No prospects found
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((p) => {
                const confidence = p.ai_analyses?.[0]?.confidence_score;
                const emailCount = p.contacts.filter((c) => c.email).length;
                const sc = statusConfig[p.status] || statusConfig.new;
                const isSelected = selected.has(p.id);
                const initials = p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

                return (
                  <TableRow key={p.id} className={`border-[#f0f2f5] ${isSelected ? "bg-[#f8f9fa]" : "hover:bg-[#f8f9fa]"}`}>
                    <TableCell className="px-5">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(p.id)} />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => openPanel(p.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#344767] to-[#1f283e] text-[10px] font-bold text-white">
                          {initials}
                        </div>
                        <span className="text-sm font-semibold text-[#344767] hover:text-[#e91e63]">
                          {p.name}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-[#7b809a] capitalize">{p.industry}</TableCell>
                    <TableCell className="text-sm text-[#7b809a]">{p.region}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${sc.className}`}>
                        {sc.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {confidence !== undefined ? (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={confidence} className="flex-1 [&_[data-slot=progress-track]]:h-1.5" />
                          <span className={`text-xs font-semibold tabular-nums w-8 text-right ${
                            confidence >= 80 ? "text-[#4caf50]" : confidence >= 60 ? "text-[#fb8c00]" : "text-[#f44335]"
                          }`}>
                            {confidence}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#7b809a]/50">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emailCount > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#f0f2f5] text-[#344767]">
                          {emailCount}
                        </Badge>
                      ) : (
                        <span className="text-xs text-[#7b809a]/50">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button className="inline-flex size-7 items-center justify-center rounded-md text-[#7b809a] hover:bg-[#f0f2f5] hover:text-[#344767] transition-colors" />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
                          <DropdownMenuItem onClick={() => handleSingleEnrich(p.id)}>
                            <Sparkles className="size-4 text-[#7b809a]" /> Enrich
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSingleAnalyze(p.id)}>
                            <Brain className="size-4 text-[#7b809a]" /> Analyze
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSingleDraft(p.id)}>
                            <Mail className="size-4 text-[#7b809a]" /> Draft Email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => handleSingleDelete(p.id)}>
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-[#7b809a]">
            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} prospects
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#e9ecef] text-[#7b809a]"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#e9ecef] text-[#7b809a]"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page: number;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (currentPage <= 3) {
                page = i + 1;
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = currentPage - 2 + i;
              }
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  className={`h-8 w-8 p-0 text-xs ${
                    currentPage === page
                      ? "bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white border-0"
                      : "border-[#e9ecef] text-[#7b809a]"
                  }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#e9ecef] text-[#7b809a]"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#e9ecef] text-[#7b809a]"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ProspectPanel
        prospectId={selectedProspectId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onProspectUpdated={loadProspects}
      />
    </div>
  );
}
