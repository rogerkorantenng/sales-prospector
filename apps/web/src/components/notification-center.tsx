"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bell,
  Search,
  Sparkles,
  Brain,
  FileEdit,
  Check,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Notification {
  id: string;
  type: "discovery" | "enrichment" | "analysis" | "email";
  message: string;
  timestamp: string;
  read: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STORAGE_KEY = "bp-notifications";
const MAX_NOTIFICATIONS = 20;
const POLL_INTERVAL = 30_000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveNotifications(items: Notification[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_NOTIFICATIONS))
    );
  } catch {
    /* localStorage full — ignore */
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_ICON: Record<
  Notification["type"],
  { icon: typeof Bell; color: string; bg: string }
> = {
  discovery: { icon: Search, color: "#1a73e8", bg: "#e3f2fd" },
  enrichment: { icon: Sparkles, color: "#7b1fa2", bg: "#f3e5f5" },
  analysis: { icon: Brain, color: "#e65100", bg: "#fff3e0" },
  email: { icon: FileEdit, color: "#2e7d32", bg: "#e8f5e9" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const prevStats = useRef<Record<string, number>>({});
  const initialized = useRef(false);

  /* Persist whenever notifications change */
  useEffect(() => {
    if (initialized.current) {
      saveNotifications(notifications);
    }
  }, [notifications]);

  /* Load from localStorage on mount */
  useEffect(() => {
    setNotifications(loadNotifications());
    initialized.current = true;
  }, []);

  /* Add a new notification */
  const addNotification = useCallback(
    (type: Notification["type"], message: string) => {
      const item: Notification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        message,
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS));
    },
    []
  );

  /* Poll API for changes */
  const poll = useCallback(async () => {
    if (!API_URL) return;

    try {
      const [discoveryRes, prospectRes, emailRes] = await Promise.all([
        fetch(`${API_URL}/api/discovery/runs`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch(`${API_URL}/api/prospects/stats`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${API_URL}/api/emails/stats`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      const prev = prevStats.current;

      /* Discovery runs completed */
      if (Array.isArray(discoveryRes)) {
        const completed = discoveryRes.filter(
          (r: { status: string; completed_at?: string; companies_found?: number; config?: { regions?: string[] } }) =>
            r.status === "completed" && r.completed_at
        );
        const completedCount = completed.length;
        if (prev.completedRuns !== undefined && completedCount > prev.completedRuns) {
          const latest = completed[0];
          const region =
            latest?.config?.regions?.[0] || "multiple regions";
          addNotification(
            "discovery",
            `Discovery completed \u2014 found ${latest?.companies_found ?? 0} companies in ${region}`
          );
        }
        prev.completedRuns = completedCount;
      }

      /* Prospect enrichment / analysis */
      if (prospectRes) {
        const enriched = prospectRes.enriched ?? 0;
        const analyzed = prospectRes.analyzed ?? 0;

        if (
          prev.enriched !== undefined &&
          enriched > prev.enriched
        ) {
          const diff = enriched - prev.enriched;
          addNotification(
            "enrichment",
            `${diff} ${diff === 1 ? "company" : "companies"} enriched with contacts`
          );
        }

        if (
          prev.analyzed !== undefined &&
          analyzed > prev.analyzed
        ) {
          const diff = analyzed - prev.analyzed;
          addNotification(
            "analysis",
            `${diff} ${diff === 1 ? "company" : "companies"} analyzed by AI`
          );
        }

        prev.enriched = enriched;
        prev.analyzed = analyzed;
      }

      /* Email drafts */
      if (emailRes) {
        const drafts = emailRes.draft ?? 0;
        if (prev.drafts !== undefined && drafts > prev.drafts) {
          const diff = drafts - prev.drafts;
          addNotification(
            "email",
            `${diff} email ${diff === 1 ? "draft" : "drafts"} ready for review`
          );
        }
        prev.drafts = drafts;
      }
    } catch {
      /* network error — skip this poll */
    }
  }, [addNotification]);

  /* Set up polling */
  useEffect(() => {
    poll(); // initial fetch to set baselines
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  /* Actions */
  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative flex size-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-[#e91e63] text-[9px] font-bold text-white ring-2 ring-[#1f283e]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9ecef] bg-white px-4 py-3">
          <h4 className="text-sm font-semibold text-[#344767]">
            Notifications
          </h4>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#e91e63] transition-colors hover:bg-[#fce4ec]"
              >
                <Check className="size-3" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#7b809a] transition-colors hover:bg-[#f0f2f5]"
              >
                <X className="size-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto bg-white">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bell className="size-8 text-[#dee2e6]" />
              <p className="mt-2 text-sm text-[#7b809a]">
                No notifications yet
              </p>
              <p className="mt-0.5 text-[11px] text-[#adb5bd]">
                Activity updates will appear here
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const typeInfo = TYPE_ICON[n.type];
              const Icon = typeInfo.icon;

              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-[#f0f2f5] px-4 py-3 transition-colors last:border-b-0 ${
                    n.read ? "bg-white" : "bg-[#fafbfc]"
                  }`}
                >
                  <div
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: typeInfo.bg }}
                  >
                    <Icon
                      className="size-3.5"
                      style={{ color: typeInfo.color }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[13px] leading-snug ${
                        n.read
                          ? "text-[#7b809a]"
                          : "font-medium text-[#344767]"
                      }`}
                    >
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#adb5bd]">
                      {relativeTime(n.timestamp)}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="mt-2 size-2 shrink-0 rounded-full bg-[#e91e63]" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
