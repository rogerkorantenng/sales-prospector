"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Globe, Layout, Clock, ExternalLink } from "lucide-react";

interface DemoCardProps {
  id: string;
  name: string;
  demo_type: string;
  status: string;
  preview_url: string | null;
  live_url: string | null;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  configuring: "bg-gray-100 text-gray-600",
  generating: "bg-amber-100 text-amber-700",
  building: "bg-blue-100 text-blue-700",
  preview: "bg-purple-100 text-purple-700",
  deployed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function DemoCard({ id, name, demo_type, status, preview_url, live_url, created_at }: DemoCardProps) {
  return (
    <Link href={`/demos?id=${id}`}>
      <div className="group material-card p-5 transition-all hover:shadow-md cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#e91e63] to-[#c2185b] text-white">
            {demo_type === "landing_page" ? <Globe className="size-5" /> : <Layout className="size-5" />}
          </div>
          <Badge className={`text-[10px] font-semibold capitalize ${statusStyles[status] || ""}`}>
            {status}
          </Badge>
        </div>

        <h3 className="text-sm font-bold text-[#344767] group-hover:text-[#e91e63] transition-colors">
          {name}
        </h3>
        <p className="text-[11px] text-[#7b809a] mt-1 capitalize">
          {demo_type.replace("_", " ")}
        </p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#f0f2f5]">
          <span className="flex items-center gap-1 text-[10px] text-[#7b809a]">
            <Clock className="size-3" />
            {new Date(created_at).toLocaleDateString()}
          </span>
          {live_url && (
            <span className="flex items-center gap-1 text-[10px] text-[#e91e63] font-medium">
              <ExternalLink className="size-3" /> Live
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
