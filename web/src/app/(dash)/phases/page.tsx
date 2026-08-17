"use client";

import { ArrowLeft, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBox,
  Field,
  PageHeader,
  Spinner,
  TextInput,
} from "@/components/ui";
import {
  useDeletePhase,
  useGreenhouses,
  usePhases,
  useSavePhase,
} from "@/lib/hooks";
import type { Phase } from "@/lib/types";

/**
 * Fertigation phases — which greenhouses are fed together.
 *
 * A phase is a real piece of plumbing: one pump, one set of stock tanks, a
 * group of blocks. Fertigation is raised against it, and the area it covers is
 * the sum of those blocks — so this mapping decides whether every m³ per
 * hectare on the farm is right or several times out.
 */
export default function PhasesPage() {
  const phases = usePhases();
  const greenhouses = useGreenhouses();
  const save = useSavePhase();
  const remove = useDeletePhase();

  const [editing, setEditing] = useState<Partial<Phase> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = phases.data ?? [];
  const houses = greenhouses.data ?? [];
  const mapped = new Set(rows.flatMap((p) => p.greenhouse_ids));
  const unmapped = houses.filter((g) => !mapped.has(g.id));

  async function submit() {
    if (!editing?.code?.trim() || !editing?.name?.trim()) {
      setError("A phase needs a code and a name.");
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        id: editing.id,
        code: editing.code.trim(),
        name: editing.name.trim(),
        note: editing.note ?? null,
        position: editing.position ?? rows.length,
        is_active: editing.is_active ?? true,
        greenhouse_ids: editing.greenhouse_ids ?? [],
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that phase.");
    }
  }

  async function withdraw(phase: Phase) {
    if (
      !confirm(
        `Delete ${phase.name}? Its ${phase.greenhouse_ids.length} greenhouse` +
          `${phase.greenhouse_ids.length === 1 ? "" : "s"} will be released, not deleted. ` +
          "Fertigation sheets already raised keep the phase name they were signed with.",
      )
    ) {
      return;
    }
    await remove.mutateAsync(phase.id);
  }

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Fertigation phases"
        subtitle="Which greenhouses are fed together"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                setEditing({ code: "", name: "", greenhouse_ids: [], is_active: true })
              }
            >
              <Plus className="h-4 w-4" /> Add a phase
            </Button>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> Settings
            </Link>
          </div>
        }
      />

      <div className="space-y-4 px-6">
        {phases.isLoading ? (
          <Card>
            <div className="p-8">
              <Spinner label="Loading phases…" />
            </div>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState>
              No phases yet. A fertigation covers a phase, and its area is the sum
              of the blocks on it — add one to get started.
            </EmptyState>
          </Card>
        ) : (
          rows.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={`${p.name} · ${p.code}`}
                subtitle={
                  p.note ??
                  `${p.greenhouse_ids.length} greenhouse${p.greenhouse_ids.length === 1 ? "" : "s"} · ${p.area_ha} ha fed together`
                }
                actions={
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => setEditing(p)}
                      className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => withdraw(p)}
                      disabled={remove.isPending}
                      className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                }
              />
              <div className="flex flex-wrap gap-1.5 p-5">
                {p.greenhouses.length === 0 ? (
                  <p className="text-sm text-ink-faint">
                    No greenhouses mapped. A fertigation on this phase would cover
                    nothing.
                  </p>
                ) : (
                  p.greenhouses.map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-soft"
                    >
                      {name}
                    </span>
                  ))
                )}
              </div>
            </Card>
          ))
        )}

        {/* A block on no phase can never be fed by a phase-wide sheet. */}
        {unmapped.length > 0 && (
          <Card>
            <CardHeader
              title={`Not on any phase · ${unmapped.length}`}
              subtitle="These blocks will not be picked up by a phase-wide fertigation."
            />
            <div className="flex flex-wrap gap-1.5 p-5">
              {unmapped.map((g) => (
                <span
                  key={g.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
                >
                  {g.name}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <Layers size={17} className="text-brand-600" />
                {editing.id ? "Edit phase" : "New phase"}
              </h2>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
              <ErrorBox message={error} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Code">
                  <TextInput
                    value={editing.code ?? ""}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                    placeholder="e.g. P1"
                  />
                </Field>
                <Field label="Name">
                  <TextInput
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Phase 1"
                  />
                </Field>
              </div>
              <Field label="Note">
                <TextInput
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="e.g. Fed from the upper reservoir"
                />
              </Field>

              <div>
                <div className="mb-1.5 flex items-center gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Greenhouses on this phase
                  </span>
                  <span className="text-xs text-ink-faint">
                    {(editing.greenhouse_ids ?? []).length} selected ·{" "}
                    {Math.round(
                      houses
                        .filter((g) => (editing.greenhouse_ids ?? []).includes(g.id))
                        .reduce((s, g) => s + Number(g.area_ha ?? 0), 0) * 10000,
                    ) / 10000}{" "}
                    ha
                  </span>
                </div>
                <div className="grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2">
                  {houses.map((g) => {
                    const ids = editing.greenhouse_ids ?? [];
                    const on = ids.includes(g.id);
                    // A block already on another phase would be moved, not
                    // shared — say so rather than letting it happen quietly.
                    const other = rows.find(
                      (p) => p.id !== editing.id && p.greenhouse_ids.includes(g.id),
                    );
                    return (
                      <label
                        key={g.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                          on ? "border-brand-300 bg-brand-50/40" : "border-line"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setEditing({
                              ...editing,
                              greenhouse_ids: on
                                ? ids.filter((x) => x !== g.id)
                                : [...ids, g.id],
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {g.name}
                          </span>
                          <span className="text-[11px] text-ink-faint">
                            {g.area_ha != null ? `${g.area_ha} ha` : "area not set"}
                          </span>
                        </span>
                        {other && !on && (
                          <Badge color="#d97706">on {other.code}</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save phase"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
