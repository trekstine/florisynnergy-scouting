"use client";

import {
  Beaker,
  Droplets,
  FileCheck2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FertigationBuilder } from "@/components/FertigationBuilder";
import { PaginationBar, usePagination } from "@/components/Pagination";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import {
  useDeleteFertigation,
  useFertigations,
  useGreenhouses,
  useMe,
} from "@/lib/hooks";
import type { Fertigation } from "@/lib/types";

const ACTIVITY_HEX: Record<string, string> = {
  fertigation: "#0891b2",
  drenching: "#7c3aed",
  flushing: "#0d9488",
};

const STATUS_HEX: Record<string, string> = {
  draft: "#64748b",
  issued: "#0891b2",
  completed: "#059669",
  cancelled: "#b91c1c",
};

/**
 * Fertigation sheets — the feeding record.
 *
 * One row per event, because that is the unit a farm signs and files. The
 * columns are the four questions a manager asks of the list: when, where, how
 * much water, what did it cost.
 */
export default function FertigationPage() {
  const [activity, setActivity] = useState("");
  const [greenhouse, setGreenhouse] = useState("");
  const [status, setStatus] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Fertigation | null>(null);

  const greenhouses = useGreenhouses();
  const me = useMe();
  const remove = useDeleteFertigation();
  const q = useFertigations({
    activity: activity || undefined,
    greenhouse_id: greenhouse ? Number(greenhouse) : undefined,
    status: status || undefined,
  });

  const rows = q.data ?? [];
  const paged = usePagination(rows, 20, `${activity}|${greenhouse}|${status}`);

  const canEdit = me.data?.role === "admin" || me.data?.role === "supervisor";
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0);
  const totalWater = rows.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);

  async function withdraw(row: Fertigation) {
    if (
      !confirm(
        `Delete the ${row.activity} sheet for ${formatDate(row.event_date)}? ` +
          "Nothing has been signed against it.",
      )
    ) {
      return;
    }
    await remove.mutateAsync(row.doc_id);
  }

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Fertigation"
        subtitle="Feeding, drenching and flushing sheets"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setEditing(null);
                setBuilderOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New sheet
            </Button>
          ) : undefined
        }
      />

      {/* Headline numbers for whatever is filtered in. */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Kpi icon={<Beaker size={14} />} label="Sheets" value={String(rows.length)} />
        <Kpi
          icon={<Droplets size={14} />}
          label="Water applied"
          value={`${Math.round(totalWater).toLocaleString()} m³`}
        />
        <Kpi label="Fertiliser cost" value={money(totalCost)} />
        <Kpi
          label="Signed"
          value={String(rows.filter((r) => r.signature_count > 0).length)}
        />
      </div>

      <div className="px-6">
        <Card>
          <CardHeader
            title="Sheets"
            subtitle="Newest first. Open one to see the tanks and raise the document."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="!w-auto !py-1.5 text-xs"
                >
                  <option value="">All activities</option>
                  <option value="fertigation">Fertigation</option>
                  <option value="drenching">Drenching</option>
                  <option value="flushing">Flushing</option>
                </Select>
                <Select
                  value={greenhouse}
                  onChange={(e) => setGreenhouse(e.target.value)}
                  className="!w-auto !py-1.5 text-xs"
                >
                  <option value="">All greenhouses</option>
                  {(greenhouses.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="!w-auto !py-1.5 text-xs"
                >
                  <option value="">Any status</option>
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>
            }
          />

          {q.isLoading ? (
            <div className="p-8">
              <Spinner label="Loading sheets…" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState>
                No fertigation sheets yet.
                {canEdit && " Use “New sheet” to record one."}
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-5 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Activity</th>
                      <th className="px-3 py-2.5 font-semibold">Where</th>
                      <th className="px-3 py-2.5 font-semibold">Tanks</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Water</th>
                      <th className="px-3 py-2.5 text-right font-semibold">m³/ha</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paged.paged.map((r) => (
                      <tr key={r.doc_id} className="hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-3">
                          <Link
                            href={`/fertigation/${r.doc_id}`}
                            className="font-semibold text-brand-700 hover:underline"
                          >
                            {formatDate(r.event_date)}
                          </Link>
                          {r.start_time && (
                            <span className="block text-xs text-ink-faint">
                              {r.start_time}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={ACTIVITY_HEX[r.activity]}>
                            {r.activity}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-ink-soft">
                          {r.phase ?? "No phase"}
                          {r.blocks_label && (
                            <span className="block text-xs text-ink-faint">
                              {r.blocks_label}
                            </span>
                          )}
                          {r.type_of_application && (
                            <span className="block text-xs text-ink-faint">
                              {r.type_of_application}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-faint">
                          {r.tanks.length
                            ? r.tanks
                                .map((t) => `${t.code}·${t.lines.length}`)
                                .join("  ")
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                          {r.volume_m3 != null ? `${r.volume_m3} m³` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                          {r.m3_per_ha ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">
                          {money(r.total_cost)}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge color={STATUS_HEX[r.status]}>{r.status}</Badge>
                            {r.signature_count > 0 && (
                              <span
                                title={`${r.signature_count} signature${r.signature_count === 1 ? "" : "s"} — locked against edits`}
                                className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700"
                              >
                                <Lock size={10} /> {r.signature_count}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <span className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/fertigation-doc/${r.doc_id}`}
                              target="_blank"
                              title="Open the printable sheet"
                              className="rounded-lg border border-line p-1.5 text-brand-700 hover:bg-brand-50"
                            >
                              <FileCheck2 size={14} />
                            </Link>
                            {canEdit && r.signature_count === 0 && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditing(r);
                                    setBuilderOpen(true);
                                  }}
                                  title="Edit"
                                  className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => withdraw(r)}
                                  disabled={remove.isPending}
                                  title="Delete"
                                  className="rounded-lg border border-line p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={paged.page}
                totalPages={paged.totalPages}
                pageSize={paged.pageSize}
                total={paged.total}
                onPage={paged.setPage}
                onPageSize={paged.setPageSize}
              />
            </>
          )}
        </Card>
      </div>

      <FertigationBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        editing={editing}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </Card>
  );
}
