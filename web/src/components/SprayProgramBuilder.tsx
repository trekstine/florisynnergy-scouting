"use client";

import {
  AlertTriangle,
  Beaker,
  Droplets,
  Info,
  Loader2,
  MapPin,
  Notebook,
  Plus,
  Settings2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge, Button, ErrorBox, Field, Select, TextInput } from "@/components/ui";
import { isHazardous, money } from "@/lib/format";
import { looseNumber } from "@/lib/parse";
import {
  useChemicals,
  useCreateSprayProgram,
  useUpdateSprayProgram,
  useGreenhouses,
  useSprayPreview,
} from "@/lib/hooks";
import type { ComplianceIssue, SprayPreview, SprayRecord } from "@/lib/types";

const COVERAGES = ["Full Cover", "Top Cover", "Spot Cover"];
const APPLICATION_TYPES = [
  "Foliar",
  "Drench",
  "Fogging",
  "Dusting",
  "Drip",
];

/** Product for a given tank: rate is per 100 L of water. */
function doseFromWater(volume: number, rate: number): number | null {
  if (!volume || !rate || volume <= 0 || rate <= 0) return null;
  return Math.round((volume * rate) / 100_000 * 1000) / 1000;
}


interface Item {
  preview: SprayPreview;
  rate: number;
  qty: number | null;
  cost: number | null;
}

/**
 * Spray program builder, following the FloriSynergy spray sheet: block and
 * tank details are shared across the mix, then products are added one at a
 * time with their own rate per 100 L, quantity auto-calculating.
 *
 * The ETL engine still does the thinking — it raises the recommendation and
 * suggests the chemical, which arrives here as a pre-filled first product —
 * but nothing is written until a person has reviewed the dose, cost, PHI and
 * compliance verdict.
 */
export function SprayProgramBuilder({
  open,
  onClose,
  context,
  onCreated,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The program being corrected, if any. Present means edit: the form opens
   * pre-filled and saves over the same program id, so the approval sheet URL,
   * the filed attachments and any link from a scouting report all still
   * resolve to it.
   */
  editing?: {
    programId: string;
    records: SprayRecord[];
  } | null;
  context: {
    greenhouseId: number | null;
    greenhouseLabel: string;
    bedCode: string | null;
    varietyCode?: string | null;
    recommendationId?: number | null;
    targetLabel?: string | null;
    pestId?: number | null;
    diseaseId?: number | null;
    suggestedChemicalId?: number | null;
  };
  onCreated?: (programId: string) => void;
}) {
  const chemicals = useChemicals();
  const greenhouses = useGreenhouses();
  const preview = useSprayPreview();
  const createProgram = useCreateSprayProgram();
  const updateProgram = useUpdateSprayProgram();
  const isEdit = !!editing;
  const busy = createProgram.isPending || updateProgram.isPending;

  const today = new Date().toISOString().slice(0, 10);

  // ── Location ──
  const [greenhouseId, setGreenhouseId] = useState<number | null>(context.greenhouseId);
  const [bedCode, setBedCode] = useState(context.bedCode ?? "");
  const [partition, setPartition] = useState("");
  const [varietyCode, setVarietyCode] = useState(context.varietyCode ?? "");
  const [scoutReportDate, setScoutReportDate] = useState(today);

  // ── Application ──
  const [applicationType, setApplicationType] = useState(APPLICATION_TYPES[0]!);
  const [coverage, setCoverage] = useState(COVERAGES[0]!);
  const [rei, setRei] = useState("");
  const [volume, setVolume] = useState("1000");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("07:00");

  // ── Products ──
  const [items, setItems] = useState<Item[]>([]);
  const [picker, setPicker] = useState("");
  const [rateInput, setRateInput] = useState("");

  const [comments, setComments] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volumeNum = Number(volume) || 0;
  const rateNum = Number(rateInput) || 0;
  const pendingQty = doseFromWater(volumeNum, rateNum);

  /**
   * Re-price the mix whenever the tank size changes.
   *
   * Each item's qty and cost were computed by the server for the volume in
   * force when it was added. Edit the volume afterwards and those figures go
   * stale — but the server recomputes from the *submitted* volume, so the
   * manager would be approving one number and getting another. This mirrors
   * the server's arithmetic exactly: qty = volume × rate ÷ 100,000, then
   * cost = qty × buying price.
   */
  useEffect(() => {
    setItems((prev) =>
      prev.map((it) => {
        const qty = doseFromWater(volumeNum, it.rate);
        const price = it.preview.buying_price;
        return {
          ...it,
          qty,
          cost: qty != null && price != null ? Math.round(qty * price * 100) / 100 : null,
        };
      }),
    );
  }, [volumeNum]);

  useEffect(() => {
    if (!open) return;
    // `editing?.records[0]` guarded the object but not the array: a payload
    // without `records` threw on the index and took the dialog down.
    const head = editing?.records?.[0];

    if (head) {
      // Editing: every field comes off the program as it stands, so a manager
      // changing one rate does not silently reset the rest of the sheet.
      setGreenhouseId(head.greenhouse_id);
      setBedCode(head.bed_code ?? "");
      setPartition(head.partition_no ?? "");
      setVarietyCode(head.variety_code ?? "");
      setScoutReportDate(head.scout_report_date?.slice(0, 10) ?? today);
      setApplicationType(head.type_of_application ?? APPLICATION_TYPES[0]!);
      setCoverage(head.coverage ?? COVERAGES[0]!);
      setRei(head.rei ?? "");
      // The stored value is text and may carry a unit; the input is numeric,
      // and "1000 L" in a number field shows as empty.
      setVolume(String(looseNumber(head.volume_of_water) ?? 1000));
      setStartDate(head.start_date?.slice(0, 10) ?? today);
      setStartTime(head.start_time ?? "07:00");
      // A compliance override already recorded on the program stays on,
      // otherwise saving an unchanged program would be blocked by the very
      // finding somebody already accepted.
      setOverride(head.comments?.startsWith("[Compliance override]") ?? false);
      setComments(
        (head.comments ?? "").replace(/^\[Compliance override\][^—]*—\s*/, ""),
      );
    } else {
      setGreenhouseId(context.greenhouseId);
      setBedCode(context.bedCode ?? "");
      setPartition("");
      setVarietyCode(context.varietyCode ?? "");
      setScoutReportDate(today);
      setApplicationType(APPLICATION_TYPES[0]!);
      setCoverage(COVERAGES[0]!);
      setRei("");
      setVolume("1000");
      setStartDate(today);
      setStartTime("07:00");
      setComments("");
      setOverride(false);
    }

    setItems([]);
    setPicker("");
    setRateInput("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context.recommendationId, editing?.programId]);

  /**
   * Re-price the products of the program being edited.
   *
   * The stored rows carry a rate and a cost, but not the compliance verdict or
   * the buying price the builder needs — and both may have moved since. Asking
   * the server to preview each product again means the manager is editing
   * against today's prices and today's rotation history, not a snapshot.
   */
  const previewMutate = preview.mutateAsync;
  useEffect(() => {
    if (!open || !editing) return;
    let cancelled = false;

    (async () => {
      const priced: Item[] = [];
      const dropped: string[] = [];
      for (const r of editing.records ?? []) {
        if (r.chemical_id == null) continue;
        const rate = looseNumber(r.rate);
        try {
          const result = await previewMutate({
            chemical_id: r.chemical_id,
            greenhouse_id: r.greenhouse_id,
            bed_code: r.bed_code,
            variety_code: r.variety_code,
            coverage: r.coverage,
            start_date: r.start_date,
            volume_of_water_l: looseNumber(r.volume_of_water),
            // Null, not zero: the server's rate is `gt=0`, so sending 0 for a
            // rate that would not parse rejected the product outright — and
            // the rejection used to be swallowed, so the row simply vanished
            // from the mix with nothing said.
            rate,
          });
          priced.push({
            preview: result,
            rate: rate ?? 0,
            qty: result.qty,
            cost: result.cost_of_chemical,
          });
        } catch {
          dropped.push(r.product ?? `Chemical #${r.chemical_id}`);
        }
      }
      if (cancelled) return;
      setItems(priced);
      // A product that would not reprice is not a detail. The programme
      // cannot be saved without at least one, and saving a mix that quietly
      // lost a product would be worse than not saving at all.
      if (dropped.length) {
        setError(
          `Could not reprice ${dropped.join(", ")} — ${
            dropped.length === 1 ? "it has" : "they have"
          } been left out of the mix. Add ${
            dropped.length === 1 ? "it" : "them"
          } again before saving, or the programme will be written without ` +
            `${dropped.length === 1 ? "it" : "them"}.`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.programId, previewMutate]);

  // Pre-fill the recommendation's suggested chemical.
  useEffect(() => {
    if (!open || !context.suggestedChemicalId || items.length > 0) return;
    setPicker(String(context.suggestedChemicalId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context.suggestedChemicalId]);

  if (!open) return null;

  async function addProduct() {
    const chemicalId = Number(picker);
    if (!chemicalId) {
      setError("Select a product.");
      return;
    }
    if (!rateNum) {
      setError("Enter the rate (product per 100 L of water).");
      return;
    }
    if (items.some((i) => i.preview.chemical_id === chemicalId)) {
      setError("That product is already in this program.");
      return;
    }
    setError(null);
    try {
      const result = await preview.mutateAsync({
        chemical_id: chemicalId,
        greenhouse_id: greenhouseId,
        bed_code: bedCode || null,
        variety_code: varietyCode || null,
        coverage,
        start_date: startDate,
        pest_id: context.pestId ?? null,
        disease_id: context.diseaseId ?? null,
        volume_of_water_l: volumeNum || null,
        rate: rateNum,
      });
      setItems((prev) => [
        ...prev,
        {
          preview: result,
          rate: rateNum,
          qty: result.qty,
          cost: result.cost_of_chemical,
        },
      ]);
      setPicker("");
      setRateInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not price that product.");
    }
  }

  const totalCost = items.reduce((s, i) => s + (i.cost ?? 0), 0);
  const harvestDates = items
    .map((i) => i.preview.safe_harvest_date)
    .filter((d): d is string => !!d)
    .sort();
  const latestHarvest = harvestDates[harvestDates.length - 1] ?? null;

  /**
   * Two products in one tank sharing a mode of action defeats rotation. The
   * server rejects this, but each per-product preview only knows about its
   * own chemical — so the conflict is derived here to surface it while the
   * mix is being built rather than at submit time.
   */
  const tankMixIssues: ComplianceIssue[] = [];
  const seenRac = new Map<string, string>();
  for (const it of items) {
    const rac = it.preview.rac_code;
    if (!rac) continue;
    const other = seenRac.get(rac);
    if (other) {
      tankMixIssues.push({
        level: "block",
        code: "tank_mix_rac",
        message: `${it.preview.name} and ${other} share mode of action RAC ${rac} — tank-mixing them adds no resistance benefit.`,
      });
    } else {
      seenRac.set(rac, it.preview.name);
    }
  }

  const allIssues: ComplianceIssue[] = [
    ...tankMixIssues,
    ...items.flatMap((i) => i.preview.issues),
  ];
  const blocking = allIssues.filter((i) => i.level === "block");
  const warnings = allIssues.filter((i) => i.level === "warn");
  const infos = allIssues.filter((i) => i.level === "info");
  const canSubmit =
    items.length > 0 && (blocking.length === 0 || override) && !busy;

  async function submit() {
    // The server requires at least one product and answers an empty list with
    // a validation error. Say it here, in words, rather than letting a 422
    // come back from a field name the reader never sees.
    if (items.length === 0) {
      setError(
        "A programme needs at least one product. Add one below before saving.",
      );
      return;
    }
    setError(null);
    const body = {
      greenhouse_id: greenhouseId,
      bed_code: bedCode || null,
      partition_no: partition || null,
      variety_code: varietyCode || null,
      type_of_application: applicationType,
      coverage,
      rei: rei || null,
      volume_of_water_l: volumeNum || null,
      comments: comments || null,
      start_date: startDate,
      start_time: startTime || null,
      scout_report_date: scoutReportDate || null,
      recommendation_id: context.recommendationId ?? null,
      items: items.map((i) => ({ chemical_id: i.preview.chemical_id, rate: i.rate })),
      override,
    };
    try {
      const result = editing
        ? await updateProgram.mutateAsync({ programId: editing.programId, body })
        : await createProgram.mutateAsync(body);
      onCreated?.(result.program_id);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not ${isEdit ? "save" : "create"} the program.`,
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {isEdit ? "Edit spray program" : "New spray program"}
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {context.targetLabel ? (
                <>
                  Targeting{" "}
                  <span className="font-semibold text-ink-soft">
                    {context.targetLabel}
                  </span>
                </>
              ) : (
                "Block, tank and timing are shared across the mix"
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <ErrorBox message={error} />

          {/* ── Location ── */}
          <SectionHeader icon={MapPin} label="Location" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Greenhouse">
              {context.greenhouseId == null ? (
                <Select
                  value={greenhouseId ?? ""}
                  onChange={(e) => {
                    setGreenhouseId(e.target.value ? Number(e.target.value) : null);
                    setItems([]);
                  }}
                >
                  <option value="">Select…</option>
                  {(greenhouses.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                  {context.greenhouseLabel}
                </div>
              )}
            </Field>
            <Field label="Bed / bay">
              <TextInput
                value={bedCode}
                onChange={(e) => setBedCode(e.target.value)}
                placeholder="All beds"
              />
            </Field>
            <Field label="Partition">
              <TextInput
                value={partition}
                onChange={(e) => setPartition(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Variety">
              <TextInput
                value={varietyCode}
                onChange={(e) => setVarietyCode(e.target.value)}
                placeholder="All varieties"
              />
            </Field>
            <Field label="Scout report date">
              <TextInput
                type="date"
                value={scoutReportDate}
                onChange={(e) => setScoutReportDate(e.target.value)}
              />
            </Field>
          </div>

          {/* ── Application ── */}
          <SectionHeader icon={Settings2} label="Application" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
            <Field label="Coverage">
              <Select value={coverage} onChange={(e) => setCoverage(e.target.value)}>
                {COVERAGES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Re-entry (hours)">
              <TextInput
                value={rei}
                onChange={(e) => setRei(e.target.value)}
                placeholder="e.g. 12"
              />
            </Field>
            <Field label="Volume of water (L)">
              <TextInput
                type="number"
                min={1}
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
              />
            </Field>
            <Field label="Start date">
              <TextInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Start time">
              <TextInput
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
          </div>

          {/* ── Products ── */}
          <SectionHeader icon={Beaker} label={`Products (${items.length})`} />

          {/* Add product — rate drives an auto-calculated quantity */}
          <div className="rounded-xl border border-line bg-surface/60 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
              <Field label="Product">
                <Select
                  value={picker}
                  onChange={(e) => setPicker(e.target.value)}
                  disabled={greenhouseId == null}
                >
                  <option value="">Select a product…</option>
                  {(chemicals.data ?? [])
                    .filter(
                      (c) => !items.some((i) => i.preview.chemical_id === c.id),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.target1 ? ` — ${c.target1}` : ""}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Rate /100L">
                <TextInput
                  type="number"
                  min={0}
                  step="any"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="e.g. 50"
                />
              </Field>
              <Field label="Quantity">
                <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold tabular-nums text-ink">
                  {pendingQty ?? "—"}
                </div>
              </Field>
              <Button
                variant="outline"
                onClick={addProduct}
                disabled={preview.isPending || greenhouseId == null}
              >
                {preview.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                Add
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <Droplets size={12} />
              Quantity = volume × rate ÷ 100,000. At {volumeNum || 0} L, a rate of{" "}
              {rateNum || "—"} gives {pendingQty ?? "—"}.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.preview.chemical_id}
                className="rounded-xl border border-line p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink">{item.preview.name}</p>
                      {item.preview.who_class && (
                        <Badge
                          color={
                            isHazardous(item.preview.who_class)
                              ? "#dc2626"
                              : "#64748b"
                          }
                        >
                          WHO {item.preview.who_class}
                        </Badge>
                      )}
                      {item.preview.rac_code && (
                        <Badge>RAC {item.preview.rac_code}</Badge>
                      )}
                    </div>
                    {item.preview.target1 && (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Targets {item.preview.target1}
                        {item.preview.target2 && `, ${item.preview.target2}`}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <Calc label="Rate" value={`${item.rate}/100L`} />
                      <Calc
                        label="Quantity"
                        value={item.qty != null ? `${item.qty}` : "—"}
                        strong
                      />
                      <Calc
                        label="Cost"
                        value={item.cost != null ? money(item.cost) : "—"}
                        strong
                      />
                      <Calc
                        label="PHI"
                        value={
                          item.preview.phi_days != null
                            ? `${item.preview.phi_days}d → ${item.preview.safe_harvest_date}`
                            : "—"
                        }
                      />
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter(
                          (p) => p.preview.chemical_id !== item.preview.chemical_id,
                        ),
                      )
                    }
                    title="Remove product"
                    className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            {items.length === 0 && !preview.isPending && (
              <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-5 text-center text-sm text-ink-faint">
                {greenhouseId == null
                  ? "Select a greenhouse first."
                  : "No products yet — add one below."}
              </div>
            )}
          </div>

          {/* ── Compliance ── */}
          {allIssues.length > 0 && (
            <>
              <SectionHeader icon={ShieldAlert} label="Compliance" />
              <div className="space-y-1.5">
                {[...blocking, ...warnings, ...infos].map((i, n) => (
                  <IssueRow key={`${i.code}-${n}`} issue={i} />
                ))}
              </div>
              {blocking.length > 0 && (
                <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-red-800">
                    <span className="font-semibold">Override the block.</span> The
                    reason is recorded on the program for audit.
                  </span>
                </label>
              )}
            </>
          )}

          {/* ── Notes ── */}
          <SectionHeader icon={Notebook} label="Notes" />
          <TextInput
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Anything the sprayer should know"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
          {/* Repeated here because the body scrolls and this bar does not —
              a rejected save reported itself off-screen otherwise. */}
          {error && (
            <p
              className="w-full truncate text-sm font-semibold text-red-700"
              title={error}
            >
              {error}
            </p>
          )}
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Total cost
              </p>
              <p className="text-lg font-bold tabular-nums text-ink">
                {money(totalCost)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Safe to harvest
              </p>
              <p className="text-lg font-bold text-ink">{latestHarvest ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />{" "}
                  {isEdit ? "Saving…" : "Creating…"}
                </>
              ) : (
                <>
                  <Beaker size={15} /> {isEdit ? "Save changes" : "Create program"}
                  {items.length > 1 && ` (${items.length})`}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof MapPin;
  label: string;
}) {
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-1.5 first:mt-0">
      <Icon size={14} className="text-ink-faint" />
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

function Calc({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <span className="text-ink-faint">{label}: </span>
      <span className={strong ? "font-bold text-ink" : "font-medium text-ink-soft"}>
        {value}
      </span>
    </div>
  );
}

function IssueRow({ issue }: { issue: ComplianceIssue }) {
  const style =
    issue.level === "block"
      ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", Icon: ShieldAlert }
      : issue.level === "warn"
        ? {
            bg: "bg-amber-50",
            border: "border-amber-200",
            text: "text-amber-800",
            Icon: AlertTriangle,
          }
        : { bg: "bg-surface", border: "border-line", text: "text-ink-soft", Icon: Info };
  const { Icon } = style;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border ${style.border} ${style.bg} px-3 py-2`}
    >
      <Icon size={14} className={`mt-0.5 shrink-0 ${style.text}`} />
      <p className={`text-sm ${style.text}`}>{issue.message}</p>
    </div>
  );
}
