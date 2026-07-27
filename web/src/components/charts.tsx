"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { severityHex } from "@/lib/format";
import type { SeverityBucket, TrendPoint } from "@/lib/types";

const AXIS = { fontSize: 11, fill: "#64748b" } as const;
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)",
};

function shortDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/** Scouting volume (area) + average severity (line) over time. */
export function TrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="recFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis yAxisId="left" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={AXIS} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(l) => shortDate(String(l))}
          formatter={(v: number, name) => [v, name === "records" ? "Records" : name === "avg_severity" ? "Avg severity" : "Over ETL"]}
        />
        <Area yAxisId="left" type="monotone" dataKey="records" stroke="#10b981" strokeWidth={2} fill="url(#recFill)" />
        <Bar yAxisId="left" dataKey="over_threshold" fill="#fca5a5" radius={[2, 2, 0, 0]} barSize={6} />
        <Line yAxisId="right" type="monotone" dataKey="avg_severity" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for a dimensional breakdown. */
export function HBarChart({
  data,
  height = 260,
  color = "#10b981",
  valueKey = "value",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  valueKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(height, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={120} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Severity 0–5 histogram, colored by the severity heat scale. */
export function SeverityHistogram({ data, height = 200 }: { data: SeverityBucket[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="severity" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={(v: number) => [v, "Records"]} labelFormatter={(l) => `Severity ${l}`} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.severity} fill={severityHex(d.severity)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut for composition (e.g. scouting by type). */
export function Donut({
  data,
  height = 200,
}: {
  data: { name: string; value: number; color: string }[];
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-ink">{total}</span>
        <span className="text-xs text-ink-faint">total</span>
      </div>
    </div>
  );
}

/** Pest × greenhouse severity heat matrix (custom — dense & scannable). */
export function HeatMatrix({
  rows,
  cols,
  value,
}: {
  rows: string[];
  cols: string[];
  value: (row: string, col: string) => number | null;
}) {
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white p-1.5" />
            {cols.map((c) => (
              <th key={c} className="p-1 text-center font-medium text-ink-faint">
                <span className="inline-block max-w-[40px] truncate" title={c}>
                  {c.replace(/[^0-9]/g, "") || c}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1 pr-3 font-medium text-ink">{r}</td>
              {cols.map((c) => {
                const v = value(r, c);
                return (
                  <td
                    key={c}
                    className="h-8 w-8 rounded-md text-center font-semibold tabular-nums"
                    style={{ backgroundColor: v == null ? "#f1f5f9" : severityHex(v), color: v != null && v >= 3 ? "#fff" : "#334155" }}
                    title={v == null ? "no records" : `${r} · ${c}: avg ${v}`}
                  >
                    {v == null ? "" : v.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Add these two exports to components/charts.tsx (alongside the existing
 * TrendChart / HBarChart / SeverityHistogram / Donut / HeatMatrix).
 * They reuse the same recharts imports and AXIS/tooltipStyle constants
 * already defined at the top of that file — no new imports needed.
 */

/** Applications (bar) + cost (line) per period — for the Spray Overview report. */
export function SprayTimingChart({
  data,
  height = 260,
}: {
  data: { period: string; applications: number; cost: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis yAxisId="left" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={52} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name) => [
            name === "cost" ? `$${v.toFixed(2)}` : v,
            name === "cost" ? "Cost" : "Applications",
          ]}
        />
        <Bar yAxisId="left" dataKey="applications" fill="#0ea5e9" radius={[2, 2, 0, 0]} barSize={14} />
        <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#dc2626" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Single-metric cost trend (area) — for the Cost report. */
export function CostTrendChart({
  data,
  height = 260,
}: {
  data: { period: string; cost: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toFixed(2)}`, "Cost"]} />
        <Area type="monotone" dataKey="cost" stroke="#059669" strokeWidth={2} fill="url(#costFill)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}