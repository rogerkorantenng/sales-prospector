"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Radar, Loader2 } from "lucide-react";

const REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
  "Northern", "Volta", "Bono", "Upper East", "Upper West",
];

const INDUSTRIES = [
  "education", "healthcare", "retail", "finance",
  "hospitality", "restaurant", "pharmacy", "supermarket",
];

export function DiscoveryForm({ onComplete }: { onComplete?: () => void }) {
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState(10);
  const [running, setRunning] = useState(false);

  const toggleItem = (
    item: string,
    list: string[],
    setter: (v: string[]) => void
  ) => {
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const handleRun = async () => {
    if (selectedRegions.length === 0) { toast.error("Select at least one region"); return; }
    setRunning(true);
    try {
      await apiPost<{ id: string }>("/discovery/run", {
        config: { regions: selectedRegions, industries: selectedIndustries, radius_km: radiusKm },
      });
      toast.success("Discovery run started");
      onComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start discovery");
    } finally { setRunning(false); }
  };

  return (
    <div className="material-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e9ecef]">
        <div className="icon-shape icon-shape-info" style={{ width: 36, height: 36, borderRadius: 8 }}>
          <Radar className="size-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#344767]">New Discovery Run</h3>
          <p className="text-xs text-[#7b809a]">Configure your search parameters</p>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Regions */}
        <div>
          <label className="mb-2.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Regions</label>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => {
              const selected = selectedRegions.includes(r);
              return (
                <Badge
                  key={r}
                  variant={selected ? "default" : "outline"}
                  className={`cursor-pointer select-none px-3 py-1.5 text-xs transition-all rounded-lg ${
                    selected
                      ? "bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white shadow-sm shadow-[#e91e63]/20 border-0"
                      : "border-[#e9ecef] text-[#7b809a] hover:bg-[#f8f9fa] hover:text-[#344767]"
                  }`}
                  onClick={() => toggleItem(r, selectedRegions, setSelectedRegions)}
                >
                  {r}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Industries */}
        <div>
          <label className="mb-2.5 block text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Industries</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((i) => {
              const selected = selectedIndustries.includes(i);
              return (
                <Badge
                  key={i}
                  variant={selected ? "default" : "outline"}
                  className={`cursor-pointer select-none capitalize px-3 py-1.5 text-xs transition-all rounded-lg ${
                    selected
                      ? "bg-gradient-to-r from-[#1a73e8] to-[#1557b0] text-white shadow-sm shadow-[#1a73e8]/20 border-0"
                      : "border-[#e9ecef] text-[#7b809a] hover:bg-[#f8f9fa] hover:text-[#344767]"
                  }`}
                  onClick={() => toggleItem(i, selectedIndustries, setSelectedIndustries)}
                >
                  {i}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Radius Slider */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">Search Radius</label>
            <span className="text-sm font-bold tabular-nums text-[#344767]">{radiusKm} km</span>
          </div>
          <Slider
            value={[radiusKm]}
            onValueChange={(val) => setRadiusKm(Array.isArray(val) ? val[0] : val)}
            min={5} max={50} step={5}
          />
          <div className="mt-1 flex justify-between text-[10px] text-[#7b809a]">
            <span>5 km</span>
            <span>50 km</span>
          </div>
        </div>

        {/* Start Button */}
        <Button
          className="w-full bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20 hover:shadow-lg hover:shadow-[#e91e63]/30"
          size="lg"
          onClick={handleRun}
          disabled={running || selectedRegions.length === 0}
        >
          {running ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Running Discovery...
            </>
          ) : (
            <>
              <Radar className="mr-2 size-4" />
              Start Discovery
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
