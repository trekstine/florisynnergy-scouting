"use client";

import { ArrowLeft, GripVertical, PenLine, Plus, Trash2 } from "lucide-react";
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
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import {
  useApprovalSlots,
  useRetireApprovalSlot,
  useSaveApprovalSlot,
} from "@/lib/hooks";
import type { ApprovalSlot, Role } from "@/lib/types";

/**
 * Which signatures an approval sheet carries.
 *
 * Farms differ in who has to sign off a spray — some want the agronomist, the
 * manager and the storeman; some only the manager. Hard-coding one farm's
 * paperwork would mean every other farm signs a sheet that misrepresents its
 * own process, so the lines are configuration.
 */
const DOC_TYPES = [
  { id: "spray_program", label: "Spray approval" },
  { id: "fertigation", label: "Fertigation sheet" },
];

export default function ApprovalSettingsPage() {
  // Spray and fertigation are signed by different people, so the lines are
  // held per sheet rather than shared.
  const [docType, setDocType] = useState(DOC_TYPES[0]!.id);
  const slots = useApprovalSlots(docType);
  const save = useSaveApprovalSlot();
  const retire = useRetireApprovalSlot();

  const [editing, setEditing] = useState<Partial<ApprovalSlot> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = [...(slots.data ?? [])].sort((a, b) => a.position - b.position);

  async function submit() {
    if (!editing?.label?.trim()) {
      setError("Give the line a label — it is what the sheet will print.");
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        id: editing.id,
        document_type: docType,
        label: editing.label.trim(),
        hint: editing.hint?.trim() || null,
        position: editing.position ?? rows.length,
        required_role: editing.required_role ?? null,
        is_required: editing.is_required ?? true,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that line.");
    }
  }

  async function move(slot: ApprovalSlot, delta: number) {
    const ordered = rows.map((r, i) => ({ ...r, position: i }));
    const from = ordered.findIndex((r) => r.id === slot.id);
    const to = from + delta;
    if (to < 0 || to >= ordered.length) return;
    // Swap, then persist both — positions are only meaningful relative to
    // each other, so writing one and not the other leaves a tie.
    [ordered[from]!.position, ordered[to]!.position] = [
      ordered[to]!.position,
      ordered[from]!.position,
    ];
    await save.mutateAsync({ id: ordered[from]!.id, position: ordered[from]!.position });
    await save.mutateAsync({ id: ordered[to]!.id, position: ordered[to]!.position });
  }

  async function remove(slot: ApprovalSlot) {
    if (
      !confirm(
        `Retire “${slot.label}”? Sheets already signed against it keep their ` +
          "signatures — this only stops it appearing on new ones.",
      )
    ) {
      return;
    }
    await retire.mutateAsync(slot.id);
  }

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Approval signatures"
        subtitle="The signature lines every approval sheet carries"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="!w-auto"
            >
              {DOC_TYPES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
            <Button
              onClick={() =>
                setEditing({ label: "", is_required: true, position: rows.length })
              }
            >
              <Plus className="h-4 w-4" /> Add a line
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

      <div className="px-6">
        <Card>
          <CardHeader
            title="Signature lines"
            subtitle="Printed in this order on every spray approval sheet."
          />
          <div className="p-5">
            <ErrorBox message={error} />
            {slots.isLoading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <EmptyState>
                No signature lines. An approval sheet with no lines cannot be
                signed — add at least one.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((slot, i) => (
                  <li key={slot.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex shrink-0 flex-col text-ink-faint">
                      <button
                        onClick={() => move(slot, -1)}
                        disabled={i === 0 || save.isPending}
                        title="Move up"
                        className="hover:text-ink disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => move(slot, 1)}
                        disabled={i === rows.length - 1 || save.isPending}
                        title="Move down"
                        className="hover:text-ink disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </span>
                    <GripVertical size={14} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{slot.label}</span>
                        {slot.required_role ? (
                          <Badge color="#0891b2">
                            {slot.required_role} only
                          </Badge>
                        ) : (
                          <Badge>anyone signed in</Badge>
                        )}
                        {!slot.is_required && <Badge color="#64748b">optional</Badge>}
                      </span>
                      {slot.hint && (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {slot.hint}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setEditing(slot)}
                        className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
                        title="Edit"
                      >
                        <PenLine size={14} />
                      </button>
                      <button
                        onClick={() => remove(slot)}
                        disabled={retire.isPending}
                        className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        title="Retire this line"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
              A sheet is fully approved once every <strong>required</strong> line
              is signed. At that point the portal generates the signed PDF and
              files it against the programme, and the programme locks against
              edits.
            </p>
          </div>
        </Card>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-bold text-ink">
                {editing.id ? "Edit signature line" : "New signature line"}
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              <ErrorBox message={error} />
              <Field label="Label">
                <TextInput
                  value={editing.label ?? ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="e.g. Approved by"
                />
              </Field>
              <Field label="Hint printed under the line">
                <TextInput
                  value={editing.hint ?? ""}
                  onChange={(e) => setEditing({ ...editing, hint: e.target.value })}
                  placeholder="e.g. Authorises the chemical, the dose and the spend"
                />
              </Field>
              <Field label="Who may sign it">
                <Select
                  value={editing.required_role ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      required_role: (e.target.value || null) as Role | null,
                    })
                  }
                >
                  <option value="">Anyone signed in</option>
                  <option value="scout">Scouts only</option>
                  <option value="supervisor">Supervisors only</option>
                  <option value="admin">Admins only</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={editing.is_required ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, is_required: e.target.checked })
                  }
                />
                Required — the sheet is not fully approved without it
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save line"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
