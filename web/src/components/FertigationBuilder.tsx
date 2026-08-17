"use client";

import { AlertTriangle, Beaker, Droplets, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  ErrorBox,
  Field,
  Select,
  TextInput,
} from "@/components/ui";
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

const ACTIVITIES: { id: FertActivity; label: string; days: string }[] = [
  { id: "fertigation", label: "Fertigation", days: "Mon, Tue, Sat" },
  { id: "drenching", label: "Drenching", days: "Wed, Thu" },
  { id: "flushing", label: "Flushing", days: "Sun" },
];

const SOURCES = ["Borehole", "River", "Reservoir", "Mix"];
const APPLICATION_TYPES = ["Drip", "Drench", "Overhead", "Flush"];

/** Two mixing tanks and an acid tank — the shape of the supplied sheet. */
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
 * Laid out the way the paper regime is written — the event across the top,
 * then a panel per stock tank — so somebody transcribing from the clipboard
 * reads down the page rather than hunting for fields.
 */
export function FertigationBuilder({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The sheet being corrected, if any. */
  editing?: Fertigation | null;
  onSaved?: (docId: string) => void;
}) {
  const save = useSaveFertigation();
  const greenhouses = useGreenhouses();
  const employees = useEmployees();
  const fertilisers = useFertilisers();

  const today = new Date().toISOString().slice(0, 10);

  const [activity, setActivity] = useState<FertActivity>("fertigation");
  const [eventDate, setEventDate] = useState(today);
  const [startTime, setStartTime] = useState("07:00");
  const [phaseId, setPhaseId] = useState<string>("");
  // Which greenhouses this sheet feeds. A phase selects its blocks; individual
  // ones can then be ticked off — a block down for maintenance is not fed.
  const [blockIds, setBlockIds] = useState<number[]>([]);
  const [blockVolumes, setBlockVolumes] = useState<Record<number, string>>({});
  const [applicationType, setApplicationType] = useState(APPLICATION_TYPES[0]!);
  const [volume, setVolume] = useState("");
  const [area, setArea] = useState("");
  const [target, setTarget] = useState("");
  const [weather, setWeather] = useState("");
  const [fertRate, setFertRate] = useState("6");
  const [acidRate, setAcidRate] = useState("2");
  const [applicator, setApplicator] = useState<string>("");
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
      setBlockIds(
        editing.blocks.map((b) => b.greenhouse_id).filter((x): x is number => x != null),
      );
      setBlockVolumes(
        Object.fromEntries(
          editing.blocks
            .filter((b) => b.greenhouse_id != null && b.volume_m3 != null)
            .map((b) => [b.greenhouse_id as number, String(b.volume_m3)]),
        ),
      );
      setApplicationType(editing.type_of_application ?? APPLICATION_TYPES[0]!);
      setVolume(editing.volume_m3 != null ? String(editing.volume_m3) : "");
      setArea(editing.area_ha != null ? String(editing.area_ha) : "");
      setTarget(editing.target_m3_per_ha != null ? String(editing.target_m3_per_ha) : "");
      setWeather(editing.weather ?? "");
      setFertRate(String(editing.fertiliser_rate_l_m3));
      setAcidRate(String(editing.acid_rate_l_m3));
      setApplicator(editing.applicator_id ? String(editing.applicator_id) : "");
      setComments(editing.comments ?? "");
      setTanks(editing.tanks.length ? editing.tanks : defaultTanks());
      setSources(editing.sources);
    } else {
      setActivity("fertigation");
      setEventDate(today);
      setStartTime("07:00");
      setPhaseId("");
      setBlockIds([]);
      setBlockVolumes({});
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

  const phases = usePhases();
  const allHouses = useMemo(() => greenhouses.data ?? [], [greenhouses.data]);
  const selectedPhase = (phases.data ?? []).find((p) => p.id === Number(phaseId));

  /** The blocks on offer: a phase narrows the list, otherwise the whole farm. */
  const offered = useMemo(
    () =>
      selectedPhase
        ? allHouses.filter((g) => selectedPhase.greenhouse_ids.includes(g.id))
        : allHouses,
    [allHouses, selectedPhase],
  );

  /** BR-001 — area is the sum over the blocks fed, never one block's figure. */
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

  /** Mirrors the server's arithmetic exactly, so the preview cannot mislead. */
  const derived = useMemo(() => {
    const stock = Math.round(volumeNum * fertRateNum * 100) / 100;
    const acid = Math.round(volumeNum * acidRateNum * 100) / 100;

    // A tank is dosed at the acid rate because of what is in it, not because
    // of what it is called — a farm may letter its acid tank anything.
    const isAcidTank = (t: FertigationTank) =>
      t.lines.some((l) => l.is_acid && l.quantity >= 0);
    const impliedSets = (t: FertigationTank) =>
      t.volume_l > 0
        ? Math.round(((isAcidTank(t) ? acid : stock) / t.volume_l) * 1000) / 1000
        : 0;
    // The number the costing uses. Derived unless somebody overrode it.
    const effectiveSets = (t: FertigationTank) => {
      if (t.sets_mode === "manual") return Math.max(t.sets, 0);
      const d = impliedSets(t);
      return d > 0 ? d : Math.max(t.sets, 0);
    };

    const cost = tanks.reduce(
      (s, t) =>
        s +
        t.lines.reduce(
          (ls, l) => ls + (l.unit_price ?? 0) * l.quantity * effectiveSets(t),
          0,
        ),
      0,
    );
    const planned =
      Number(target) > 0 && selectedArea > 0
        ? Math.round(Number(target) * selectedArea * 100) / 100
        : null;
    const sourcesTotal =
      Math.round(sources.reduce((s, x) => s + (x.volume_m3 ?? 0), 0) * 100) / 100;

    return {
      stock,
      acid,
      cost: Math.round(cost * 100) / 100,
      perHa: areaNum ? Math.round((volumeNum / areaNum) * 100) / 100 : null,
      isAcidTank,
      impliedSets,
      effectiveSets,
      planned,
      sourcesTotal,
      sourceGap:
        volumeNum > 0 && sourcesTotal > 0 && Math.abs(sourcesTotal - volumeNum) >= 0.5
          ? Math.round((sourcesTotal - volumeNum) * 100) / 100
          : null,
    };
  }, [volumeNum, areaNum, fertRateNum, acidRateNum, tanks, sources, target, selectedArea]);

  /** Calcium and sulphate in one tank will precipitate — say so while it can
   *  still be fixed, rather than at the drippers. */
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
          `Tank ${t.code}: ${ca.join(", ")} with ${so4.join(", ")} — calcium with sulphate or phosphate precipitates and blocks drippers. These normally go in separate tanks.`,
        );
      }
    }
    return out;
  }, [tanks]);

  if (!open) return null;

  function setTank(index: number, patch: Partial<FertigationTank>) {
    setTanks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addLine(tankIndex: number, fertiliserId: string) {
    const f = (fertilisers.data ?? []).find((x) => x.id === Number(fertiliserId));
    if (!f) return;
    setTanks((prev) =>
      prev.map((t, i) =>
        i === tankIndex
          ? {
              ...t,
              lines: t.lines.some((l) => l.fertiliser_id === f.id)
                ? t.lines
                : [
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
            }
          : t,
      ),
    );
  }

  function setLineQty(tankIndex: number, lineIndex: number, qty: number) {
    setTanks((prev) =>
      prev.map((t, i) =>
        i === tankIndex
          ? {
              ...t,
              lines: t.lines.map((l, j) =>
                j === lineIndex ? { ...l, quantity: qty } : l,
              ),
            }
          : t,
      ),
    );
  }

  function removeLine(tankIndex: number, lineIndex: number) {
    setTanks((prev) =>
      prev.map((t, i) =>
        i === tankIndex
          ? { ...t, lines: t.lines.filter((_, j) => j !== lineIndex) }
          : t,
      ),
    );
  }

  async function submit() {
    if (!eventDate) {
      setError("Give the sheet a date.");
      return;
    }
    if (!tanks.some((t) => t.lines.some((l) => l.quantity > 0))) {
      setError("Add at least one fertiliser with a quantity.");
      return;
    }
    setError(null);

    const body: FertigationBody = {
      activity,
      event_date: eventDate,
      start_time: startTime || null,
      phase_id: phaseId ? Number(phaseId) : null,
      // Area is only sent when it was typed over; otherwise the server sums
      // the blocks, so one rule governs it.
      blocks: blockIds.map((id) => ({
        greenhouse_id: id,
        volume_m3: blockVolumes[id] ? Number(blockVolumes[id]) : null,
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
      // Tanks with nothing in them are not sent — a two-tank farm should not
      // file a sheet carrying an empty Tank C.
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
      setError(e instanceof Error ? e.message : "Could not save the sheet.");
    }
  }

  const available = fertilisers.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[93vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {editing ? "Edit fertigation sheet" : "New fertigation sheet"}
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              The event, then what goes in each stock tank
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-6 py-5">
          <ErrorBox message={error} />

          {/* ── The event ── */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
              The event
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Activity">
                <Select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as FertActivity)}
                >
                  {ACTIVITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.days}
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
                    const id = e.target.value;
                    setPhaseId(id);
                    // Picking a phase selects the blocks on it — that is the
                    // point of a phase. Individual ones can still be unticked.
                    const p = (phases.data ?? []).find((x) => x.id === Number(id));
                    setBlockIds(p ? [...p.greenhouse_ids] : []);
                  }}
                >
                  <option value="">No phase — pick blocks directly</option>
                  {(phases.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.greenhouse_ids.length} block
                      {p.greenhouse_ids.length === 1 ? "" : "s"})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type of application">
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
              <Field label="Total water applied (m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="e.g. 835"
                />
              </Field>
              <Field label="Area (ha)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.001"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder={selectedArea ? String(selectedArea) : "e.g. 32"}
                />
              </Field>
              <Field label="Target m³ per ha">
                <TextInput
                  type="number"
                  min={0}
                  step="0.01"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. 33.33"
                />
              </Field>
              <Field label="Weather">
                <TextInput
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  placeholder="e.g. Overcast, cool"
                />
              </Field>
              <Field label="Applicator">
                <Select
                  value={applicator}
                  onChange={(e) => setApplicator(e.target.value)}
                >
                  <option value="">Not recorded</option>
                  {(employees.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Fertiliser injection (L per m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.1"
                  value={fertRate}
                  onChange={(e) => setFertRate(e.target.value)}
                />
              </Field>
              <Field label="Acid injection (L per m³)">
                <TextInput
                  type="number"
                  min={0}
                  step="0.1"
                  value={acidRate}
                  onChange={(e) => setAcidRate(e.target.value)}
                />
              </Field>
            </div>

            <p className="mt-2 text-xs text-ink-faint">
              Total water applied is the one figure everything else derives
              from: the stock and acid solution, every tank&apos;s set count, and
              the cost.
            </p>

            {/* The report plans forwards — "m³ used = 33.33 × area" — so offer
                that rather than making somebody do it on a calculator. */}
            {derived.planned != null && (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                  volumeNum > 0 && Math.abs(derived.planned - volumeNum) >= 0.5
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-line bg-surface text-ink-faint"
                }`}
              >
                {target} m³/ha × {selectedArea} ha ={" "}
                <strong className="tabular-nums">{derived.planned} m³</strong> planned
                {volumeNum > 0 && Math.abs(derived.planned - volumeNum) >= 0.5 && (
                  <> — {volumeNum} m³ recorded.</>
                )}{" "}
                <button
                  type="button"
                  onClick={() => setVolume(String(derived.planned))}
                  className="font-semibold underline"
                >
                  Use the planned figure
                </button>
              </div>
            )}
          </section>

          {/* ── Which blocks this feeds ── */}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                Greenhouses fed
              </h3>
              <span className="text-xs text-ink-faint">
                {blockIds.length} selected ·{" "}
                <strong className="text-ink-soft">{selectedArea} ha</strong>
                {area && Number(area) !== selectedArea && (
                  <span className="text-amber-700">
                    {" "}
                    — area overridden to {area} ha
                  </span>
                )}
              </span>
              {offered.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setBlockIds(
                      blockIds.length === offered.length
                        ? []
                        : offered.map((g) => g.id),
                    )
                  }
                  className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
                >
                  {blockIds.length === offered.length ? "Select none" : "Select all"}
                </button>
              )}
            </div>

            <p className="mb-2 text-xs text-ink-faint">
              Area is the sum over these blocks — it is what m³ per hectare
              divides by. Enter a per-block volume only where the farm meters
              each greenhouse; otherwise the phase total is apportioned by area.
            </p>

            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {offered.map((g) => {
                const on = blockIds.includes(g.id);
                return (
                  <div
                    key={g.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      on ? "border-brand-300 bg-brand-50/40" : "border-line"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setBlockIds((prev) =>
                          prev.includes(g.id)
                            ? prev.filter((x) => x !== g.id)
                            : [...prev, g.id],
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {g.name}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {g.area_ha != null ? `${g.area_ha} ha` : "area not set"}
                      </span>
                    </span>
                    {on && (
                      <TextInput
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="m³"
                        value={blockVolumes[g.id] ?? ""}
                        onChange={(e) =>
                          setBlockVolumes((prev) => ({
                            ...prev,
                            [g.id]: e.target.value,
                          }))
                        }
                        className="!w-20 !py-1 text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {offered.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-faint">
                No greenhouses on this phase yet. Map them under Settings →
                Fertigation phases.
              </p>
            )}

            {/* Everything the water volume implies, before anything is saved. */}
            <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              <Derived label="Stock solution" value={`${derived.stock} L`} />
              <Derived label="Acid solution" value={`${derived.acid} L`} />
              <Derived
                label="m³ per ha"
                value={derived.perHa != null ? String(derived.perHa) : "—"}
              />
              <Derived label="Fertiliser cost" value={money(derived.cost)} />
            </div>
          </section>

          {/* ── Water sources ── */}
          <section>
            <div className="mb-2 flex items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                Water sources
              </h3>
              <button
                onClick={() =>
                  setSources((p) => [
                    ...p,
                    { source: SOURCES[0]!, volume_m3: null, ec: null, ph: null, note: null },
                  ])
                }
                className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
              >
                <Plus size={12} /> Add a source
              </button>
            </div>
            <p className="mb-2 text-xs text-ink-faint">
              Where the {volumeNum ? `${volumeNum} m³` : "water"} above came from.
              These are a breakdown of that total, not extra water — EC and pH
              sit here because borehole and river differ, and averaging them
              hides why the acid dose changed.
            </p>

            {sources.length > 0 && (
              <div
                className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                  derived.sourceGap
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-line bg-surface text-ink-faint"
                }`}
              >
                Sources total{" "}
                <strong className="tabular-nums">{derived.sourcesTotal} m³</strong>
                {volumeNum > 0 && (
                  <>
                    {" "}against <strong className="tabular-nums">{volumeNum} m³</strong>{" "}
                    applied
                    {derived.sourceGap ? (
                      <>
                        {" — "}
                        <strong>
                          {derived.sourceGap > 0 ? "+" : ""}
                          {derived.sourceGap} m³ difference
                        </strong>
                        .{" "}
                        <button
                          type="button"
                          onClick={() => setVolume(String(derived.sourcesTotal))}
                          className="font-semibold underline"
                        >
                          Use the source total
                        </button>
                      </>
                    ) : (
                      " — they agree."
                    )}
                  </>
                )}
              </div>
            )}

            {sources.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-faint">
                None recorded. Optional — the sheet works on the total alone.
              </p>
            ) : (
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-5">
                    <Select
                      value={s.source}
                      onChange={(e) =>
                        setSources((p) =>
                          p.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)),
                        )
                      }
                    >
                      {SOURCES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      type="number"
                      step="0.01"
                      placeholder="m³"
                      value={s.volume_m3 ?? ""}
                      onChange={(e) =>
                        setSources((p) =>
                          p.map((x, j) =>
                            j === i
                              ? { ...x, volume_m3: e.target.value ? Number(e.target.value) : null }
                              : x,
                          ),
                        )
                      }
                    />
                    <TextInput
                      type="number"
                      step="0.01"
                      placeholder="EC (mS/cm)"
                      value={s.ec ?? ""}
                      onChange={(e) =>
                        setSources((p) =>
                          p.map((x, j) =>
                            j === i
                              ? { ...x, ec: e.target.value ? Number(e.target.value) : null }
                              : x,
                          ),
                        )
                      }
                    />
                    <TextInput
                      type="number"
                      step="0.01"
                      placeholder="pH"
                      value={s.ph ?? ""}
                      onChange={(e) =>
                        setSources((p) =>
                          p.map((x, j) =>
                            j === i
                              ? { ...x, ph: e.target.value ? Number(e.target.value) : null }
                              : x,
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() => setSources((p) => p.filter((_, j) => j !== i))}
                      className="justify-self-start rounded-lg border border-line p-2 text-ink-faint hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── The tanks ── */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
              Stock tanks
            </h3>

            {warnings.map((w) => (
              <div
                key={w}
                className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" />
                <p className="text-xs text-amber-800">{w}</p>
              </div>
            ))}

            <div className="space-y-3">
              {tanks.map((tank, ti) => (
                <div key={tank.code} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                      <Beaker size={15} className="text-brand-600" /> Tank {tank.code}
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
                    {/* Sets are derived from the water volume by default.
                        Two editable numbers that ought to agree is how a sheet
                        ends up lying — so the derivation governs unless
                        somebody explicitly takes it over. */}
                    <div className="w-40">
                      <Field label="Sets">
                        <span className="flex items-center gap-1.5">
                          {tank.sets_mode === "manual" ? (
                            <TextInput
                              type="number"
                              min={0}
                              step="0.1"
                              value={tank.sets}
                              onChange={(e) =>
                                setTank(ti, { sets: Number(e.target.value) || 0 })
                              }
                              className="!w-20"
                            />
                          ) : (
                            <span className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm font-semibold tabular-nums text-ink">
                              {derived.impliedSets(tank) || "—"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setTank(ti, {
                                sets_mode:
                                  tank.sets_mode === "manual" ? "auto" : "manual",
                                sets:
                                  tank.sets_mode === "manual"
                                    ? tank.sets
                                    : derived.impliedSets(tank) || tank.sets,
                              })
                            }
                            className="text-[11px] font-semibold text-brand-700 hover:underline"
                          >
                            {tank.sets_mode === "manual" ? "use calculated" : "override"}
                          </button>
                        </span>
                      </Field>
                    </div>

                    <span className="pb-2 text-xs text-ink-faint">
                      {volumeNum > 0 ? (
                        <>
                          {(derived.isAcidTank(tank)
                            ? derived.acid
                            : derived.stock
                          ).toLocaleString()}{" "}
                          L {derived.isAcidTank(tank) ? "acid" : "stock"} ÷{" "}
                          {tank.volume_l} L
                          {tank.sets_mode === "manual" &&
                            derived.impliedSets(tank) !== tank.sets && (
                              <strong className="ml-1 text-amber-700">
                                = {derived.impliedSets(tank)}, overridden
                              </strong>
                            )}
                        </>
                      ) : (
                        "enter a water volume to calculate"
                      )}
                    </span>

                    <span className="ml-auto pb-2 text-sm font-semibold tabular-nums text-ink">
                      {money(
                        tank.lines.reduce(
                          (s, l) =>
                            s + (l.unit_price ?? 0) * l.quantity * derived.effectiveSets(tank),
                          0,
                        ),
                      )}
                    </span>
                  </div>

                  <div className="p-4">
                    {tank.lines.length > 0 && (
                      <table className="mb-3 w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                            <th className="pb-1.5 font-semibold">Fertiliser</th>
                            <th className="pb-1.5 text-right font-semibold">
                              Qty per tank
                            </th>
                            <th className="pb-1.5 text-right font-semibold">
                              × {derived.effectiveSets(tank) || 0} sets
                            </th>
                            <th className="pb-1.5 text-right font-semibold">Cost</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {tank.lines.map((line, li) => (
                            <tr key={`${line.fertiliser_code}-${li}`}>
                              <td className="py-1.5">
                                <span className="font-semibold text-ink">
                                  {line.fertiliser_code}
                                </span>
                                <span className="ml-2 text-xs text-ink-faint">
                                  {line.fertiliser_name}
                                </span>
                              </td>
                              <td className="py-1.5 text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <TextInput
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      setLineQty(ti, li, Number(e.target.value) || 0)
                                    }
                                    className="!w-24 text-right"
                                  />
                                  <span className="text-xs text-ink-faint">
                                    {line.unit}
                                  </span>
                                </span>
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-ink-soft">
                                {Math.round(
                                  line.quantity * derived.effectiveSets(tank) * 1000,
                                ) / 1000}{" "}
                                {line.unit}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-ink">
                                {line.unit_price != null
                                  ? money(
                                      line.unit_price *
                                        line.quantity *
                                        derived.effectiveSets(tank),
                                    )
                                  : "—"}
                              </td>
                              <td className="py-1.5 pl-2 text-right">
                                <button
                                  onClick={() => removeLine(ti, li)}
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

                    <Select
                      value=""
                      onChange={(e) => addLine(ti, e.target.value)}
                      className="max-w-sm"
                    >
                      <option value="">Add a fertiliser to Tank {tank.code}…</option>
                      {available
                        .filter((f) => !tank.lines.some((l) => l.fertiliser_id === f.id))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.code} — {f.name}
                            {f.default_tank && f.default_tank !== tank.code
                              ? ` (usually tank ${f.default_tank})`
                              : ""}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Field label="Comments">
            <TextInput
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Anything the next person reading this sheet should know"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
          <span className="flex items-center gap-3 text-sm">
            <Droplets size={15} className="text-ink-faint" />
            <span className="text-ink-faint">Total</span>
            <strong className="tabular-nums text-ink">{money(derived.cost)}</strong>
            {warnings.length > 0 && (
              <Badge color="#d97706">
                {warnings.length} tank warning{warnings.length === 1 ? "" : "s"}
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Create sheet"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
