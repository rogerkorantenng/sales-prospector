"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface CampaignStats {
  name: string;
  sent: number;
  opened: number;
  replied: number;
}

export function CampaignChart({ campaigns }: { campaigns: CampaignStats[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={campaigns} barGap={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "#7b809a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#7b809a" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#ffffff",
            border: "1px solid #e9ecef",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#344767",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "12px", color: "#7b809a" }} />
        <Bar dataKey="sent" fill="#1a73e8" name="Sent" radius={[4, 4, 0, 0]} />
        <Bar dataKey="opened" fill="#4caf50" name="Opened" radius={[4, 4, 0, 0]} />
        <Bar dataKey="replied" fill="#fb8c00" name="Replied" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
