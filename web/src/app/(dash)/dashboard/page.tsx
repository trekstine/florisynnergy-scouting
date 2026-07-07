"use client";

import {
  Bug,
  ClipboardList,
  DollarSign,
  Gauge,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Donut, HBarChart, SeverityHistogram, TrendChart } from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { PressureMap } from "@/components/map";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { PRESSURE_HEX, PRESSURE_LABEL, SCOUTING_LABEL, money, relativeTime } from "@/lib/format";
import {
  useBreakdown,
  usePoints,
  usePressure,
  useRecommendations,
  useSeverityDist,
  useSummary,
  useTrend,
} from "@/lib/hooks";
import type { Filters, KpiDelta, ScoutingFor } from "@/lib/types";

const TYPE_COLOR: Record<ScoutingFor, string> = {
  pest: "#10b981",
  disease: "#f59e0b",
  lure: "#6366f1",
  sticky_trap: "#ec4899",
};

export default function DashboardPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));
  const summary = useSummary(filters);
  const trend = useTrend(filters);
  const pestBreak = useBreakdown("pest", filters);
  const sevDist = useSeverityDist(filters);
  const recs = useRecommendations();
  const pressure = usePressure(filters);
  const points = usePoints(filters);
  const heatPoints = useMemo<[number, number, number][]>(
    () => (points.data ?? []).map((p) => [p.lat, p.lng, Math.max(0.15, p.severity / 5)]),
    [points.data],
  );

  const openRecs = useMemo(
    () => (recs.data ?? []).filter((r) => r.status === "open" || r.status === "planned"),
    [recs.data],
  );

  const typeData = useMemo(() => {
    const bt = summary.data?.by_type ?? {};
    return (["pest", "disease", "lure", "sticky_trap"] as ScoutingFor[])
      .map((k) => ({ name: SCOUTING_LABEL[k], value: bt[k] ?? 0, color: TYPE_COLOR[k] }))
      .filter((d) => d.value > 0);
  }, [summary.data]);

  const highPressure = (pressure.data ?? []).filter((g) => g.pressure === "high").length;

  return (
    <div className="space-y-5 pb-10">
      <PageHeader title="Dashboard" subtitle="Farm-wide scouting, pressure & agronomy" />
      <div className="px-6">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 px-6 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<ClipboardList size={16} />} label="Records" kpi={summary.data?.records} />
        <Kpi icon={<Gauge size={16} />} label="Avg severity" kpi={summary.data?.avg_severity} decimals={1} invert />
        <Kpi icon={<Bug size={16} />} label="Over ETL" kpi={summary.data?.over_threshold} invert />
        <Kpi icon={<TrendingUp size={16} />} label="Open recs" value={summary.data?.open_recommendations} accent={openRecs.length ? "#dc2626" : undefined} />
        <Kpi icon={<Users size={16} />} label="Active scouts" kpi={summary.data?.active_scouts} />
        <Kpi icon={<DollarSign size={16} />} label="Spray cost" kpi={summary.data?.spray_cost} money invert />
      </div>

      {/* 2D farm pressure map */}
      <div className="px-6">
        <Card className="overflow-hidden">
          <CardHeader
            title="Farm pressure map"
            subtitle="Live 2D / satellite view — pest & disease pressure by greenhouse"
            actions={
              <Link href="/map" className="text-sm font-semibold text-brand-700 hover:underline">
                Open full map →
              </Link>
            }
          />
          <div className="relative h-[420px] w-full">
            {pressure.data ? (
              <PressureMap
                data={pressure.data}
                selectedId={null}
                onSelect={() => router.push("/map")}
                heatPoints={heatPoints}
                showHeat
              />
            ) : (
              <div className="flex h-full items-center justify-center"><Spinner /></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-2.5">
            {(["high", "medium", "low", "none"] as const).map((p) => (
              <span key={p} className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PRESSURE_HEX[p] }} />
                {PRESSURE_LABEL[p]}
              </span>
            ))}
            <span className="ml-auto text-xs text-ink-faint">Click a greenhouse to drill in</span>
          </div>
        </Card>
      </div>

      {/* Trend + composition */}
      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Scouting trend" subtitle="Volume (area), over-ETL (bars), avg severity (line)" />
          <div className="p-4">
            {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="By scouting type" />
          <div className="p-4">
            {summary.isLoading ? <Spinner /> : typeData.length ? <Donut data={typeData} /> : <EmptyState>No records.</EmptyState>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {typeData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name} <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Breakdown + severity + recs */}
      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Top pests" subtitle="By records in range" />
          <div className="p-4">
            {pestBreak.isLoading ? <Spinner /> : (
              <HBarChart
                data={(pestBreak.data ?? []).slice(0, 7).map((r) => ({ label: r.key, value: r.records }))}
              />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Severity distribution" subtitle="0 (clean) → 5 (severe)" />
          <div className="p-4">
            {sevDist.isLoading ? <Spinner /> : <SeverityHistogram data={sevDist.data ?? []} />}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Action queue"
            subtitle={`${highPressure} greenhouses high pressure`}
            actions={<Link href="/recommendations" className="text-sm font-semibold text-brand-700 hover:underline">View</Link>}
          />
          <div className="divide-y divide-line">
            {recs.isLoading && <div className="p-4"><Spinner /></div>}
            {openRecs.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{r.note ?? "Intervention"}</p>
                  <p className="text-xs text-ink-faint">{relativeTime(r.created_at)}</p>
                </div>
                <Badge color={r.status === "open" ? "#dc2626" : "#f59e0b"}>{r.status}</Badge>
              </div>
            ))}
            {!recs.isLoading && openRecs.length === 0 && <div className="p-4"><EmptyState>All clear.</EmptyState></div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  kpi,
  value,
  decimals = 0,
  money: asMoney = false,
  invert = false,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  kpi?: KpiDelta;
  value?: number | string;
  decimals?: number;
  money?: boolean;
  invert?: boolean; // for metrics where up = bad (severity, over-ETL, cost)
  accent?: string;
}) {
  const v = kpi ? kpi.value : value;
  const display =
    v == null ? "—" : asMoney ? money(Number(v)) : typeof v === "number" ? v.toFixed(decimals) : v;
  const pct = kpi?.delta_pct ?? null;
  const up = (pct ?? 0) > 0;
  const good = pct == null ? null : invert ? !up : up;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-faint">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>{display}</span>
        {pct != null && pct !== 0 && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${good ? "text-brand-600" : "text-red-600"}`}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(pct)}%
          </span>
        )}
      </div>
    </Card>
  );
}
