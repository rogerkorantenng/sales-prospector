"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  gradient?: "primary" | "info" | "success" | "warning" | "danger" | "dark";
  trend?: "up" | "down";
  delay?: number;
}

const gradientStyles: Record<string, { bg: string; shadow: string }> = {
  primary: {
    bg: "linear-gradient(135deg, #e91e63, #c2185b)",
    shadow: "0 4px 20px rgba(233,30,99,0.3)",
  },
  info: {
    bg: "linear-gradient(135deg, #49a3f1, #1a73e8)",
    shadow: "0 4px 20px rgba(26,115,232,0.3)",
  },
  success: {
    bg: "linear-gradient(135deg, #66bb6a, #388e3c)",
    shadow: "0 4px 20px rgba(76,175,80,0.3)",
  },
  warning: {
    bg: "linear-gradient(135deg, #ffa726, #fb8c00)",
    shadow: "0 4px 20px rgba(251,140,0,0.3)",
  },
  danger: {
    bg: "linear-gradient(135deg, #ef5350, #e53935)",
    shadow: "0 4px 20px rgba(244,67,54,0.3)",
  },
  dark: {
    bg: "linear-gradient(135deg, #42424a, #191919)",
    shadow: "0 4px 20px rgba(52,71,103,0.3)",
  },
};

const subtitleColorMap: Record<string, string> = {
  primary: "text-[#e91e63]",
  info: "text-[#1a73e8]",
  success: "text-[#4caf50]",
  warning: "text-[#fb8c00]",
  danger: "text-[#f44335]",
  dark: "text-[#344767]",
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient = "dark",
  trend,
  delay,
}: StatsCardProps) {
  const delayClass = delay && delay >= 1 && delay <= 8 ? `delay-${delay}` : "";
  const animateClass = delay ? `animate-slide-up ${delayClass}` : "";
  const style = gradientStyles[gradient] || gradientStyles.dark;

  return (
    <div className={animateClass}>
      <div className="relative overflow-visible rounded-xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
        {/* Floating gradient icon — overlaps top edge */}
        {Icon && (
          <div className="absolute -top-4 right-4 z-10">
            <div
              className="flex size-14 items-center justify-center rounded-xl"
              style={{
                background: style.bg,
                boxShadow: style.shadow,
              }}
            >
              <Icon className="size-6 text-white" strokeWidth={1.8} />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b809a]">
            {title}
          </p>
          <h4 className="mt-1 text-[28px] font-bold leading-tight tabular-nums text-[#344767]">
            {value}
          </h4>
        </div>

        {/* Footer with separator */}
        {subtitle && (
          <div className="border-t border-[#f0f2f5] px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              {trend === "up" && (
                <TrendingUp className="size-3.5 text-[#4caf50]" />
              )}
              {trend === "down" && (
                <TrendingDown className="size-3.5 text-[#f44335]" />
              )}
              <p
                className={`text-xs font-medium ${subtitleColorMap[gradient] ?? "text-[#7b809a]"}`}
              >
                {subtitle}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
