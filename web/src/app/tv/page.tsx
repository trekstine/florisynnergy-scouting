"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  ClipboardList,
  Gauge,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LogoMark } from "@/components/Logo";
import { isoDaysAgo } from "@/components/FilterBar";
import { PRESSURE_HEX, PRESSURE_LABEL, SCOUTING_LABEL, severityHex } from "@/lib/format";
import {
  useDiseases,
  useGreenhouses,
  usePests,
  usePressure,
  useRecommendations,
  useScouting,
  useScoutSummary,
  useSummary,
  useTrend,
} from "@/lib/hooks";
import type { Filters } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────────────
   Farm wallboard — a read-only, full-screen display for an office TV.
   Designed to be legible from across a room: oversized type, dark canvas,
   colour doing the heavy lifting. No interaction at all — it rotates
   through scenes on its own and re-pulls data on a timer.
   ───────────────────────────────────────────────────────────────────────── */

const ROTATE_MS = 18_000; // seconds per scene
const REFRESH_MS = 60_000; // how often data is re-pulled

const SCENES = ["pressure", "attention", "activity", "trend"] as const;
type Scene = (typeof SCENES)[number];

const SCENE_TITLE: Record<Scene, string> = {
  pressure: "Farm pressure",
  attention: "Needs attention",
  activity: "Scouting activity",
  trend: "14-day trend",
};

export default function TvPage() {
  const qc = useQueryClient();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [clock, setClock] = useState("");
  const [today, setToday] = useState("");
  const [lastSync, setLastSync] = useState("");

  const filters: Filters = useMemo(
    () => ({ start: isoDaysAgo(14), end: new Date().toISOString().slice(0, 10) }),
    [],
  );

  const summary = useSummary(filters);
  const pressure = usePressure(filters);
  const trend = useTrend(filters);
  const recs = useRecommendations();
  const scouts = useScoutSummary(filters);
  const greenhouses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const scouting = useScouting({ start: filters.start, end: filters.end, limit: 40 });

  // Clock ticks locally; set after mount so SSR markup matches.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      );
      setToday(
        d.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
      );
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Scene rotation.
  useEffect(() => {
    const id = setInterval(
      () => setSceneIdx((i) => (i + 1) % SCENES.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, []);

  // Periodic data refresh — the board runs unattended for days.
  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries();
      setLastSync(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [qc]);

  const scene = SCENES[sceneIdx]!;

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
  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);

  const openRecs = useMemo(
    () => (recs.data ?? []).filter((r) => r.status === "open" || r.status === "planned"),
    [recs.data],
  );

  const blocks = pressure.data ?? [];
  const highCount = blocks.filter((b) => b.pressure === "high").length;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#04140d] text-white">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-10 py-5">
        <div className="flex items-center gap-4">
          <LogoMark size={46} tone="light" />
          <div>
            <p className="text-2xl font-bold leading-tight">
              Flori<span className="text-brand-400">Synergy</span>{" "}
              <span className="text-white/50">IPM</span>
            </p>
            <p className="flex items-center gap-1.5 text-sm text-white/45">
              <MapPin size={13} /> Naivasha Rose Estate
            </p>
          </div>
        </div>

        <p className="text-3xl font-bold tracking-tight text-white/90">
          {SCENE_TITLE[scene]}
        </p>

        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums leading-none">{clock}</p>
          <p className="mt-1 text-sm text-white/45">{today}</p>
          <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-white/30">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
            </span>
            Live{lastSync && ` · synced ${lastSync}`}
          </p>
        </div>
      </header>

      {/* ── Scene body ── */}
      <main className="min-h-0 flex-1 px-10 py-7">
        {scene === "pressure" && (
          <div className="flex h-full flex-col gap-6">
            <div className="grid shrink-0 grid-cols-4 gap-5">
              <BigStat
                icon={ClipboardList}
                label="Records · 14 days"
                value={summary.data?.records.value.toLocaleString() ?? "—"}
              />
              <BigStat
                icon={Gauge}
                label="Average severity"
                value={summary.data?.avg_severity.value.toFixed(1) ?? "—"}
                tone={
                  (summary.data?.avg_severity.value ?? 0) >= 3
                    ? "#f87171"
                    : "#34d399"
                }
              />
              <BigStat
                icon={AlertTriangle}
                label="Over threshold"
                value={summary.data?.over_threshold.value.toLocaleString() ?? "—"}
                tone={
                  (summary.data?.over_threshold.value ?? 0) > 0 ? "#f87171" : "#34d399"
                }
              />
              <BigStat
                icon={Bug}
                label="Open recommendations"
                value={summary.data?.open_recommendations.toLocaleString() ?? "—"}
                tone={openRecs.length > 0 ? "#fbbf24" : "#34d399"}
              />
            </div>

            <div className="min-h-0 flex-1">
              <SceneLabel>
                Greenhouse pressure · {highCount} block{highCount === 1 ? "" : "s"} high
              </SceneLabel>
              <div className="grid grid-cols-6 gap-4 2xl:grid-cols-8">
                {blocks.map((b) => (
                  <div
                    key={b.greenhouse_id}
                    className="rounded-2xl border p-4"
                    style={{
                      backgroundColor: `${PRESSURE_HEX[b.pressure]}1f`,
                      borderColor: `${PRESSURE_HEX[b.pressure]}66`,
                    }}
                  >
                    <p className="truncate text-lg font-bold">{b.name}</p>
                    <p
                      className="mt-1 text-4xl font-bold tabular-nums leading-none"
                      style={{ color: PRESSURE_HEX[b.pressure] }}
                    >
                      {b.avg_severity.toFixed(1)}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                      {PRESSURE_LABEL[b.pressure]}
                    </p>
                    <p className="text-xs text-white/35">{b.records} records</p>
                  </div>
                ))}
                {blocks.length === 0 && (
                  <p className="col-span-full text-xl text-white/40">
                    No pressure data in range.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {scene === "attention" && (
          <div className="grid h-full grid-cols-2 gap-8">
            <div className="min-h-0">
              <SceneLabel>Open recommendations · {openRecs.length}</SceneLabel>
              {openRecs.length === 0 ? (
                <AllClear message="No open recommendations." />
              ) : (
                <div className="space-y-3">
                  {openRecs.slice(0, 6).map((r) => {
                    const target =
                      r.disease_id != null
                        ? (diseaseName.get(r.disease_id) ?? "Disease")
                        : r.pest_id != null
                          ? (pestName.get(r.pest_id) ?? "Pest")
                          : "Intervention";
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4"
                      >
                        <span
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
                          style={{
                            backgroundColor: `${severityHex(r.trigger_severity)}33`,
                            color: severityHex(r.trigger_severity),
                          }}
                        >
                          {r.trigger_severity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-2xl font-bold">{target}</p>
                          <p className="text-base text-white/45">
                            {r.greenhouse_id ? (ghName.get(r.greenhouse_id) ?? "—") : "—"}
                            {r.bed_code && ` · Bed ${r.bed_code}`}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold uppercase"
                          style={{
                            backgroundColor:
                              r.status === "open" ? "#dc262633" : "#f59e0b33",
                            color: r.status === "open" ? "#f87171" : "#fbbf24",
                          }}
                        >
                          {r.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0">
              <SceneLabel>Blocks under pressure</SceneLabel>
              {blocks.filter((b) => b.pressure === "high" || b.pressure === "medium")
                .length === 0 ? (
                <AllClear message="No block above low pressure." />
              ) : (
                <div className="space-y-3">
                  {blocks
                    .filter((b) => b.pressure === "high" || b.pressure === "medium")
                    .sort((a, b) => b.avg_severity - a.avg_severity)
                    .slice(0, 6)
                    .map((b) => (
                      <div
                        key={b.greenhouse_id}
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-2xl font-bold">{b.name}</p>
                          <p className="text-base text-white/45">
                            {b.records} records · {b.over_threshold} over ETL
                          </p>
                        </div>
                        <div className="h-3 w-40 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(8, (b.avg_severity / 5) * 100)}%`,
                              backgroundColor: PRESSURE_HEX[b.pressure],
                            }}
                          />
                        </div>
                        <span
                          className="w-14 shrink-0 text-right text-3xl font-bold tabular-nums"
                          style={{ color: PRESSURE_HEX[b.pressure] }}
                        >
                          {b.avg_severity.toFixed(1)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {scene === "activity" && (
          <div className="grid h-full grid-cols-2 gap-8">
            <div className="min-h-0">
              <SceneLabel>
                <Users size={15} className="mr-1.5 inline" />
                Scouts · last 14 days
              </SceneLabel>
              <div className="space-y-3">
                {(scouts.data ?? []).slice(0, 6).map((s, i) => (
                  <div
                    key={s.scout_id}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-lg font-bold text-brand-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-2xl font-bold">{s.name}</p>
                      <p className="text-base text-white/45">
                        {s.greenhouses_visited} greenhouse
                        {s.greenhouses_visited === 1 ? "" : "s"} visited
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold tabular-nums text-brand-400">
                        {s.records}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-white/35">
                        records
                      </p>
                    </div>
                  </div>
                ))}
                {(scouts.data ?? []).length === 0 && (
                  <p className="text-xl text-white/40">No scout activity in range.</p>
                )}
              </div>
            </div>

            <div className="min-h-0">
              <SceneLabel>Latest observations</SceneLabel>
              <div className="space-y-2.5">
                {(scouting.data ?? []).slice(0, 7).map((s) => {
                  const target =
                    s.disease_id != null
                      ? (diseaseName.get(s.disease_id) ?? "Disease")
                      : s.pest_id != null
                        ? (pestName.get(s.pest_id) ?? "Pest")
                        : SCOUTING_LABEL[s.scouting_for];
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3"
                      style={{ borderLeft: `4px solid ${severityHex(s.severity)}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xl font-bold">{target}</p>
                        <p className="text-sm text-white/45">
                          {s.greenhouse_id ? (ghName.get(s.greenhouse_id) ?? "—") : "—"}
                          {s.bed_code && ` · Bed ${s.bed_code}`}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-2xl font-bold tabular-nums"
                        style={{ color: severityHex(s.severity) }}
                      >
                        {s.severity}
                      </span>
                    </div>
                  );
                })}
                {(scouting.data ?? []).length === 0 && (
                  <p className="text-xl text-white/40">No observations in range.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {scene === "trend" && <TrendScene data={trend.data ?? []} />}
      </main>

      {/* ── Rotation indicator ── */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-white/10 px-10 py-4">
        {SCENES.map((s, i) => (
          <div
            key={s}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className={
                i === sceneIdx
                  ? "h-full rounded-full bg-brand-400"
                  : "h-full rounded-full bg-transparent"
              }
              style={
                i === sceneIdx
                  ? { animation: `tv-progress ${ROTATE_MS}ms linear` }
                  : undefined
              }
            />
          </div>
        ))}
        <span className="ml-2 shrink-0 text-xs text-white/25">
          {sceneIdx + 1} / {SCENES.length}
        </span>
      </footer>
    </div>
  );
}

/** Big trend bars — custom SVG so it reads at TV distance. */
function TrendScene({
  data,
}: {
  data: { date: string; records: number; avg_severity: number; over_threshold: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-2xl text-white/40">
        No trend data in range.
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.records), 1);

  return (
    <div className="flex h-full flex-col">
      <SceneLabel>Records per day · bar colour shows average severity</SceneLabel>
      <div className="flex min-h-0 flex-1 items-end gap-2">
        {data.map((d) => {
          const h = (d.records / max) * 100;
          const color = severityHex(Math.round(d.avg_severity));
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col justify-end gap-2">
              <p className="text-center text-lg font-bold tabular-nums text-white/80">
                {d.records || ""}
              </p>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${Math.max(h, d.records ? 3 : 0)}%`,
                  backgroundColor: color,
                }}
              />
              <p className="text-center text-xs text-white/35">
                {new Date(d.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center gap-5 border-t border-white/10 pt-4">
        <span className="text-sm text-white/40">Average severity:</span>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="flex items-center gap-2 text-sm text-white/60">
            <span
              className="h-4 w-4 rounded"
              style={{ backgroundColor: severityHex(s) }}
            />
            {s}
          </span>
        ))}
        <span className="text-sm text-white/30">0 clean → 5 severe</span>
      </div>
    </div>
  );
}

function BigStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-white/40">
        <Icon size={15} /> {label}
      </p>
      <p
        className="mt-2 text-6xl font-bold tabular-nums leading-none"
        style={{ color: tone ?? "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}

function SceneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-white/35">
      {children}
    </p>
  );
}

function AllClear({ message }: { message: string }) {
  return (
    <div className="flex h-4/5 flex-col items-center justify-center gap-4 rounded-2xl border border-brand-500/20 bg-brand-500/5">
      <ShieldCheck size={56} className="text-brand-400" />
      <p className="text-3xl font-bold text-brand-400">All clear</p>
      <p className="text-lg text-white/40">{message}</p>
    </div>
  );
}
