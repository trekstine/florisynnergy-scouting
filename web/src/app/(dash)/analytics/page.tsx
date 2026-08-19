"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Building2,
  Download,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CostTrendChart,
  Donut,
  HBarChart,
  HeatMatrix,
  MultiLineChart,
  RankedBarChart,
  SeverityHistogram,
  SprayTimingChart,
  StackedBarChart,
  TrendChart,
} from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { PaginationBar, usePagination } from "@/components/Pagination";
import { ScoutMovementPanel } from "@/components/ScoutMovementPanel";
import { SprayProgramsTable } from "@/components/SprayProgramsTable";
import type { Program } from "@/components/SprayProgramsTable";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import {
  SCOUTING_LABEL,
  VERIFICATION_LABEL,
  money,
  relativeTime,
  severityHex,
} from "@/lib/format";
import {
  useAgentTrend,
  useBreakdown,
  useFertigationCost,
  useFertigationUsage,
  useFertigationWater,
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePestMatrix,
  usePests,
  useScouting,
  useScoutSummary,
  useSeverityDist,
  useSpray,
  useSummary,
  useTrend,
  useVarieties,
} from "@/lib/hooks";
import { programKey } from "@/lib/sprayExport";
import type { Filters, ScoutingRecord, SprayRecord } from "@/lib/types";

// ── Report registry ─────────────────────────────────────────────────────
const TABS = [
  { id: "overview", group: "", label: "Overview", blurb: "The big picture of all scouting and spray activity." },
  { id: "table", group: "Scouting", label: "Detail table", blurb: "Every field observation in range, with resolved names and scores." },
  { id: "greenhouses", group: "Scouting", label: "Greenhouses", blurb: "Compare performance and issues by greenhouse." },
  { id: "trends", group: "Scouting", label: "Trends", blurb: "Whether problems are increasing or decreasing." },
  { id: "variety-pests", group: "Scouting", label: "Varieties", blurb: "Pest and disease pressure by variety." },
  { id: "movement", group: "Scouting", label: "Movement", blurb: "Scout movement and activity across locations." },
  { id: "spray", group: "Spray", label: "Programs", blurb: "Spray programs and their timing." },
  { id: "coverage", group: "Spray", label: "Coverage", blurb: "How much area or crop coverage is being addressed." },
  { id: "cost", group: "Spray", label: "Cost", blurb: "Spray spending and financial impact." },
  { id: "gh-cost", group: "Spray", label: "Cost by greenhouse", blurb: "Where the highest spray costs are going." },
  { id: "chemicals", group: "Spray", label: "Cost by chemical", blurb: "Where the chemical budget goes, and how much product it buys." },
  { id: "variety-cost", group: "Spray", label: "Cost by variety", blurb: "Which varieties are driving spray spend." },
  { id: "fert-cost", group: "Fertigation", label: "Cost", blurb: "What feeding costs, by phase, block or month." },
  { id: "fert-water", group: "Fertigation", label: "Water applied", blurb: "Water on each sheet against the rate it planned for — where the farm is over- or under-feeding." },
  { id: "fert-usage", group: "Fertigation", label: "Fertiliser usage", blurb: "How much of each product left the store, for reconciliation and ordering." },
] as const;

const TAB_GROUPS = ["Scouting", "Spray", "Fertigation"] as const;

type TabId = (typeof TABS)[number]["id"];

/** A scouting record joined with its resolved reference names. */
interface ScoutingDetailRow {
  r: ScoutingRecord;
  greenhouse: string;
  target: string;
  targetKind: string;
  variety: string;
  scout: string;
  count: number;
}

const SCOUTING_TYPE_COLORS: Record<string, string> = {
  pest: "#10b981",
  disease: "#f59e0b",
  lure: "#6366f1",
  sticky_trap: "#0ea5e9",
};

/** Distinct hues so six overlapping lines stay tellable apart. */
const PEST_LINE_COLORS = ["#10b981", "#0ea5e9", "#6366f1", "#f59e0b", "#ec4899", "#14b8a6"];
const DISEASE_LINE_COLORS = ["#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#65a30d", "#db2777"];

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
  const [fertGroup, setFertGroup] = useState("phase");

  const summary = useSummary(filters);
  const trend = useTrend(filters);
  const agentTrend = useAgentTrend(filters);
  const pestBreak = useBreakdown("pest", filters);
  const diseaseBreak = useBreakdown("disease", filters);
  const varietyBreak = useBreakdown("variety", filters);
  const ghBreak = useBreakdown("greenhouse", filters);
  const sevDist = useSeverityDist(filters);
  const matrix = usePestMatrix(filters);
  const scouts = useScoutSummary(filters);
  const greenhouses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const varieties = useVarieties();
  const employees = useEmployees();
  const scouting = useScouting({
    start: filters.start,
    end: filters.end,
    greenhouse_id: filters.greenhouse_id,
    scouting_for: filters.scouting_for,
    pest_id: filters.pest_id,
    disease_id: filters.disease_id,
    variety_code: filters.variety_code,
    limit: 1000,
  });
  const spray = useSpray();

  // Fertigation aggregates, computed server-side from the sheets as raised —
  // each line carries the price that applied on the day, so a repriced
  // fertiliser cannot restate what last month's feeding cost.
  const fertCost = useFertigationCost(fertGroup, filters);
  const fertWater = useFertigationWater(filters);
  const fertUsage = useFertigationUsage(filters);

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  /** Short codes (GH03) for chart axes and dense tables. */
  const ghCode = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);

  /** The greenhouse breakdown keys by name, so the leaderboard needs
   *  name → code to label its rows without truncating every one of them
   *  to the same "Greenhou…". */
  const ghCodeByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of greenhouses.data ?? []) if (g.code) m.set(g.name, g.code);
    return m;
  }, [greenhouses.data]);

  // ── Reference lookups so the detail table shows names, not raw ids ──
  const pestName = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pests.data ?? []) m.set(p.id, p.name);
    return m;
  }, [pests.data]);
  const diseaseName = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of diseases.data ?? []) m.set(d.id, d.name);
    return m;
  }, [diseases.data]);
  const varietyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varieties.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varieties.data]);
  const scoutName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employees.data]);

  // Every spray-derived report below reads from this, so they all honor
  // the same date range / greenhouse filter as the scouting reports.
  const filteredSpray = useMemo(
    () => filterSprayRecords(spray.data ?? [], filters),
    [spray.data, filters],
  );

  /**
   * Two grids, not one.
   *
   * Pests and diseases were stacked on a single matrix, so Botrytis sat
   * between Black Spot and Caterpillars with nothing to say which was which —
   * and they are not comparable: a mildew reading and a thrips reading mean
   * different interventions, different chemistry and different thresholds.
   * The columns stay shared (every greenhouse the filter covers appears on
   * both) so the two grids line up and can be read against each other.
   */
  const { pestGrid, diseaseGrid } = useMemo(() => {
    const cells = matrix.data ?? [];
    const colSort = (a: string, b: string) =>
      (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0);

    // Columns come from every cell regardless of kind, so a greenhouse with
    // only disease records still holds its place on the pest grid — an empty
    // column is information, and dropping it would misalign the two.
    const cols = [...new Set(cells.map((x) => x.greenhouse))].sort(colSort);

    const gridFor = (kind: "pest" | "disease") => {
      const mine = cells.filter((x) => x.kind === kind);
      const lookup = new Map<string, number>();
      for (const x of mine) lookup.set(`${x.pest}|${x.greenhouse}`, x.avg_severity);
      return {
        rows: [...new Set(mine.map((x) => x.pest))].sort(),
        cols,
        lookup,
      };
    };

    return { pestGrid: gridFor("pest"), diseaseGrid: gridFor("disease") };
  }, [matrix.data]);

  /**
   * The detail table's row model: every scouting record joined to its
   * resolved names (greenhouse, pest/disease, variety, scout) so the table
   * reads like a report rather than a database dump. Client-side filters
   * for disease/variety are applied here too — the /scouting list endpoint
   * only accepts greenhouse/type/scout/date.
   */
  const detailRows: ScoutingDetailRow[] = useMemo(() => {
    return (scouting.data ?? []).map((r) => {
        const isDisease = r.disease_id != null;
        return {
          r,
          greenhouse: r.greenhouse_id
            ? (ghName.get(r.greenhouse_id) ?? `#${r.greenhouse_id}`)
            : "—",
          target: isDisease
            ? (diseaseName.get(r.disease_id as number) ?? "Disease")
            : r.pest_id != null
              ? (pestName.get(r.pest_id) ?? "Pest")
              : "—",
          targetKind: isDisease ? "Disease" : r.pest_id != null ? "Pest" : "—",
          variety: r.variety_code
            ? (varietyName.get(r.variety_code) ?? r.variety_code)
            : "—",
          scout: r.scout_id ? (scoutName.get(r.scout_id) ?? `#${r.scout_id}`) : "—",
          count:
            r.fcm_count + r.sticky_trap_bug_count + r.lure_bug_count,
        };
      });
  }, [scouting.data, ghName, pestName, diseaseName, varietyName, scoutName]);

  const filteredScoutingRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return detailRows;
    return detailRows.filter((row) =>
      [
        row.greenhouse,
        row.r.bed_code,
        row.target,
        row.variety,
        row.scout,
        row.r.stage,
        row.r.location_on_plant,
        row.r.notes,
        row.r.session_comment,
        SCOUTING_LABEL[row.r.scouting_for],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [recordSearch, detailRows]);

  function exportScoutingCsv() {
    const head = [
      "recorded_at",
      "greenhouse",
      "bed",
      "type",
      "target_kind",
      "target",
      "variety",
      "stage",
      "location_on_plant",
      "severity",
      "count",
      "beneficials",
      "scout",
      "verification",
      "flagged",
      "notes",
      "session_comment",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filteredScoutingRecords.map((x) =>
      [
        x.r.recorded_at,
        x.greenhouse,
        x.r.bed_code ?? "",
        SCOUTING_LABEL[x.r.scouting_for],
        x.targetKind,
        x.target,
        x.variety,
        x.r.stage ?? "",
        x.r.location_on_plant ?? "",
        x.r.severity,
        x.count,
        x.r.beneficials_count,
        x.scout,
        VERIFICATION_LABEL[x.r.verification_method],
        x.r.flagged ? "yes" : "no",
        x.r.notes ?? "",
        x.r.session_comment ?? "",
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scouting_detail_${filters.start}_to_${filters.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const coverageBreakdown = useMemo(() => countBy(filteredSpray, (r) => r.coverage), [filteredSpray]);

  /**
   * Coverage *per block*, not farm-wide.
   *
   * "19 full cover, 13 top cover" across the estate tells a manager nothing
   * actionable. Which blocks got full cover and which only got a top pass is
   * the question — it's how you spot a block that has been under-treated.
   */
  const coverageByGreenhouse = useMemo(() => {
    const types = [...new Set(filteredSpray.map((r) => r.coverage?.trim()).filter(Boolean))] as string[];
    const byBlock = new Map<string, Record<string, number>>();
    for (const r of filteredSpray) {
      if (r.greenhouse_id == null) continue;
      const block = ghCode.get(r.greenhouse_id) ?? `GH#${r.greenhouse_id}`;
      const type = r.coverage?.trim() || "Unspecified";
      const row = byBlock.get(block) ?? {};
      row[type] = (row[type] ?? 0) + 1;
      byBlock.set(block, row);
    }
    const keys = types.length ? types : ["Unspecified"];
    const data = [...byBlock.entries()]
      .map(([label, counts]) => {
        const filled: Record<string, string | number> = { label };
        for (const k of keys) filled[k] = counts[k] ?? 0;
        return filled;
      })
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return { data, keys };
  }, [filteredSpray, ghCode]);
  const chemicalBreakdown = useMemo(() => countBy(filteredSpray, (r) => r.product), [filteredSpray]);
  const chemicalCostBreakdown = useMemo(() => costBy(filteredSpray, (r) => r.product), [filteredSpray]);
  // Full variety names, not the three-letter code the record stores.
  const varietyCostBreakdown = useMemo(
    () =>
      costBy(filteredSpray, (r) =>
        r.variety_code ? varietyName.get(r.variety_code) ?? r.variety_code : null,
      ),
    [filteredSpray, varietyName],
  );

  // Block *codes* on the axis — "Greenhouse 03" wraps and rotates; "GH03"
  // reads at a glance, which is the point of an axis label.
  const greenhouseCostBreakdown = useMemo(
    () =>
      costBy(filteredSpray, (r) =>
        r.greenhouse_id != null ? ghCode.get(r.greenhouse_id) ?? `GH#${r.greenhouse_id}` : null,
      ),
    [filteredSpray, ghCode],
  );

  /** Litres/kg of product actually applied — spend hides a cheap product used heavily. */
  const chemicalQtyBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of filteredSpray) {
      const key = r.product?.trim() || "Unspecified";
      totals.set(key, (totals.get(key) ?? 0) + (r.qty ?? 0));
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value: Math.round(value * 1000) / 1000 }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredSpray]);

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
    const map = new Map<string, Program>();
    const now = Date.now();
    for (const row of filteredSpray) {
      const key = programKey(row);
      const entry: Program = map.get(key) ?? {
        program: key,
        products: new Set<string>(),
        greenhouses: new Set<string>(),
        totalCost: 0,
        firstDate: null,
        lastDate: null,
        activePhiUntil: null,
        records: [],
      };
      entry.records.push(row);
      if (row.product) entry.products.add(row.product);
      if (row.greenhouse_id != null) {
        entry.greenhouses.add(ghCode.get(row.greenhouse_id) ?? `GH#${row.greenhouse_id}`);
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
  }, [filteredSpray, ghCode]);

  const scoutingTable = usePagination(filteredScoutingRecords, 25, recordSearch);
  const movementTable = usePagination(scouts.data ?? [], 10);
  // Which scout the manager drilled into on the Movement tab.
  const [selectedScout, setSelectedScout] = useState<number | null>(null);

  const summaryCards = [
    {
      label: "Reports",
      value: summary.data ? summary.data.records.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.records.delta_pct),
      pct: summary.data?.records.delta_pct,
    },
    {
      label: "Avg severity",
      value: summary.data ? summary.data.avg_severity.value.toFixed(1) : "—",
      hint: deltaHint(summary.data?.avg_severity.delta_pct),
      pct: summary.data?.avg_severity.delta_pct,
      invert: true,
    },
    {
      label: "Over threshold",
      value: summary.data ? summary.data.over_threshold.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.over_threshold.delta_pct),
      pct: summary.data?.over_threshold.delta_pct,
      invert: true,
    },
    {
      label: "Open recs",
      value: summary.data ? summary.data.open_recommendations.toLocaleString() : "—",
      hint: "Needs follow-up · open",
      href: "/recommendations",
    },
    {
      label: "Active scouts",
      value: summary.data ? summary.data.active_scouts.value.toLocaleString() : "—",
      hint: deltaHint(summary.data?.active_scouts.delta_pct),
      pct: summary.data?.active_scouts.delta_pct,
    },
    {
      label: "Spray spend",
      value: summary.data ? money(summary.data.spray_cost.value) : "—",
      hint: deltaHint(summary.data?.spray_cost.delta_pct),
      pct: summary.data?.spray_cost.delta_pct,
      invert: true,
    },
  ];

  /**
   * Pivot the per-agent trend into recharts' row-per-date shape, one column
   * per agent. Only the busiest agents get a line — a dozen overlapping
   * series is unreadable.
   */
  function pivotTrend(kind: "pest" | "disease") {
    const points = (agentTrend.data ?? []).filter((p) => p.agent_kind === kind);
    const totals = new Map<string, number>();
    for (const p of points) {
      totals.set(p.agent_name, (totals.get(p.agent_name) ?? 0) + p.records);
    }
    const series = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const byDate = new Map<string, Record<string, string | number | null>>();
    for (const p of points) {
      if (!series.includes(p.agent_name)) continue;
      const row = byDate.get(p.date) ?? { date: p.date };
      row[p.agent_name] = p.avg_severity;
      byDate.set(p.date, row);
    }
    return {
      series,
      rows: [...byDate.values()].sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
    };
  }

  const pestTrend = useMemo(
    () => pivotTrend("pest"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentTrend.data],
  );
  const diseaseTrend = useMemo(
    () => pivotTrend("disease"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentTrend.data],
  );

  /** Greenhouses ranked by average severity — the "where to look" list. */
  const ghLeaderboard = useMemo(
    () =>
      [...(ghBreak.data ?? [])]
        .sort((a, b) => b.avg_severity - a.avg_severity || b.records - a.records)
        .slice(0, 8),
    [ghBreak.data],
  );

  /**
   * The actionable triage row. Each entry only appears when it's actually
   * non-zero, so an "all clear" window shows an all-clear state rather than
   * three zeroes dressed up as alerts.
   */
  const attention = useMemo(() => {
    const items: {
      label: string;
      value: string;
      hint: string;
      color: string;
      icon: typeof AlertTriangle;
      go: () => void;
    }[] = [];
    const overEtl = summary.data?.over_threshold.value ?? 0;
    const openRecs = summary.data?.open_recommendations ?? 0;
    const hotBlocks = (ghBreak.data ?? []).filter((g) => g.over_threshold > 0).length;

    if (overEtl > 0) {
      items.push({
        label: "Records over threshold",
        value: overEtl.toLocaleString(),
        hint: "Severity at or above the pest/disease ETL",
        color: "#dc2626",
        icon: AlertTriangle,
        go: () => setActiveTab("table"),
      });
    }
    if (openRecs > 0) {
      items.push({
        label: "Open recommendations",
        value: openRecs.toLocaleString(),
        hint: "Raised automatically, awaiting action",
        color: "#f59e0b",
        icon: Bug,
        go: () => setActiveTab("greenhouses"),
      });
    }
    if (hotBlocks > 0) {
      items.push({
        label: "Blocks with breaches",
        value: hotBlocks.toLocaleString(),
        hint: "Greenhouses with at least one over-ETL record",
        color: "#7c3aed",
        icon: Building2,
        go: () => setActiveTab("greenhouses"),
      });
    }
    return items;
  }, [summary.data, ghBreak.data]);

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
        title="Analytics"
        subtitle="Scouting pressure, threshold breaches and spray spend across the farm."
      />
      <div className="px-6">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      {/* Grouped report nav — scouting and spray reports were previously one
          undifferentiated row of twelve pills. */}
      <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-6 backdrop-blur">
        <nav className="flex items-center gap-4 overflow-x-auto py-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={clsx(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              activeTab === "overview"
                ? "bg-brand-600 text-white"
                : "text-ink-soft hover:bg-surface",
            )}
          >
            Overview
          </button>

          {TAB_GROUPS.map((group) => (
            <div key={group} className="flex items-center gap-1">
              <span className="mr-1 border-l border-line pl-4 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                {group}
              </span>
              {TABS.filter((t) => t.group === group).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={clsx(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab === t.id
                      ? "bg-brand-600 text-white"
                      : "text-ink-soft hover:bg-surface",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {activeTab !== "overview" && (
        <div className="px-6 text-sm text-ink-faint">{activeTabMeta.blurb}</div>
      )}

      {activeTab === "overview" && (
        <>
          {/* ── Headline KPIs ── */}
          <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((item) => (
              <Kpi key={item.label} {...item} loading={summary.isLoading} />
            ))}
          </div>

          {/* ── What needs attention — the actionable read ── */}
          <div className="px-6">
            <Card>
              <CardHeader
                title="Needs attention"
                subtitle="Where to look first in the selected window."
              />
              {attention.length === 0 ? (
                <div className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                    <ShieldCheck size={17} className="text-brand-600" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">All clear</p>
                    <p className="text-xs text-ink-faint">
                      Nothing over threshold and no open recommendations in range.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 p-4 md:grid-cols-3">
                  {attention.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.go}
                      className="flex items-start gap-3 rounded-lg border border-line p-3 text-left transition-colors hover:border-brand-300 hover:bg-surface"
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${a.color}14` }}
                      >
                        <a.icon size={16} style={{ color: a.color }} />
                      </span>
                      <div className="min-w-0">
                        <p
                          className="text-xl font-bold leading-none tabular-nums"
                          style={{ color: a.color }}
                        >
                          {a.value}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">{a.label}</p>
                        <p className="text-xs text-ink-faint">{a.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Trend + composition ── */}
          <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Scouting trend"
                subtitle="Volume, threshold breaches and average severity over time."
              />
              <div className="p-4">
                {trend.isLoading ? (
                  <Spinner />
                ) : (trend.data ?? []).length === 0 ? (
                  <EmptyState>No scouting records in range.</EmptyState>
                ) : (
                  <TrendChart data={trend.data ?? []} height={240} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="By scouting type" />
              <div className="p-4">
                {summary.isLoading ? (
                  <Spinner />
                ) : scoutingByType.length === 0 ? (
                  <EmptyState>No records.</EmptyState>
                ) : (
                  <Donut data={scoutingByType} height={190} showKey />
                )}
              </div>
            </Card>
          </div>

          {/* ── Pests vs diseases ── */}
          <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top pests" subtitle="By records in range" />
              <div className="p-4">
                {pestBreak.isLoading ? (
                  <Spinner />
                ) : (pestBreak.data ?? []).length === 0 ? (
                  <EmptyState>No pest records in range.</EmptyState>
                ) : (
                  <HBarChart
                    data={(pestBreak.data ?? []).slice(0, 6).map((r) => ({ label: r.key, value: r.records }))}
                    height={190}
                    seriesLabel="Records"
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Top diseases" subtitle="By records in range" />
              <div className="p-4">
                {diseaseBreak.isLoading ? (
                  <Spinner />
                ) : (diseaseBreak.data ?? []).length === 0 ? (
                  <EmptyState>No disease records in range.</EmptyState>
                ) : (
                  <HBarChart
                    data={(diseaseBreak.data ?? []).slice(0, 6).map((r) => ({ label: r.key, value: r.records }))}
                    height={190}
                    color="#f59e0b"
                    seriesLabel="Records"
                  />
                )}
              </div>
            </Card>
          </div>

          {/* ── Greenhouse leaderboard — ranked, not just charted ── */}
          <div className="px-6">
            <Card>
              <CardHeader
                title="Pressure by greenhouse"
                subtitle="Ranked by average severity — the blocks carrying the most pressure."
                actions={
                  <button
                    type="button"
                    onClick={() => setActiveTab("greenhouses")}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Full report →
                  </button>
                }
              />
              <div className="p-4">
                {ghBreak.isLoading ? (
                  <Spinner />
                ) : ghLeaderboard.length === 0 ? (
                  <EmptyState>No scouting records in range.</EmptyState>
                ) : (
                  <div className="space-y-1.5">
                    {ghLeaderboard.map((g) => (
                      <div key={g.key} className="flex items-center gap-3">
                        <span
                          title={g.key}
                          className="flex w-40 shrink-0 items-baseline gap-1.5 text-sm"
                        >
                          <span className="font-semibold text-ink">{g.key}</span>
                          {ghCodeByName.get(g.key) && (
                            <span className="text-[11px] text-ink-faint">
                              {ghCodeByName.get(g.key)}
                            </span>
                          )}
                        </span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface">
                          <div
                            className="flex h-full items-center justify-end rounded-md px-2"
                            style={{
                              width: `${Math.max(6, (g.avg_severity / 5) * 100)}%`,
                              backgroundColor: severityHex(Math.round(g.avg_severity)),
                            }}
                          >
                            <span className="text-[11px] font-bold text-white">
                              {g.avg_severity.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs text-ink-faint">
                          {g.records} rec
                          {g.over_threshold > 0 && (
                            <span className="ml-1 font-semibold text-red-600">
                              · {g.over_threshold} ETL
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Spray strip — compact, links to the spray reports ── */}
          <div className="px-6">
            <Card>
              <CardHeader
                title="Spray at a glance"
                subtitle="Application activity in the current window."
                actions={
                  <button
                    type="button"
                    onClick={() => setActiveTab("spray")}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Spray reports →
                  </button>
                }
              />
              <div className="grid grid-cols-2 divide-line p-4 md:grid-cols-4 md:divide-x">
                {sprayGlanceCards.map((item) => (
                  <div key={item.label} className="px-4 py-1 first:pl-0">
                    <p className="text-xl font-bold tabular-nums text-ink">
                      {spray.isLoading ? "—" : item.value}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-ink-soft">{item.label}</p>
                    <p className="text-[11px] text-ink-faint">{item.hint}</p>
                  </div>
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
              title="Scouting detail"
              subtitle="Every field observation in range, with resolved names, scores and context."
              actions={
                <button
                  type="button"
                  onClick={exportScoutingCsv}
                  disabled={!filteredScoutingRecords.length}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface disabled:opacity-50"
                >
                  <Download size={14} /> Export CSV
                </button>
              }
            />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <TextInput
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="Search greenhouse, bed, pest/disease, variety, scout, stage or notes"
                  className="max-w-md"
                />
                <span className="text-xs text-ink-faint">
                  {filteredScoutingRecords.length} record
                  {filteredScoutingRecords.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Greenhouse</th>
                      <th className="px-3 py-2.5 font-semibold">Bed</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Pest / Disease</th>
                      <th className="px-3 py-2.5 font-semibold">Variety</th>
                      <th className="px-3 py-2.5 font-semibold">Stage</th>
                      <th className="px-3 py-2.5 font-semibold">On plant</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Severity</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Count</th>
                      <th className="px-3 py-2.5 font-semibold">Scout</th>
                      <th className="px-3 py-2.5 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {scouting.isLoading ? (
                      <tr>
                        <td colSpan={12} className="px-3 py-6">
                          <Spinner label="Loading records…" />
                        </td>
                      </tr>
                    ) : filteredScoutingRecords.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-ink-faint">
                          No matching records.
                        </td>
                      </tr>
                    ) : (
                      scoutingTable.paged.map((row) => (
                        <tr key={row.r.id} className="align-top hover:bg-surface">
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {/* The timestamp is the row's handle — open the
                                full record rather than squeezing more columns
                                into an already wide table. */}
                            <Link
                              href={`/scouting/${row.r.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {new Date(row.r.recorded_at).toLocaleString("en-GB", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                            {row.greenhouse}
                          </td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.r.bed_code ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                            {SCOUTING_LABEL[row.r.scouting_for]}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-ink">{row.target}</span>
                            {row.targetKind !== "—" && (
                              <span className="ml-1.5 text-xs text-ink-faint">
                                {row.targetKind}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.variety}</td>
                          <td className="px-3 py-2.5 text-ink-soft">{row.r.stage ?? "—"}</td>
                          <td className="px-3 py-2.5 text-ink-soft">
                            {row.r.location_on_plant ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className="inline-block min-w-[2.25rem] rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
                              style={{
                                backgroundColor: `${severityHex(row.r.severity)}22`,
                                color: row.r.severity >= 3 ? "#b91c1c" : "#047857",
                              }}
                            >
                              {row.r.severity}/5
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                            {row.count || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                            {row.scout}
                            {row.r.flagged && (
                              <span
                                className="ml-1.5 text-xs font-semibold text-red-600"
                                title={row.r.flag_reason ?? "Flagged"}
                              >
                                ⚑
                              </span>
                            )}
                          </td>
                          <td className="max-w-[16rem] px-3 py-2.5 text-ink-soft">
                            {row.r.notes ?? "—"}
                            {row.r.session_comment && (
                              <span
                                className="mt-0.5 block truncate text-xs italic text-ink-faint"
                                title={row.r.session_comment}
                              >
                                Session: {row.r.session_comment}
                              </span>
                            )}
                          </td>
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
            {/* <Card>
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
            </Card> */}
          </div>
          <div className="space-y-5 px-6">
            <Card>
              <CardHeader
                title="Pests by greenhouse"
                subtitle="Average severity per pest, per block. Columns are greenhouse numbers; darker is worse."
              />
              <div className="p-4">
                {matrix.isLoading && <Spinner />}
                {!matrix.isLoading && pestGrid.rows.length === 0 && (
                  <EmptyState>No pest records in range.</EmptyState>
                )}
                {pestGrid.rows.length > 0 && (
                  <HeatMatrix
                    rows={pestGrid.rows}
                    cols={pestGrid.cols}
                    value={(r, c) => pestGrid.lookup.get(`${r}|${c}`) ?? null}
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Diseases by greenhouse"
                subtitle="Average severity per disease, per block. Same columns as the pest grid above."
              />
              <div className="p-4">
                {matrix.isLoading && <Spinner />}
                {!matrix.isLoading && diseaseGrid.rows.length === 0 && (
                  <EmptyState>No disease records in range.</EmptyState>
                )}
                {diseaseGrid.rows.length > 0 && (
                  <HeatMatrix
                    rows={diseaseGrid.rows}
                    cols={diseaseGrid.cols}
                    value={(r, c) => diseaseGrid.lookup.get(`${r}|${c}`) ?? null}
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === "trends" && (
        <>
          {/* <div className="px-6">
            <Card>
              <CardHeader
                title="Trend report"
                subtitle="How record volume, severity, and threshold breaches evolve over time."
              />
              <div className="p-4">
                {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} height={300} />}
              </div>
            </Card>
          </div> */}
          {/* Per-agent trajectories — compare an agent against the
              interventions made against it. */}
          <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Trend per pest"
                subtitle="Average severity per day, one line per pest."
              />
              <div className="p-4">
                {agentTrend.isLoading ? (
                  <Spinner />
                ) : (
                  <MultiLineChart
                    data={pestTrend.rows}
                    series={pestTrend.series}
                    colors={PEST_LINE_COLORS}
                    height={260}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Trend per disease"
                subtitle="Average severity per day, one line per disease."
              />
              <div className="p-4">
                {agentTrend.isLoading ? (
                  <Spinner />
                ) : (
                  <MultiLineChart
                    data={diseaseTrend.rows}
                    series={diseaseTrend.series}
                    colors={DISEASE_LINE_COLORS}
                    height={260}
                  />
                )}
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
        <div className="space-y-4 px-6">
          <Card>
            <CardHeader
              title="Movement report"
              subtitle="Click a scout to trace their walk bed by bed"
            />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Scout</th>
                    <th className="px-3 py-2.5 font-semibold">Records</th>
                    <th className="px-3 py-2.5 font-semibold">Greenhouses</th>
                    <th className="px-3 py-2.5 font-semibold">Beds</th>
                    <th className="px-3 py-2.5 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {movementTable.paged.map((s) => {
                    const on = s.scout_id === selectedScout;
                    return (
                      <tr
                        key={s.scout_id}
                        onClick={() => setSelectedScout(on ? null : s.scout_id)}
                        className={`cursor-pointer ${on ? "bg-brand-50" : "hover:bg-surface"}`}
                      >
                        <td className="px-5 py-2.5 font-medium">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: on ? "#059669" : "transparent" }}
                            />
                            {s.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{s.records}</td>
                        <td className="px-3 py-2.5 tabular-nums">{s.greenhouses_visited}</td>
                        <td className="px-3 py-2.5 tabular-nums">{s.beds_visited}</td>
                        <td className="px-3 py-2.5 text-ink-faint">{relativeTime(s.last_seen)}</td>
                      </tr>
                    );
                  })}
                  {scouts.data?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-ink-faint">
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

          <ScoutMovementPanel scoutId={selectedScout} filters={filters} />
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
            <SprayProgramsTable
              programs={programs}
              loading={spray.isLoading}
              ghName={ghName}
              varietyName={varietyName}
              employeeName={scoutName}
              rangeLabel={`${filters.start}_to_${filters.end}`}
              reportParams={{
                start: filters.start ?? "",
                end: filters.end ?? "",
                greenhouse_id: filters.greenhouse_id ? String(filters.greenhouse_id) : "",
              }}
            />
          </div>
        </>
      )}

      {activeTab === "coverage" && (
        <div className="space-y-5 px-6">
          <Card>
            <CardHeader
              title="Coverage by greenhouse"
              subtitle="Which blocks received full cover and which only a top pass."
            />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : coverageByGreenhouse.data.length === 0 ? (
                <EmptyState>No spray coverage data in range.</EmptyState>
              ) : (
                <StackedBarChart
                  data={coverageByGreenhouse.data}
                  keys={coverageByGreenhouse.keys}
                  colors={STACK_COLORS}
                  height={340}
                  xKey="label"
                />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Coverage mix"
              subtitle="Farm-wide split of applications by coverage type."
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
                  height={200}
                  seriesLabel="Applications"
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
              subtitle={`Total ${money(totalSprayCost)} in the selected range, by block.`}
            />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : greenhouseCostBreakdown.length === 0 ? (
                <EmptyState>No spray records in range.</EmptyState>
              ) : (
                <RankedBarChart
                  data={greenhouseCostBreakdown.slice(0, 12).map((r) => ({ label: r.label, value: r.value }))}
                  color="#059669"
                  height={300}
                  seriesLabel="Spray spend"
                  format="money"
                  unitNote="Top 12 blocks by spend"
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "chemicals" && (
        <div className="space-y-5 px-6">
          <Card>
            <CardHeader
              title="Chemical spend"
              subtitle="Products ranked by total cost in the selected range."
            />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : chemicalCostBreakdown.length === 0 ? (
                <EmptyState>No spray cost data in range.</EmptyState>
              ) : (
                <RankedBarChart
                  data={chemicalCostBreakdown.slice(0, 10).map((r) => ({ label: r.label, value: r.value }))}
                  color="#dc2626"
                  height={300}
                  seriesLabel="Spend"
                  format="money"
                />
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Quantity used"
                subtitle="How much product actually went out — a cheap product used heavily hides in a spend chart."
              />
              <div className="p-4">
                {spray.isLoading ? (
                  <Spinner />
                ) : chemicalQtyBreakdown.length === 0 ? (
                  <EmptyState>No product quantities recorded in range.</EmptyState>
                ) : (
                  <HBarChart
                    data={chemicalQtyBreakdown.slice(0, 8)}
                    color="#0891b2"
                    height={220}
                    seriesLabel="Quantity (L / kg)"
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Application frequency"
                subtitle="How often each product was applied, by count."
              />
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
                    seriesLabel="Applications"
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "variety-cost" && (
        <div className="px-6">
          <Card>
            <CardHeader title="Variety cost report" subtitle="Spray spend by crop variety in the selected range." />
            <div className="p-4">
              {spray.isLoading ? (
                <Spinner />
              ) : varietyCostBreakdown.length === 0 ? (
                <EmptyState>No variety cost data in range.</EmptyState>
              ) : (
                <RankedBarChart
                  data={varietyCostBreakdown.slice(0, 10).map((r) => ({ label: r.label, value: r.value }))}
                  color="#dc2626"
                  height={300}
                  seriesLabel="Spray spend"
                  format="money"
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "fert-cost" && (
        <div className="space-y-5 px-6">
          <PlaceholderPriceNote />
          <Card>
            <CardHeader
              title="Fertigation cost"
              subtitle="Grouped by where the feeding went. Costs use the prices stored on each sheet when it was raised."
              actions={
                <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
                  {[
                    { id: "phase", label: "By phase" },
                    { id: "block", label: "By block" },
                    { id: "month", label: "By month" },
                    { id: "activity", label: "By activity" },
                  ].map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setFertGroup(g.id)}
                      className={clsx(
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                        fertGroup === g.id
                          ? "bg-brand-600 text-white"
                          : "text-ink-soft hover:bg-surface",
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="p-4">
              {fertCost.isLoading && <Spinner />}
              {!fertCost.isLoading && (fertCost.data ?? []).length === 0 && (
                <EmptyState>No fertigation sheets in this date range.</EmptyState>
              )}
              {(fertCost.data ?? []).length > 0 && (
                <>
                  <RankedBarChart
                    data={(fertCost.data ?? [])
                      .slice(0, 12)
                      .map((r) => ({ label: r.key, value: r.total_cost }))}
                    color="#0891b2"
                    height={300}
                    seriesLabel="Feeding spend"
                    format="money"
                  />
                  <div className="mt-4 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                          <th className="py-2 pr-3 font-semibold">
                            {fertGroup === "month" ? "Month" : fertGroup === "block" ? "Block" : fertGroup === "activity" ? "Activity" : "Phase"}
                          </th>
                          <th className="py-2 pr-3 text-right font-semibold">Sheets</th>
                          <th className="py-2 pr-3 text-right font-semibold">Water m³</th>
                          <th className="py-2 pr-3 text-right font-semibold">Area ha</th>
                          <th className="py-2 pr-3 text-right font-semibold">m³/ha</th>
                          <th className="py-2 text-right font-semibold">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {(fertCost.data ?? []).map((r) => (
                          <tr key={r.key} className="hover:bg-surface">
                            <td className="py-2 pr-3 font-medium text-ink">{r.key}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.sheets}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.volume_m3.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.area_ha || "—"}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.m3_per_ha ?? "—"}</td>
                            <td className="py-2 text-right font-semibold tabular-nums text-ink">{money(r.total_cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {fertGroup === "block" && (
                    <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
                      A sheet covering several greenhouses is one cost shared
                      between them, apportioned by area — not counted once per
                      block. The block totals therefore add up to the farm total.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "fert-water" && (
        <div className="space-y-5 px-6">
          <Card>
            <CardHeader
              title="Water applied against plan"
              subtitle="Each sheet's m³/ha next to the target it was raised for. Negative variance is underfeeding."
            />
            <div className="overflow-auto p-4">
              {fertWater.isLoading && <Spinner />}
              {!fertWater.isLoading && (fertWater.data ?? []).length === 0 && (
                <EmptyState>No fertigation sheets in this date range.</EmptyState>
              )}
              {(fertWater.data ?? []).length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Phase</th>
                      <th className="py-2 pr-3 font-semibold">Blocks</th>
                      <th className="py-2 pr-3 text-right font-semibold">Area ha</th>
                      <th className="py-2 pr-3 text-right font-semibold">Water m³</th>
                      <th className="py-2 pr-3 text-right font-semibold">m³/ha</th>
                      <th className="py-2 pr-3 text-right font-semibold">Target m³/ha</th>
                      <th className="py-2 pr-3 text-right font-semibold">Variance</th>
                      <th className="py-2 text-right font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(fertWater.data ?? []).map((r) => (
                      <tr key={r.doc_id} className="hover:bg-surface">
                        <td className="whitespace-nowrap py-2 pr-3">
                          <Link
                            href={`/fertigation/${encodeURIComponent(r.doc_id)}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {new Date(r.event_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-ink-soft">{r.phase ?? "—"}</td>
                        <td className="max-w-[16rem] truncate py-2 pr-3 text-ink-soft" title={r.blocks ?? ""}>
                          {r.blocks ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.area_ha ?? "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {r.volume_m3?.toLocaleString() ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">
                          {r.m3_per_ha ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {r.target_m3_per_ha ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.variance_pct == null ? (
                            <span className="text-ink-faint">no target set</span>
                          ) : (
                            <span
                              className={clsx(
                                "font-semibold",
                                Math.abs(r.variance_pct) < 5
                                  ? "text-emerald-700"
                                  : Math.abs(r.variance_pct) < 15
                                    ? "text-amber-700"
                                    : "text-red-700",
                              )}
                            >
                              {r.variance_pct > 0 ? "+" : ""}
                              {r.variance_pct}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-soft">{money(r.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
                A sheet with no target rate has nothing to be measured against,
                so its variance is blank rather than zero — a blank is missing
                information, and zero would read as on-plan.
              </p>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "fert-usage" && (
        <div className="space-y-5 px-6">
          <PlaceholderPriceNote />
          <Card>
            <CardHeader
              title="Fertiliser usage"
              subtitle="Quantity × the sets actually made up, summed across every sheet in range."
            />
            <div className="p-4">
              {fertUsage.isLoading && <Spinner />}
              {!fertUsage.isLoading && (fertUsage.data ?? []).length === 0 && (
                <EmptyState>No fertiliser issued in this date range.</EmptyState>
              )}
              {(fertUsage.data ?? []).length > 0 && (
                <>
                  <RankedBarChart
                    data={(fertUsage.data ?? [])
                      .slice(0, 12)
                      .map((r) => ({ label: r.code, value: r.total_cost }))}
                    color="#7c3aed"
                    height={300}
                    seriesLabel="Product spend"
                    format="money"
                  />
                  <div className="mt-4 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                          <th className="py-2 pr-3 font-semibold">Code</th>
                          <th className="py-2 pr-3 font-semibold">Product</th>
                          <th className="py-2 pr-3 text-right font-semibold">Quantity</th>
                          <th className="py-2 pr-3 text-right font-semibold">Sheets</th>
                          <th className="py-2 text-right font-semibold">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {(fertUsage.data ?? []).map((r) => (
                          <tr key={r.code} className="hover:bg-surface">
                            <td className="py-2 pr-3 font-semibold text-ink">{r.code}</td>
                            <td className="py-2 pr-3 text-ink-soft">{r.name ?? "—"}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink">
                              {r.quantity.toLocaleString()} {r.unit}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{r.sheets}</td>
                            <td className="py-2 text-right font-semibold tabular-nums text-ink">
                              {money(r.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Says out loud that the money on screen is not the farm's money yet.
 *
 * The fertiliser register ships with indicative prices, not invoices. A cost
 * report that looks authoritative while resting on invented figures is worse
 * than no report — somebody will budget against it.
 */
function PlaceholderPriceNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>
        <strong>Costs are indicative.</strong> The fertiliser register still
        carries placeholder prices. Enter your invoice prices under Settings →
        Fertilisers and every figure here becomes real.
      </span>
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

/**
 * Headline metric with a period-over-period delta. `invert` marks metrics
 * where "up" is bad (severity, breaches, cost) so the arrow colour reads
 * correctly without the user having to think about it.
 */
function Kpi({
  label,
  value,
  hint,
  pct,
  invert = false,
  loading,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  pct?: number | null;
  invert?: boolean;
  loading?: boolean;
  /** When set the tile becomes a link — e.g. open recs → /recommendations. */
  href?: string;
}) {
  const up = (pct ?? 0) > 0;
  const good = pct == null || pct === 0 ? null : invert ? !up : up;

  const body = (
    <>
      <p className="flex items-center gap-1 text-xs font-medium text-ink-faint">
        {label}
        {href && <ArrowRight size={11} className="opacity-60" />}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-ink">
          {loading ? "—" : value}
        </span>
        {pct != null && pct !== 0 && (
          <span
            className={clsx(
              "flex items-center gap-0.5 text-xs font-semibold",
              good ? "text-brand-600" : "text-red-600",
            )}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(pct).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-line bg-white p-4 shadow-card transition-colors hover:border-brand-300 hover:bg-surface"
      >
        {body}
      </Link>
    );
  }
  return <Card className="p-4">{body}</Card>;
}

function Breakdown({
  title,
  q,
  color,
}: {
  title: string;
  q: {
    data?: {
      key: string;
      records: number;
      avg_severity: number;
      over_threshold: number;
      beds: string[];
    }[];
    isLoading: boolean;
  };
  color: string;
}) {
  const rows = (q.data ?? []).slice(0, 8);
  const total = (q.data ?? []).reduce((s, r) => s + r.records, 0);
  return (
    <Card>
      <CardHeader title={title} actions={<Badge>{total} recs</Badge>} />
      <div className="p-4">
        {q.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState>No data.</EmptyState>
        ) : (
          <>
            <HBarChart
              data={rows.map((r) => ({ label: r.key, value: r.records }))}
              color={color}
              height={200}
            />
            {/* Where it's happening — a count alone doesn't tell you where to go. */}
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="flex items-start justify-between gap-3 text-xs"
                  title={
                    r.beds.length
                      ? `${r.key} on ${r.beds.join(", ")}`
                      : `${r.key} — no bed recorded`
                  }
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-soft">
                    {r.key}
                  </span>
                  <span className="shrink-0 text-right text-ink-faint">
                    {r.beds.length ? (
                      <>
                        {r.beds.slice(0, 3).join(", ")}
                        {r.beds.length > 3 && ` +${r.beds.length - 3}`}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-ink-faint">
              Beds where each was recorded · hover for the full list
            </p>
          </>
        )}
      </div>
    </Card>
  );
}