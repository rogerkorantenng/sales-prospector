"use client";

import { useEffect, useState, useCallback } from "react";
import { api, apiPost } from "@/lib/api";
import { EmailEditor } from "@/components/email-editor";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import Link from "next/link";
import {
  Mail,
  FileEdit,
  CheckCircle2,
  Send,
  AlertTriangle,
  Building2,
  Inbox,
} from "lucide-react";

type EmailStatus = "draft" | "approved" | "sent" | "failed";

interface EmailData {
  id: string;
  subject: string;
  body: string;
  tone: string;
  status: string;
  companies?: { name: string; industry: string; region: string };
  sent_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  replied_at?: string | null;
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

const STATUS_TABS: { value: EmailStatus; label: string; icon: React.ElementType }[] = [
  { value: "draft", label: "Draft", icon: FileEdit },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "sent", label: "Sent", icon: Send },
  { value: "failed", label: "Failed", icon: AlertTriangle },
];

export default function OutreachPage() {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [filter, setFilter] = useState<EmailStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<EmailData[]>(`/emails?status=${filter}&limit=50`);
      setEmails(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch { setEmails([]); } finally { setLoading(false); }
  }, [filter]);

  const loadStats = useCallback(async () => {
    try { const data = await api<EmailStats>("/emails/stats"); setStats(data); } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    setCheckedIds(new Set());
    setSelectedId(null);
    loadEmails();
    loadStats();
  }, [filter, loadEmails, loadStats]);

  const handleBulkApprove = async () => {
    if (checkedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await apiPost<{ approved: number }>("/emails/bulk-approve", { ids: Array.from(checkedIds) });
      toast.success(`${res.approved} emails approved`);
      setCheckedIds(new Set()); loadEmails(); loadStats();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Bulk approve failed"); } finally { setBulkLoading(false); }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAllChecked = () => {
    if (checkedIds.size === emails.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(emails.map((e) => e.id)));
  };

  const selectedEmail = emails.find((e) => e.id === selectedId) || null;

  const getStatusCount = (status: EmailStatus): number => {
    if (!stats) return 0;
    if (status === "failed") return 0;
    return (stats as unknown as Record<string, number>)[status] ?? 0;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb + Header */}
      <div className="px-6 py-4 border-b border-[#e9ecef] bg-white">
        <p className="text-xs text-[#7b809a]">
          <Link href="/dashboard" className="hover:text-[#344767]">Home</Link>
          <span className="mx-1">/</span>
          <span className="text-[#344767]">Outreach</span>
        </p>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-lg font-bold text-[#344767]">Outreach</h1>
            <p className="text-xs text-[#7b809a]">Manage your email pipeline</p>
          </div>
          {filter === "draft" && checkedIds.size > 0 && (
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white border-0 shadow-md shadow-[#4caf50]/20"
            >
              <CheckCircle2 className="mr-1.5 size-3.5" />
              {bulkLoading ? "Approving..." : `Approve ${checkedIds.size} Selected`}
            </Button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-[#e9ecef] bg-white px-6 py-2">
        {STATUS_TABS.map((tab) => {
          const count = getStatusCount(tab.value);
          const active = filter === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[#e91e63]/10 text-[#e91e63]"
                  : "text-[#7b809a] hover:bg-[#f8f9fa] hover:text-[#344767]"
              }`}
            >
              <Icon className="size-3.5" />
              {tab.label}
              {count > 0 && (
                <Badge
                  variant={active ? "default" : "secondary"}
                  className={`ml-1 h-4 min-w-5 px-1 text-[10px] ${
                    active ? "bg-[#e91e63] text-white" : "bg-[#f0f2f5] text-[#7b809a]"
                  }`}
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - email list */}
        <div className="w-[40%] flex-shrink-0 border-r border-[#e9ecef] overflow-y-auto bg-white">
          {loading ? (
            <div className="p-4"><ListSkeleton rows={8} /></div>
          ) : emails.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={`No ${filter} emails`}
              description={`There are no emails with ${filter} status at the moment.`}
            />
          ) : (
            <div>
              {filter === "draft" && emails.length > 0 && (
                <div className="flex items-center gap-3 border-b border-[#e9ecef] bg-[#f8f9fa] px-4 py-2">
                  <Checkbox
                    checked={checkedIds.size === emails.length && emails.length > 0}
                    onCheckedChange={toggleAllChecked}
                  />
                  <span className="text-xs text-[#7b809a]">
                    {checkedIds.size > 0 ? `${checkedIds.size} selected` : "Select all"}
                  </span>
                </div>
              )}

              {emails.map((email) => {
                const isActive = selectedId === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedId(email.id)}
                    className={`flex cursor-pointer items-start gap-3 border-b border-[#f0f2f5] px-4 py-3 transition-colors ${
                      isActive
                        ? "bg-[#e91e63]/5 border-l-2 border-l-[#e91e63]"
                        : "hover:bg-[#f8f9fa]"
                    }`}
                  >
                    {filter === "draft" && (
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checkedIds.has(email.id)}
                          onCheckedChange={() => toggleCheck(email.id)}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 shrink-0 text-[#7b809a]" />
                        <span className="truncate text-xs font-bold text-[#344767]">
                          {email.companies?.name || "Unknown"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#7b809a]">{email.subject}</p>
                      {email.companies?.region && (
                        <span className="mt-1 inline-block text-[10px] text-[#7b809a]/70">
                          {email.companies.region}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel - email detail/editor */}
        <div className="flex-1 overflow-hidden bg-white">
          {selectedEmail ? (
            <EmailEditor
              key={selectedEmail.id}
              email={selectedEmail}
              onAction={() => { loadEmails(); loadStats(); }}
            />
          ) : (
            <EmptyState
              icon={Mail}
              title="Select an email to preview"
              description="Choose an email from the list to view details and take action."
            />
          )}
        </div>
      </div>
    </div>
  );
}
