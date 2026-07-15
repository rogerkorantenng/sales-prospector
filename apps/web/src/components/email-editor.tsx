"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiPost, apiPatch } from "@/lib/api";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Briefcase,
  Save,
  CheckCircle2,
  Send,
  RotateCcw,
  Eye,
  MousePointerClick,
  Reply,
  X,
  Plus,
} from "lucide-react";

interface EmailData {
  id: string;
  subject: string;
  body: string;
  tone: string;
  status: string;
  recipient_email?: string | null;
  hunter_emails?: { email: string; name: string | null; role: string | null }[];
  companies?: { name: string; industry: string; region: string };
  sent_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  replied_at?: string | null;
  bounced_at?: string | null;
  bounce_type?: string | null;
  bounce_reason?: string | null;
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function EmailEditor({
  email,
  onAction,
}: {
  email: EmailData;
  onAction?: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState(email.recipient_email || "");
  const [hunterEmails, setHunterEmails] = useState<string[]>(
    (email.hunter_emails || []).map(h => h.email)
  );
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);

  useEffect(() => {
    setRecipientEmail(email.recipient_email || "");
    setHunterEmails((email.hunter_emails || []).map(h => h.email));
    setSubject(email.subject);
    setBody(email.body);
  }, [email.id, email.recipient_email, email.subject, email.body]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);

  const isSent = email.status === "sent";
  const isReadOnly = isSent || email.status === "failed";

  const handleSave = async () => {
    setSaving(true);
    try { await apiPatch(`/emails/${email.id}`, { subject, body, override_email: recipientEmail || null }); toast.success("Email saved"); onAction?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try { await apiPost(`/emails/${email.id}/approve`, {}); toast.success("Email approved"); onAction?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to approve"); }
    finally { setApproving(false); }
  };

  const handleSend = async () => {
    setSending(true);
    try { await apiPost(`/emails/${email.id}/send`, { to_email: recipientEmail || undefined, extra_to: hunterEmails.filter(Boolean) }); toast.success("Email sent"); onAction?.(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to send"); }
    finally { setSending(false); }
  };

  const handleRegenerate = async () => {
    toast.info("Regenerating email...");
    try {
      const result = await apiPost<{ subject: string; body: string }>(`/emails/${email.id}/regenerate`, {});
      setSubject(result.subject);
      setBody(result.body);
      toast.success("Email regenerated");
      onAction?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate");
    }
  };

  const statusBadgeClass =
    email.status === "sent"
      ? "bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white"
      : email.status === "approved"
        ? "bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white"
        : email.status === "failed"
          ? "bg-gradient-to-r from-[#f44335] to-[#d32f2f] text-white"
          : "bg-gradient-to-r from-[#fb8c00] to-[#ef6c00] text-white";

  return (
    <div className="flex h-full flex-col">
      {/* Company context header */}
      <div className="border-b border-[#e9ecef] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#f0f2f5]">
            <Building2 className="size-4 text-[#7b809a]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#344767] leading-tight">
              {email.companies?.name || "Unknown Company"}
            </h3>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-[#7b809a]">
              {email.companies?.industry && (
                <span className="flex items-center gap-1"><Briefcase className="size-3" />{email.companies.industry}</span>
              )}
              {email.companies?.region && (
                <span className="flex items-center gap-1"><MapPin className="size-3" />{email.companies.region}</span>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}`}>
            {email.status}
          </span>
        </div>
      </div>

      {/* Editor / Read-only body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Recipients</label>
          {isReadOnly ? (
            <div className="space-y-1">
              <p className="text-sm text-[#344767]">{email.recipient_email || "—"}</p>
              {hunterEmails.map((e) => (
                <p key={e} className="text-sm text-[#344767]">{e}</p>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Primary recipient */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#7b809a] w-10 shrink-0">To</span>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="text-sm bg-[#f8f9fa] border-[#e9ecef]"
                />
              </div>
              {/* Additional recipients (Hunter + any added) */}
              {hunterEmails.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#1a73e8] w-10 shrink-0">Also</span>
                  <Input
                    type="email"
                    value={e}
                    onChange={(ev) => {
                      const updated = [...hunterEmails];
                      updated[i] = ev.target.value;
                      setHunterEmails(updated);
                    }}
                    className="text-sm bg-[#f0f7ff] border-[#1a73e8]/20"
                  />
                  <button onClick={() => setHunterEmails(hunterEmails.filter((_, j) => j !== i))} className="text-[#7b809a] hover:text-[#f44335]">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {/* Add recipient button */}
              <button
                onClick={() => setHunterEmails([...hunterEmails, ""])}
                className="flex items-center gap-1 text-[10px] text-[#7b809a] hover:text-[#1a73e8]"
              >
                <Plus className="size-3" /> Add recipient
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Subject</label>
          {isReadOnly ? (
            <p className="text-sm font-semibold text-[#344767]">{email.subject}</p>
          ) : (
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm bg-[#f8f9fa] border-[#e9ecef]" />
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Body</label>
          {isReadOnly ? (
            <div className="rounded-lg border border-[#e9ecef] bg-[#f8f9fa] p-4 text-sm leading-relaxed text-[#344767] whitespace-pre-wrap">
              {email.body}
            </div>
          ) : (
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={15} className="text-sm leading-relaxed bg-[#f8f9fa] border-[#e9ecef]" />
          )}
        </div>

        {/* Sent email metrics */}
        {isSent && (
          <div className="space-y-3">
            {email.bounced_at && (
              <div className="rounded-lg border border-[#f44335]/30 bg-[#f44335]/5 p-3">
                <div className="flex items-start gap-2">
                  <X className="size-4 text-[#f44335] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-[#f44335]">
                      {email.bounce_type === "complaint" ? "Marked as Spam" : `Bounced (${email.bounce_type || "permanent"})`}
                      <span className="ml-2 font-normal text-[#7b809a]">{formatTimestamp(email.bounced_at)}</span>
                    </p>
                    {email.bounce_reason && (
                      <p className="text-[10px] text-[#7b809a] mt-0.5">{email.bounce_reason}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-[#e9ecef] bg-[#f8f9fa] p-4">
              <h4 className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Engagement Metrics</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-[#1a73e8]" />
                  <div>
                    <p className="text-xs text-[#7b809a]">Opened</p>
                    <p className="text-sm font-semibold text-[#344767]">{formatTimestamp(email.opened_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MousePointerClick className="size-4 text-[#4caf50]" />
                  <div>
                    <p className="text-xs text-[#7b809a]">Clicked</p>
                    <p className="text-sm font-semibold text-[#344767]">{formatTimestamp(email.clicked_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Reply className="size-4 text-[#fb8c00]" />
                  <div>
                    <p className="text-xs text-[#7b809a]">Replied</p>
                    <p className="text-sm font-semibold text-[#344767]">{formatTimestamp(email.replied_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isReadOnly && (
        <div className="border-t border-[#e9ecef] px-5 py-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="border-[#e9ecef] text-[#7b809a] hover:text-[#344767]">
              <Save className="mr-1.5 size-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {email.status === "draft" && (
              <Button size="sm" onClick={handleApprove} disabled={approving} className="bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white border-0 shadow-md shadow-[#1a73e8]/20">
                <CheckCircle2 className="mr-1.5 size-3.5" />
                {approving ? "Approving..." : "Approve"}
              </Button>
            )}
            {(email.status === "draft" || email.status === "approved") && (
              <Button size="sm" onClick={handleSend} disabled={sending} className="bg-gradient-to-r from-[#4caf50] to-[#388e3c] text-white border-0 shadow-md shadow-[#4caf50]/20">
                <Send className="mr-1.5 size-3.5" />
                {sending ? "Sending..." : "Send Now"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleRegenerate} className="ml-auto text-[#7b809a] hover:text-[#344767]">
              <RotateCcw className="mr-1.5 size-3.5" />
              Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
