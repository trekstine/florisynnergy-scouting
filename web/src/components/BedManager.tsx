"use client";

import { AlertTriangle, Grid3x3, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button, ErrorBox, Field, Spinner, TextInput } from "@/components/ui";
import {
  useBeds,
  useCreateBed,
  useCreateBedsBulk,
  useDeleteBed,
} from "@/lib/hooks";
import type { Greenhouse } from "@/lib/types";

/**
 * Bed registration for a greenhouse.
 *
 * This isn't just bookkeeping: the pest pressure index divides total severity
 * by the block's bed count, so a block with 20 physical beds but only 4
 * registered will report indices 5× too high. The panel says so explicitly.
 */
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
  const deleteBed = useDeleteBed();

  const [code, setCode] = useState("");
  const [bulkCount, setBulkCount] = useState("20");
  const [prefix, setPrefix] = useState("Bed ");
  const [error, setError] = useState<string | null>(null);

  const rows = beds.data ?? [];

  async function addOne() {
    if (!code.trim()) return;
    setError(null);
    try {
      await createBed.mutateAsync({ greenhouseId: greenhouse.id, code: code.trim() });
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that bed.");
    }
  }

  async function generate() {
    const n = Number(bulkCount);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter how many beds this block has.");
      return;
    }
    setError(null);
    try {
      await createBulk.mutateAsync({
        greenhouseId: greenhouse.id,
        count: n,
        start: 1,
        prefix,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate beds.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Grid3x3 size={17} className="text-brand-600" />
              Beds — {greenhouse.name}
            </h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {rows.length} bed{rows.length === 1 ? "" : "s"} registered
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

          {/* Bulk generate — the common path for a new block */}
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-sm font-semibold text-ink">Generate a run</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-24">
                <Field label="How many">
                  <TextInput
                    type="number"
                    min={1}
                    max={200}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field label="Prefix">
                  <TextInput
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </Field>
              </div>
              <Button onClick={generate} disabled={createBulk.isPending}>
                {createBulk.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Creates {prefix}1 … {prefix}
              {Number(bulkCount) || "N"}. Existing codes are skipped, so topping a
              block up from 12 to 20 is safe.
            </p>
          </div>

          {/* Single add */}
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Or add one bed">
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addOne();
                  }}
                  placeholder="e.g. Bed 21 or Bay A"
                />
              </Field>
            </div>
            <Button
              variant="outline"
              onClick={addOne}
              disabled={createBed.isPending || !code.trim()}
            >
              <Plus size={15} /> Add
            </Button>
          </div>

          {/* Registered beds */}
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-ink">Registered beds</p>
            {beds.isLoading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <p className="text-sm text-ink-faint">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rows.map((b) => (
                  <span
                    key={b.id}
                    className="group flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-soft"
                  >
                    {b.code}
                    <button
                      onClick={() =>
                        deleteBed.mutate({
                          greenhouseId: greenhouse.id,
                          bedId: b.id,
                        })
                      }
                      title={`Remove ${b.code}`}
                      className="text-ink-faint opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
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
