"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import {
  CostTrendChart,
  Donut,
  HBarChart,
  HeatMatrix,
  ParetoChart,
  SeverityHistogram,
  SprayTimingChart,
  StackedBarChart,
  TrendChart,
} from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { PaginationBar, usePagination } from "@/components/Pagination";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import { money, relativeTime } from "@/lib/format";
import {
  useBreakdown,
  useGreenhouses,
  usePestMatrix,
  useScouting,
  useScoutSummary,
  useSeverityDist,
  useSpray,
  useSummary,
  useTrend,
} from "@/lib/hooks";
import type { Filters, SprayRecord } from "@/lib/types";

// ── Report registry ─────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Overview", blurb: "The big picture of all scouting and spray activity." },
  { id: "table", label: "Table", blurb: "All records in a structured table for review." },
  { id: "greenhouses", label: "Greenhouses", blurb: "Compare performance and issues by greenhouse." },
  { id: "trends", label: "Trends", blurb: "Whether problems are increasing or decreasing." },
  { id: "movement", label: "Movement", blurb: "Scout movement and activity across locations." },
  { id: "spray", label: "Spray Overview", blurb: "Spray programs and their timing." },
  { id: "coverage", label: "Coverage", blurb: "How much area or crop coverage is being addressed." },
  { id: "cost", label: "Cost", blurb: "Spray spending and financial impact." },
  { id: "variety-pests", label: "Variety Pests", blurb: "Pest and disease pressure by variety." },
  { id: "gh-cost", label: "Greenhouse Cost", blurb: "Where the highest spray costs are going." },
  { id: "chemicals", label: "Chemicals", blurb: "Which chemicals are being used most." },
  { id: "variety-cost", label: "Variety Cost", blurb: "Which varieties are driving spray spend." },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SCOUTING_TYPE_COLORS: Record<string, string> = {
  pest: "#10b981",
  disease: "#f59e0b",
  lure: "#6366f1",
  sticky_trap: "#0ea5e9",
};

const STACK_COLORS = ["#0ea5e9", "#6366f1", "#f59e0b", "#10b981", "#dc2626", "#7c3aed", "#94a3b8"];

// ── Local helpers (pure, no backend changes needed) ─────────────────────

/** Spray endpoints don't accept filters server-side yet, so we apply the
 * same date-range / greenhouse filter the rest of the page uses, here. */
function filterSprayRecords(rows: SprayRecord[], f: Filters): SprayRecord[] {
  const startTs = f.start ? new Date(f.start).getTime() : null;
  const endTs = f.end ? new Date(f.end).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
  return rows.filter((r) => {
    if (f.greenhouse_id && r.greenhouse_id !== f.greenhouse_id) return false;
    const ts = new Date(r.recorded_at).getTime();
    if (startTs != null && ts < startTs) return false;
    if (endTs != null && ts > endTs) return false;
    return true;
  });
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const parts = key.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function countBy(rows: SprayRecord[], pick: (r: SprayRecord) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row)?.trim() || "Unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function costBy(rows: SprayRecord[], pick: (r: SprayRecord) => string | null | undefined) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row)?.trim() || "Unspecified";
    totals.set(key, (totals.get(key) ?? 0) + (row.cost_of_chemical ?? 0));
  }
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));
  const [recordSearch, setRecordSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const summary = useSummary(filters);
  const trend = useTrend(filters);
  const pestBreak = useBreakdown("pest", filters);
  const diseaseBreak = useBreakdown("disease", filters);
  const varietyBreak = useBreakdown("variety", filters);
  const ghBreak = useBreakdown("greenhouse", filters);
  const sevDist = useSeverityDist(filters);
  const matrix = usePestMatrix(filters);
  const scouts = useScoutSummary(filters);
  const greenhouses = useGreenhouses();
  const scouting = useScouting({
    start: filters.start,
    end: filters.end,
    greenhouse_id: filters.greenhouse_id,
    scouting_for: filters.scouting_for,
    limit: 120,
  });
  const spray = useSpray();

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  // Every spray-derived report below reads from this, so they all honor
  // the same date range / greenhouse filter as the scouting reports.
  const filteredSpray = useMemo(
    () => filterSprayRecords(spray.data ?? [], filters),
    [spray.data, filters],
  );

  const { rows, cols, lookup } = useMemo(() => {
    const cells = matrix.data ?? [];
    const r = new Set<string>();
    const c = new Set<string>();
    const map = new Map<string, number>();
    for (const x of cells) {
      r.add(x.pest);
      c.add(x.greenhouse);
      map.set(`${x.pest}|${x.greenhouse}`, x.avg_severity);
    }
    const colSort = (a: string, b: string) =>
      (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0);
    return { rows: [...r].sort(), cols: [...c].sort(colSort), lookup: map };
  }, [matrix.data]);

  const filteredScoutingRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return scouting.data ?? [];
    return (scouting.data ?? []).filter((row) => {
      const haystack = [row.bed_code, row.variety_code, row.notes, row.scouting_for]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [recordSearch, scouting.data]);

  const coverageBreakdown = useMemo(() => countBy(filteredSpray, (r) => r.coverage), [filteredSpray]);
  const chemicalBreakdown = useMemo(() => countBy(filteredSpray, (r) => r.product), [filteredSpray]);
  const chemicalCostBreakdown = useMemo(() => costBy(filteredSpray, (r) => r.product), [filteredSpray]);
  const varietyCostBreakdown = useMemo(() => costBy(filteredSpray, (r) => r.variety_code), [filteredSpray]);

  const greenhouseCostBreakdown = useMemo(
    () =>
      costBy(filteredSpray, (r) =>
        r.greenhouse_id != null ? ghName.get(r.greenhouse_id) ?? `GH #${r.greenhouse_id}` : null,
      ),
    [filteredSpray, ghName],
  );

  const totalSprayCost = useMemo(
    () => filteredSpray.reduce((s, r) => s + (r.cost_of_chemical ?? 0), 0),
    [filteredSpray],
  );
  const distinctProducts = useMemo(
    () => new Set(filteredSpray.map((r) => r.product?.trim()).filter(Boolean)).size,
    [filteredSpray],
  );

  const costTrend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of filteredSpray) {
      const key = monthKey(row.recorded_at);
      totals.set(key, (totals.get(key) ?? 0) + (row.cost_of_chemical ?? 0));
    }
    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, cost]) => ({ period: monthLabel(key), cost }));
  }, [filteredSpray]);

  const sprayTiming = useMemo(() => {
    const apps = new Map<string, number>();
    const cost = new Map<string, number>();
    for (const row of filteredSpray) {
      const key = monthKey(row.recorded_at);
      apps.set(key, (apps.get(key) ?? 0) + 1);
      cost.set(key, (cost.get(key) ?? 0) + (row.cost_of_chemical ?? 0));
    }
    const keys = Array.from(new Set([...apps.keys(), ...cost.keys()])).sort((a, b) => a.localeCompare(b));
    return keys.map((key) => ({
      period: monthLabel(key),
      applications: apps.get(key) ?? 0,
      cost: cost.get(key) ?? 0,
    }));
  }, [filteredSpray]);

  // Applications by coverage type, per month — feeds the stacked bar in Spray Overview.
  const coverageTimeline = useMemo(() => {
    const keySet = new Set<string>();
    const perMonth = new Map<string, Record<string, number>>();
    for (const row of filteredSpray) {
      const mk = monthKey(row.recorded_at);
      const coverage = row.coverage?.trim() || "Unspecified";
      keySet.add(coverage);
      const bucket = perMonth.get(mk) ?? {};
      bucket[coverage] = (bucket[coverage] ?? 0) + 1;
      perMonth.set(mk, bucket);
    }
    const keys = Array.from(keySet).sort();
    const data = Array.from(perMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, bucket]) => {
        const row: Record<string, string | number> = { period: monthLabel(mk) };
        for (const k of keys) row[k] = bucket[k] ?? 0;
        return row;
      });
    return { keys, data };
  }, [filteredSpray]);

  // Scouting composition by type — feeds the donut in Overview.
  const scoutingByType = useMemo(() => {
    const entries = Object.entries(summary.data?.by_type ?? {});
    return entries.map(([name, value]) => ({
      name,
      value,
      color: SCOUTING_TYPE_COLORS[name] ?? "#94a3b8",
    }));
  }, [summary.data]);

  // One row per spray program: window, products, greenhouses, cost, PHI status.
  const programs = useMemo(() => {
    type ProgramRow = {
      program: string;
      applications: number;
      products: Set<string>;
      greenhouses: Set<string>;
      totalCost: number;
      firstDate: string | null;
      lastDate: string | null;
      activePhiUntil: string | null;
    };
    const map = new Map<string, ProgramRow>();
    const now = Date.now();
    for (const row of filteredSpray) {
      const key = row.program_id?.trim() || `Unassigned (#${row.id})`;
      const entry: ProgramRow = map.get(key) ?? {
        program: key,
        applications: 0,
        products: new Set<string>(),
        greenhouses: new Set<string>(),
        totalCost: 0,
        firstDate: null,
        lastDate: null,
        activePhiUntil: null,
      };
      entry.applications += 1;
      if (row.product) entry.products.add(row.product);
      if (row.greenhouse_id != null) {
        entry.greenhouses.add(ghName.get(row.greenhouse_id) ?? `GH #${row.greenhouse_id}`);
      }
      entry.totalCost += row.cost_of_chemical ?? 0;
      const d = row.start_date ?? row.recorded_at;
      if (!entry.firstDate || d < entry.firstDate) entry.firstDate = d;
      if (!entry.lastDate || d > entry.lastDate) entry.lastDate = d;
      if (row.safe_harvest_date) {
        const t = new Date(row.safe_harvest_date).getTime();
        if (t >= now && (!entry.activePhiUntil || t > new Date(entry.activePhiUntil).getTime())) {
          entry.activePhiUntil = row.safe_harvest_date;
        }
      }
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  }, [filteredSpray, ghName]);

  const scoutingTable = usePagination(filteredScoutingRecords, 25, recordSearch);
  const movementTable = usePagination(scouts.data ?? [], 10);
  const programsTable = usePagination(programs, 10);

  const summaryCards = [
    {
      label: "Reports",
      value: summary.data ? summary.data.records.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.records.delta_pct),
    },
    {
      label: "Avg severity",
      value: summary.data ? summary.data.avg_severity.value.toFixed(1) : "—",
      hint: deltaHint(summary.data?.avg_severity.delta_pct),
    },
    {
      label: "Over threshold",
      value: summary.data ? summary.data.over_threshold.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.over_threshold.delta_pct),
    },
    {
      label: "Open recommendations",
      value: summary.data ? summary.data.open_recommendations.toLocaleString() : "—",
      hint: "Needs follow-up",
    },
    {
      label: "Active scouts",
      value: summary.data ? summary.data.active_scouts.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.active_scouts.delta_pct),
    },
    {
      label: "Spray spend",
      value: summary.data ? money(summary.data.spray_cost.value) : "—",
      hint: deltaHint(summary.data?.spray_cost.delta_pct),
    },
  ];

  const sprayGlanceCards = [
    { label: "Spray applications", value: filteredSpray.length.toLocaleString(), hint: "In selected range" },
    { label: "Spray spend", value: money(totalSprayCost), hint: "In selected range" },
    { label: "Active programs", value: programs.length.toLocaleString(), hint: "Distinct program IDs" },
    { label: "Products used", value: distinctProducts.toLocaleString(), hint: "Distinct chemicals applied" },
  ];

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Reports Overview"
        subtitle="A breakdown of all report types and what each one helps us understand."
      />
      <div className="px-6">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      <div className="sticky top-0 z-10 -mx-0 border-b border-line bg-white/95 px-6 backdrop-blur">
        <nav className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={clsx(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                activeTab === t.id ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-surface",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-6 text-sm text-ink-faint">{activeTabMeta.blurb}</div>

      {activeTab === "overview" && (
        <>
          <div className="px-6">
            <Card>
              <CardHeader title="Quick summary" subtitle="Scouting activity in the current window." />
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((item) => (
                  <StatTile key={item.label} {...item} loading={summary.isLoading} />
                ))}
              </div>
            </Card>
          </div>

          <div className="px-6">
            <Card>
              <CardHeader title="Spray at a glance" subtitle="Spray activity in the current window." />
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {sprayGlanceCards.map((item) => (
                  <StatTile key={item.label} {...item} loading={spray.isLoading} />
                ))}
              </div>
            </Card>
          </div>

          <div className="px-6">
            <Card>
              <CardHeader title="Scouting composition" subtitle="Records by scouting type in the current window." />
              <div className="p-4">
                {summary.isLoading ? (
                  <Spinner />
                ) : scoutingByType.length === 0 ? (
                  <EmptyState>No scouting records in range.</EmptyState>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div className="w-full max-w-[220px]">
                      <Donut data={scoutingByType} height={200} />
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-1">
                      {scoutingByType.map((t) => (
                        <div key={t.name} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/70 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                            <span className="text-sm capitalize text-ink-soft">{t.name}</span>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-ink">{t.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="px-6">
            <Card>
              <CardHeader
                title="Jump to a report"
                subtitle="Every report below, one tap away."
              />
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {TABS.filter((t) => t.id !== "overview").map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className="rounded-lg border border-line bg-surface/70 p-4 text-left transition-colors hover:border-brand-300 hover:bg-white"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {t.label}
                    </div>
                    <div className="mt-1 text-sm text-ink-soft">{t.blurb}</div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "table" && (
        <div className="px-6">
          <Card>
            <CardHeader
              title="Table report"
              subtitle="A searchable record view for raw scouting entries and context."
            />
            <div className="space-y-3 p-4">
              <TextInput
                value={recordSearch}
                onChange={(event) => setRecordSearch(event.target.value)}
                placeholder="Search beds, varieties, notes or scouting type"
              />
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Bed</th>
                      <th className="px-3 py-2.5 font-semibold">Variety</th>
                      <th className="px-3 py-2.5 font-semibold">Severity</th>
                      <th className="px-3 py-2.5 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {scouting.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6">
                          <Spinner label="Loading records…" />
                        </td>
                      </tr>
                    ) : filteredScoutingRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-ink-faint">
                          No matching records.
                        </td>
                      </tr>
                    ) : (
                      scoutingTable.paged.map((row) => (
                        <tr key={row.id} className="hover:bg-surface">
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink-soft">
                            {new Date(row.recorded_at).toLocaleString("en-GB", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="px-3 py-2.5 capitalize text-ink-soft">{row.scouting_for}</td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.bed_code ?? "—"}</td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.variety_code ?? "—"}</td>
                          <td className="px-3 py-2.5 tabular-nums text-ink">{row.severity}</td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.notes ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <PaginationBar
              page={scoutingTable.page}
              totalPages={scoutingTable.totalPages}
              pageSize={scoutingTable.pageSize}
              total={scoutingTable.total}
              onPage={scoutingTable.setPage}
              onPageSize={scoutingTable.setPageSize}
            />
          </Card>
        </div>
      )}

      {activeTab === "greenhouses" && (
        <>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Greenhouse activity"
                subtitle="Where scouting activity is concentrated."
              />
              <div className="p-4">
                {ghBreak.isLoading ? (
                  <Spinner />
                ) : (
                  <HBarChart
                    data={(ghBreak.data ?? [])
                      .slice(0, 12)
                      .map((r) => ({ label: r.key, value: r.records }))}
                    height={240}
                    color="#0ea5e9"
                  />
                )}
              </div>
            </Card>
          </div>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Pest × greenhouse matrix"
                subtitle="Average severity (green → red)"
              />
              <div className="p-4">
                {matrix.isLoading && <Spinner />}
                {!matrix.isLoading && rows.length === 0 && (
                  <EmptyState>No pest records in range.</EmptyState>
                )}
                {rows.length > 0 && (
                  <HeatMatrix rows={rows} cols={cols} value={(r, c) => lookup.get(`${r}|${c}`) ?? null} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "trends" && (
        <>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Trend report"
                subtitle="How record volume, severity, and threshold breaches evolve over time."
              />
              <div className="p-4">
                {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} height={300} />}
              </div>
            </Card>
          </div>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Severity distribution"
                subtitle="The spread of issue intensity across the current range."
              />
              <div className="p-4">
                {sevDist.isLoading ? (
                  <Spinner />
                ) : (
                  <SeverityHistogram data={sevDist.data ?? []} height={240} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "movement" && (
        <div className="px-6">
          <Card>
            <CardHeader title="Movement report" subtitle="Records & coverage in range" />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Scout</th>
                    <th className="px-3 py-2.5 font-semibold">Records</th>
                    <th className="px-3 py-2.5 font-semibold">Greenhouses</th>
                    <th className="px-3 py-2.5 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {movementTable.paged.map((s) => (
                    <tr key={s.scout_id} className="hover:bg-surface">
                      <td className="px-5 py-2.5 font-medium">{s.name}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.records}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.greenhouses_visited}</td>
                      <td className="px-3 py-2.5 text-ink-faint">{relativeTime(s.last_seen)}</td>
                    </tr>
                  ))}
                  {scouts.data?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-ink-faint">
                        No scout activity.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={movementTable.page}
              totalPages={movementTable.totalPages}
              pageSize={movementTable.pageSize}
              total={movementTable.total}
              onPage={movementTable.setPage}
              onPageSize={movementTable.setPageSize}
              pageSizeOptions={[10, 25, 50]}
            />
          </Card>
        </div>
      )}

      {activeTab === "spray" && (
        <>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Spray timing"
                subtitle="Applications and cost per month across all programs."
              />
              <div className="p-4">
                {spray.isLoading ? (
                  <Spinner />
                ) : sprayTiming.length === 0 ? (
                  <EmptyState>No spray records in range.</EmptyState>
                ) : (
                  <SprayTimingChart data={sprayTiming} height={260} />
                )}
              </div>
            </Card>
          </div>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Coverage over time"
                subtitle="Applications by coverage type, per month."
              />
              <div className="p-4">
                {spray.isLoading ? (
                  <Spinner />
                ) : coverageTimeline.data.length === 0 ? (
                  <EmptyState>No spray records in range.</EmptyState>
                ) : (
                  <StackedBarChart
                    data={coverageTimeline.data}
                    keys={coverageTimeline.keys}
                    colors={STACK_COLORS}
                    height={260}
                  />
                )}
              </div>
            </Card>
          </div>
          <div className="px-6">
            <Card>
              <CardHeader
                title="Programs"
                subtitle="One row per spray program: window, products, greenhouses, and PHI status."
              />
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-5 py-2.5 font-semibold">Program</th>
                      <th className="px-3 py-2.5 font-semibold">Greenhouses</th>
                      <th className="px-3 py-2.5 font-semibold">Applications</th>
                      <th className="px-3 py-2.5 font-semibold">Products</th>
                      <th className="px-3 py-2.5 font-semibold">Window</th>
                      <th className="px-3 py-2.5 font-semibold">Cost</th>
                      <th className="px-3 py-2.5 font-semibold">PHI status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {spray.isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6">
                          <Spinner label="Loading programs…" />
                        </td>
                      </tr>
                    ) : programs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-ink-faint">
                          No spray programs in range.
                        </td>
                      </tr>
                    ) : (
                      programsTable.paged.map((p) => (
                        <tr key={p.program} className="hover:bg-surface">
                          <td className="px-5 py-2.5 font-medium text-ink">{p.program}</td>
                          <td className="px-3 py-2.5 text-ink-soft">
                            {[...p.greenhouses].join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{p.applications}</td>
                          <td className="px-3 py-2.5 text-ink-soft">
                            {[...p.products].join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-ink-faint">
                            {p.firstDate ? new Date(p.firstDate).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—"}
                            {" – "}
                            {p.lastDate ? new Date(p.lastDate).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-ink">{money(p.totalCost)}</td>
                          <td className="px-3 py-2.5">
                            {p.activePhiUntil ? (
                              <Badge color="#dc2626">
                                Active until{" "}
                                {new Date(p.activePhiUntil).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                              </Badge>
                            ) : (
                              <Badge color="#059669">Cleared</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={programsTable.page}
                totalPages={programsTable.totalPages}
                pageSize={programsTable.pageSize}
                total={programsTable.total}
                onPage={programsTable.setPage}
                onPageSize={programsTable.setPageSize}
                pageSizeOptions={[10, 25, 50]}
              />
            </Card>
          </div>
        </>
      )}

      {activeTab === "coverage" && (
        <div className="px-6">
          <Card>
            <CardHeader
              title="Coverage report"
              subtitle="How spray activities are distributed by coverage type."
            />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : coverageBreakdown.length === 0 ? (
                <EmptyState>No spray coverage data in range.</EmptyState>
              ) : (
                <HBarChart
                  data={coverageBreakdown.slice(0, 8).map((r) => ({ label: r.label, value: r.value }))}
                  color="#0ea5e9"
                  height={240}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "cost" && (
        <>
          <div className="px-6">
            <Card>
              <CardHeader title="Spray cost overview" subtitle="Financial impact in the selected range." />
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                <StatTile label="Total spend" value={money(totalSprayCost)} hint="In selected range" loading={spray.isLoading} />
                <StatTile
                  label="Avg cost / application"
                  value={filteredSpray.length ? money(totalSprayCost / filteredSpray.length) : "—"}
                  hint="In selected range"
                  loading={spray.isLoading}
                />
                <StatTile label="Applications" value={filteredSpray.length.toLocaleString()} hint="In selected range" loading={spray.isLoading} />
                <StatTile label="Programs" value={programs.length.toLocaleString()} hint="Distinct program IDs" loading={spray.isLoading} />
              </div>
            </Card>
          </div>
          <div className="px-6">
            <Card>
              <CardHeader title="Cost trend" subtitle="Total spray spend by month." />
              <div className="p-4">
                {spray.isLoading ? (
                  <Spinner />
                ) : costTrend.length === 0 ? (
                  <EmptyState>No spray cost data in range.</EmptyState>
                ) : (
                  <CostTrendChart data={costTrend} height={260} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "variety-pests" && (
        <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
          <Breakdown title="Pressure by variety" q={varietyBreak} color="#6366f1" />
          <Breakdown title="Top pests" q={pestBreak} color="#10b981" />
          <Breakdown title="Top diseases" q={diseaseBreak} color="#f59e0b" />
        </div>
      )}

      {activeTab === "gh-cost" && (
        <div className="px-6">
          <Card>
            <CardHeader
              title="Greenhouse cost report"
              subtitle={`Total ${money(totalSprayCost)} in the selected range — cumulative % shows where spend concentrates.`}
            />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : greenhouseCostBreakdown.length === 0 ? (
                <EmptyState>No spray records in range.</EmptyState>
              ) : (
                <ParetoChart
                  data={greenhouseCostBreakdown.slice(0, 12).map((r) => ({ label: r.label, value: r.value }))}
                  color="#059669"
                  height={280}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "chemicals" && (
        <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Chemical usage" subtitle="Most frequently applied products, by count." />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : chemicalBreakdown.length === 0 ? (
                <EmptyState>No spray product data in range.</EmptyState>
              ) : (
                <HBarChart
                  data={chemicalBreakdown.slice(0, 8).map((r) => ({ label: r.label, value: r.value }))}
                  color="#7c3aed"
                  height={220}
                />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Chemical spend" subtitle="Same products, ranked by total cost — with cumulative % concentration." />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : chemicalCostBreakdown.length === 0 ? (
                <EmptyState>No spray cost data in range.</EmptyState>
              ) : (
                <ParetoChart
                  data={chemicalCostBreakdown.slice(0, 10).map((r) => ({ label: r.label, value: r.value }))}
                  color="#dc2626"
                  height={260}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "variety-cost" && (
        <div className="px-6">
          <Card>
            <CardHeader title="Variety cost report" subtitle="Spray spend concentrated by variety, with cumulative % of total." />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : varietyCostBreakdown.length === 0 ? (
                <EmptyState>No variety cost data in range.</EmptyState>
              ) : (
                <ParetoChart
                  data={varietyCostBreakdown.slice(0, 10).map((r) => ({ label: r.label, value: r.value }))}
                  color="#dc2626"
                  height={280}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function deltaHint(pct: number | null | undefined) {
  if (pct == null) return "No prior period";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}% vs prev`;
}

function StatTile({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink">
        {loading ? <Spinner label="" /> : value}
      </div>
      <div className="mt-1 text-sm text-ink-faint">{hint}</div>
    </div>
  );
}

function Breakdown({
  title,
  q,
  color,
}: {
  title: string;
  q: {
    data?: { key: string; records: number; over_threshold: number }[];
    isLoading: boolean;
  };
  color: string;
}) {
  const total = (q.data ?? []).reduce((s, r) => s + r.records, 0);
  return (
    <Card>
      <CardHeader title={title} actions={<Badge>{total} recs</Badge>} />
      <div className="p-4">
        {q.isLoading ? (
          <Spinner />
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState>No data.</EmptyState>
        ) : (
          <HBarChart
            data={(q.data ?? []).slice(0, 8).map((r) => ({ label: r.key, value: r.records }))}
            color={color}
            height={200}
          />
        )}
      </div>
    </Card>
  );
}