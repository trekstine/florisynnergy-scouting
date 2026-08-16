"use client";

import {
  Beaker,
  ChevronRight,
  Download,
  FileCheck2,
  Layers,
  Plus,
  ShieldAlert,
  Sprout,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PaginationBar, usePagination } from "@/components/Pagination";
import { SprayProgramBuilder } from "@/components/SprayProgramBuilder";
import { STATUS_HEX } from "@/components/SprayProgramPanel";
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
import { bedLabel, formatDate, isHazardous, money } from "@/lib/format";
import { useEmployees, useGreenhouses, useSpray, useVarieties } from "@/lib/hooks";
import { buildSprayCsv, downloadCsv, programKey } from "@/lib/sprayExport";
import type { ProgramStatus, SprayRecord } from "@/lib/types";

/** A program is one application event — one block, one date, N tank-mixed products. */
interface Program {
  id: string;
  greenhouseId: number | null;
  greenhouse: string;
  bedCode: string | null;
  varietyCode: string | null;
  coverage: string | null;
  date: string;
  products: SprayRecord[];
  totalCost: number;
  /** The block is locked until the longest PHI across the mix clears. */
  safeHarvest: string | null;
  fromRecommendation: boolean;
  hazardous: boolean;
  status: ProgramStatus;
}

export default function SprayPage() {
  const spray = useSpray(1000);
  const greenhouses = useGreenhouses();
  // Only needed so the export resolves codes to names, same as Analytics.
  const varieties = useVarieties();
  const employees = useEmployees();

  const [ghFilter, setGhFilter] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);

  /** Full names for the export — the UI shows codes, but a CSV that says
   *  "GH03" in one screen and "Greenhouse 03" in another is the drift the
   *  shared exporter exists to prevent. */
  const ghFullName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  const varietyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varieties.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varieties.data]);

  const employeeName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employees.data]);

  /** Group the flat product rows the API returns back into programs. */
  const programs: Program[] = useMemo(() => {
    const rows = (spray.data ?? []).filter((r) =>
      ghFilter ? r.greenhouse_id === Number(ghFilter) : true,
    );
    const map = new Map<string, Program>();

    for (const r of rows) {
      // Rows without a program_id are standalone applications (older data or
      // mobile captures) — give each its own single-product program. The
      // "#<id>" form must match Analytics and the approval sheet, which look
      // the program up by this same key.
      const key = programKey(r);
      const existing = map.get(key);
      const date = r.start_date ?? r.recorded_at;

      if (!existing) {
        map.set(key, {
          id: key,
          greenhouseId: r.greenhouse_id,
          greenhouse: r.greenhouse_id
            ? (ghName.get(r.greenhouse_id) ?? `GH #${r.greenhouse_id}`)
            : "—",
          bedCode: r.bed_code,
          varietyCode: r.variety_code,
          coverage: r.coverage,
          date,
          products: [r],
          totalCost: r.cost_of_chemical ?? 0,
          safeHarvest: r.safe_harvest_date,
          fromRecommendation: r.recommendation_id != null,
          hazardous: isHazardous(r.who_class),
          status: r.program_status ?? "planned",
        });
      } else {
        existing.products.push(r);
        existing.totalCost += r.cost_of_chemical ?? 0;
        if (
          r.safe_harvest_date &&
          (!existing.safeHarvest || r.safe_harvest_date > existing.safeHarvest)
        ) {
          existing.safeHarvest = r.safe_harvest_date;
        }
        if (r.recommendation_id != null) existing.fromRecommendation = true;
        if (isHazardous(r.who_class)) existing.hazardous = true;
      }
    }

    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [spray.data, ghFilter, ghName]);

  /** Blocks still inside a pre-harvest interval — the compliance question. */
  const underPhi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const byBlock = new Map<string, { block: string; until: string; product: string }>();
    for (const p of programs) {
      if (!p.safeHarvest || p.safeHarvest <= today) continue;
      const current = byBlock.get(p.greenhouse);
      if (!current || p.safeHarvest > current.until) {
        const longest = [...p.products].sort((a, b) =>
          (b.safe_harvest_date ?? "").localeCompare(a.safe_harvest_date ?? ""),
        )[0];
        byBlock.set(p.greenhouse, {
          block: p.greenhouse,
          until: p.safeHarvest,
          product: longest?.product ?? "—",
        });
      }
    }
    return [...byBlock.values()].sort((a, b) => a.until.localeCompare(b.until));
  }, [programs]);

  const totals = useMemo(
    () => ({
      programs: programs.length,
      products: programs.reduce((s, p) => s + p.products.length, 0),
      cost: programs.reduce((s, p) => s + p.totalCost, 0),
    }),
    [programs],
  );

  const paged = usePagination(programs, 15, ghFilter);

  function exportCsv() {
    const csv = buildSprayCsv(
      programs.map((p) => ({ id: p.id, records: p.products })),
      {
        greenhouse: (id) => ghFullName.get(id) ?? `#${id}`,
        variety: (code) => varietyName.get(code) ?? code,
        employee: (id) => employeeName.get(id) ?? "",
      },
    );
    downloadCsv(csv, `spray_programs_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Spray Programs"
        subtitle="Applications, dosing and pre-harvest compliance"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!programs.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={() => setBuilderOpen(true)}>
              <Plus className="h-4 w-4" /> New program
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Kpi icon={Layers} label="Programs" value={String(totals.programs)} />
        <Kpi icon={Beaker} label="Product applications" value={String(totals.products)} />
        <Kpi icon={Sprout} label="Total spend" value={money(totals.cost)} />
        <Kpi
          icon={ShieldAlert}
          label="Blocks under PHI"
          value={String(underPhi.length)}
          tone={underPhi.length > 0 ? "#dc2626" : undefined}
        />
      </div>

      {/* Pre-harvest interval — the operationally critical panel */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Pre-harvest intervals"
            subtitle="Blocks that cannot be cut until the interval clears."
          />
          <div className="p-4">
            {underPhi.length === 0 ? (
              <EmptyState>No block is currently under a pre-harvest interval.</EmptyState>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {underPhi.map((b) => {
                  const days = Math.ceil(
                    (new Date(b.until).getTime() - Date.now()) / 86_400_000,
                  );
                  return (
                    <div
                      key={b.block}
                      className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-sm font-bold text-red-700">
                        {days}d
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-red-900">{b.block}</p>
                        <p className="truncate text-xs text-red-700">
                          Safe {formatDate(b.until)} · {b.product}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Programs */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Programs"
            subtitle="One row per application event. Open a program for the tank, the paperwork and the scouting behind it."
            actions={
              <Select
                value={ghFilter}
                onChange={(e) => setGhFilter(e.target.value)}
                className="!w-auto !py-1.5 text-xs"
              >
                <option value="">All greenhouses</option>
                {(greenhouses.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            }
          />

          {spray.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : programs.length === 0 ? (
            <div className="p-5">
              <EmptyState>
                No spray programs yet. Plan one from a recommendation, or use
                &ldquo;New program&rdquo; above.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Block</th>
                    <th className="px-3 py-2.5 font-semibold">Products</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Safe to cut</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paged.paged.map((p) => (
                    <tr key={p.id} className="group hover:bg-surface">
                      <td className="whitespace-nowrap px-5 py-3">
                        <Link
                          href={`/spray/${encodeURIComponent(p.id)}`}
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          {formatDate(p.date)}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-ink">{p.greenhouse}</span>
                        {p.bedCode && (
                          <span className="text-ink-faint"> · {bedLabel(p.bedCode)}</span>
                        )}
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {p.fromRecommendation && (
                            <Badge color="#059669">From recommendation</Badge>
                          )}
                          {p.hazardous && <Badge color="#dc2626">Hazardous</Badge>}
                        </span>
                      </td>
                      <td className="max-w-[18rem] px-3 py-3">
                        <span className="block truncate text-ink-soft">
                          {p.products.map((r) => r.product ?? "—").join(", ")}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {p.products.length} product{p.products.length === 1 ? "" : "s"}
                          {p.coverage && ` · ${p.coverage}`}
                          {p.products[0]?.type_of_application &&
                            ` · ${p.products[0].type_of_application}`}
                          {p.products[0]?.volume_of_water &&
                            ` · ${p.products[0].volume_of_water}`}
                          {p.varietyCode && ` · ${p.varietyCode}`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Badge color={STATUS_HEX[p.status]}>
                          {p.status === "planned"
                            ? "Planned"
                            : p.status === "applied"
                              ? "Applied"
                              : "Reviewed"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                        {p.safeHarvest ? formatDate(p.safeHarvest) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">
                        {money(p.totalCost)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <span className="flex items-center justify-end gap-2">
                          <Link
                            href={`/spray-approval/${encodeURIComponent(p.id)}`}
                            target="_blank"
                            title="Open the printable approval sheet"
                            className="rounded-lg border border-line p-1.5 text-brand-700 transition-colors hover:bg-brand-50"
                          >
                            <FileCheck2 size={14} />
                          </Link>
                          <Link
                            href={`/spray/${encodeURIComponent(p.id)}`}
                            title="Open the program"
                            className="rounded-lg border border-line p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!spray.isLoading && programs.length > 0 && (
            <PaginationBar
              page={paged.page}
              totalPages={paged.totalPages}
              pageSize={paged.pageSize}
              total={paged.total}
              onPage={paged.setPage}
              onPageSize={paged.setPageSize}
            />
          )}
        </Card>
      </div>

      <SprayProgramBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        context={{
          greenhouseId: null,
          greenhouseLabel: "Ad-hoc application",
          bedCode: null,
        }}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
        <Icon size={14} /> {label}
      </p>
      <p
        className="mt-1.5 text-2xl font-bold tabular-nums"
        style={{ color: tone ?? "#0f172a" }}
      >
        {value}
      </p>
    </Card>
  );
}
