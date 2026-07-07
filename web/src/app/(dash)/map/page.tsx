"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { HBarChart, TrendChart } from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { PressureMap } from "@/components/map";
import { Badge, Spinner } from "@/components/ui";
import { PRESSURE_HEX, PRESSURE_LABEL, SCOUTING_LABEL, formatDateTime } from "@/lib/format";
import {
  useBedPressure,
  useBreakdown,
  usePoints,
  usePressure,
  useScouting,
  useTrend,
} from "@/lib/hooks";
import type { Filters, GreenhousePressure } from "@/lib/types";

type View = "choropleth" | "heat" | "both";

export default function MapPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));
  const [view, setView] = useState<View>("choropleth");
  const pressure = usePressure(filters);
  const points = usePoints(filters);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
        <FilterBar value={filters} onChange={setFilters} showGreenhouse={false} />
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

        <aside className="w-[26rem] shrink-0 overflow-auto border-l border-line bg-white">
          {selected ? (
            <GreenhousePanel gh={selected} filters={filters} onClose={() => setSelectedId(null)} />
          ) : (
            <p className="p-5 text-sm text-ink-faint">Select a greenhouse to drill into beds, trend and pests.</p>
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
  const ghFilters = { ...filters, greenhouse_id: gh.greenhouse_id };
  const beds = useBedPressure(gh.greenhouse_id, filters);
  const trend = useTrend(ghFilters);
  const pests = useBreakdown("pest", ghFilters);
  const scouting = useScouting({ greenhouse_id: gh.greenhouse_id });

  return (
    <div>
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-ink">{gh.name}</h2>
          <Badge color={PRESSURE_HEX[gh.pressure]} className="mt-1">{PRESSURE_LABEL[gh.pressure]} pressure</Badge>
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        <Stat label="Records" value={gh.records} />
        <Stat label="Avg sev" value={gh.avg_severity} />
        <Stat label="Over ETL" value={gh.over_threshold} />
      </div>

      {/* Bed-level heat — the bed precision  is known for */}
      <Section title="Bed pressure">
        {beds.isLoading ? <Spinner /> : (beds.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">No bed-level records.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(beds.data ?? []).map((b) => (
              <div
                key={b.bed_code}
                className="rounded-lg border border-line p-2.5"
                style={{ borderLeft: `4px solid ${PRESSURE_HEX[b.pressure]}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{b.bed_code}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: PRESSURE_HEX[b.pressure] }}>
                    {b.avg_severity}
                  </span>
                </div>
                <p className="text-xs text-ink-faint">{b.records} records</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Trend">
        {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} height={170} />}
      </Section>

      <Section title="Top pests here">
        {pests.isLoading ? <Spinner /> : (pests.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">No pest records.</p>
        ) : (
          <HBarChart data={(pests.data ?? []).slice(0, 5).map((r) => ({ label: r.key, value: r.records }))} height={150} />
        )}
      </Section>

      <Section title="Recent scouting">
        {scouting.isLoading && <Spinner />}
        <ul className="space-y-2">
          {(scouting.data ?? []).slice(0, 8).map((s) => (
            <li key={s.id} className="rounded-lg border border-line p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{SCOUTING_LABEL[s.scouting_for]}</span>
                <Badge color={s.severity >= 4 ? "#dc2626" : s.severity >= 3 ? "#f59e0b" : "#10b981"}>sev {s.severity}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">{s.bed_code ?? "—"} · {s.variety_code ?? "—"} · {formatDateTime(s.recorded_at)}</p>
            </li>
          ))}
          {scouting.data?.length === 0 && <li className="text-sm text-ink-faint">No scouting records.</li>}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line p-5">
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3">
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink-faint">{label}</p>
    </div>
  );
}
