"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  ClipboardList,
  Gauge,
  MapPin,
  Scissors,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isoDaysAgo } from "@/components/FilterBar";
import { LogoLockup } from "@/components/Logo";
import {
  PRESSURE_HEX,
  PRESSURE_LABEL,
  SCOUTING_LABEL,
  bedLabel,
  severityHex,
} from "@/lib/format";
import {
  useDiseases,
  useGreenhouses,
  usePests,
  usePressure,
  useRecommendations,
  useScouting,
  useScoutSummary,
  useSpray,
  useSummary,
  useTrend,
} from "@/lib/hooks";
import type { Filters, GreenhousePressure } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────────────
   Farm wallboard — a read-only, full-screen display for an office TV.

   Two principles drive the design:

   1. It is read from across a room, by someone walking past. Type is large,
      contrast is high, and nothing that matters is set below white/50.
   2. It shows *what needs a decision*, not everything that could be shown.
      Scenes with nothing to say are skipped rather than filling the screen
      with "All clear" for eighteen seconds.
   ───────────────────────────────────────────────────────────────────────── */

const ROTATE_MS = 18_000;
const REFRESH_MS = 60_000;
/** Past this without a successful refresh, the board stops claiming it's live. */
const STALE_MS = 5 * 60_000;

const SCENES = ["pressure", "attention", "holds", "activity", "trend"] as const;
type Scene = (typeof SCENES)[number];

const SCENE_TITLE: Record<Scene, string> = {
  pressure: "Farm pressure",
  attention: "Needs attention",
  holds: "Re-entry & harvest holds",
  activity: "Scouting activity",
  trend: "14-day trend",
};

/** A block that can't be entered or cut yet, and why. */
interface Hold {
  block: string;
  reentryUntil: number | null;
  harvestUntil: string | null;
  product: string;
}

export default function TvPage() {
  const qc = useQueryClient();
  const [sceneIdx, setSceneIdx] = useState(0);
  const [clock, setClock] = useState("");
  const [today, setToday] = useState("");
  const [lastSync, setLastSync] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

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
  const spray = useSpray(1000);

  // Clock ticks locally; set after mount so SSR markup matches.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getTime());
      setClock(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setToday(
        d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
      );
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Periodic data refresh — the board runs unattended for days.
  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries().then(() => setLastSync(Date.now()));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [qc]);

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);
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

  const openRecs = useMemo(
    () => (recs.data ?? []).filter((r) => r.status === "open" || r.status === "planned"),
    [recs.data],
  );

  /** Worst first — a wallboard should lead with the block that needs a decision. */
  const blocks = useMemo(() => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
    return [...(pressure.data ?? [])].sort(
      (a, b) =>
        (rank[a.pressure] ?? 9) - (rank[b.pressure] ?? 9) ||
        b.avg_severity - a.avg_severity,
    );
  }, [pressure.data]);
  const highCount = blocks.filter((b) => b.pressure === "high").length;
  const flagged = useMemo(
    () => blocks.filter((b) => b.pressure === "high" || b.pressure === "medium"),
    [blocks],
  );

  /**
   * Re-entry and harvest holds.
   *
   * The most time-critical thing on a flower farm, and the one a wallboard is
   * genuinely good for: nobody should walk into a block still inside its
   * re-entry interval, and nobody should cut from one still inside its PHI.
   */
  const holds = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const byBlock = new Map<string, Hold>();
    for (const r of spray.data ?? []) {
      if (r.greenhouse_id == null) continue;
      const block = ghName.get(r.greenhouse_id) ?? `GH#${r.greenhouse_id}`;
      const applied = new Date(r.start_date ?? r.recorded_at).getTime();
      const reiHours = Number(r.rei);
      const reentry =
        Number.isFinite(reiHours) && reiHours > 0 ? applied + reiHours * 3_600_000 : null;
      const harvest =
        r.safe_harvest_date && r.safe_harvest_date > todayIso ? r.safe_harvest_date : null;
      if ((reentry == null || reentry <= now) && harvest == null) continue;

      const cur = byBlock.get(block);
      byBlock.set(block, {
        block,
        reentryUntil: Math.max(cur?.reentryUntil ?? 0, reentry ?? 0) || null,
        harvestUntil:
          [cur?.harvestUntil, harvest].filter(Boolean).sort().at(-1) ?? null,
        product: r.product ?? cur?.product ?? "—",
      });
    }
    return [...byBlock.values()].sort(
      (a, b) => (b.reentryUntil ?? 0) - (a.reentryUntil ?? 0),
    );
  }, [spray.data, ghName, now]);

  const activeReentry = useMemo(
    () => holds.filter((h) => h.reentryUntil != null && h.reentryUntil > now),
    [holds, now],
  );

  /**
   * Only rotate through scenes that have something to say. A board stuck on
   * an empty panel teaches people to stop looking at it.
   */
  const liveScenes = useMemo(() => {
    const has: Record<Scene, boolean> = {
      pressure: blocks.length > 0,
      attention: openRecs.length > 0 || flagged.length > 0,
      holds: holds.length > 0,
      activity: (scouts.data ?? []).length > 0 || (scouting.data ?? []).length > 0,
      trend: (trend.data ?? []).length > 0,
    };
    const live = SCENES.filter((s) => has[s]);
    return live.length ? live : (["pressure"] as Scene[]);
  }, [blocks, openRecs, flagged, holds, scouts.data, scouting.data, trend.data]);

  const advance = useCallback(
    () => setSceneIdx((i) => (i + 1) % liveScenes.length),
    [liveScenes.length],
  );
  useEffect(() => {
    const id = setInterval(advance, ROTATE_MS);
    return () => clearInterval(id);
  }, [advance]);

  const activeIdx = sceneIdx % liveScenes.length;
  const scene = liveScenes[activeIdx]!;
  const stale = now - lastSync > STALE_MS;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#04140d] text-white">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/15 px-10 py-5">
        <div className="flex items-center gap-5">
          <LogoLockup width={132} tone="light" />
          <p className="flex items-center gap-1.5 border-l border-white/15 pl-5 text-base text-white/70">
            <MapPin size={15} /> Naivasha Rose Estate
          </p>
        </div>

        <p className="text-3xl font-bold tracking-tight">{SCENE_TITLE[scene]}</p>

        <div className="text-right">
          <p className="text-5xl font-bold tabular-nums leading-none">{clock}</p>
          <p className="mt-1.5 text-base text-white/60">{today}</p>
          {stale ? (
            <p className="mt-1.5 flex items-center justify-end gap-1.5 text-sm font-bold text-amber-400">
              <WifiOff size={14} /> Data may be stale
            </p>
          ) : (
            <p className="mt-1.5 flex items-center justify-end gap-1.5 text-sm text-white/50">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              Live
            </p>
          )}
        </div>
      </header>

      {/* A re-entry hold is a safety matter — it rides above every scene. */}
      {activeReentry.length > 0 && scene !== "holds" && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-10 py-2.5">
          <AlertTriangle size={18} className="shrink-0 text-amber-300" />
          <p className="text-lg font-bold text-amber-200">
            Do not enter: {activeReentry.map((h) => h.block).join(", ")}
          </p>
          <span className="text-base text-amber-200/70">
            re-entry interval still running
          </span>
        </div>
      )}

      {/* ── Scene body ── */}
      <main className="min-h-0 flex-1 overflow-hidden px-10 py-7">
        {scene === "pressure" && (
          <div className="flex h-full flex-col gap-6">
            <div className="grid shrink-0 grid-cols-4 gap-5">
              <BigStat
                icon={ClipboardList}
                label="Records · 14 days"
                value={summary.data?.records.value.toLocaleString() ?? "—"}
                delta={summary.data?.records.delta_pct}
              />
              <BigStat
                icon={Gauge}
                label="Average severity"
                value={summary.data?.avg_severity.value.toFixed(1) ?? "—"}
                delta={summary.data?.avg_severity.delta_pct}
                deltaGoodWhenDown
                tone={(summary.data?.avg_severity.value ?? 0) >= 3 ? "#f87171" : "#34d399"}
              />
              <BigStat
                icon={AlertTriangle}
                label="Over threshold"
                value={summary.data?.over_threshold.value.toLocaleString() ?? "—"}
                delta={summary.data?.over_threshold.delta_pct}
                deltaGoodWhenDown
                tone={(summary.data?.over_threshold.value ?? 0) > 0 ? "#f87171" : "#34d399"}
              />
              <BigStat
                icon={Bug}
                label="Open recommendations"
                value={summary.data?.open_recommendations.toLocaleString() ?? "—"}
                tone={openRecs.length > 0 ? "#fbbf24" : "#34d399"}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <SceneLabel>
                Greenhouse pressure · {highCount} block{highCount === 1 ? "" : "s"} high ·
                worst first
              </SceneLabel>
              <div className="grid grid-cols-6 gap-4 2xl:grid-cols-8">
                {blocks.slice(0, 16).map((b) => (
                  <BlockTile key={b.greenhouse_id} block={b} />
                ))}
                {blocks.length === 0 && (
                  <p className="col-span-full text-2xl text-white/60">
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
                        className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4"
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
                          <p className="text-base text-white/60">
                            {r.greenhouse_id ? (ghName.get(r.greenhouse_id) ?? "—") : "—"}
                            {r.bed_code && ` · ${bedLabel(r.bed_code)}`}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold uppercase"
                          style={{
                            backgroundColor:
                              r.status === "open" ? "#dc262640" : "#f59e0b40",
                            color: r.status === "open" ? "#fca5a5" : "#fcd34d",
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
              {flagged.length === 0 ? (
                <AllClear message="No block above low pressure." />
              ) : (
                <div className="space-y-3">
                  {flagged.slice(0, 5).map((b) => (
                    <div
                      key={b.greenhouse_id}
                      className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4"
                    >
                      <div className="flex items-center gap-4">
                        <p className="min-w-0 flex-1 truncate text-2xl font-bold">
                          {b.name}
                        </p>
                        <div className="h-3 w-36 overflow-hidden rounded-full bg-white/15">
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
                      {/* The engine's own sentence — pests and diseases are
                          never blended, so this names the actual culprit. */}
                      {b.headline && (
                        <p className="mt-1.5 text-lg font-semibold text-white/85">
                          {b.headline}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {scene === "holds" && (
          <div className="flex h-full flex-col">
            <SceneLabel>
              Blocks locked by re-entry or pre-harvest intervals · {holds.length}
            </SceneLabel>
            {holds.length === 0 ? (
              <AllClear message="Every block is clear to enter and cut." />
            ) : (
              <div className="grid grid-cols-2 gap-4 2xl:grid-cols-3">
                {holds.slice(0, 12).map((h) => {
                  const reentryActive = h.reentryUntil != null && h.reentryUntil > now;
                  const hoursLeft = reentryActive
                    ? Math.ceil((h.reentryUntil! - now) / 3_600_000)
                    : 0;
                  return (
                    <div
                      key={h.block}
                      className="rounded-2xl border px-6 py-5"
                      style={{
                        borderColor: reentryActive ? "#fbbf2466" : "#ffffff26",
                        backgroundColor: reentryActive ? "#fbbf241a" : "#ffffff0f",
                      }}
                    >
                      <p className="text-3xl font-bold">{h.block}</p>
                      <p className="mt-1 truncate text-base text-white/60">{h.product}</p>
                      <div className="mt-4 space-y-2">
                        <HoldRow
                          icon={<AlertTriangle size={18} />}
                          label="Re-entry"
                          value={reentryActive ? `${hoursLeft}h remaining` : "Clear"}
                          alert={reentryActive}
                        />
                        <HoldRow
                          icon={<Scissors size={18} />}
                          label="Harvest"
                          value={
                            h.harvestUntil
                              ? `from ${new Date(h.harvestUntil).toLocaleDateString(
                                  "en-GB",
                                  { day: "numeric", month: "short" },
                                )}`
                              : "Clear"
                          }
                          alert={!!h.harvestUntil}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                    className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/25 text-lg font-bold text-brand-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-2xl font-bold">{s.name}</p>
                      <p className="text-base text-white/60">
                        {s.greenhouses_visited} greenhouse
                        {s.greenhouses_visited === 1 ? "" : "s"} · {s.beds_visited} beds
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold tabular-nums text-brand-400">
                        {s.records}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-white/50">
                        records
                      </p>
                    </div>
                  </div>
                ))}
                {(scouts.data ?? []).length === 0 && (
                  <p className="text-2xl text-white/60">No scout activity in range.</p>
                )}
              </div>
            </div>

            <div className="min-h-0">
              <SceneLabel>Latest findings</SceneLabel>
              <div className="space-y-2.5">
                {(scouting.data ?? [])
                  .filter((s) => s.severity > 0)
                  .slice(0, 7)
                  .map((s) => {
                    const target =
                      s.disease_id != null
                        ? (diseaseName.get(s.disease_id) ?? "Disease")
                        : s.pest_id != null
                          ? (pestName.get(s.pest_id) ?? "Pest")
                          : SCOUTING_LABEL[s.scouting_for];
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3"
                        style={{ borderLeft: `4px solid ${severityHex(s.severity)}` }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xl font-bold">{target}</p>
                          <p className="text-sm text-white/60">
                            {s.greenhouse_id ? (ghName.get(s.greenhouse_id) ?? "—") : "—"}
                            {s.bed_code && ` · ${bedLabel(s.bed_code)}`}
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
                {(scouting.data ?? []).filter((s) => s.severity > 0).length === 0 && (
                  <AllClear message="Every bed walked came back clean." />
                )}
              </div>
            </div>
          </div>
        )}

        {scene === "trend" && <TrendScene data={trend.data ?? []} />}
      </main>

      {/* ── Rotation indicator ── */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-white/15 px-10 py-4">
        {liveScenes.map((s, i) => (
          <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className={
                i === activeIdx
                  ? "h-full rounded-full bg-brand-400"
                  : "h-full rounded-full bg-transparent"
              }
              style={
                i === activeIdx
                  ? { animation: `tv-progress ${ROTATE_MS}ms linear` }
                  : undefined
              }
            />
          </div>
        ))}
        <span className="ml-2 shrink-0 text-sm text-white/45">
          {activeIdx + 1}/{liveScenes.length}
        </span>
      </footer>
    </div>
  );
}

/**
 * One block. The headline is the point — "Powdery Mildew severity 4 on Bed 9"
 * tells a manager what to do; a blended average across every pest and disease
 * does not, and contradicts the model the rest of the product runs on.
 */
function BlockTile({ block: b }: { block: GreenhousePressure }) {
  const hex = PRESSURE_HEX[b.pressure];
  const urgent = b.pressure === "high";
  return (
    <div
      className="flex flex-col rounded-2xl border p-4"
      style={{
        backgroundColor: `${hex}${urgent ? "2e" : "1a"}`,
        borderColor: `${hex}${urgent ? "99" : "4d"}`,
      }}
    >
      <p className="truncate text-lg font-bold">{b.name}</p>
      <p
        className="mt-1 text-4xl font-bold tabular-nums leading-none"
        style={{ color: hex }}
      >
        {b.avg_severity.toFixed(1)}
      </p>
      <p
        className="mt-2 text-xs font-bold uppercase tracking-wide"
        style={{ color: hex }}
      >
        {PRESSURE_LABEL[b.pressure]}
      </p>
      {b.headline ? (
        <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-white/80">
          {b.headline}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] text-white/50">{b.records} records</p>
      )}
    </div>
  );
}

function HoldRow({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  alert: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={alert ? "text-amber-300" : "text-white/40"}>{icon}</span>
      <span className="text-base text-white/60">{label}</span>
      <span
        className={`ml-auto text-lg font-bold ${
          alert ? "text-amber-200" : "text-white/50"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Big trend bars — plain layout so it reads at TV distance. */
function TrendScene({
  data,
}: {
  data: { date: string; records: number; avg_severity: number; over_threshold: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-2xl text-white/60">
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
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col justify-end gap-2">
              <p className="text-center text-lg font-bold tabular-nums text-white/90">
                {d.records || ""}
              </p>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${Math.max(h, d.records ? 3 : 0)}%`,
                  backgroundColor: severityHex(Math.round(d.avg_severity)),
                }}
              />
              <p className="text-center text-xs text-white/50">
                {new Date(d.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center gap-5 border-t border-white/15 pt-4">
        <span className="text-sm text-white/60">Average severity:</span>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="flex items-center gap-2 text-sm text-white/75">
            <span className="h-4 w-4 rounded" style={{ backgroundColor: severityHex(s) }} />
            {s}
          </span>
        ))}
        <span className="text-sm text-white/50">0 clean → 5 severe</span>
      </div>
    </div>
  );
}

function BigStat({
  icon: Icon,
  label,
  value,
  tone,
  delta,
  deltaGoodWhenDown,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone?: string;
  /** Percentage change vs the previous period, already in the summary. */
  delta?: number | null;
  /** For severity and breaches, falling is the good direction. */
  deltaGoodWhenDown?: boolean;
}) {
  const show = delta != null && Math.abs(delta) >= 1;
  const rising = (delta ?? 0) > 0;
  const good = deltaGoodWhenDown ? !rising : rising;
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-5">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-white/60">
        <Icon size={15} /> {label}
      </p>
      <div className="mt-2 flex items-end gap-3">
        <p
          className="text-6xl font-bold tabular-nums leading-none"
          style={{ color: tone ?? "#ffffff" }}
        >
          {value}
        </p>
        {show && (
          <span
            className={`flex items-center gap-1 pb-1 text-lg font-bold ${
              good ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {rising ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            {Math.abs(delta!).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-white/45">
        {show ? "vs previous 14 days" : " "}
      </p>
    </div>
  );
}

function SceneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-white/55">
      {children}
    </p>
  );
}

function AllClear({ message }: { message: string }) {
  return (
    <div className="flex h-4/5 flex-col items-center justify-center gap-4 rounded-2xl border border-brand-500/25 bg-brand-500/10">
      <ShieldCheck size={56} className="text-brand-400" />
      <p className="text-3xl font-bold text-brand-400">All clear</p>
      <p className="text-lg text-white/60">{message}</p>
    </div>
  );
}
