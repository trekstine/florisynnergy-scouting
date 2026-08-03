"use client";

import {
  AlertTriangle,
  Beaker,
  Info,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, ErrorBox, Field, Select, TextInput } from "@/components/ui";
import { money } from "@/lib/format";
import {
  useChemicals,
  useCreateSprayProgram,
  useGreenhouses,
  useSprayPreview,
} from "@/lib/hooks";
import type { ComplianceIssue, SprayPreview } from "@/lib/types";

const COVERAGES = ["Full block", "Spot treatment", "Perimeter", "Alternate rows"];

/**
 * Explicit, reviewable spray program builder.
 *
 * The ETL engine still does the thinking — it detects the breach, raises the
 * recommendation and suggests the chemical, which arrives here as a pre-filled
 * first product. But nothing is written until a person has seen the dosing,
 * cost, PHI and compliance verdict and pressed the button. Automation informs;
 * the human decides.
 */
export function SprayProgramBuilder({
  open,
  onClose,
  context,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
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

  // Ad-hoc programs (started from the Spray page rather than a
  // recommendation) arrive with no block, so the user picks one here.
  const [greenhouseId, setGreenhouseId] = useState<number | null>(
    context.greenhouseId,
  );
  const [bedCode, setBedCode] = useState(context.bedCode ?? "");
  const [varietyCode, setVarietyCode] = useState(context.varietyCode ?? "");
  const [coverage, setCoverage] = useState(COVERAGES[0]!);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [comments, setComments] = useState("");
  const [items, setItems] = useState<SprayPreview[]>([]);
  const [picker, setPicker] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal is opened for a different recommendation.
  useEffect(() => {
    if (!open) return;
    setGreenhouseId(context.greenhouseId);
    setBedCode(context.bedCode ?? "");
    setVarietyCode(context.varietyCode ?? "");
    setCoverage(COVERAGES[0]!);
    setStartDate(new Date().toISOString().slice(0, 10));
    setComments("");
    setItems([]);
    setPicker("");
    setOverride(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context.recommendationId]);

  const addProduct = useMemo(
    () =>
      async (chemicalId: number) => {
        if (items.some((i) => i.chemical_id === chemicalId)) {
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
          });
          setItems((prev) => [...prev, result]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not price that product.");
        }
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, context, bedCode, varietyCode, coverage, startDate],
  );

  // Pre-fill the recommendation's suggested chemical as the first product.
  useEffect(() => {
    if (!open || !context.suggestedChemicalId || items.length > 0) return;
    void addProduct(context.suggestedChemicalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context.suggestedChemicalId]);

  if (!open) return null;

  const totalCost = items.reduce((s, i) => s + (i.cost_of_chemical ?? 0), 0);
  const harvestDates = items
    .map((i) => i.safe_harvest_date)
    .filter((d): d is string => !!d)
    .sort();
  const latestHarvest = harvestDates[harvestDates.length - 1] ?? null;

  const allIssues: ComplianceIssue[] = items.flatMap((i) => i.issues);
  const blocking = allIssues.filter((i) => i.level === "block");
  const warnings = allIssues.filter((i) => i.level === "warn");
  const infos = allIssues.filter((i) => i.level === "info");
  const canSubmit =
    items.length > 0 && (blocking.length === 0 || override) && !createProgram.isPending;

  async function submit() {
    setError(null);
    try {
      const result = await createProgram.mutateAsync({
        greenhouse_id: greenhouseId,
        bed_code: bedCode || null,
        variety_code: varietyCode || null,
        coverage,
        comments: comments || null,
        start_date: startDate,
        recommendation_id: context.recommendationId ?? null,
        items: items.map((i) => ({ chemical_id: i.chemical_id })),
        override,
      });
      onCreated?.(result.program_id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the program.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Plan spray program</h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {context.greenhouseLabel}
              {context.bedCode && ` · Bed ${context.bedCode}`}
              {context.targetLabel && (
                <>
                  {" · targeting "}
                  <span className="font-semibold text-ink-soft">
                    {context.targetLabel}
                  </span>
                </>
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

          {/* Application context */}
          {context.greenhouseId == null && (
            <div className="mt-1">
              <Field label="Greenhouse">
                <Select
                  value={greenhouseId ?? ""}
                  onChange={(e) => {
                    setGreenhouseId(e.target.value ? Number(e.target.value) : null);
                    // Dosing is area-based, so previously priced products are
                    // stale the moment the block changes.
                    setItems([]);
                  }}
                >
                  <option value="">Select a block…</option>
                  {(greenhouses.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Bed / bay">
              <TextInput
                value={bedCode}
                onChange={(e) => setBedCode(e.target.value)}
                placeholder="All beds"
              />
            </Field>
            <Field label="Variety">
              <TextInput
                value={varietyCode}
                onChange={(e) => setVarietyCode(e.target.value)}
                placeholder="All varieties"
              />
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
            <Field label="Start date">
              <TextInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
          </div>

          {/* Products */}
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">
              Products{" "}
              <span className="font-normal text-ink-faint">({items.length})</span>
            </h3>
            {items.length > 0 && (
              <p className="text-xs text-ink-faint">
                Dosing calculated from block area
                {items[0]?.area_ha != null && ` · ${items[0].area_ha} ha`}
              </p>
            )}
          </div>

          <div className="mt-2 space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.chemical_id}
                className="rounded-xl border border-line p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink">{item.name}</p>
                      {item.who_class && (
                        <Badge
                          color={
                            ["IA", "IB", "II"].includes(item.who_class)
                              ? "#dc2626"
                              : "#64748b"
                          }
                        >
                          WHO {item.who_class}
                        </Badge>
                      )}
                      {item.rac_code && <Badge>RAC {item.rac_code}</Badge>}
                    </div>
                    {(item.target1 || item.active_ingredient1) && (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {item.active_ingredient1}
                        {item.target1 && ` · targets ${item.target1}`}
                        {item.target2 && `, ${item.target2}`}
                      </p>
                    )}

                    {/* The maths that used to happen invisibly */}
                    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                      <Calc label="Rate" value={item.rate ?? "—"} />
                      <Calc
                        label="Quantity"
                        value={item.qty != null ? `${item.qty}` : "—"}
                      />
                      <Calc label="Water" value={item.volume_of_water ?? "—"} />
                      <Calc
                        label="Cost"
                        value={
                          item.cost_of_chemical != null
                            ? money(item.cost_of_chemical)
                            : "—"
                        }
                        strong
                      />
                      <Calc
                        label="PHI"
                        value={item.phi_days != null ? `${item.phi_days} days` : "—"}
                      />
                      <Calc label="REI" value={item.rei ? `${item.rei}h` : "—"} />
                      <Calc
                        label="Safe harvest"
                        value={item.safe_harvest_date ?? "—"}
                        span2
                      />
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter((p) => p.chemical_id !== item.chemical_id),
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
              <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-faint">
                {greenhouseId == null
                  ? "Select a greenhouse first — dosing is calculated from block area."
                  : "No products yet — add one below to see its dosing and cost."}
              </div>
            )}
            {preview.isPending && (
              <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-ink-faint">
                <Loader2 size={15} className="animate-spin" /> Pricing product…
              </div>
            )}
          </div>

          {/* Add product */}
          <div className="mt-3 flex gap-2">
            <Select
              value={picker}
              onChange={(e) => setPicker(e.target.value)}
              className="flex-1"
              disabled={greenhouseId == null}
            >
              <option value="">Add a product…</option>
              {(chemicals.data ?? [])
                .filter((c) => !items.some((i) => i.chemical_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.target1 ? ` — ${c.target1}` : ""}
                  </option>
                ))}
            </Select>
            <Button
              variant="outline"
              disabled={!picker || preview.isPending}
              onClick={() => {
                void addProduct(Number(picker));
                setPicker("");
              }}
            >
              <Plus size={15} /> Add
            </Button>
          </div>

          {/* Compliance */}
          {allIssues.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-ink">Compliance</h3>
              <div className="space-y-1.5">
                {blocking.map((i, n) => (
                  <IssueRow key={`b${n}`} issue={i} />
                ))}
                {warnings.map((i, n) => (
                  <IssueRow key={`w${n}`} issue={i} />
                ))}
                {infos.map((i, n) => (
                  <IssueRow key={`i${n}`} issue={i} />
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
            </div>
          )}

          {/* Notes */}
          <div className="mt-6">
            <Field label="Notes (optional)">
              <TextInput
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Anything the sprayer should know"
              />
            </Field>
          </div>
        </div>

        {/* Footer: the totals a manager signs off on */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
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
              {createProgram.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <Beaker size={15} /> Create program
                  {items.length > 1 && ` (${items.length} products)`}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Calc({
  label,
  value,
  strong,
  span2,
}: {
  label: string;
  value: string;
  strong?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : undefined}>
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
