"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { LogoLockup } from "@/components/Logo";
import { Spinner } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { useFertigations } from "@/lib/hooks";

/**
 * Every fertigation in a date range, as a printable document.
 *
 * The sheet authorises one feeding event. This is the other half — the record
 * of what actually went on over a period, for the file the manager keeps and
 * the auditor asks for. It mirrors the chemical application report, because a
 * farm reads its feeding and its spraying the same way.
 *
 * Every figure here comes off the sheets as raised, including the prices that
 * applied on the day. A fertiliser repriced next month must not restate what
 * last month's feeding cost.
 */
export default function FertigationReportPage() {
  return (
    <Suspense fallback={<div className="p-10"><Spinner /></div>}>
      <FertigationReport />
    </Suspense>
  );
}

function FertigationReport() {
  const sp = useSearchParams();
  const start = sp.get("start");
  const end = sp.get("end");
  const activity = sp.get("activity");
  const ghFilter = sp.get("greenhouse_id");

  const q = useFertigations({
    start: start ?? undefined,
    end: end ?? undefined,
    activity: activity ?? undefined,
    greenhouse_id: ghFilter ? Number(ghFilter) : undefined,
  });

  const rows = useMemo(
    () =>
      [...(q.data ?? [])].sort((a, b) =>
        b.event_date.localeCompare(a.event_date),
      ),
    [q.data],
  );

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + r.total_cost, 0);
    const litres = rows.reduce((s, r) => s + (r.solution_l ?? 0), 0);
    const water = rows.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);
    const signed = rows.filter((r) => r.signature_count > 0).length;
    // Products across every tank on every sheet — what the store actually
    // handled over the period.
    const products = new Set(
      rows.flatMap((r) => r.tanks.flatMap((t) => t.lines.map((l) => l.fertiliser_code))),
    ).size;
    return { cost, litres, water, signed, products };
  }, [rows]);

  /** Issue per product across the whole period — the store's reconciliation. */
  const issued = useMemo(() => {
    const agg = new Map<string, { name: string | null; unit: string; qty: number; cost: number }>();
    for (const sheet of rows) {
      for (const tank of sheet.tanks) {
        // The set count is the one in force on that sheet, not recomputed —
        // otherwise a later change to the regime would restate history.
        // Falls back to 0 rather than 1: an unset count means the sheet has
        // nothing to multiply by, and assuming one tank-full would invent an
        // issue the store never made.
        const sets = tank.effective_sets ?? 0;
        for (const line of tank.lines) {
          const row = agg.get(line.fertiliser_code) ?? {
            name: line.fertiliser_name ?? null,
            unit: line.unit ?? "kg",
            qty: 0,
            cost: 0,
          };
          row.qty += line.quantity * sets;
          row.cost += (line.unit_price ?? 0) * line.quantity * sets;
          agg.set(line.fertiliser_code, row);
        }
      }
    }
    return [...agg.entries()]
      .map(([code, v]) => ({ code, ...v, qty: Math.round(v.qty * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  if (q.isLoading) {
    return (
      <div className="p-10">
        <Spinner label="Loading fertigation sheets…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[1100px] items-center justify-between px-6 print:hidden">
        <p className="text-sm text-ink-faint">
          {rows.length} fertigation sheet{rows.length === 1 ? "" : "s"} in range.
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
            <LogoLockup width={150} />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">
                Fertigation Report
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
            {activity && <p className="capitalize">{activity}</p>}
            <p>Issued {formatDate(new Date().toISOString())}</p>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-5 gap-4 border-b border-line pb-4">
          <Summary label="Sheets" value={String(rows.length)} />
          <Summary label="Solution made up" value={`${totals.litres.toLocaleString()} L`} />
          <Summary label="Water applied" value={`${Math.round(totals.water).toLocaleString()} m³`} />
          <Summary label="Products used" value={String(totals.products)} />
          <Summary label="Total cost" value={money(totals.cost)} />
        </div>

        {/* Said once, plainly, rather than left for somebody to discover after
            they have budgeted against it. */}
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <strong>Costs are indicative.</strong> The fertiliser register carries
          placeholder prices until the farm&apos;s invoice prices are entered.
        </p>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No fertigation sheets were raised in this period.
          </p>
        ) : (
          <>
            <Section title="Sheets raised">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-ink text-left uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5 pr-2 font-semibold">Date</th>
                    <th className="py-1.5 pr-2 font-semibold">Ref</th>
                    <th className="py-1.5 pr-2 font-semibold">Activity</th>
                    <th className="py-1.5 pr-2 font-semibold">Phase / blocks</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Area ha</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Solution L</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">L/ha</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">m³/ha</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Water m³</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Cost</th>
                    <th className="py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.doc_id}>
                      <td className="whitespace-nowrap py-1.5 pr-2">{formatDate(r.event_date)}</td>
                      <td className="py-1.5 pr-2 text-ink-faint">{r.reference ?? "—"}</td>
                      <td className="py-1.5 pr-2 capitalize">{r.activity}</td>
                      <td className="max-w-[15rem] truncate py-1.5 pr-2">
                        {r.phase ?? r.blocks_label ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.area_ha ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.solution_l?.toLocaleString() ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.l_per_ha ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.m3_per_ha ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.volume_m3?.toLocaleString() ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                        {money(r.total_cost)}
                      </td>
                      <td className="py-1.5 capitalize">
                        {r.signature_count > 0 ? `signed ×${r.signature_count}` : r.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink font-bold">
                    <td className="py-1.5 pr-2" colSpan={5}>
                      {rows.length} sheet{rows.length === 1 ? "" : "s"}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {totals.litres.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2" colSpan={2} />
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {Math.round(totals.water).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {money(totals.cost)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </Section>

            <Section title="Fertiliser issued over the period">
              <p className="mb-2 text-[10px] text-ink-faint">
                Recipe quantity × the tank-fulls actually made up, summed across
                every sheet — what the store handled, not what one tank holds.
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-ink text-left uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5 pr-2 font-semibold">Code</th>
                    <th className="py-1.5 pr-2 font-semibold">Product</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Issued</th>
                    <th className="py-1.5 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {issued.map((r) => (
                    <tr key={r.code}>
                      <td className="py-1.5 pr-2 font-semibold">{r.code}</td>
                      <td className="py-1.5 pr-2">{r.name ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.qty.toLocaleString()} {r.unit}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {money(Math.round(r.cost * 100) / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-ink-faint">
          Generated by Florisynergy IPM. Figures are taken from the sheets as
          raised, at the prices that applied on the day.
        </footer>
      </article>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}
