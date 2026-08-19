"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import { PaginationBar, usePagination } from "@/components/Pagination";
import { ScoutingBehindLink } from "@/components/ScoutingBehindLink";
import { Badge, Card, CardHeader, Spinner } from "@/components/ui";
import { formatDate, isHazardous, money } from "@/lib/format";
import { buildSprayCsv, downloadCsv } from "@/lib/sprayExport";
import type { SprayRecord } from "@/lib/types";

/** One application event: a block, a date, and the products in the tank. */
export interface Program {
  program: string;
  products: Set<string>;
  greenhouses: Set<string>;
  totalCost: number;
  firstDate: string | null;
  lastDate: string | null;
  activePhiUntil: string | null;
  records: SprayRecord[];
}

const dt = (v: string | null | undefined) => (v ? formatDate(v) : "—");

export function SprayProgramsTable({
  programs,
  loading,
  ghName,
  varietyName,
  employeeName,
  rangeLabel,
  reportParams,
}: {
  programs: Program[];
  loading: boolean;
  ghName: Map<number, string>;
  varietyName: Map<string, string>;
  employeeName: Map<number, string>;
  /** Used to name the export file, e.g. "2026-07-11_to_2026-08-10". */
  rangeLabel: string;
  /** Passed to the printable report so it covers the same slice. */
  reportParams: Record<string, string>;
}) {
  const table = usePagination(programs, 10);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const csv = buildSprayCsv(
      programs.map((p) => ({ id: p.program, records: p.records })),
      {
        greenhouse: (id) => ghName.get(id) ?? `#${id}`,
        variety: (code) => varietyName.get(code) ?? code,
        employee: (id) => employeeName.get(id) ?? "",
      },
    );
    downloadCsv(csv, `spray_programs_${rangeLabel}.csv`);
  }

  const productLines = programs.reduce((s, p) => s + p.records.length, 0);

  return (
    <Card>
      <CardHeader
        title="Programs"
        subtitle="One row per application event — expand to see the tank mix, dosing and compliance."
        actions={
          <span className="flex items-center gap-2">
            <Link
              href={`/spray-report?${new URLSearchParams(
                Object.entries(reportParams).filter(([, v]) => v) as [string, string][],
              )}`}
              target="_blank"
              title="Printable report of every chemical application in range"
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <FileText size={14} /> Chemical report
            </Link>
          <button
            onClick={exportCsv}
            disabled={programs.length === 0}
            title="Download every product line for the current filters"
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
          >
            <Download size={14} /> Export CSV ({productLines})
          </button>
          </span>
        }
      />
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-2 py-2.5 font-semibold">Program</th>
              <th className="px-3 py-2.5 font-semibold">Greenhouse</th>
              <th className="px-3 py-2.5 font-semibold">Products</th>
              <th className="px-3 py-2.5 font-semibold">Window</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
              <th className="px-3 py-2.5 font-semibold">PHI status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <Spinner label="Loading programs…" />
                </td>
              </tr>
            ) : programs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-ink-faint">
                  No spray programs in range.
                </td>
              </tr>
            ) : (
              table.paged.map((p) => {
                const isOpen = open.has(p.program);
                const hazardous = p.records.some((r) => isHazardous(r.who_class));
                return (
                  // The Fragment is the mapped element, so the key belongs
                  // here — on the children React never sees it.
                  <Fragment key={p.program}>
                    <tr
                      onClick={() => toggle(p.program)}
                      className="cursor-pointer hover:bg-surface"
                    >
                      <td className="px-3 py-2.5 text-ink-faint">
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs text-ink">
                        {p.program.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {[...p.greenhouses].join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {[...p.products].map((n) => (
                            <span
                              key={n}
                              className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium"
                            >
                              {n}
                            </span>
                          ))}
                          {hazardous && <Badge color="#dc2626">Hazardous</Badge>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-faint">
                        {dt(p.firstDate)}
                        {p.firstDate !== p.lastDate && ` – ${dt(p.lastDate)}`}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                        {money(p.totalCost)}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.activePhiUntil ? (
                          <Badge color="#dc2626">Active until {dt(p.activePhiUntil)}</Badge>
                        ) : (
                          <Badge color="#059669">Cleared</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-3">
                          <Link
                            href={`/spray/${encodeURIComponent(p.program)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Open the full program"
                            className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline"
                          >
                            Program
                          </Link>
                          <Link
                            href={`/spray-approval/${encodeURIComponent(p.program)}`}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            title="Open the printable approval sheet"
                            className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline"
                          >
                            <FileCheck2 size={14} /> Sheet
                          </Link>
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface/60">
                        <td colSpan={8} className="px-5 py-4">
                          <ProgramDetail
                            program={p}
                            ghName={ghName}
                            varietyName={varietyName}
                            employeeName={employeeName}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={table.page}
        totalPages={table.totalPages}
        pageSize={table.pageSize}
        total={table.total}
        onPage={table.setPage}
        onPageSize={table.setPageSize}
        pageSizeOptions={[10, 25, 50]}
      />
    </Card>
  );
}

function ProgramDetail({
  program: p,
  ghName,
  varietyName,
  employeeName,
}: {
  program: Program;
  ghName: Map<number, string>;
  varietyName: Map<string, string>;
  employeeName: Map<number, string>;
}) {
  const head = p.records[0]!;
  const maxRei = p.records
    .map((r) => Number(r.rei))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];

  return (
    <div className="space-y-4">
      {/* Location, crop and provenance */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Greenhouse">
          {head.greenhouse_id != null ? ghName.get(head.greenhouse_id) ?? "—" : "—"}
        </Field>
        <Field label="Bed / bay">{head.bed_code ?? "All beds"}</Field>
        <Field label="Partition">{head.partition_no ?? "—"}</Field>
        <Field label="Variety">
          {head.variety_code ? varietyName.get(head.variety_code) ?? head.variety_code : "All"}
        </Field>
        <Field label="Application">{head.type_of_application ?? "—"}</Field>
        <Field label="Coverage">{head.coverage ?? "—"}</Field>
        <Field label="Water volume">{head.volume_of_water ?? "—"}</Field>
        <Field label="Block area">{head.area_ha != null ? `${head.area_ha} ha` : "—"}</Field>
        <Field label="Start">
          {dt(head.start_date)}
          {head.start_time ? ` ${head.start_time.slice(0, 5)}` : ""}
        </Field>
        <Field label="Scout report">{dt(head.scout_report_date)}</Field>
        <Field label="Re-entry">{maxRei != null ? `${maxRei} h` : "—"}</Field>
        <Field label="Prepared by">
          {head.scout_id != null ? employeeName.get(head.scout_id) ?? "—" : "—"}
        </Field>
      </dl>

      {/* Per-product dosing, cost and safety */}
      <div className="overflow-auto rounded-lg border border-line bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Active ingredient</th>
              <th className="px-3 py-2 font-semibold">Target</th>
              <th className="px-3 py-2 font-semibold">WHO</th>
              <th className="px-3 py-2 font-semibold">RAC</th>
              <th className="px-3 py-2 text-right font-semibold">Rate</th>
              <th className="px-3 py-2 text-right font-semibold">Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Unit price</th>
              <th className="px-3 py-2 text-right font-semibold">Cost</th>
              <th className="px-3 py-2 text-right font-semibold">REI</th>
              <th className="px-3 py-2 font-semibold">PHI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.records.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-semibold text-ink">{r.product ?? "—"}</td>
                <td className="px-3 py-2 text-ink-soft">
                  {[r.active_ingredient1, r.active_ingredient2]
                    .filter(Boolean)
                    .join(" + ") || "—"}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  {[r.target1, r.target2].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2">
                  {r.who_class ? (
                    <Badge color={isHazardous(r.who_class) ? "#dc2626" : "#64748b"}>
                      {r.who_class}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">{r.rac_code ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.rate ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {r.qty ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                  {r.buying_price != null ? money(r.buying_price) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {r.cost_of_chemical != null ? money(r.cost_of_chemical) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                  {r.rei ? `${r.rei}h` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-faint">
                  {r.phi_days != null ? `${r.phi_days}d → ${dt(r.safe_harvest_date)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {/* The total is what gets approved, so it belongs under the column
              it totals rather than only in the collapsed row. */}
          <tfoot>
            <tr className="border-t border-line bg-surface">
              <td colSpan={8} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {p.records.length} product{p.records.length === 1 ? "" : "s"} · total
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-ink">
                {money(p.totalCost)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Provenance: why this happened, and anything overridden. The link
          back to scouting is the point — a spray should always be traceable
          to the observation that justified it. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="text-ink-faint">
          Raised from:{" "}
          {head.recommendation_id != null ? (
            <Link
              href={`/recommendations`}
              className="font-semibold text-brand-700 hover:underline"
            >
              Recommendation #{head.recommendation_id}
            </Link>
          ) : (
            <span className="font-medium text-ink-soft">
              Routine program (no recommendation)
            </span>
          )}
        </span>
        {/* No fallback to start_date: the day it was sprayed is not the day it
            was justified, and substituting one for the other is how the wrong
            rounds came to be shown. */}
        <ScoutingBehindLink
          greenhouseId={head.greenhouse_id}
          reportDate={head.scout_report_date}
          reportEndDate={head.scout_report_end_date}
          className="flex items-center gap-1 font-semibold text-brand-700 hover:underline"
        />
        {head.comments && (
          <span
            className={
              head.comments.startsWith("[Compliance override]")
                ? "rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800"
                : "text-ink-faint"
            }
          >
            {head.comments}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
