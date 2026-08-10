"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { LogoLockup } from "@/components/Logo";
import { Spinner } from "@/components/ui";
import { formatDate, isHazardous, money } from "@/lib/format";
import { useEmployees, useGreenhouses, useSpray, useVarieties } from "@/lib/hooks";
import type { SprayRecord } from "@/lib/types";

/**
 * Every chemical application in a date range, as a printable document.
 *
 * The approval sheet authorises one program before it happens. This is the
 * other half: the record of what actually went out, one line per chemical,
 * for the file the manager keeps and the auditor asks for.
 */
export default function ChemicalReportPage() {
  return (
    <Suspense fallback={<div className="p-10"><Spinner /></div>}>
      <ChemicalReport />
    </Suspense>
  );
}

function ChemicalReport() {
  const sp = useSearchParams();
  const start = sp.get("start");
  const end = sp.get("end");
  const ghFilter = sp.get("greenhouse_id");

  const spray = useSpray(1000);
  const greenhouses = useGreenhouses();
  const varieties = useVarieties();
  const employees = useEmployees();

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);

  const varietyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varieties.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varieties.data]);

  const scoutName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employees.data]);

  const rows = useMemo(() => {
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() + 86_400_000 - 1 : null;
    return (spray.data ?? [])
      .filter((r) => {
        if (ghFilter && r.greenhouse_id !== Number(ghFilter)) return false;
        const ts = new Date(r.start_date ?? r.recorded_at).getTime();
        if (startTs != null && ts < startTs) return false;
        if (endTs != null && ts > endTs) return false;
        return true;
      })
      .sort((a, b) =>
        (b.start_date ?? b.recorded_at).localeCompare(a.start_date ?? a.recorded_at),
      );
  }, [spray.data, start, end, ghFilter]);

  const total = rows.reduce((s, r) => s + (r.cost_of_chemical ?? 0), 0);
  const products = new Set(rows.map((r) => r.product).filter(Boolean)).size;
  const blocks = new Set(rows.map((r) => r.greenhouse_id).filter((v) => v != null)).size;
  const hazardous = rows.filter((r) => isHazardous(r.who_class)).length;

  if (spray.isLoading) {
    return (
      <div className="p-10">
        <Spinner label="Loading applications…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[1100px] items-center justify-between px-6 print:hidden">
        <p className="text-sm text-ink-faint">
          {rows.length} chemical application{rows.length === 1 ? "" : "s"} in range.
        </p>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[1100px] bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div className="flex items-center gap-4">
            {/* The registered mark heads every printed document. */}
            <LogoLockup width={150} />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">
                Chemical Application Report
              </h1>
              <p className="text-sm text-ink-faint">Naivasha Rose Estate</p>
            </div>
          </div>
          <div className="text-right text-xs text-ink-faint">
            <p>
              Period{" "}
              <span className="font-semibold text-ink">
                {start ? formatDate(start) : "all"} – {end ? formatDate(end) : "all"}
              </span>
            </p>
            <p>Issued {formatDate(new Date().toISOString())}</p>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-4 gap-4 border-b border-line pb-4">
          <Summary label="Applications" value={String(rows.length)} />
          <Summary label="Distinct products" value={String(products)} />
          <Summary label="Blocks treated" value={String(blocks)} />
          <Summary label="Total chemical cost" value={money(total)} />
        </div>

        {hazardous > 0 && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {hazardous} application{hazardous === 1 ? "" : "s"} used a highly hazardous
            product (WHO class II or above). These are marked in the table.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-ink-faint">
            No chemical applications in this period.
          </p>
        ) : (
          <table className="mt-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-ink text-left text-[9px] uppercase tracking-wider text-ink-faint">
                <th className="py-1.5 pr-2 font-semibold">Date</th>
                <th className="py-1.5 pr-2 font-semibold">Block</th>
                <th className="py-1.5 pr-2 font-semibold">Bed</th>
                <th className="py-1.5 pr-2 font-semibold">Variety</th>
                <th className="py-1.5 pr-2 font-semibold">Product</th>
                <th className="py-1.5 pr-2 font-semibold">Active ingredient</th>
                <th className="py-1.5 pr-2 font-semibold">Target</th>
                <th className="py-1.5 pr-2 font-semibold">Appl.</th>
                <th className="py-1.5 pr-2 font-semibold">Cover</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Water</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Rate</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Cost</th>
                <th className="py-1.5 pr-2 font-semibold">WHO</th>
                <th className="py-1.5 pr-2 font-semibold">RAC</th>
                <th className="py-1.5 pr-2 font-semibold">REI</th>
                <th className="py-1.5 font-semibold">Safe to cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  block={r.greenhouse_id != null ? ghName.get(r.greenhouse_id) ?? "—" : "—"}
                  variety={
                    r.variety_code ? varietyName.get(r.variety_code) ?? r.variety_code : "—"
                  }
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <td colSpan={12} className="py-2 text-right text-xs font-semibold text-ink">
                  Total
                </td>
                <td className="py-2 pr-2 text-right text-xs font-bold tabular-nums text-ink">
                  {money(total)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-[10px] leading-relaxed text-ink-faint">
          Quantities are litres or kilograms of product, derived from the tank volume at
          the stated rate per 100 L. Re-entry intervals are hours after application; the
          safe-to-cut date is the pre-harvest interval applied to the application date.
          Prepared by{" "}
          {rows[0]?.scout_id != null ? scoutName.get(rows[0].scout_id) ?? "—" : "—"} ·
          Generated by Florisynergy IPM.
        </footer>
      </article>
    </div>
  );
}

function Row({ r, block, variety }: { r: SprayRecord; block: string; variety: string }) {
  return (
    <tr className="break-inside-avoid">
      <td className="whitespace-nowrap py-1.5 pr-2">
        {formatDate(r.start_date ?? r.recorded_at)}
      </td>
      <td className="py-1.5 pr-2 font-semibold text-ink">{block}</td>
      <td className="py-1.5 pr-2">{r.bed_code ?? "All"}</td>
      <td className="py-1.5 pr-2">{variety}</td>
      <td className="py-1.5 pr-2 font-semibold text-ink">{r.product ?? "—"}</td>
      <td className="py-1.5 pr-2">{r.active_ingredient1 ?? "—"}</td>
      <td className="py-1.5 pr-2">
        {[r.target1, r.target2].filter(Boolean).join(", ") || "—"}
      </td>
      <td className="py-1.5 pr-2">{r.type_of_application ?? "—"}</td>
      <td className="py-1.5 pr-2">{r.coverage ?? "—"}</td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-right">
        {r.volume_of_water ?? "—"}
      </td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-right">{r.rate ?? "—"}</td>
      <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{r.qty ?? "—"}</td>
      <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
        {r.cost_of_chemical != null ? money(r.cost_of_chemical) : "—"}
      </td>
      <td className="py-1.5 pr-2">
        <span className={isHazardous(r.who_class) ? "font-bold text-red-700" : ""}>
          {r.who_class ?? "—"}
        </span>
      </td>
      <td className="py-1.5 pr-2">{r.rac_code ?? "—"}</td>
      <td className="py-1.5 pr-2">{r.rei ? `${r.rei}h` : "—"}</td>
      <td className="whitespace-nowrap py-1.5">
        {r.safe_harvest_date ? formatDate(r.safe_harvest_date) : "—"}
      </td>
    </tr>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
