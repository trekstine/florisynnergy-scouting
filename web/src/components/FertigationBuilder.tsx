"use client";

import { AlertTriangle, Beaker, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, ErrorBox, Field, Select, TextInput } from "@/components/ui";
import { money } from "@/lib/format";
import {
  useEmployees,
  useFertilisers,
  useGreenhouses,
  usePhases,
  useSaveFertigation,
} from "@/lib/hooks";
import type {
  FertActivity,
  Fertigation,
  FertigationBody,
  FertigationSource,
  FertigationTank,
} from "@/lib/types";

const ACTIVITIES: { id: FertActivity; label: string }[] = [
  { id: "fertigation", label: "Fertigation" },
  { id: "drenching", label: "Drenching" },
  { id: "flushing", label: "Flushing" },
];

const SOURCES = ["Borehole", "River", "Reservoir", "Mix"];
const APPLICATION_TYPES = ["Drip", "Drench", "Overhead", "Flush"];

function defaultTanks(): FertigationTank[] {
  return [
    { code: "A", volume_l: 1000, sets_mode: "auto", sets: 1, note: null, lines: [] },
    { code: "B", volume_l: 1000, sets_mode: "auto", sets: 1, note: null, lines: [] },
    { code: "C", volume_l: 500, sets_mode: "auto", sets: 1, note: null, lines: [] },
  ];
}

/**
 * Create or correct a fertigation sheet.
 *
 * Ordered by what depends on what, because the previous layout was not: the
 * area comes from the blocks, but the blocks sat below the water fields that
 * divide by it, so you picked blocks at the bottom, scrolled up to check the
 * area, then back down. The chain is blocks → area → water → sets → cost, and
 * the form now runs in that order with the running totals pinned at the top,
 * so nothing needs scrolling back to.
 */
export function FertigationBuilder({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Fertigation | null;
  onSaved?: (docId: string) => void;
}) {
  const save = useSaveFertigation();
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const fertilisers = useFertilisers();
  const phases = usePhases();

  const today = new Date().toISOString().slice(0, 10);

  const [activity, setActivity] = useState<FertActivity>("fertigation");
  const [eventDate, setEventDate] = useState(today);
  const [startTime, setStartTime] = useState("07:00");
  const [phaseId, setPhaseId] = useState("");
  const [blockIds, setBlockIds] = useState<number[]>([]);
  const [blockVolumes, setBlockVolumes] = useState<Record<number, string>>({});
  const [perBlock, setPerBlock] = useState(false);
  const [applicationType, setApplicationType] = useState(APPLICATION_TYPES[0]!);
  const [volume, setVolume] = useState("");
  const [area, setArea] = useState("");
  const [target, setTarget] = useState("");
  const [weather, setWeather] = useState("");
  const [fertRate, setFertRate] = useState("6");
  const [acidRate, setAcidRate] = useState("2");
  const [applicator, setApplicator] = useState("");
  const [comments, setComments] = useState("");
  const [tanks, setTanks] = useState<FertigationTank[]>(defaultTanks());
  const [sources, setSources] = useState<FertigationSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setActivity(editing.activity);
      setEventDate(editing.event_date.slice(0, 10));
      setStartTime(editing.start_time ?? "07:00");
      setPhaseId(editing.phase_id ? String(editing.phase_id) : "");
      // Guarded: a response missing one of these must not white-screen the
      // form. An API a version behind, or a partial payload, should cost a
      // blank field — not the whole dialog.
      const blocks = editing.blocks ?? [];
      setBlockIds(
        blocks.map((b) => b.greenhouse_id).filter((x): x is number => x != null),
      );
      const vols = Object.fromEntries(
        blocks
          .filter((b) => b.greenhouse_id != null && b.volume_m3 != null)
          .map((b) => [b.greenhouse_id as number, String(b.volume_m3)]),
      );
      setBlockVolumes(vols);
      setPerBlock(Object.keys(vols).length > 0);
      setApplicationType(editing.type_of_application ?? APPLICATION_TYPES[0]!);
      setVolume(editing.volume_m3 != null ? String(editing.volume_m3) : "");
      setArea(editing.area_ha != null ? String(editing.area_ha) : "");
      setTarget(editing.target_m3_per_ha != null ? String(editing.target_m3_per_ha) : "");
      setWeather(editing.weather ?? "");
      setFertRate(String(editing.fertiliser_rate_l_m3));
      setAcidRate(String(editing.acid_rate_l_m3));
      setApplicator(editing.applicator_id ? String(editing.applicator_id) : "");
      setComments(editing.comments ?? "");
      setTanks(editing.tanks?.length ? editing.tanks : defaultTanks());
      setSources(editing.sources ?? []);
    } else {
      setActivity("fertigation");
      setEventDate(today);
      setStartTime("07:00");
      setPhaseId("");
      setBlockIds([]);
      setBlockVolumes({});
      setPerBlock(false);
      setApplicationType(APPLICATION_TYPES[0]!);
      setVolume("");
      setArea("");
      setTarget("");
      setWeather("");
      setFertRate("6");
      setAcidRate("2");
      setApplicator("");
      setComments("");
      setTanks(defaultTanks());
      setSources([]);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.doc_id]);

  const allHouses = useMemo(() => greenhouses.data ?? [], [greenhouses.data]);
  const selectedPhase = (phases.data ?? []).find((p) => p.id === Number(phaseId));
  const offered = useMemo(
    () =>
      selectedPhase
        ? allHouses.filter((g) => selectedPhase.greenhouse_ids.includes(g.id))
        : allHouses,
    [allHouses, selectedPhase],
  );

  const selectedArea = useMemo(
    () =>
      Math.round(
        allHouses
          .filter((g) => blockIds.includes(g.id))
          .reduce((s, g) => s + Number(g.area_ha ?? 0), 0) * 10000,
      ) / 10000,
    [allHouses, blockIds],
  );

  const volumeNum = Number(volume) || 0;
  const areaNum = Number(area) || selectedArea || 0;
  const fertRateNum = Number(fertRate) || 0;
  const acidRateNum = Number(acidRate) || 0;

  /** Mirrors the server exactly, so the running totals cannot mislead. */
  const d = useMemo(() => {
    const stock = Math.round(volumeNum * fertRateNum * 100) / 100;
    const acid = Math.round(volumeNum * acidRateNum * 100) / 100;

    // Which rate a tank is dosed at follows what is in it, not its letter.
    const isAcid = (t: FertigationTank) => t.lines.some((l) => l.is_acid);
    const implied = (t: FertigationTank) =>
      t.volume_l > 0
        ? Math.round(((isAcid(t) ? acid : stock) / t.volume_l) * 1000) / 1000
        : 0;
    const sets = (t: FertigationTank) => {
      if (t.sets_mode === "manual") return Math.max(t.sets, 0);
      const n = implied(t);
      return n > 0 ? n : Math.max(t.sets, 0);
    };

    const cost = tanks.reduce(
      (s, t) =>
        s + t.lines.reduce((ls, l) => ls + (l.unit_price ?? 0) * l.quantity * sets(t), 0),
      0,
    );
    const planned =
      Number(target) > 0 && areaNum > 0
        ? Math.round(Number(target) * areaNum * 100) / 100
        : null;
    const srcTotal =
      Math.round(sources.reduce((s, x) => s + (x.volume_m3 ?? 0), 0) * 100) / 100;

    return {
      stock,
      acid,
      isAcid,
      implied,
      sets,
      cost: Math.round(cost * 100) / 100,
      perHa: areaNum ? Math.round((volumeNum / areaNum) * 100) / 100 : null,
      planned,
      srcTotal,
      srcGap:
        volumeNum > 0 && srcTotal > 0 && Math.abs(srcTotal - volumeNum) >= 0.5
          ? Math.round((srcTotal - volumeNum) * 100) / 100
          : null,
    };
  }, [volumeNum, areaNum, fertRateNum, acidRateNum, tanks, sources, target]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const t of tanks) {
      const codes = t.lines
        .filter((l) => l.quantity > 0)
        .map((l) => l.fertiliser_code.toUpperCase().replace(/\s/g, ""));
      const ca = codes.filter((c) => c.includes("CA") && !c.startsWith("CU"));
      const so4 = codes.filter(
        (c) => c.includes("SO4") || c.includes("PO4") || c.includes("MKP"),
      );
      if (ca.length && so4.length) {
        out.push(
          `Tank ${t.code}: ${ca.join(", ")} with ${so4.join(", ")} will precipitate. Separate tanks.`,
        );
      }
    }
    return out;
  }, [tanks]);

  if (!open) return null;

  function setTank(i: number, patch: Partial<FertigationTank>) {
    setTanks((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  function addLine(ti: number, id: string) {
    const f = (fertilisers.data ?? []).find((x) => x.id === Number(id));
    if (!f) return;
    setTanks((prev) =>
      prev.map((t, i) =>
        i !== ti || t.lines.some((l) => l.fertiliser_id === f.id)
          ? t
          : {
              ...t,
              lines: [
                ...t.lines,
                {
                  fertiliser_id: f.id,
                  fertiliser_code: f.code,
                  fertiliser_name: f.name,
                  quantity: 0,
                  unit: f.unit,
                  position: t.lines.length,
                  is_acid: f.is_acid,
                  unit_price: f.price_per_unit,
                },
              ],
            },
      ),
    );
  }

  async function submit() {
    if (!eventDate) return setError("Pick a date.");
    if (!tanks.some((t) => t.lines.some((l) => l.quantity > 0)))
      return setError("Add at least one fertiliser with a quantity.");
    setError(null);

    const body: FertigationBody = {
      activity,
      event_date: eventDate,
      start_time: startTime || null,
      phase_id: phaseId ? Number(phaseId) : null,
      blocks: blockIds.map((id) => ({
        greenhouse_id: id,
        volume_m3: perBlock && blockVolumes[id] ? Number(blockVolumes[id]) : null,
      })),
      type_of_application: applicationType,
      volume_m3: volumeNum || null,
      area_ha: area ? Number(area) : null,
      target_m3_per_ha: target ? Number(target) : null,
      weather: weather || null,
      fertiliser_rate_l_m3: fertRateNum,
      acid_rate_l_m3: acidRateNum,
      applicator_id: applicator ? Number(applicator) : null,
      comments: comments || null,
      status: editing?.status ?? "draft",
      tanks: tanks
        .filter((t) => t.lines.length > 0)
        .map((t) => ({
          code: t.code,
          volume_l: t.volume_l,
          sets_mode: t.sets_mode ?? "auto",
          sets: t.sets,
          note: t.note,
          lines: t.lines.map((l, i) => ({
            fertiliser_id: l.fertiliser_id,
            fertiliser_code: l.fertiliser_code,
            fertiliser_name: l.fertiliser_name,
            quantity: l.quantity,
            unit: l.unit,
            position: i,
          })),
        })),
      sources: sources.filter((s) => s.source),
    };

    try {
      const saved = await save.mutateAsync({ docId: editing?.doc_id, body });
      onSaved?.(saved.doc_id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  const available = fertilisers.data ?? [];

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[93vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-ink">
            {editing ? "Edit fertigation sheet" : "New fertigation sheet"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Running totals, pinned. Every figure below feeds one of these, so
            there is never a reason to scroll back up to check one. */}
        <div className="grid grid-cols-3 gap-px border-b border-line bg-line sm:grid-cols-5">
          <Stat label="Area" value={areaNum ? `${areaNum} ha` : "—"} />
          <Stat label="Water" value={volumeNum ? `${volumeNum} m³` : "—"} />
          <Stat label="m³/ha" value={d.perHa != null ? String(d.perHa) : "—"} />
          <Stat label="Stock" value={d.stock ? `${d.stock} L` : "—"} />
          <Stat label="Cost" value={d.cost ? money(d.cost) : "—"} strong />
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-auto px-6 py-6">
          <ErrorBox message={error} />

          {/* ── 1. Where ── */}
          <Step n={1} title="Where and when">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Activity">
                <Select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as FertActivity)}
                >
                  {ACTIVITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <TextInput
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </Field>
              <Field label="Start time">
                <TextInput
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="Phase">
                <Select
                  value={phaseId}
                  onChange={(e) => {
                    setPhaseId(e.target.value);
                    const p = (phases.data ?? []).find(
                      (x) => x.id === Number(e.target.value),
                    );
                    setBlockIds(p ? [...p.greenhouse_ids] : []);
                  }}
                >
                  <option value="">No phase</option>
                  {(phases.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center gap-3 text-sm">
                <span className="font-semibold text-ink-soft">Greenhouses</span>
                <span className="text-ink-faint">
                  {blockIds.length} selected · {selectedArea} ha
                </span>
                {offered.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBlockIds(
                        blockIds.length === offered.length ? [] : offered.map((g) => g.id),
                      )
                    }
                    className="ml-auto font-semibold text-brand-700 hover:underline"
                  >
                    {blockIds.length === offered.length ? "None" : "All"}
                  </button>
                )}
              </div>

              {offered.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-faint">
                  No greenhouses on this phase. Map them under Settings.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {offered.map((g) => {
                    const on = blockIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setBlockIds((p) =>
                            on ? p.filter((x) => x !== g.id) : [...p, g.id],
                          )
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          on
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-line text-ink-soft hover:border-ink-faint"
                        }`}
                      >
                        {g.name}
                        <span className="ml-2 text-xs text-ink-faint">
                          {g.area_ha ?? "—"} ha
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Step>

          {/* ── 2. Water — needs the area from step 1 ── */}
          <Step n={2} title="Water">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Target m³/ha">
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="33.33"
                />
              </Field>
              <Field label="Water applied (m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder={d.planned ? String(d.planned) : "835"}
                />
              </Field>
              <Field label="Area (ha)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.001"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder={selectedArea ? String(selectedArea) : "from blocks"}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={applicationType}
                  onChange={(e) => setApplicationType(e.target.value)}
                >
                  {APPLICATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {d.planned != null && (
              <Note tone={volumeNum && Math.abs(d.planned - volumeNum) >= 0.5 ? "warn" : "flat"}>
                {target} × {areaNum} ha = <strong>{d.planned} m³</strong>
                {volumeNum > 0 && Math.abs(d.planned - volumeNum) >= 0.5 && (
                  <> · {volumeNum} recorded</>
                )}{" "}
                <button
                  type="button"
                  onClick={() => setVolume(String(d.planned))}
                  className="font-semibold underline"
                >
                  use
                </button>
              </Note>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Fertiliser injection (L/m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.1"
                  value={fertRate}
                  onChange={(e) => setFertRate(e.target.value)}
                />
              </Field>
              <Field label="Acid injection (L/m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.1"
                  value={acidRate}
                  onChange={(e) => setAcidRate(e.target.value)}
                />
              </Field>
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center gap-3 text-sm">
                <span className="font-semibold text-ink-soft">Sources</span>
                {sources.length > 0 && (
                  <span
                    className={d.srcGap ? "font-semibold text-amber-700" : "text-ink-faint"}
                  >
                    {d.srcTotal} m³
                    {d.srcGap ? ` · ${d.srcGap > 0 ? "+" : ""}${d.srcGap} vs applied` : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSources((p) => [
                      ...p,
                      { source: SOURCES[0]!, volume_m3: null, ec: null, ph: null, note: null },
                    ])
                  }
                  className="ml-auto flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                >
                  <Plus size={11} /> Add
                </button>
              </div>

              {sources.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="pb-2 font-semibold">Source</th>
                      <th className="pb-2 font-semibold">m³</th>
                      <th className="pb-2 font-semibold">EC</th>
                      <th className="pb-2 font-semibold">pH</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-2">
                          <Select
                            value={s.source}
                            onChange={(e) =>
                              setSources((p) =>
                                p.map((x, j) =>
                                  j === i ? { ...x, source: e.target.value } : x,
                                ),
                              )
                            }
                            className=""
                          >
                            {SOURCES.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </Select>
                        </td>
                        {(["volume_m3", "ec", "ph"] as const).map((k) => (
                          <td key={k} className="py-2 pr-2">
                            <TextInput
                              type="number"
                              step="0.01"
                              value={s[k] ?? ""}
                              onChange={(e) =>
                                setSources((p) =>
                                  p.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          [k]: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : x,
                                  ),
                                )
                              }
                              className="!w-28"
                            />
                          </td>
                        ))}
                        <td className="py-2">
                          <button
                            onClick={() => setSources((p) => p.filter((_, j) => j !== i))}
                            className="text-ink-faint hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {blockIds.length > 1 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
                <input
                  type="checkbox"
                  checked={perBlock}
                  onChange={(e) => setPerBlock(e.target.checked)}
                />
                Meter each greenhouse separately
              </label>
            )}
            {perBlock && (
              <div className="mt-2 flex flex-wrap gap-2">
                {allHouses
                  .filter((g) => blockIds.includes(g.id))
                  .map((g) => (
                    <span key={g.id} className="flex items-center gap-1.5 text-xs">
                      <span className="text-ink-soft">{g.name}</span>
                      <TextInput
                        type="number"
                        step="0.01"
                        placeholder="m³"
                        value={blockVolumes[g.id] ?? ""}
                        onChange={(e) =>
                          setBlockVolumes((p) => ({ ...p, [g.id]: e.target.value }))
                        }
                        className="!w-24"
                      />
                    </span>
                  ))}
              </div>
            )}
          </Step>

          {/* ── 3. Tanks — sets derive from the water in step 2 ── */}
          <Step n={3} title="Stock tanks">
            {warnings.map((w) => (
              <Note key={w} tone="warn">
                <AlertTriangle size={12} className="inline" /> {w}
              </Note>
            ))}

            <div className="space-y-3">
              {tanks.map((tank, ti) => (
                <div key={tank.code} className="rounded-xl border border-line">
                  <div className="border-b border-line bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-end gap-4">
                      <span className="flex items-center gap-2 pb-2 text-sm font-bold text-ink">
                        <Beaker size={16} className="text-brand-600" />
                        Tank {tank.code}
                        {d.isAcid(tank) && <Badge>acid</Badge>}
                      </span>

                      <div className="w-28">
                        <Field label="Volume (L)">
                          <TextInput
                            type="number"
                            min={0}
                            value={tank.volume_l}
                            onChange={(e) =>
                              setTank(ti, { volume_l: Number(e.target.value) || 0 })
                            }
                          />
                        </Field>
                      </div>

                      <div className="w-36">
                        <Field label="Sets">
                          {tank.sets_mode === "manual" ? (
                            <TextInput
                              type="number"
                              min={0}
                              step="0.1"
                              value={tank.sets}
                              onChange={(e) =>
                                setTank(ti, { sets: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold tabular-nums text-ink">
                              {d.implied(tank) || "—"}
                            </div>
                          )}
                        </Field>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setTank(ti, {
                            sets_mode: tank.sets_mode === "manual" ? "auto" : "manual",
                            sets:
                              tank.sets_mode === "manual"
                                ? tank.sets
                                : d.implied(tank) || tank.sets,
                          })
                        }
                        className="pb-2.5 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        {tank.sets_mode === "manual" ? "Use calculated" : "Override"}
                      </button>

                      <span className="ml-auto pb-2 text-base font-bold tabular-nums text-ink">
                        {money(
                          tank.lines.reduce(
                            (s, l) => s + (l.unit_price ?? 0) * l.quantity * d.sets(tank),
                            0,
                          ),
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    {tank.lines.length > 0 && (
                      <table className="mb-3 w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                            <th className="pb-2 font-semibold">Fertiliser</th>
                            <th className="pb-2 text-right font-semibold">Per tank</th>
                            <th className="pb-2 text-right font-semibold">Total</th>
                            <th className="pb-2 text-right font-semibold">Cost</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {tank.lines.map((line, li) => (
                            <tr key={`${line.fertiliser_code}-${li}`}>
                              <td className="py-2 font-semibold text-ink">
                                {line.fertiliser_code}
                              </td>
                              <td className="py-2 text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <TextInput
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      setTanks((prev) =>
                                        prev.map((t, i) =>
                                          i === ti
                                            ? {
                                                ...t,
                                                lines: t.lines.map((l, j) =>
                                                  j === li
                                                    ? {
                                                        ...l,
                                                        quantity:
                                                          Number(e.target.value) || 0,
                                                      }
                                                    : l,
                                                ),
                                              }
                                            : t,
                                        ),
                                      )
                                    }
                                    className="!w-24 text-right"
                                  />
                                  <span className="text-ink-faint">{line.unit}</span>
                                </span>
                              </td>
                              <td className="py-2 text-right tabular-nums text-ink-soft">
                                {Math.round(line.quantity * d.sets(tank) * 1000) / 1000}
                              </td>
                              <td className="py-2 text-right tabular-nums text-ink">
                                {line.unit_price != null
                                  ? money(line.unit_price * line.quantity * d.sets(tank))
                                  : "—"}
                              </td>
                              <td className="py-2 pl-2 text-right">
                                <button
                                  onClick={() =>
                                    setTanks((prev) =>
                                      prev.map((t, i) =>
                                        i === ti
                                          ? {
                                              ...t,
                                              lines: t.lines.filter((_, j) => j !== li),
                                            }
                                          : t,
                                      ),
                                    )
                                  }
                                  className="text-ink-faint hover:text-red-600"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <Select
                      value=""
                      onChange={(e) => addLine(ti, e.target.value)}
                      className="max-w-xs"
                    >
                      <option value="">Add fertiliser…</option>
                      {available
                        .filter((f) => !tank.lines.some((l) => l.fertiliser_id === f.id))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.code} — {f.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </Step>

          {/* ── 4. Anything left ── */}
          <Step n={4} title="Details">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Applicator">
                <Select
                  value={applicator}
                  onChange={(e) => setApplicator(e.target.value)}
                >
                  <option value="">—</option>
                  {(employees.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Weather">
                <TextInput
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  placeholder="Overcast, cool"
                />
              </Field>
              <Field label="Comments">
                <TextInput
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </Field>
            </div>
          </Step>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
          <span className="flex items-center gap-2 text-sm">
            <strong className="tabular-nums text-ink">{money(d.cost)}</strong>
            {warnings.length > 0 && (
              <Badge color="#d97706">{warnings.length} warning</Badge>
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {n}
        </span>
        <span className="text-sm font-bold text-ink">{title}</span>
      </h3>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-white px-3 py-3 text-center">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-1 tabular-nums ${strong ? "text-lg font-bold text-ink" : "text-lg font-semibold text-ink-soft"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Note({
  tone = "flat",
  children,
}: {
  tone?: "flat" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs ${
        tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-line bg-surface text-ink-faint"
      }`}
    >
      {children}
    </p>
  );
}
