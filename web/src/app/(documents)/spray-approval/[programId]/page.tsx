"use client";

import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { ApprovalSignatures } from "@/components/ApprovalSignatures";
import { LogoLockup } from "@/components/Logo";
import { Spinner } from "@/components/ui";
import { formatDate, isHazardous, money } from "@/lib/format";
import { useEmployees, useGreenhouses, useSpray, useVarieties } from "@/lib/hooks";
import { programKey } from "@/lib/sprayExport";

/**
 * A signable one-page spray authorisation.
 *
 * Farms don't approve a spray from a dashboard — somebody signs a sheet that
 * states what goes in the tank, what it costs, when the block can be re-entered
 * and when it can next be cut. This renders exactly that, and nothing else, so
 * Ctrl-P produces a clean document.
 */
export default function SprayApprovalPage() {
  const params = useParams<{ programId: string }>();
  const programId = decodeURIComponent(params.programId);

  const spray = useSpray(1000);
  const greenhouses = useGreenhouses();
  const varieties = useVarieties();
  const employees = useEmployees();

  const rows = useMemo(
    () => (spray.data ?? []).filter((r) => programKey(r) === programId),
    [spray.data, programId],
  );

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  const varietyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varieties.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varieties.data]);

  const preparedBy = useMemo(() => {
    const id = rows[0]?.scout_id;
    if (id == null) return null;
    return (employees.data ?? []).find((e) => e.id === id)?.name ?? null;
  }, [rows, employees.data]);

  if (spray.isLoading) {
    return (
      <div className="p-10">
        <Spinner label="Loading program…" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-10 text-sm text-ink-faint">
        No spray program found for <code>{programId}</code>.
      </div>
    );
  }

  const head = rows[0]!;
  const totalCost = rows.reduce((s, r) => s + (r.cost_of_chemical ?? 0), 0);
  const harvest = rows
    .map((r) => r.safe_harvest_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const maxRei = rows
    .map((r) => Number(r.rei))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];
  const hazardous = rows.filter((r) => isHazardous(r.who_class));
  const blocks = [...new Set(rows.map((r) => r.greenhouse_id).filter((v): v is number => v != null))];

  return (
    <div className="min-h-screen bg-surface py-8 print:bg-white print:py-0">
      {/* Screen-only toolbar — never printed. */}
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-6 print:hidden">
        <p className="text-sm text-ink-faint">
          Review, then print or save as PDF for the approval file.
        </p>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div className="flex items-center gap-4">
            {/* The registered mark heads every printed document. */}
            <LogoLockup width={150} />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">
                Spray Application Authorisation
              </h1>
              <p className="text-sm text-ink-faint">Naivasha Rose Estate</p>
            </div>
          </div>
          <div className="text-right text-xs text-ink-faint">
            <p>
              Program <span className="font-mono text-ink">{programId.slice(0, 8)}</span>
            </p>
            <p>Issued {formatDate(new Date().toISOString())}</p>
          </div>
        </header>

        {/* The scouting round that justifies this spray. An approver's first
            question is "what did we see, and when" — so it leads, rather than
            sitting as one cell among twelve in the details grid below. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">
              Scouting report date
            </p>
            <p className="text-sm font-bold text-ink">
              {head.scout_report_date ? formatDate(head.scout_report_date) : "Not recorded"}
            </p>
          </div>
          <div>
            {/* Who raised it is a fact of the record, distinct from who signs
                for it — worth stating even before anybody has signed. */}
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">
              Raised by
            </p>
            <p className="text-sm font-medium text-ink">{preparedBy ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">
              Basis for this application
            </p>
            <p className="text-sm font-medium text-ink">
              {head.recommendation_id != null
                ? `Recommendation #${head.recommendation_id}${
                    head.target1 ? ` — ${head.target1}` : ""
                  }`
                : "Routine preventative program"}
            </p>
          </div>
        </div>

        {/* ── Where and when ── */}
        <Section title="Application details">
          <dl className="grid grid-cols-4 gap-x-6 gap-y-3">
            <Item label="Greenhouse">
              {blocks.map((id) => ghName.get(id) ?? `#${id}`).join(", ") || "—"}
            </Item>
            <Item label="Bed / bay">{head.bed_code ?? "All beds"}</Item>
            <Item label="Partition">{head.partition_no ?? "—"}</Item>
            <Item label="Variety">
              {head.variety_code
                ? varietyName.get(head.variety_code) ?? head.variety_code
                : "All varieties"}
            </Item>
            <Item label="Application">{head.type_of_application ?? "—"}</Item>
            <Item label="Coverage">{head.coverage ?? "—"}</Item>
            <Item label="Water volume">{head.volume_of_water ?? "—"}</Item>
            <Item label="Block area">
              {head.area_ha != null ? `${head.area_ha} ha` : "—"}
            </Item>
            <Item label="Start date">{formatDate(head.start_date)}</Item>
            <Item label="Start time">{head.start_time?.slice(0, 5) ?? "—"}</Item>
            <Item label="Scout report">{formatDate(head.scout_report_date)}</Item>
            <Item label="Raised from">
              {head.recommendation_id != null
                ? `Recommendation #${head.recommendation_id}`
                : "Routine program"}
            </Item>
          </dl>
        </Section>

        {/* ── The tank ── */}
        <Section title={`Tank mix — ${rows.length} product${rows.length === 1 ? "" : "s"}`}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="py-2 pr-2 font-semibold">Product</th>
                <th className="py-2 pr-2 font-semibold">Active ingredient</th>
                <th className="py-2 pr-2 font-semibold">Target</th>
                <th className="py-2 pr-2 font-semibold">WHO</th>
                <th className="py-2 pr-2 font-semibold">RAC</th>
                <th className="py-2 pr-2 text-right font-semibold">Rate</th>
                <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                <th className="py-2 pr-2 text-right font-semibold">Unit price</th>
                <th className="py-2 text-right font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2 font-semibold text-ink">{r.product ?? "—"}</td>
                  <td className="py-2 pr-2 text-ink-soft">{r.active_ingredient1 ?? "—"}</td>
                  <td className="py-2 pr-2 text-ink-soft">
                    {[r.target1, r.target2].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-2">
                    <span className={isHazardous(r.who_class) ? "font-bold text-red-700" : ""}>
                      {r.who_class ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-ink-soft">{r.rac_code ?? "—"}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.rate ?? "—"}</td>
                  <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                    {r.qty ?? "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-ink-soft">
                    {r.buying_price != null ? money(r.buying_price) : "—"}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {r.cost_of_chemical != null ? money(r.cost_of_chemical) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <td colSpan={8} className="py-2 text-right text-xs font-semibold text-ink">
                  Total chemical cost
                </td>
                <td className="py-2 text-right text-sm font-bold tabular-nums text-ink">
                  {money(totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[10px] text-ink-faint">
            Quantities are litres or kilograms of product, derived from the tank volume at the
            stated rate per 100 L.
          </p>
        </Section>

        {/* ── Safety constraints ── */}
        <Section title="Safety &amp; compliance">
          <div className="grid grid-cols-3 gap-4">
            <Constraint
              label="Re-entry interval"
              value={maxRei != null ? `${maxRei} hours` : "Not specified"}
              detail="No person may enter the block before this has elapsed."
            />
            <Constraint
              label="Safe to harvest from"
              value={harvest ? formatDate(harvest) : "Not specified"}
              detail="The longest pre-harvest interval across the mix governs."
            />
            <Constraint
              label="Hazard classification"
              value={
                hazardous.length
                  ? `${hazardous.length} highly hazardous product${hazardous.length === 1 ? "" : "s"}`
                  : "None above WHO III"
              }
              detail={
                hazardous.length
                  ? `Full PPE required: ${hazardous.map((r) => r.product).join(", ")}.`
                  : "Standard PPE applies."
              }
              alert={hazardous.length > 0}
            />
          </div>
          {head.comments && (
            <div className="mt-3 border-l-2 border-line pl-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Notes
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">{head.comments}</p>
            </div>
          )}
        </Section>

        {/* ── Sign-off ──
            Signed in the portal rather than on paper: a drawn mark, a
            re-entered PIN, and a fingerprint of the sheet as it stood, so the
            approval can be checked later rather than merely believed. */}
        <Section title="Authorisation">
          <ApprovalSignatures documentId={programId} />
        </Section>

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-ink-faint">
          Generated by Florisynergy IPM. Dosing, costing and pre-harvest intervals are computed
          from the chemical register; retain this sheet with the farm&apos;s spray records.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium text-ink">{children}</dd>
    </div>
  );
}

function Constraint({
  label,
  value,
  detail,
  alert,
}: {
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded border p-2.5 ${alert ? "border-red-300 bg-red-50" : "border-line"}`}>
      <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${alert ? "text-red-700" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-ink-faint">{detail}</p>
    </div>
  );
}
