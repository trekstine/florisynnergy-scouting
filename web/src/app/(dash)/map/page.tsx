"use client";

import {
  Activity,
  ClipboardList,
  Grid3x3,
  MousePointerClick,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { HBarChart, TrendChart } from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { PressureMap } from "@/components/map";
import { Badge, Spinner } from "@/components/ui";
import {
  PRESSURE_HEX,
  PRESSURE_LABEL,
  SCOUTING_LABEL,
  formatDateTime,
  severityHex,
} from "@/lib/format";
import {
  useBedPressure,
  useBreakdown,
  useDiseases,
  usePests,
  usePoints,
  usePressure,
  useScouting,
  useTrend,
  useVarieties,
} from "@/lib/hooks";
import type { Filters, GreenhousePressure } from "@/lib/types";

type View = "choropleth" | "heat" | "both";

export default function MapPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <MapView />
    </Suspense>
  );
}

function MapView() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));
  const [view, setView] = useState<View>("choropleth");
  const pressure = usePressure(filters);
  const points = usePoints(filters);

  // Deep link: /map?greenhouse=3 opens straight into that block's panel,
  // so clicking a block on the dashboard map lands somewhere useful.
  const initialId = Number(searchParams.get("greenhouse")) || null;
  const [selectedId, setSelectedId] = useState<number | null>(initialId);

  const heatPoints = useMemo<[number, number, number][]>(
    () => (points.data ?? []).map((p) => [p.lat, p.lng, Math.max(0.15, p.severity / 5)]),
    [points.data],
  );
  const selected = useMemo(
    () => (pressure.data ?? []).find((g) => g.greenhouse_id === selectedId),
    [pressure.data, selectedId],
  );

  const totals = useMemo(() => {
    const t = { none: 0, low: 0, medium: 0, high: 0 };
    for (const g of pressure.data ?? []) t[g.pressure] += 1;
    return t;
  }, [pressure.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Pressure Map</h1>
          <p className="text-xs text-ink-faint">Interactive farm view · pest &amp; disease pressure by greenhouse</p>
        </div>
        <div className="flex items-center gap-4">
          {(["high", "medium", "low", "none"] as const).map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PRESSURE_HEX[p] }} />
              {PRESSURE_LABEL[p]} <span className="font-bold tabular-nums">{totals[p]}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-6 py-2">
        {/* Greenhouse select doubles as a picker — polygons overlap on the
            map, so selecting by name is often faster than clicking. */}
        <FilterBar
          value={filters}
          onChange={(f) => {
            setFilters(f);
            if (f.greenhouse_id) setSelectedId(f.greenhouse_id);
            else if (!f.greenhouse_id && filters.greenhouse_id) setSelectedId(null);
          }}
        />
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(["choropleth", "heat", "both"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize ${
                view === v ? "bg-brand-600 text-white" : "bg-white text-ink-soft hover:bg-surface"
              }`}
            >
              {v === "choropleth" ? "Greenhouse" : v === "heat" ? "Heatmap" : "Both"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {pressure.data && (
            <PressureMap
              data={pressure.data}
              selectedId={selectedId}
              onSelect={setSelectedId}
              heatPoints={heatPoints}
              showHeat={view !== "choropleth"}
              showChoropleth={view !== "heat"}
              showLabels={view !== "heat"}
            />
          )}
          {pressure.isLoading && (
            <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-line bg-white px-3 py-1.5"><Spinner /></div>
          )}
        </div>

        <aside className="flex w-[26rem] shrink-0 flex-col border-l border-line bg-white">
          {selected ? (
            <GreenhousePanel
              gh={selected}
              filters={filters}
              onClose={() => {
                setSelectedId(null);
                if (filters.greenhouse_id) {
                  setFilters({ ...filters, greenhouse_id: undefined });
                }
              }}
            />
          ) : (
            <EmptyPanel count={(pressure.data ?? []).length} />
          )}
        </aside>
      </div>
    </div>
  );
}

function GreenhousePanel({
  gh,
  filters,
  onClose,
}: {
  gh: GreenhousePressure;
  filters: Filters;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "beds" | "records">("overview");

  // Reset to Overview when a different greenhouse is selected, so the panel
  // never opens on a tab the user didn't choose for this block.
  useEffect(() => setTab("overview"), [gh.greenhouse_id]);

  const ghFilters = { ...filters, greenhouse_id: gh.greenhouse_id };
  const beds = useBedPressure(gh.greenhouse_id, filters);
  const trend = useTrend(ghFilters);
  const pests = useBreakdown("pest", ghFilters);
  const diseases = useBreakdown("disease", ghFilters);
  const scouting = useScouting({
    greenhouse_id: gh.greenhouse_id,
    start: filters.start,
    end: filters.end,
    scouting_for: filters.scouting_for || undefined,
  });

  // Reference lookups so the panel can show real names rather than ids/codes.
  const pestList = usePests();
  const diseaseList = useDiseases();
  const varietyList = useVarieties();

  const pestName = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pestList.data ?? []) m.set(p.id, p.name);
    return m;
  }, [pestList.data]);
  const diseaseName = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of diseaseList.data ?? []) m.set(d.id, d.name);
    return m;
  }, [diseaseList.data]);
  const varietyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varietyList.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varietyList.data]);

  const bedRows = beds.data ?? [];
  const records = scouting.data ?? [];

  return (
    <>
      {/* ── Sticky header: identity + pressure, always visible ── */}
      <div className="shrink-0 border-b border-line">
        <div
          className="h-1 w-full"
          style={{ backgroundColor: PRESSURE_HEX[gh.pressure] }}
        />
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-ink">
              {gh.name}
            </h2>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge color={PRESSURE_HEX[gh.pressure]}>
                {PRESSURE_LABEL[gh.pressure]} pressure
              </Badge>
              <span className="text-xs text-ink-faint">
                {bedRows.length} bed{bedRows.length === 1 ? "" : "s"} active
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 pb-4">
          <Stat label="Records" value={gh.records} />
          <Stat label="Avg severity" value={gh.avg_severity} tone="#0284c7" />
          <Stat
            label="Over ETL"
            value={gh.over_threshold}
            tone={gh.over_threshold > 0 ? "#dc2626" : undefined}
          />
        </div>

        {/* ── Segmented tabs — replaces one very long scroll ── */}
        <div className="flex gap-1 px-3 pb-2">
          {(
            [
              { id: "overview", label: "Overview", icon: Activity },
              { id: "beds", label: "Beds", icon: Grid3x3 },
              { id: "records", label: "Records", icon: ClipboardList },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-faint hover:bg-surface hover:text-ink-soft"
                }`}
              >
                <Icon size={14} />
                {label}
                {id === "records" && records.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      active ? "bg-brand-100 text-brand-700" : "bg-surface text-ink-faint"
                    }`}
                  >
                    {records.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "overview" && (
          <>
            <Section title="Trend" hint="Records · over-ETL · severity">
              {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} height={190} />}
            </Section>

            <Section title="Top pests here" hint="Records per pest">
              {pests.isLoading ? <Spinner /> : (pests.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-faint">No pest records.</p>
              ) : (
                <HBarChart
                  data={(pests.data ?? []).slice(0, 5).map((r) => ({ label: r.key, value: r.records }))}
                  height={150}
                  seriesLabel="Records"
                />
              )}
            </Section>

            <Section title="Top diseases here" hint="Records per disease">
              {diseases.isLoading ? <Spinner /> : (diseases.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-faint">No disease records.</p>
              ) : (
                <HBarChart
                  data={(diseases.data ?? []).slice(0, 5).map((r) => ({ label: r.key, value: r.records }))}
                  height={150}
                  color="#f59e0b"
                  seriesLabel="Records"
                />
              )}
            </Section>
          </>
        )}

        {tab === "beds" && (
          <Section title="Bed pressure" hint="Avg severity per bed">
            {beds.isLoading ? <Spinner /> : bedRows.length === 0 ? (
              <p className="text-sm text-ink-faint">No bed-level records in range.</p>
            ) : (
              <>
                {/* Compact heat strip — the whole block at a glance */}
                <div className="mb-4 flex flex-wrap gap-1">
                  {bedRows.map((b) => (
                    <span
                      key={b.bed_code}
                      title={`${b.bed_code} · avg ${b.avg_severity} · ${b.records} records`}
                      className="h-7 min-w-[2.25rem] rounded-md px-1.5 text-center text-[11px] font-bold leading-7 text-white"
                      style={{ backgroundColor: PRESSURE_HEX[b.pressure] }}
                    >
                      {b.bed_code}
                    </span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {bedRows.map((b) => (
                    <div
                      key={b.bed_code}
                      className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                    >
                      <span
                        className="h-7 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: PRESSURE_HEX[b.pressure] }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{b.bed_code}</p>
                        <p className="text-xs text-ink-faint">
                          {b.records} record{b.records === 1 ? "" : "s"}
                          {b.over_threshold > 0 && ` · ${b.over_threshold} over ETL`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className="text-sm font-bold tabular-nums"
                          style={{ color: PRESSURE_HEX[b.pressure] }}
                        >
                          {b.avg_severity}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-faint">
                          avg
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

        {tab === "records" && (
          <Section title="Scouting records" hint="Newest first">
            {scouting.isLoading && <Spinner />}
            <ul className="space-y-2">
              {records.map((s) => {
                // Lead with the actual agent name (disease or pest) rather
                // than the capture type, plus the full variety name.
                const target =
                  s.disease_id != null
                    ? (diseaseName.get(s.disease_id) ?? "Disease")
                    : s.pest_id != null
                      ? (pestName.get(s.pest_id) ?? "Pest")
                      : SCOUTING_LABEL[s.scouting_for];
                const variety = s.variety_code
                  ? (varietyName.get(s.variety_code) ?? s.variety_code)
                  : null;
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-line p-3 transition-colors hover:border-brand-200 hover:bg-surface"
                    style={{ borderLeft: `3px solid ${severityHex(s.severity)}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-sm font-semibold text-ink"
                        title={target}
                      >
                        {target}
                      </span>
                      <Badge color={severityHex(s.severity)}>
                        Severity {s.severity}/5
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {variety ? (
                        <>
                          <span className="font-medium">{variety}</span>
                          {s.variety_code && variety !== s.variety_code && (
                            <span className="text-ink-faint"> ({s.variety_code})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-faint">No variety</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {SCOUTING_LABEL[s.scouting_for]} · {s.bed_code ?? "—"} ·{" "}
                      {formatDateTime(s.recorded_at)}
                    </p>
                  </li>
                );
              })}
              {records.length === 0 && !scouting.isLoading && (
                <li className="text-sm text-ink-faint">No scouting records.</li>
              )}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}

/** Shown before a greenhouse is picked — explains both ways to select one. */
function EmptyPanel({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface">
        <MousePointerClick size={22} className="text-ink-faint" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">No greenhouse selected</p>
        <p className="mt-1 text-sm text-ink-faint">
          Click a block on the map — or pick one from the greenhouse dropdown
          above when polygons overlap.
        </p>
      </div>
      {count > 0 && (
        <p className="text-xs text-ink-faint">{count} greenhouses in range</p>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line p-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <p
        className="text-xl font-bold tabular-nums leading-none"
        style={{ color: tone ?? "#0f172a" }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium text-ink-faint">{label}</p>
    </div>
  );
}
