"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Search,
  Users,
  Mail,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Wand2,
} from "lucide-react";
import { NotificationCenter } from "@/components/notification-center";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: string;
}

const navSections: NavSection[] = [
  {
    label: "PIPELINE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/discover", label: "Discover", icon: Search },
      {
        href: "/prospects",
        label: "Prospects",
        icon: Users,
        badgeKey: "prospects",
      },
      { href: "/territory", label: "Territory", icon: MapPin },
      { href: "/demos", label: "Demos", icon: Wand2, badgeKey: "demos" },
    ],
  },
  {
    label: "OUTREACH",
    items: [
      {
        href: "/outreach",
        label: "Outreach",
        icon: Mail,
        badgeKey: "outreach",
      },
      { href: "/campaigns", label: "Campaigns", icon: BarChart3 },
    ],
  },
  {
    label: "SYSTEM",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!API_URL) return;

    Promise.all([
      fetch(`${API_URL}/api/prospects/stats`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_URL}/api/emails/stats`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([prospectStats, emailStats]) => {
      const newBadges: Record<string, number> = {};
      if (prospectStats?.total) newBadges.prospects = prospectStats.total;
      if (emailStats?.draft) newBadges.outreach = emailStats.draft;
      setBadges(newBadges);
    });
  }, []);

  return (
    <aside
      className="relative z-10 flex h-screen flex-col bg-[#1f283e]"
      style={{
        width: collapsed ? 64 : 250,
        minWidth: collapsed ? 64 : 250,
        transition: "width 200ms ease, min-width 200ms ease",
      }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-white/[0.08]">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1f283e] text-sm font-bold">
          BP
        </div>
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-white">
            Brownshift Prospector
          </span>
        )}
      </div>

      {/* User section */}
      {!collapsed && (
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.08]">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-xs font-bold text-white">
            RK
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              Roger Koranten-Ng
            </p>
            <p className="text-[11px] text-white/50">Administrator</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.15em] text-white/40 uppercase">
                {section.label}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {section.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const badgeCount = item.badgeKey
                  ? badges[item.badgeKey]
                  : undefined;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? "bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white shadow-md shadow-[#e91e63]/20"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                    }`}
                  >
                    <item.icon
                      className={`size-[18px] shrink-0 ${
                        active ? "text-white" : "text-white/50 group-hover:text-white/80"
                      }`}
                    />

                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {badgeCount !== undefined && badgeCount > 0 && (
                          <span
                            className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                              active
                                ? "bg-white/25 text-white"
                                : "bg-white/10 text-white/60"
                            }`}
                          >
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: notifications + collapse */}
      <div className="border-t border-white/[0.08] p-3 flex items-center gap-2">
        <NotificationCenter />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center justify-center rounded-lg py-2 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
