"use client";

import { AlertTriangle, Check, Grid3x3, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, ErrorBox, Field, Select, Spinner, TextInput } from "@/components/ui";
import {
  useBeds,
  useCreateBed,
  useCreateBedsBulk,
  useDeleteBeds,
} from "@/lib/hooks";
import type { Bed, Greenhouse } from "@/lib/types";

/**
 * Bed registration for a greenhouse.
 *
 * This is not bookkeeping: the pest pressure index divides total severity by
 * the block's bed count, so a block with 20 physical beds but 4 registered
 * reports indices five times too high.
 *
 * The screen is built around a preview, because the thing that made it painful
 * was generating twenty beds under the wrong naming and then having to delete
 * them one at a time. Now you see exactly what will be created before you
 * commit, and you can clear a mistake in one action.
 */

/** How farms actually name beds. A free-text prefix with a load-bearing
 *  trailing space was a trap — "Bed" and "Bed " produce different codes. */
const NAMING = [
  { id: "bed", label: "Bed 1, Bed 2, Bed 3…", code: (n: number) => `Bed ${n}` },
  { id: "bay", label: "Bay 1, Bay 2, Bay 3…", code: (n: number) => `Bay ${n}` },
  { id: "row", label: "Row 1, Row 2, Row 3…", code: (n: number) => `Row ${n}` },
  { id: "short", label: "B1, B2, B3…", code: (n: number) => `B${n}` },
  { id: "number", label: "1, 2, 3…", code: (n: number) => `${n}` },
  {
    id: "letter",
    label: "Bed A, Bed B, Bed C…",
    code: (n: number) => `Bed ${letters(n)}`,
  },
] as const;

/** 1 → A, 26 → Z, 27 → AA. */
function letters(n: number): string {
  let out = "";
  let i = n;
  while (i > 0) {
    const rem = (i - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    i = Math.floor((i - 1) / 26);
  }
  return out;
}

const EMPTY_BEDS: Bed[] = [];

export function BedManager({
  greenhouse,
  onClose,
}: {
  greenhouse: Greenhouse;
  onClose: () => void;
}) {
  const beds = useBeds(greenhouse.id);
  const createBed = useCreateBed();
  const createBulk = useCreateBedsBulk();
  const deleteBeds = useDeleteBeds();

  const [naming, setNaming] = useState<string>("bed");
  const [count, setCount] = useState("20");
  const [start, setStart] = useState("1");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Hoisted so `?? []` does not mint a new array on every render and defeat
  // the memo below.
  const rows = beds.data ?? EMPTY_BEDS;
  const existing = useMemo(() => new Set(rows.map((b) => b.code)), [rows]);
  const scheme = NAMING.find((n) => n.id === naming) ?? NAMING[0];

  /** Exactly what Generate will create — shown before anything is written. */
  const preview = useMemo(() => {
    const n = Math.min(Math.max(Number(count) || 0, 0), 200);
    const from = Math.max(Number(start) || 1, 1);
    const codes = Array.from({ length: n }, (_, i) => scheme.code(from + i));
    return {
      codes,
      fresh: codes.filter((c) => !existing.has(c)),
      skipped: codes.filter((c) => existing.has(c)),
    };
  }, [count, start, scheme, existing]);

  const withRecords = rows.filter((b) => b.records > 0);
  const selectedRows = rows.filter((b) => selected.has(b.id));
  const selectedRecords = selectedRows.reduce((s, b) => s + b.records, 0);

  async function generate() {
    if (preview.fresh.length === 0) {
      setError(
        preview.codes.length === 0
          ? "Enter how many beds this block has."
          : "Every one of those codes is already registered.",
      );
      return;
    }
    setError(null);
    try {
      // The exact codes from the preview, so what lands is what was shown —
      // including naming that is not prefix + number, like "Bed A".
      await createBulk.mutateAsync({
        greenhouseId: greenhouse.id,
        codes: preview.codes,
      });
      setDone(
        `Registered ${preview.fresh.length} bed${preview.fresh.length === 1 ? "" : "s"}` +
          (preview.skipped.length
            ? `, skipped ${preview.skipped.length} already there`
            : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate beds.");
    }
  }

  async function addOne() {
    if (!code.trim()) return;
    setError(null);
    try {
      await createBed.mutateAsync({ greenhouseId: greenhouse.id, code: code.trim() });
      setDone(`Added ${code.trim()}`);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that bed.");
    }
  }

  async function removeSelected() {
    if (selected.size === 0) return;
    if (
      selectedRecords > 0 &&
      !confirm(
        `${selected.size} bed${selected.size === 1 ? "" : "s"} carry ` +
          `${selectedRecords} scouting record${selectedRecords === 1 ? "" : "s"}. ` +
          "Removing them leaves that history without a registered bed. Continue?",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const r = await deleteBeds.mutateAsync({
        greenhouseId: greenhouse.id,
        bedIds: [...selected],
      });
      setDone(`Removed ${r.deleted} bed${r.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove those beds.");
    }
  }

  async function removeAll() {
    if (
      !confirm(
        `Clear all ${rows.length} beds on ${greenhouse.name}?` +
          (withRecords.length
            ? ` ${withRecords.length} of them have scouting history.`
            : " None of them have scouting history."),
      )
    ) {
      return;
    }
    setError(null);
    try {
      const r = await deleteBeds.mutateAsync({ greenhouseId: greenhouse.id });
      setDone(`Cleared ${r.deleted} bed${r.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the beds.");
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const busy = createBulk.isPending || createBed.isPending || deleteBeds.isPending;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Grid3x3 size={17} className="text-brand-600" />
              Beds — {greenhouse.name}
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {rows.length} bed{rows.length === 1 ? "" : "s"} registered
              {withRecords.length > 0 && ` · ${withRecords.length} with scouting history`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <ErrorBox message={error} />
          {done && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <Check size={15} className="shrink-0 text-emerald-700" />
              <p className="text-sm font-medium text-emerald-800">{done}</p>
            </div>
          )}

          {rows.length === 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-700" />
              <p className="text-sm text-amber-800">
                No beds registered. Pest pressure divides total severity by this
                block&apos;s bed count, so register every bed or the indices will
                read too high.
              </p>
            </div>
          )}

          {/* ── Generate a run — the common path ── */}
          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-sm font-semibold text-ink">Register the beds</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Naming">
                <Select value={naming} onChange={(e) => setNaming(e.target.value)}>
                  {NAMING.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="How many">
                <TextInput
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </Field>
              <Field label="Starting at">
                <TextInput
                  type="number"
                  min={1}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
            </div>

            {/* The preview is the point: see it before you commit to it. */}
            <div className="mt-3 rounded-lg bg-surface p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Will create
              </p>
              {preview.codes.length === 0 ? (
                <p className="mt-1 text-sm text-ink-faint">
                  Enter how many beds this block has.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {preview.codes.slice(0, 3).join(", ")}
                    {preview.codes.length > 4 && ", …"}
                    {preview.codes.length > 3 &&
                      `, ${preview.codes[preview.codes.length - 1]}`}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {preview.fresh.length} new
                    {preview.skipped.length > 0 &&
                      ` · ${preview.skipped.length} already registered, will be skipped`}
                  </p>
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={generate} disabled={busy || preview.fresh.length === 0}>
                {createBulk.isPending
                  ? "Registering…"
                  : `Register ${preview.fresh.length || ""} bed${preview.fresh.length === 1 ? "" : "s"}`}
              </Button>
              {rows.length > 0 && (
                <button
                  onClick={removeAll}
                  disabled={busy}
                  className="text-xs font-semibold text-ink-faint hover:text-red-700 hover:underline disabled:opacity-50"
                >
                  Clear all {rows.length} and start again
                </button>
              )}
            </div>
          </div>

          {/* ── One-off ── */}
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Or add a single bed">
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addOne();
                  }}
                  placeholder="e.g. Bed 21, Bay A, Tunnel 3"
                />
              </Field>
            </div>
            <Button variant="outline" onClick={addOne} disabled={busy || !code.trim()}>
              <Plus size={15} /> Add
            </Button>
          </div>

          {/* ── Registered ── */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-ink">
                Registered beds {rows.length > 0 && `· ${rows.length}`}
              </p>
              {rows.length > 0 && (
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <button
                    onClick={() =>
                      setSelected(
                        selected.size === rows.length
                          ? new Set()
                          : new Set(rows.map((b) => b.id)),
                      )
                    }
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {selected.size === rows.length ? "Select none" : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <button
                      onClick={removeSelected}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Remove {selected.size}
                    </button>
                  )}
                </div>
              )}
            </div>

            {beds.isLoading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <p className="text-sm text-ink-faint">None yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((b) => {
                    const on = selected.has(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggle(b.id)}
                        title={
                          b.records > 0
                            ? `${b.code} — ${b.records} scouting record${b.records === 1 ? "" : "s"}`
                            : `${b.code} — never scouted`
                        }
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          on
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-line bg-surface text-ink-soft hover:border-ink-faint"
                        }`}
                      >
                        {on && <Check size={11} />}
                        {b.code}
                        {b.records > 0 && (
                          <span className="text-[10px] text-ink-faint">{b.records}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Tap a bed to select it. The small number is how many scouting
                  records name it.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3">
          <p className="text-xs text-ink-faint">
            Beds are the unit scouts report against.
          </p>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
