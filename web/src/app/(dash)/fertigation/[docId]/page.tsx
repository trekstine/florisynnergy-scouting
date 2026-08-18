"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Beaker,
  Droplets,
  FileCheck2,
  Lock,
  Pencil,
  Sprout,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { FertigationBuilder } from "@/components/FertigationBuilder";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { useFertigation, useFertigationWarnings, useMe } from "@/lib/hooks";

const STATUS_HEX: Record<string, string> = {
  draft: "#64748b",
  issued: "#0891b2",
  completed: "#059669",
  cancelled: "#b91c1c",
};

/**
 * One fertigation sheet, in full.
 *
 * The list links here and there was nothing to land on — this page was in the
 * plan and never built, so every row in the list led to a 404.
 */
export default function FertigationDetailPage() {
  const params = useParams<{ docId: string }>();
  const docId = decodeURIComponent(params.docId);
  const q = useFertigation(docId);
  const warnings = useFertigationWarnings(docId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  if (q.isLoading) {
    return (
      <div className="p-8">
        <Spinner label="Loading sheet…" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-8">
        <EmptyState>
          No fertigation sheet found for <code>{docId}</code>.
        </EmptyState>
      </div>
    );
  }

  const f = q.data;
  const signed = f.signature_count > 0;
  const canEdit =
    !signed && (me.data?.role === "admin" || me.data?.role === "supervisor");

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={`${f.activity[0]!.toUpperCase()}${f.activity.slice(1)} — ${formatDate(f.event_date)}`}
        subtitle={`${f.phase ?? "No phase"}${f.blocks_label ? ` · ${f.blocks_label}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            <Link
              href={`/fertigation-doc/${encodeURIComponent(f.doc_id)}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              <FileCheck2 className="h-4 w-4" /> Sheet
            </Link>
            <Link
              href="/fertigation"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> All sheets
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6">
        <Badge color={STATUS_HEX[f.status]}>{f.status}</Badge>
        {f.type_of_application && <Badge>{f.type_of_application}</Badge>}
        {signed && (
          <span
            className="flex items-center gap-1 text-xs font-semibold text-ink-soft"
            title="A signed sheet cannot be edited — void the signatures first."
          >
            <Lock size={11} /> Signed {f.signature_count}× · locked
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-5">
        <Tile icon={<Droplets size={13} />} label="Water" value={`${f.volume_m3 ?? "—"} m³`} />
        <Tile label="Area fed" value={f.area_ha != null ? `${f.area_ha} ha` : "—"} />
        <Tile label="m³ / ha" value={f.m3_per_ha != null ? String(f.m3_per_ha) : "—"} />
        <Tile icon={<Beaker size={13} />} label="Stock" value={`${f.stock_required_l} L`} />
        <Tile icon={<Sprout size={13} />} label="Cost" value={money(f.total_cost)} />
      </div>

      {(warnings.data ?? []).length > 0 && (
        <div className="px-6">
          {(warnings.data ?? []).map((w) => (
            <div
              key={w}
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
              <p className="text-sm text-amber-800">{w}</p>
            </div>
          ))}
        </div>
      )}

      <div className="px-6">
        <Card>
          <CardHeader title="Application" subtitle="How the sheet was made up" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
            <Detail label="Date">{formatDate(f.event_date)}</Detail>
            <Detail label="Start time">{f.start_time ?? "—"}</Detail>
            <Detail label="Phase">{f.phase ?? "—"}</Detail>
            <Detail label="Applicator">{f.applicator ?? "—"}</Detail>
            <Detail label="Target rate">
              {f.target_m3_per_ha != null ? `${f.target_m3_per_ha} m³/ha` : "—"}
            </Detail>
            <Detail label="Planned water">
              {f.planned_m3 != null ? `${f.planned_m3} m³` : "—"}
            </Detail>
            <Detail label="Fertiliser injection">{f.fertiliser_rate_l_m3} L/m³</Detail>
            <Detail label="Acid injection">{f.acid_rate_l_m3} L/m³</Detail>
            <Detail label="Acid solution">{f.acid_required_l} L</Detail>
            <Detail label="Weather">{f.weather ?? "—"}</Detail>
            <Detail label="Prepared by">{f.prepared_by_name ?? "—"}</Detail>
          </dl>
          {f.comments && (
            <div className="border-t border-line px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">
                Comments
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">{f.comments}</p>
            </div>
          )}
        </Card>
      </div>

      {f.blocks.length > 0 && (
        <div className="px-6">
          <Card>
            <CardHeader
              title={`Greenhouses fed · ${f.blocks.length}`}
              subtitle="The area every per-hectare figure divides by"
            />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Greenhouse</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Area (ha)</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Water (m³)</th>
                    <th className="px-3 py-2.5 text-right font-semibold">m³/ha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {f.blocks.map((b) => (
                    <tr key={b.id ?? b.name} className="hover:bg-surface">
                      <td className="px-5 py-2.5 font-medium text-ink">{b.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {b.area_ha ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {b.volume_m3 ?? "apportioned"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {b.m3_per_ha ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.block_note && (
              <p className="border-t border-line px-5 py-3 text-xs font-semibold text-amber-800">
                {f.block_note}
              </p>
            )}
          </Card>
        </div>
      )}

      {f.sources.length > 0 && (
        <div className="px-6">
          <Card>
            <CardHeader title="Water sources" subtitle="EC and pH per source" />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Source</th>
                    <th className="px-3 py-2.5 text-right font-semibold">m³</th>
                    <th className="px-3 py-2.5 text-right font-semibold">EC</th>
                    <th className="px-3 py-2.5 text-right font-semibold">pH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {f.sources.map((s) => (
                    <tr key={s.id ?? s.source}>
                      <td className="px-5 py-2.5 font-medium text-ink">{s.source}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {s.volume_m3 ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {s.ec ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {s.ph ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.source_note && (
              <p className="border-t border-line px-5 py-3 text-xs font-semibold text-amber-800">
                {f.source_note}
              </p>
            )}
          </Card>
        </div>
      )}

      {f.tanks.map((tank) => (
        <div key={tank.id ?? tank.code} className="px-6">
          <Card>
            <CardHeader
              title={`Tank ${tank.code} · ${tank.volume_l} L × ${tank.effective_sets ?? tank.sets} sets`}
              subtitle={
                tank.is_acid_tank
                  ? "Acid tank — dosed at the acid injection rate"
                  : undefined
              }
              actions={
                <span className="text-sm font-bold tabular-nums text-ink">
                  {money(tank.total_cost ?? 0)}
                </span>
              }
            />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-5 py-2.5 font-semibold">Fertiliser</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Per tank</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unit price</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tank.lines.map((l, i) => (
                    <tr key={l.id ?? i} className="hover:bg-surface">
                      <td className="px-5 py-2.5">
                        <span className="font-semibold text-ink">
                          {l.fertiliser_code}
                        </span>
                        {l.fertiliser_name && (
                          <span className="ml-2 text-xs text-ink-faint">
                            {l.fertiliser_name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {l.quantity} {l.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">
                        {Math.round(
                          l.quantity * (tank.effective_sets ?? tank.sets) * 1000,
                        ) / 1000}{" "}
                        {l.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                        {l.unit_price != null ? money(l.unit_price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                        {l.cost != null ? money(l.cost) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}

      <FertigationBuilder
        open={editing}
        onClose={() => setEditing(false)}
        editing={f}
      />
    </div>
  );
}

function Tile({
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
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{value}</p>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
