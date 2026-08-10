"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
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
/** Shared recharts <Legend> styling so every chart's key looks the same. */
const LEGEND_STYLE = { fontSize: 11, paddingTop: 6 } as const;

function shortDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * Standalone chart key. Used where recharts can't render a meaningful
 * legend on its own — single-series charts, or charts whose colors encode a
 * scale (severity) rather than a series.
 */
export function ChartKey({
  items,
  note,
}: {
  items: { label: string; color: string; shape?: "dot" | "bar" | "line" }[];
  note?: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2">
      {items.map(({ label, color, shape = "dot" }) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          {shape === "line" ? (
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
          ) : shape === "bar" ? (
            <span className="h-3 w-2 rounded-sm" style={{ backgroundColor: color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          )}
          {label}
        </span>
      ))}
      {note && <span className="text-[11px] text-ink-faint">{note}</span>}
    </div>
  );
}

/** Scouting volume (area) + over-ETL (bars) + average severity (line). */
export function TrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div>
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
          <Area yAxisId="left" name="Records" type="monotone" dataKey="records" stroke="#10b981" strokeWidth={2} fill="url(#recFill)" />
          <Bar yAxisId="left" name="Over ETL" dataKey="over_threshold" fill="#fca5a5" radius={[2, 2, 0, 0]} barSize={6} />
          <Line yAxisId="right" name="Avg severity" type="monotone" dataKey="avg_severity" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartKey
        items={[
          { label: "Records (left axis)", color: "#10b981" },
          { label: "Over ETL (left axis)", color: "#fca5a5", shape: "bar" },
          { label: "Avg severity 0–5 (right axis)", color: "#f59e0b", shape: "line" },
        ]}
      />
    </div>
  );
}

/**
 * One line per agent over time — lets a manager line a specific pest or
 * disease up against the interventions they made, which a single blended
 * trend line can't show.
 */
export function MultiLineChart({
  data,
  series,
  colors,
  height = 280,
  yLabel = "Avg severity",
  yDomain = [0, 5],
}: {
  /** Rows keyed by date, with one numeric column per series name. */
  data: Record<string, string | number | null>[];
  series: string[];
  colors: string[];
  height?: number;
  yLabel?: string;
  yDomain?: [number, number];
}) {
  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-faint">
        No data in range.
      </div>
    );
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={yDomain}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            allowDecimals
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(v: number, name) => [v, name]}
          />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              name={s}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-ink-faint">
        {yLabel} per day · gaps mean the agent wasn&apos;t recorded that day
      </p>
    </div>
  );
}

/** Horizontal bars for a dimensional breakdown. */
export function HBarChart({
  data,
  height = 260,
  color = "#10b981",
  valueKey = "value",
  seriesLabel = "Records",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  valueKey?: string;
  /** What the bar length means — shown in the key and the tooltip. */
  seriesLabel?: string;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(height, data.length * 30 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={120} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "#f8fafc" }}
            formatter={(v: number) => [v, seriesLabel]}
          />
          <Bar name={seriesLabel} dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
      <ChartKey items={[{ label: seriesLabel, color, shape: "bar" }]} />
    </div>
  );
}

/** Severity 0–5 histogram, colored by the severity heat scale. */
export function SeverityHistogram({ data, height = 200 }: { data: SeverityBucket[]; height?: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="severity" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={(v: number) => [v, "Records"]} labelFormatter={(l) => `Severity ${l}`} />
          <Bar name="Records" dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.severity} fill={severityHex(d.severity)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Bar colour encodes the severity scale itself, so the key is the scale. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2">
        <span className="text-[11px] text-ink-faint">Bar height = records · colour = severity:</span>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="flex items-center gap-1 text-[11px] text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: severityHex(s) }} />
            {s}
          </span>
        ))}
        <span className="text-[11px] text-ink-faint">(0 clean → 5 severe)</span>
      </div>
    </div>
  );
}

/** Donut for composition (e.g. scouting by type). */
export function Donut({
  data,
  height = 200,
  showKey = false,
}: {
  data: { name: string; value: number; color: string }[];
  height?: number;
  /** Some callers render their own richer key below the donut. */
  showKey?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name) => [
                `${v} (${total ? Math.round((v / total) * 100) : 0}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-ink">{total}</span>
          <span className="text-xs text-ink-faint">total</span>
        </div>
      </div>
      {showKey && (
        <ChartKey items={data.map((d) => ({ label: `${d.name} (${d.value})`, color: d.color }))} />
      )}
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2">
        <span className="text-[11px] text-ink-faint">Cell = avg severity:</span>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="flex items-center gap-1 text-[11px] text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: severityHex(s) }} />
            {s}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[11px] text-ink-faint">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#f1f5f9]" />
          no records
        </span>
      </div>
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
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis yAxisId="left" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number, name) => [
              name === "Cost" ? `$${v.toFixed(2)}` : v,
              name,
            ]}
          />
          <Bar yAxisId="left" name="Applications" dataKey="applications" fill="#0ea5e9" radius={[2, 2, 0, 0]} barSize={14} />
          <Line yAxisId="right" name="Cost" type="monotone" dataKey="cost" stroke="#dc2626" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartKey
        items={[
          { label: "Applications (left axis)", color: "#0ea5e9", shape: "bar" },
          { label: "Cost (right axis)", color: "#dc2626", shape: "line" },
        ]}
      />
    </div>
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
    <div>
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
          <Area name="Cost" type="monotone" dataKey="cost" stroke="#059669" strokeWidth={2} fill="url(#costFill)" />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartKey items={[{ label: "Spray cost per period", color: "#059669", shape: "line" }]} />
    </div>
  );
}

/**
 * More additions for components/charts.tsx.
 *
 * IMPORTANT: these two need `Legend` added to the existing recharts import
 * at the top of charts.tsx, e.g.:
 *
 *   import {
 *     Area,
 *     Bar,
 *     BarChart,
 *     CartesianGrid,
 *     Cell,
 *     ComposedChart,
 *     Legend,        // <-- add this
 *     Line,
 *     Pie,
 *     PieChart,
 *     ResponsiveContainer,
 *     Tooltip,
 *     XAxis,
 *     YAxis,
 *   } from "recharts";
 *
 * Everything else (AXIS, tooltipStyle) is reused from the existing file.
 */

/**
 * Pareto / 80-20 chart: bars ranked largest-first with a cumulative-%
 * line on a secondary axis. Good for "which few things account for most
 * of the total" — cost concentration, top offenders, etc.
 */
/**
 * A plain ranked bar chart: largest first, no cumulative overlay.
 *
 * Managers read these to answer "where is the money going", which the bar
 * heights already say. The Pareto line this replaced added a second axis and
 * a second scale for a question nobody was asking.
 */
export function RankedBarChart({
  data,
  height = 280,
  color = "#7c3aed",
  seriesLabel = "Value",
  format = "number",
  unitNote,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  seriesLabel?: string;
  /** Money formats the axis and tooltip in KES. */
  format?: "number" | "money";
  unitNote?: string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const fmt = (v: number) =>
    format === "money"
      ? `KES ${Math.round(v).toLocaleString()}`
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  // Long names need room and an angle; short codes read better upright.
  const longest = sorted.reduce((m, d) => Math.max(m, d.label.length), 0);
  const angled = longest > 12;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sorted}
          margin={{ top: 8, right: 16, left: 4, bottom: angled ? 46 : 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={angled ? -35 : 0}
            textAnchor={angled ? "end" : "middle"}
            height={angled ? 60 : 24}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={format === "money" ? 64 : 44}
            tickFormatter={(v: number) =>
              format === "money" ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "#f8fafc" }}
            formatter={(v: number) => [fmt(v), seriesLabel]}
          />
          <Bar
            name={seriesLabel}
            dataKey="value"
            fill={color}
            radius={[4, 4, 0, 0]}
            barSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
      <ChartKey
        items={[{ label: seriesLabel, color, shape: "bar" }]}
        note={unitNote ?? "Ranked largest first"}
      />
    </div>
  );
}

export function StackedBarChart({
  data,
  keys,
  colors,
  height = 260,
  xKey = "period",
}: {
  data: Record<string, string | number>[];
  keys: string[];
  colors: string[];
  height?: number;
  /** Which field carries the category. Time series use "period"; a
   *  per-greenhouse breakdown uses "label". Hardcoding "period" silently
   *  produced an axis with no labels at all. */
  xKey?: string;
}) {
  // Block codes are short and there may be twenty of them — show every one,
  // angled, rather than letting recharts drop labels to make room.
  const categorical = xKey !== "period";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: -16, bottom: categorical ? 28 : 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          minTickGap={categorical ? 0 : 24}
          interval={categorical ? 0 : "preserveEnd"}
          angle={categorical ? -45 : 0}
          textAnchor={categorical ? "end" : "middle"}
          height={categorical ? 46 : 24}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
        <Legend wrapperStyle={LEGEND_STYLE} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="stack"
            fill={colors[i % colors.length]}
            radius={i === keys.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}


