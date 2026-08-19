"use client";

import { AlertTriangle, Printer } from "lucide-react";
import { useParams } from "next/navigation";

import { ApprovalSignatures } from "@/components/ApprovalSignatures";
import { LogoLockup } from "@/components/Logo";
import { Spinner } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { useFertigation, useFertigationWarnings } from "@/lib/hooks";

/**
 * The fertigation sheet, as a document.
 *
 * The paper version this replaces states the regime, the tanks and four
 * signatures. This states the same, plus the arithmetic the farm was doing by
 * hand — stock solution, sets, cost — and signs through the portal's approval
 * slots rather than a biro.
 */
export default function FertigationDocPage() {
  const params = useParams<{ docId: string }>();
  const docId = decodeURIComponent(params.docId);
  const q = useFertigation(docId);
  const warnings = useFertigationWarnings(docId);

  if (q.isLoading) {
    return (
      <div className="p-10">
        <Spinner label="Loading sheet…" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-10 text-sm text-ink-faint">
        No fertigation sheet found for <code>{docId}</code>.
      </div>
    );
  }

  const f = q.data;

  return (
    <div className="min-h-screen bg-surface py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-6 print:hidden">
        <p className="text-sm text-ink-faint">
          Review, then print or save as PDF for the fertigation file.
        </p>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink"
        >
          <Printer size={15} /> Print
        </button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            <LogoLockup />
            <h1 className="mt-3 text-xl font-bold tracking-tight text-ink">
              {f.activity === "fertigation"
                ? "Fertiliser Regime & Fertigation Record"
                : f.activity === "drenching"
                  ? "Drenching Record"
                  : "Flushing Record"}
            </h1>
            <p className="mt-0.5 text-sm text-ink-faint">
              {f.phase ?? "Whole farm"}
              {f.blocks.length > 0 && ` · ${f.blocks.length} greenhouse${f.blocks.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="text-right text-xs text-ink-faint">
            <p>
              Sheet{" "}
              <span className="font-mono text-ink">{f.doc_id.slice(0, 8)}</span>
            </p>
            <p>Issued {formatDate(new Date().toISOString())}</p>
          </div>
        </header>

        {/* The event */}
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 rounded border border-line bg-surface px-4 py-3 sm:grid-cols-4">
          <Kv label="Date of application" value={formatDate(f.event_date)} strong />
          <Kv label="Start time" value={f.start_time ?? "—"} />
          <Kv label="Phase" value={f.phase ?? "—"} />
          <Kv label="Type of application" value={f.type_of_application ?? "—"} />
          <Kv
            label="Total water applied"
            value={
              f.volume_m3 != null
                ? `${Math.round(f.volume_m3 * 1000).toLocaleString()} L (${f.volume_m3} m³)`
                : "—"
            }
            strong
          />
          <Kv
            label="Area fed"
            value={
              f.area_ha != null
                ? `${f.area_ha} ha${f.blocks.length ? ` · ${f.blocks.length} blocks` : ""}`
                : "—"
            }
          />
          <Kv label="m³ per ha" value={f.m3_per_ha != null ? String(f.m3_per_ha) : "—"} />
          <Kv label="Applicator" value={f.applicator ?? "—"} />
          {f.m3_per_ha != null && (
            <Kv label="Rate applied" value={`${f.m3_per_ha} m³/ha`} />
          )}
          {f.weather && <Kv label="Weather" value={f.weather} />}
        </div>

        {/* What the injection rates call for — the sum the farm did by hand. */}
        <Section title="Solution required">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <Kv
              label="Fertiliser injection"
              value={`${f.fertiliser_rate_l_m3} L per m³`}
            />
            <Kv label="Stock solution" value={`${f.stock_required_l} L`} strong />
            <Kv label="Acid injection" value={`${f.acid_rate_l_m3} L per m³`} />
            <Kv label="Acid solution" value={`${f.acid_required_l} L`} strong />
          </div>
          {f.m3_per_ha != null && (
            <p className="mt-2 text-[10px] text-ink-faint">
              Rate applied: {Math.round((f.volume_m3 ?? 0) * 1000).toLocaleString()} L
              = {f.volume_m3} m³ ÷ {f.area_ha} ha = {f.m3_per_ha} m³/ha.
            </p>
          )}
          {f.volume_m3 != null && (
            <p className="mt-2 text-[10px] text-ink-faint">
              {f.volume_m3} m³ × {f.fertiliser_rate_l_m3} L/m³ ={" "}
              {f.stock_required_l} L stock solution · {f.volume_m3} m³ ×{" "}
              {f.acid_rate_l_m3} L/m³ = {f.acid_required_l} L acid. Each tank&apos;s
              set count is that figure divided by the tank&apos;s own volume.
            </p>
          )}
        </Section>

        {/* Which blocks were fed — the area every per-hectare figure divides by */}
        {f.blocks.length > 0 && (
          <Section title={`Greenhouses fed — ${f.blocks.length}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 font-semibold">Greenhouse</th>
                  <th className="py-1.5 font-semibold">Code</th>
                  <th className="py-1.5 text-right font-semibold">Area (ha)</th>
                  <th className="py-1.5 text-right font-semibold">Water (m³)</th>
                  <th className="py-1.5 text-right font-semibold">m³/ha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {f.blocks.map((b) => (
                  <tr key={b.id ?? b.name}>
                    <td className="py-1.5 font-semibold text-ink">{b.name}</td>
                    <td className="py-1.5 text-ink-faint">{b.code ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {b.area_ha ?? "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {b.volume_m3 ?? <span className="text-ink-faint">apportioned</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {b.m3_per_ha ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink">
                  <td colSpan={2} className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    Total
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                    {f.area_ha ?? "—"}
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                    {f.blocks_total_m3 || f.volume_m3 || "—"}
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                    {f.m3_per_ha ?? "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
            {f.block_note && (
              <p className="mt-1.5 text-[10px] font-semibold text-amber-800">
                {f.block_note}
              </p>
            )}
          </Section>
        )}

        {/* Water sources */}
        {f.sources.length > 0 && (
          <Section title="Water source, EC and pH">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 font-semibold">Source</th>
                  <th className="py-1.5 text-right font-semibold">Volume (m³)</th>
                  <th className="py-1.5 text-right font-semibold">EC (mS/cm)</th>
                  <th className="py-1.5 text-right font-semibold">pH</th>
                  <th className="py-1.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {f.sources.map((s) => (
                  <tr key={s.id ?? s.source}>
                    <td className="py-1.5 font-semibold text-ink">{s.source}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.volume_m3 ?? "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{s.ec ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.ph ?? "—"}</td>
                    <td className="py-1.5 text-ink-faint">{s.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink">
                  <td className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    Total
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                    {f.sources_total_m3} m³
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
            {f.source_note && (
              <p className="mt-1.5 text-[10px] font-semibold text-amber-800">
                {f.source_note}
              </p>
            )}
          </Section>
        )}

        {/* The tanks — the heart of the sheet */}
        {f.tanks.map((tank) => (
          <Section
            key={tank.id ?? tank.code}
            title={`Tank ${tank.code} — ${tank.volume_l} L × ${tank.effective_sets ?? tank.sets} set${(tank.effective_sets ?? tank.sets) === 1 ? "" : "s"}${tank.is_acid_tank ? " (acid)" : ""}`}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 font-semibold">#</th>
                  <th className="py-1.5 font-semibold">Fertiliser</th>
                  <th className="py-1.5 text-right font-semibold">Per tank</th>
                  <th className="py-1.5 text-right font-semibold">
                    Total ({tank.effective_sets ?? tank.sets} set
                    {(tank.effective_sets ?? tank.sets) === 1 ? "" : "s"})
                  </th>
                  <th className="py-1.5 text-right font-semibold">Cost</th>
                  <th className="py-1.5 w-28 font-semibold">Actual issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tank.lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="py-1.5 text-ink-faint">{i + 1}</td>
                    <td className="py-1.5">
                      <span className="font-semibold text-ink">
                        {line.fertiliser_code}
                      </span>
                      {line.fertiliser_name && (
                        <span className="ml-2 text-ink-faint">
                          {line.fertiliser_name}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                      {Math.round(
                        line.quantity * (tank.effective_sets ?? tank.sets) * 1000,
                      ) / 1000}{" "}
                      {line.unit}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.cost != null ? money(line.cost) : "—"}
                    </td>
                    {/* Left blank on purpose: the store writes what it actually
                        issued against what was asked for. */}
                    <td className="py-1.5">
                      <span className="block border-b border-ink-faint">&nbsp;</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td colSpan={4} className="py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    Tank {tank.code} total
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums text-ink">
                    {money(tank.total_cost ?? 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {f.volume_m3 != null && (
              <p className="mt-1.5 text-[10px] text-ink-faint">
                {tank.is_acid_tank ? f.acid_required_l : f.stock_required_l} L{" "}
                {tank.is_acid_tank ? "acid" : "stock"} ÷ {tank.volume_l} L ={" "}
                {tank.implied_sets} sets
                {tank.sets_mode === "manual" &&
                  tank.implied_sets !== tank.effective_sets && (
                    <strong className="text-amber-800">
                      {" "}
                      — overridden to {tank.effective_sets}
                    </strong>
                  )}
                .
              </p>
            )}
          </Section>
        ))}

        <div className="mt-4 flex items-center justify-between rounded border border-ink px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Total fertiliser cost
          </span>
          <span className="text-lg font-bold tabular-nums text-ink">
            {money(f.total_cost)}
          </span>
        </div>

        {(warnings.data ?? []).length > 0 && (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <AlertTriangle size={13} /> Tank make-up warnings
            </p>
            {(warnings.data ?? []).map((w) => (
              <p key={w} className="mt-1 text-xs text-amber-800">
                {w}
              </p>
            ))}
          </div>
        )}

        {f.comments && (
          <Section title="Comments">
            <p className="text-xs text-ink-soft">{f.comments}</p>
          </Section>
        )}

        <Section title="Authorisation">
          <ApprovalSignatures documentId={f.doc_id} documentType="fertigation" />
        </Section>

        <footer className="mt-8 border-t border-line pt-3 text-[10px] text-ink-faint">
          Generated by Florisynergy IPM. Solution volumes, set counts and costs are
          computed from the recorded water volume and injection rates; retain this
          sheet with the farm&apos;s fertigation records.
        </footer>
      </article>
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

function Kv({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-sm ${strong ? "font-bold text-ink" : "text-ink-soft"}`}>
        {value}
      </p>
    </div>
  );
}
