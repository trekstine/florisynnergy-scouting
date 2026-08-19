"use client";

import {
  ArrowRight,
  Bug,
  CalendarClock,
  ClipboardList,
  Map as MapIcon,
  Maximize2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  FilterBar,
  RANGES_WITH_TODAY,
  defaultFilters,
  isoDaysAgo,
} from "@/components/FilterBar";
import { PressureMap } from "@/components/map";
import { Badge, Card, CardHeader, EmptyState, Spinner } from "@/components/ui";
import { bedLabel, PRESSURE_HEX, PRESSURE_LABEL, relativeTime, SCOUTING_LABEL, severityHex } from "@/lib/format";
import {
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePests,
  usePoints,
  usePressure,
  useRecommendations,
  useScouting,
  useSummary,
  useTrend,
} from "@/lib/hooks";
import type { Filters, GreenhousePressure } from "@/lib/types";

/**
 * The dashboard answers "what needs me today"; Analytics answers "what has
 * been happening over time". Keeping that split is deliberate — this page
 * carries no trend/breakdown charts, because those live one click away under
 * Analytics and having them in both places made the two pages near-identical.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));
  const [mapView, setMapView] = useState<"choropleth" | "heat" | "both">("both");
  const [hovered, setHovered] = useState<GreenhousePressure | null>(null);

  const summary = useSummary(filters);
  const trend = useTrend(filters);
  const pressure = usePressure(filters);
  const points = usePoints(filters);
  const recs = useRecommendations();
  const greenhouses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const employees = useEmployees();

  const feed = useScouting({ ...filters, limit: 200 });
  // Coverage needs a wider window than the filter — a block last scouted 45
  // days ago simply wouldn't appear in a 30-day query, and that gap is
  // precisely what we want to surface.
  const coverageScope = useScouting({ start: isoDaysAgo(90), limit: 1000 });

  const [greeting, setGreeting] = useState("Welcome back");
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setTodayLabel(
      d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    );
  }, []);

  // ── Lookups ──
  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);
  const pestName = useMemo(() => {
    const m = new Map<number, { name: string; threshold: number }>();
    for (const p of pests.data ?? []) m.set(p.id, p);
    return m;
  }, [pests.data]);
  const diseaseName = useMemo(() => {
    const m = new Map<number, { name: string; threshold: number }>();
    for (const d of diseases.data ?? []) m.set(d.id, d);
    return m;
  }, [diseases.data]);
  const scoutName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employees.data]);

  const targetOf = (r: { pest_id: number | null; disease_id: number | null }) =>
    r.disease_id != null
      ? (diseaseName.get(r.disease_id)?.name ?? "Disease")
      : r.pest_id != null
        ? (pestName.get(r.pest_id)?.name ?? "Pest")
        : "—";

  // ── Today's snapshot ──
  const todayStats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = (feed.data ?? []).filter(
      (r) => new Date(r.recorded_at) >= start,
    );
    const breaches = rows.filter((r) => {
      const t =
        r.disease_id != null
          ? diseaseName.get(r.disease_id)?.threshold
          : r.pest_id != null
            ? pestName.get(r.pest_id)?.threshold
            : undefined;
      return t != null && r.severity >= t && r.severity > 0;
    }).length;
    return {
      records: rows.length,
      scouts: new Set(rows.map((r) => r.scout_id).filter(Boolean)).size,
      blocks: new Set(rows.map((r) => r.greenhouse_id).filter(Boolean)).size,
      breaches,
    };
  }, [feed.data, pestName, diseaseName]);

  // ── Coverage: days since each block was last scouted ──
  const coverage = useMemo(() => {
    const last = new Map<number, string>();
    for (const r of coverageScope.data ?? []) {
      if (r.greenhouse_id == null) continue;
      const prev = last.get(r.greenhouse_id);
      if (!prev || r.recorded_at > prev) last.set(r.greenhouse_id, r.recorded_at);
    }
    const now = Date.now();
    return [...(greenhouses.data ?? [])]
      .map((g) => {
        const iso = last.get(g.id);
        const days = iso
          ? Math.floor((now - new Date(iso).getTime()) / 86_400_000)
          : null;
        return { id: g.id, label: g.code ?? g.name, days };
      })
      .sort((a, b) => (b.days ?? 999) - (a.days ?? 999));
  }, [coverageScope.data, greenhouses.data]);

  const overdue = coverage.filter((c) => c.days == null || c.days >= 7);

  const openRecs = useMemo(
    () =>
      (recs.data ?? [])
        .filter((r) => r.status === "open" || r.status === "planned")
        .sort((a, b) => b.trigger_severity - a.trigger_severity),
    [recs.data],
  );

  const heatPoints = useMemo<[number, number, number][]>(
    () =>
      (points.data ?? []).map((p) => [p.lat, p.lng, Math.max(0.15, p.severity / 5)]),
    [points.data],
  );

  const pressureCounts = useMemo(() => {
    const t = { none: 0, low: 0, medium: 0, high: 0 };
    for (const g of pressure.data ?? []) t[g.pressure] += 1;
    return t;
  }, [pressure.data]);

  const worstBlock = useMemo(
    () =>
      [...(pressure.data ?? [])].sort(
        (a, b) => b.avg_severity - a.avg_severity || b.over_threshold - a.over_threshold,
      )[0] ?? null,
    [pressure.data],
  );

  const recent = (feed.data ?? []).slice(0, 8);
  const hotBlocks = useMemo(
    () =>
      [...(pressure.data ?? [])]
        .sort((a, b) => b.avg_severity - a.avg_severity)
        .slice(0, 6),
    [pressure.data],
  );

  return (
    <div className="space-y-5 pb-10">
      {/* ── Greeting + today's snapshot ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting}</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {todayLabel} · Naivasha Rose Estate
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TodayChip
            icon={ClipboardList}
            value={todayStats.records}
            label="records today"
          />
          <TodayChip icon={Users} value={todayStats.scouts} label="scouts out" />
          <TodayChip icon={MapIcon} value={todayStats.blocks} label="blocks visited" />
          <TodayChip
            icon={Bug}
            value={todayStats.breaches}
            label="breaches today"
            tone={todayStats.breaches > 0 ? "#dc2626" : undefined}
          />
        </div>
      </div>

      <div className="px-6">
        {/* "Today" first: the dashboard's job is what needs attention now,
            and a manager checking on the morning's rounds should not have to
            read them out of a 7-day total. */}
        <FilterBar value={filters} onChange={setFilters} ranges={RANGES_WITH_TODAY} />
      </div>

      {/* ── Period KPIs ── */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Kpi
          label="Records"
          value={summary.data?.records.value.toLocaleString() ?? "—"}
          pct={summary.data?.records.delta_pct}
        />
        <Kpi
          label="Avg severity"
          value={summary.data?.avg_severity.value.toFixed(1) ?? "—"}
          pct={summary.data?.avg_severity.delta_pct}
          invert
        />
        <Kpi
          label="Over threshold"
          value={summary.data?.over_threshold.value.toLocaleString() ?? "—"}
          pct={summary.data?.over_threshold.delta_pct}
          invert
        />
        <Kpi
          label="Active scouts"
          value={summary.data?.active_scouts.value.toLocaleString() ?? "—"}
          pct={summary.data?.active_scouts.delta_pct}
        />
      </div>

      {/* ── Farm pressure map — the spatial read of the whole estate ── */}
      <div className="px-6">
        <Card className="overflow-hidden">
          <CardHeader
            title="Farm pressure map"
            subtitle="Hover a block for detail · click to drill in · zoom with + / −"
            actions={
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-lg border border-line">
                  {(
                    [
                      { id: "choropleth", label: "Blocks" },
                      { id: "heat", label: "Heat" },
                      { id: "both", label: "Both" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setMapView(v.id)}
                      className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                        mapView === v.id
                          ? "bg-brand-600 text-white"
                          : "bg-white text-ink-soft hover:bg-surface"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <Link
                  href="/map"
                  className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface"
                >
                  <Maximize2 size={12} /> Full map
                </Link>
              </div>
            }
          />

          {/* Live pressure counts — clicking jumps to that block on the map */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
            {(["high", "medium", "low", "none"] as const).map((p) => (
              <span
                key={p}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${PRESSURE_HEX[p]}14`,
                  color: PRESSURE_HEX[p],
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: PRESSURE_HEX[p] }}
                />
                {PRESSURE_LABEL[p]}
                <span className="font-bold tabular-nums">
                  {pressureCounts[p]}
                </span>
              </span>
            ))}
            {worstBlock && (
              <button
                onClick={() => router.push(`/map?greenhouse=${worstBlock.greenhouse_id}`)}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:bg-surface"
              >
                Worst block: {worstBlock.name} ({worstBlock.avg_severity.toFixed(1)})
                <ArrowRight size={12} />
              </button>
            )}
          </div>

          {/* Isolated so Leaflet's z-index stays inside the card. */}
          <div className="relative isolate h-[440px] w-full">
            {pressure.data ? (
              <>
                <PressureMap
                  data={pressure.data}
                  selectedId={hovered?.greenhouse_id ?? null}
                  onSelect={(id) => router.push(`/map?greenhouse=${id}`)}
                  onHover={setHovered}
                  heatPoints={heatPoints}
                  showHeat={mapView !== "choropleth"}
                  showChoropleth={mapView !== "heat"}
                  showLabels={mapView !== "heat"}
                  // Embedded in a scrolling page — the wheel scrolls the
                  // dashboard, not the map. Zoom with the +/− buttons.
                  scrollWheelZoom={false}
                />

                {/* Hover inspector — read a block without navigating away */}
                <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] w-56">
                  {hovered ? (
                    <div className="rounded-xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-ink">
                          {hovered.name}
                        </p>
                        <Badge color={PRESSURE_HEX[hovered.pressure]}>
                          {PRESSURE_LABEL[hovered.pressure]}
                        </Badge>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p
                            className="text-lg font-bold leading-none tabular-nums"
                            style={{ color: PRESSURE_HEX[hovered.pressure] }}
                          >
                            {hovered.avg_severity.toFixed(1)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-faint">avg sev</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold leading-none tabular-nums text-ink">
                            {hovered.records}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-faint">records</p>
                        </div>
                        <div>
                          <p
                            className={`text-lg font-bold leading-none tabular-nums ${
                              hovered.over_threshold > 0 ? "text-red-600" : "text-ink"
                            }`}
                          >
                            {hovered.over_threshold}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-faint">over ETL</p>
                        </div>
                      </div>
                      {hovered.headline && (
                        <p className="mt-2 text-[11px] font-semibold text-red-600">
                          {hovered.headline}
                        </p>
                      )}
                      <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-ink-faint">
                        Click to open this block
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-line bg-white/80 px-3 py-2 text-center text-[11px] text-ink-faint shadow-sm backdrop-blur">
                      Hover a greenhouse for detail
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── The two operational questions: what needs action, what's been missed ── */}
      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs action"
            subtitle={
              openRecs.length
                ? `${openRecs.length} open recommendation${openRecs.length === 1 ? "" : "s"}`
                : "Threshold breaches raise these automatically"
            }
            actions={
              <Link
                href="/recommendations"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                View all →
              </Link>
            }
          />
          <div className="p-4">
            {recs.isLoading ? (
              <Spinner />
            ) : openRecs.length === 0 ? (
              <AllClear message="No open recommendations." />
            ) : (
              <div className="space-y-2">
                {openRecs.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    href="/recommendations"
                    className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:border-brand-300 hover:bg-surface"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: `${severityHex(r.trigger_severity)}22`,
                        color: r.trigger_severity >= 3 ? "#b91c1c" : "#047857",
                      }}
                    >
                      {r.trigger_severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {targetOf(r)}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {r.greenhouse_id ? (ghName.get(r.greenhouse_id) ?? "—") : "—"}
                        {r.bed_code && ` · ${bedLabel(r.bed_code)}`} ·{" "}
                        {relativeTime(r.created_at)}
                      </p>
                    </div>
                    <Badge color={r.status === "open" ? "#dc2626" : "#f59e0b"}>
                      {r.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Scouting coverage"
            subtitle={
              overdue.length
                ? `${overdue.length} block${overdue.length === 1 ? "" : "s"} not scouted in a week`
                : "Every block scouted within the last 7 days"
            }
            actions={
              <Link
                href="/scouting"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                Scouting →
              </Link>
            }
          />
          <div className="p-4">
            {coverageScope.isLoading || greenhouses.isLoading ? (
              <Spinner />
            ) : coverage.length === 0 ? (
              <EmptyState>No greenhouses registered.</EmptyState>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {coverage.map((c) => {
                    const tone =
                      c.days == null
                        ? "#94a3b8"
                        : c.days >= 14
                          ? "#dc2626"
                          : c.days >= 7
                            ? "#f59e0b"
                            : c.days >= 3
                              ? "#84cc16"
                              : "#10b981";
                    return (
                      <span
                        key={c.id}
                        title={
                          c.days == null
                            ? `${c.label} · no records in 90 days`
                            : `${c.label} · last scouted ${c.days}d ago`
                        }
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold"
                        style={{ backgroundColor: `${tone}1f`, color: tone }}
                      >
                        {c.label}
                        <span className="tabular-nums opacity-80">
                          {c.days == null ? "90+" : `${c.days}d`}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-ink-faint">
                  <span className="font-medium">Days since last scouted:</span>
                  {[
                    { c: "#10b981", l: "0–2" },
                    { c: "#84cc16", l: "3–6" },
                    { c: "#f59e0b", l: "7–13" },
                    { c: "#dc2626", l: "14+" },
                    { c: "#94a3b8", l: "none" },
                  ].map((k) => (
                    <span key={k.l} className="flex items-center gap-1">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: k.c }}
                      />
                      {k.l}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ── Live feed + pressure snapshot ── */}
      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Latest observations"
            subtitle="Straight from the field as scouts sync."
            actions={
              <Link
                href="/scouting"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                All records →
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {feed.isLoading && (
              <div className="p-4">
                <Spinner />
              </div>
            )}
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: severityHex(r.severity) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {targetOf(r)}
                    <span className="ml-2 text-xs font-normal text-ink-faint">
                      {SCOUTING_LABEL[r.scouting_for]}
                    </span>
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {r.greenhouse_id ? (ghName.get(r.greenhouse_id) ?? "—") : "—"}
                    {r.bed_code && ` · ${r.bed_code}`}
                    {r.scout_id && ` · ${scoutName.get(r.scout_id) ?? ""}`}
                  </p>
                </div>
                <span
                  className="shrink-0 text-sm font-bold tabular-nums"
                  style={{ color: severityHex(r.severity) }}
                >
                  {r.severity}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-ink-faint">
                  {relativeTime(r.recorded_at)}
                </span>
              </div>
            ))}
            {!feed.isLoading && recent.length === 0 && (
              <div className="p-4">
                <EmptyState>No observations in this range.</EmptyState>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Pressure now"
            subtitle="Highest blocks in range"
            actions={
              <Link
                href="/map"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                Map →
              </Link>
            }
          />
          <div className="space-y-2 p-4">
            {pressure.isLoading ? (
              <Spinner />
            ) : hotBlocks.length === 0 ? (
              <EmptyState>No pressure data.</EmptyState>
            ) : (
              hotBlocks.map((b) => (
                <div key={b.greenhouse_id}>
                  <div className="flex items-center gap-2.5">
                    <span
                      title={b.name}
                      className="w-28 shrink-0 truncate text-sm font-medium text-ink"
                    >
                      {b.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-surface">
                      <div
                        className="flex h-full items-center justify-end rounded px-1.5"
                        style={{
                          width: `${Math.max(10, (b.avg_severity / 5) * 100)}%`,
                          backgroundColor: PRESSURE_HEX[b.pressure],
                        }}
                      >
                        <span className="text-[10px] font-bold text-white">
                          {b.avg_severity.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <span className="w-10 shrink-0 text-right text-[11px] text-ink-faint">
                      {PRESSURE_LABEL[b.pressure]}
                    </span>
                  </div>
                  {/* Names the agent driving the band, rather than a bare number. */}
                  {b.headline && (
                    <p className="ml-[7.6rem] mt-0.5 truncate text-[11px] text-ink-faint">
                      {b.headline}
                    </p>
                  )}
                </div>
              ))
            )}
            <Link
              href="/analytics"
              className="mt-3 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm transition-colors hover:border-brand-300 hover:bg-surface"
            >
              <span className="flex items-center gap-2 text-ink-soft">
                <CalendarClock size={15} className="text-ink-faint" />
                Trends &amp; breakdowns
              </span>
              <ArrowRight size={15} className="text-ink-faint" />
            </Link>
          </div>
        </Card>
      </div>

      {/* ── 14-day sparkline: enough context, no full chart ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="Records per day across the selected range."
          />
          <div className="p-4">
            {trend.isLoading ? (
              <Spinner />
            ) : (trend.data ?? []).length === 0 ? (
              <EmptyState>No records in range.</EmptyState>
            ) : (
              <Sparkbars
                data={(trend.data ?? []).map((d) => ({
                  date: d.date,
                  value: d.records,
                  severity: d.avg_severity,
                }))}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Compact day-by-day bars — context without a full analytics chart. */
function Sparkbars({
  data,
}: {
  data: { date: string; value: number; severity: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {data.map((d) => (
          <div
            key={d.date}
            title={`${new Date(d.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })} · ${d.value} records · avg severity ${d.severity.toFixed(1)}`}
            className="flex-1 rounded-t transition-opacity hover:opacity-80"
            style={{
              height: `${Math.max((d.value / max) * 100, d.value ? 4 : 1)}%`,
              backgroundColor: severityHex(Math.round(d.severity)),
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-ink-faint">
        <span>
          {new Date(data[0]!.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })}
        </span>
        <span>Bar height = records · colour = average severity</span>
        <span>
          {new Date(data[data.length - 1]!.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          })}
        </span>
      </div>
    </div>
  );
}

function TodayChip({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
      <Icon size={15} className="text-ink-faint" />
      <span
        className="text-lg font-bold tabular-nums leading-none"
        style={{ color: tone ?? "#0f172a" }}
      >
        {value}
      </span>
      <span className="text-xs text-ink-faint">{label}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  pct,
  invert = false,
}: {
  label: string;
  value: string;
  pct?: number | null;
  invert?: boolean;
}) {
  const up = (pct ?? 0) > 0;
  const good = pct == null || pct === 0 ? null : invert ? !up : up;
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-ink">{value}</span>
        {pct != null && pct !== 0 && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              good ? "text-brand-600" : "text-red-600"
            }`}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(pct).toFixed(0)}%
          </span>
        )}
      </div>
    </Card>
  );
}

function AllClear({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 py-8">
      <ShieldCheck size={28} className="text-brand-600" />
      <p className="text-sm font-semibold text-brand-700">All clear</p>
      <p className="text-xs text-ink-faint">{message}</p>
    </div>
  );
}
