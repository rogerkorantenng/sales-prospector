"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  ChevronRight,
  Users,
  Loader2,
  Eye,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Prospect {
  id: string;
  name: string;
  industry: string;
  region: string;
  status: string;
  website: string | null;
}

interface RegionData {
  name: string;
  prospects: Prospect[];
  total: number;
  byStatus: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Ghana SVG Region definitions                                       */
/* ------------------------------------------------------------------ */

interface SvgRegion {
  id: string;
  label: string;
  matches: string[];
  path: string;
  labelX: number;
  labelY: number;
}

const SVG_REGIONS: SvgRegion[] = [
  {
    id: "upper-west",
    label: "Upper West",
    matches: ["Upper West"],
    path: "M 40,30 L 120,30 L 120,90 L 40,90 Z",
    labelX: 80,
    labelY: 65,
  },
  {
    id: "upper-east",
    label: "Upper East",
    matches: ["Upper East"],
    path: "M 130,30 L 230,30 L 230,90 L 130,90 Z",
    labelX: 180,
    labelY: 65,
  },
  {
    id: "northern",
    label: "Northern",
    matches: ["Northern", "Savannah", "North East"],
    path: "M 40,100 L 230,100 L 230,190 L 40,190 Z",
    labelX: 135,
    labelY: 145,
  },
  {
    id: "bono",
    label: "Bono",
    matches: ["Bono", "Bono East", "Ahafo"],
    path: "M 40,200 L 135,200 L 135,270 L 40,270 Z",
    labelX: 87,
    labelY: 240,
  },
  {
    id: "volta",
    label: "Volta / Oti",
    matches: ["Volta", "Oti"],
    path: "M 195,200 L 260,200 L 260,310 L 195,310 Z",
    labelX: 227,
    labelY: 260,
  },
  {
    id: "ashanti",
    label: "Ashanti",
    matches: ["Ashanti"],
    path: "M 80,280 L 185,280 L 185,340 L 80,340 Z",
    labelX: 132,
    labelY: 315,
  },
  {
    id: "eastern",
    label: "Eastern",
    matches: ["Eastern"],
    path: "M 160,200 L 190,200 L 210,280 L 190,280 L 190,340 L 160,340 Z",
    labelX: 183,
    labelY: 270,
  },
  {
    id: "western",
    label: "Western",
    matches: ["Western", "Western North"],
    path: "M 30,280 L 75,280 L 75,340 L 60,400 L 30,400 Z",
    labelX: 52,
    labelY: 340,
  },
  {
    id: "central",
    label: "Central",
    matches: ["Central"],
    path: "M 80,345 L 165,345 L 155,405 L 65,405 Z",
    labelX: 115,
    labelY: 378,
  },
  {
    id: "greater-accra",
    label: "Greater Accra",
    matches: ["Greater Accra"],
    path: "M 170,345 L 230,345 L 230,395 L 160,395 Z",
    labelX: 195,
    labelY: 373,
  },
];

/* ------------------------------------------------------------------ */
/*  Color scale                                                        */
/* ------------------------------------------------------------------ */

function getDensityColor(count: number): string {
  if (count === 0) return "#e8e8e8";
  if (count <= 5) return "#c8e6c9";
  if (count <= 15) return "#81c784";
  if (count <= 30) return "#4caf50";
  return "#2e7d32";
}

function getDensityTextColor(count: number): string {
  if (count <= 15) return "#344767";
  return "#ffffff";
}

/* ------------------------------------------------------------------ */
/*  Status color helpers                                               */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "#e3f2fd", text: "#1565c0", label: "New" },
  enriched: { bg: "#f3e5f5", text: "#7b1fa2", label: "Enriched" },
  analyzed: { bg: "#fff3e0", text: "#e65100", label: "Analyzed" },
  contacted: { bg: "#e8f5e9", text: "#2e7d32", label: "Contacted" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TerritoryPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    api<Prospect[]>("/prospects/?limit=200")
      .then(setProspects)
      .catch(() => setProspects([]))
      .finally(() => setLoading(false));
  }, []);

  /* Group prospects by SVG region */
  const regionDataMap = useMemo(() => {
    const map: Record<string, RegionData> = {};

    for (const svgR of SVG_REGIONS) {
      map[svgR.id] = {
        name: svgR.label,
        prospects: [],
        total: 0,
        byStatus: {},
      };
    }

    for (const p of prospects) {
      const region = SVG_REGIONS.find((r) =>
        r.matches.some(
          (m) => p.region?.toLowerCase() === m.toLowerCase()
        )
      );
      if (region) {
        const rd = map[region.id];
        rd.prospects.push(p);
        rd.total++;
        rd.byStatus[p.status] = (rd.byStatus[p.status] || 0) + 1;
      }
    }

    return map;
  }, [prospects]);

  const selectedData = selectedRegion ? regionDataMap[selectedRegion] : null;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (hoveredRegion) {
        setTooltipPos({ x: e.clientX, y: e.clientY });
      }
    },
    [hoveredRegion]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#7b809a]">
        <Link href="/dashboard" className="hover:text-[#344767] transition-colors">
          Home
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#344767]">Territory</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#344767]">Territory Map</h1>
        <p className="mt-1 text-sm text-[#7b809a]">
          Prospect density across Ghana regions. Click a region to view details.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-[#e91e63]" />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: SVG Map */}
          <div className="col-span-12 lg:col-span-7">
            <div className="material-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#344767]">
                  Ghana Prospect Density
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#7b809a]">Density:</span>
                  {[
                    { color: "#e8e8e8", label: "0" },
                    { color: "#c8e6c9", label: "1-5" },
                    { color: "#81c784", label: "6-15" },
                    { color: "#4caf50", label: "16-30" },
                    { color: "#2e7d32", label: "31+" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1">
                      <div
                        className="size-3 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[10px] text-[#7b809a]">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div onMouseMove={handleMouseMove} className="relative">
                <svg
                  viewBox="0 0 280 430"
                  className="w-full"
                  style={{ maxHeight: 520 }}
                >
                  {/* Ghana outline */}
                  <rect
                    x="25"
                    y="20"
                    width="245"
                    height="400"
                    rx="12"
                    fill="none"
                    stroke="#dee2e6"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />

                  {SVG_REGIONS.map((region) => {
                    const data = regionDataMap[region.id];
                    const isSelected = selectedRegion === region.id;
                    const isHovered = hoveredRegion === region.id;
                    const fillColor = getDensityColor(data.total);
                    const textColor = getDensityTextColor(data.total);

                    return (
                      <g
                        key={region.id}
                        className="cursor-pointer transition-all duration-150"
                        onClick={() =>
                          setSelectedRegion(
                            selectedRegion === region.id ? null : region.id
                          )
                        }
                        onMouseEnter={() => setHoveredRegion(region.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                      >
                        <path
                          d={region.path}
                          fill={fillColor}
                          stroke={isSelected ? "#e91e63" : isHovered ? "#344767" : "#ffffff"}
                          strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                          rx="4"
                          style={{
                            filter: isHovered
                              ? "brightness(0.92)"
                              : undefined,
                            transition:
                              "fill 200ms, stroke 150ms, stroke-width 150ms",
                          }}
                        />
                        <text
                          x={region.labelX}
                          y={region.labelY - 6}
                          textAnchor="middle"
                          fill={textColor}
                          fontSize="9"
                          fontWeight="600"
                          style={{ pointerEvents: "none" }}
                        >
                          {region.label}
                        </text>
                        <text
                          x={region.labelX}
                          y={region.labelY + 8}
                          textAnchor="middle"
                          fill={textColor}
                          fontSize="11"
                          fontWeight="700"
                          style={{ pointerEvents: "none" }}
                        >
                          {data.total}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Floating tooltip */}
                {hoveredRegion && (
                  <div
                    className="pointer-events-none fixed z-50 rounded-lg bg-[#1f283e] px-3 py-2 text-xs text-white shadow-lg"
                    style={{
                      left: tooltipPos.x + 12,
                      top: tooltipPos.y - 40,
                    }}
                  >
                    <p className="font-semibold">
                      {regionDataMap[hoveredRegion].name}
                    </p>
                    <p className="text-white/70">
                      {regionDataMap[hoveredRegion].total} prospect
                      {regionDataMap[hoveredRegion].total !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="col-span-12 lg:col-span-5">
            {selectedData ? (
              <div className="material-card space-y-5 p-6">
                {/* Region header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#e91e63] to-[#c2185b]">
                        <MapPin className="size-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#344767]">
                          {selectedData.name}
                        </h3>
                        <p className="text-xs text-[#7b809a]">
                          {selectedData.total} total prospect
                          {selectedData.total !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 text-xs px-2.5">
                    {selectedData.total}
                  </Badge>
                </div>

                {/* Status breakdown */}
                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                    Status Breakdown
                  </p>
                  <div className="space-y-2.5">
                    {Object.entries(STATUS_COLORS).map(([key, style]) => {
                      const count = selectedData.byStatus[key] || 0;
                      const pct =
                        selectedData.total > 0
                          ? (count / selectedData.total) * 100
                          : 0;
                      return (
                        <div key={key}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-medium text-[#344767]">
                              {style.label}
                            </span>
                            <span className="text-xs tabular-nums text-[#7b809a]">
                              {count}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0f2f5]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: style.text,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top 5 prospects */}
                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                    Top Prospects
                  </p>
                  {selectedData.prospects.length === 0 ? (
                    <p className="py-4 text-center text-sm text-[#7b809a]">
                      No prospects in this region yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedData.prospects.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg border border-[#e9ecef] bg-[#fafafa] p-3 transition-colors hover:bg-white"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#344767]">
                              {p.name}
                            </p>
                            <p className="text-[11px] text-[#7b809a]">
                              {p.industry}
                            </p>
                          </div>
                          <Badge
                            className="ml-2 border-0 text-[10px] shrink-0"
                            style={{
                              backgroundColor:
                                STATUS_COLORS[p.status]?.bg || "#f0f2f5",
                              color:
                                STATUS_COLORS[p.status]?.text || "#7b809a",
                            }}
                          >
                            {STATUS_COLORS[p.status]?.label || p.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* View all link */}
                {selectedData.total > 0 && (
                  <Link
                    href={`/prospects?region=${encodeURIComponent(
                      SVG_REGIONS.find((r) => r.id === selectedRegion)
                        ?.matches[0] || ""
                    )}`}
                  >
                    <Button className="w-full bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white hover:shadow-lg hover:shadow-[#e91e63]/20 transition-shadow">
                      <Eye className="mr-2 size-4" />
                      View All Prospects
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="material-card flex flex-col items-center justify-center p-12 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-[#f0f2f5]">
                  <MapPin className="size-7 text-[#7b809a]" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#344767]">
                  Select a Region
                </h3>
                <p className="mt-1 max-w-[220px] text-sm text-[#7b809a]">
                  Click on any region in the map to view prospect details and
                  status breakdown.
                </p>

                {/* Summary stats */}
                <div className="mt-6 grid w-full grid-cols-2 gap-3">
                  <div className="rounded-lg bg-[#f0f2f5] p-3 text-center">
                    <p className="text-lg font-bold text-[#344767]">
                      {prospects.length}
                    </p>
                    <p className="text-[11px] text-[#7b809a]">
                      Total Prospects
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#f0f2f5] p-3 text-center">
                    <p className="text-lg font-bold text-[#344767]">
                      {
                        SVG_REGIONS.filter(
                          (r) => regionDataMap[r.id].total > 0
                        ).length
                      }
                    </p>
                    <p className="text-[11px] text-[#7b809a]">
                      Active Regions
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
