"use client";

import {
  ArrowLeft,
  Beaker,
  CalendarDays,
  FileCheck2,
  Lock,
  Pencil,
  ShieldAlert,
  Sprout,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SprayProgramBuilder } from "@/components/SprayProgramBuilder";
import { STATUS_HEX, SprayProgramPanel } from "@/components/SprayProgramPanel";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { bedLabel, formatDate, isHazardous, money } from "@/lib/format";
import {
  useDeleteSprayProgram,
  useEmployees,
  useGreenhouses,
  useMe,
  useSpray,
  useVarieties,
} from "@/lib/hooks";
import { programKey } from "@/lib/sprayExport";
import type { ProgramStatus } from "@/lib/types";

const STATUS_LABEL: Record<ProgramStatus, string> = {
  planned: "Planned",
  applied: "Applied",
  reviewed: "Reviewed",
};

/**
 * One spray program, in full.
 *
 * The list is deliberately thin — a row per application event and nothing
 * more. Everything about a program (the tank, the dosing, the paperwork, the
 * scouting that justified it) lives here, where there is room for it.
 */
export default function SprayProgramPage() {
  const params = useParams<{ programId: string }>();
  const programId = decodeURIComponent(params.programId);

  const router = useRouter();
  const spray = useSpray(1000);
  const greenhouses = useGreenhouses();
  const varieties = useVarieties();
  const employees = useEmployees();
  const me = useMe();
  const removeProgram = useDeleteSprayProgram();
  const [editing, setEditing] = useState(false);

  const rows = useMemo(
    () => (spray.data ?? []).filter((r) => programKey(r) === programId),
    [spray.data, programId],
  );

  if (spray.isLoading) {
    return (
      <div className="p-8">
        <Spinner label="Loading program…" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-8">
        <EmptyState>
          No spray program found for <code>{programId}</code>.
        </EmptyState>
      </div>
    );
  }

  const head = rows[0]!;
  const status: ProgramStatus = head.program_status ?? "planned";
  const greenhouse =
    (greenhouses.data ?? []).find((g) => g.id === head.greenhouse_id)?.name ??
    (head.greenhouse_id ? `Greenhouse #${head.greenhouse_id}` : "Ad-hoc application");
  const variety =
    (varieties.data ?? []).find((v) => v.code === head.variety_code)?.name ??
    head.variety_code;
  const operator =
    (employees.data ?? []).find((e) => e.id === head.scout_id)?.name ?? null;

  const totalCost = rows.reduce((s, r) => s + (r.cost_of_chemical ?? 0), 0);
  const safeHarvest = rows
    .map((r) => r.safe_harvest_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const maxRei = rows
    .map((r) => Number(r.rei))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];
  const hazardous = rows.some((r) => isHazardous(r.who_class));
  const daysToCut = safeHarvest
    ? Math.ceil((new Date(safeHarvest).getTime() - Date.now()) / 86_400_000)
    : null;

  // A planned program has not touched the crop yet, so it can still be
  // corrected. Once it is applied the chemical is on the plants and a signed
  // sheet is filed — the server refuses the edit, and so does the button.
  const role = me.data?.role;
  const canEdit = status === "planned" && (role === "admin" || role === "supervisor");
  const canDelete = status === "planned" && role === "admin";

  async function withdraw() {
    if (
      !confirm(
        "Withdraw this program? It was never applied, so nothing is being " +
          "erased from the spray record.",
      )
    ) {
      return;
    }
    await removeProgram.mutateAsync(programId);
    router.push("/spray");
  }

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={`${greenhouse}${head.bed_code ? ` · ${bedLabel(head.bed_code)}` : ""}`}
        subtitle={`Spray program · ${formatDate(head.start_date ?? head.recorded_at)} · ${rows.length} product${rows.length === 1 ? "" : "s"}`}
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
            {canDelete && (
              <button
                onClick={withdraw}
                disabled={removeProgram.isPending}
                title="Withdraw a program raised in error"
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-faint transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <Link
              href={`/spray-approval/${encodeURIComponent(programId)}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              <FileCheck2 className="h-4 w-4" /> Approval sheet
            </Link>
            <Link
              href="/spray"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> All programs
            </Link>
          </div>
        }
      />

      {/* Status strip — the two things anyone asks first. */}
      <div className="flex flex-wrap items-center gap-2 px-6">
        <Badge color={STATUS_HEX[status]}>{STATUS_LABEL[status]}</Badge>
        {head.recommendation_id != null && (
          <Badge color="#059669">From recommendation</Badge>
        )}
        {hazardous && (
          <Badge color="#dc2626">
            <ShieldAlert size={11} /> Hazardous product in the mix
          </Badge>
        )}
        {head.coverage && <Badge>{head.coverage}</Badge>}
        {status !== "planned" && (
          <span
            className="flex items-center gap-1 text-xs text-ink-faint"
            title="Corrections after application belong in the effectiveness review, or in a new program."
          >
            <Lock size={11} /> Locked — this program has been applied
          </span>
        )}
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Tile icon={<Beaker size={13} />} label="Products" value={String(rows.length)} />
        <Tile icon={<Sprout size={13} />} label="Total cost" value={money(totalCost)} />
        <Tile
          icon={<ShieldAlert size={13} />}
          label="Re-entry interval"
          value={Number.isFinite(maxRei) ? `${maxRei} h` : "—"}
        />
        <Tile
          icon={<CalendarDays size={13} />}
          label="Safe to cut"
          value={safeHarvest ? formatDate(safeHarvest) : "—"}
          note={
            daysToCut != null && daysToCut > 0
              ? `${daysToCut} day${daysToCut === 1 ? "" : "s"} to go`
              : safeHarvest
                ? "Interval cleared"
                : undefined
          }
          hex={daysToCut != null && daysToCut > 0 ? "#dc2626" : undefined}
        />
      </div>

      {/* ── The tank ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Application"
            subtitle="How the mix was made up and when it went out"
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
            <Detail label="Greenhouse">{greenhouse}</Detail>
            <Detail label="Bed">{head.bed_code ? bedLabel(head.bed_code) : "—"}</Detail>
            <Detail label="Partition">{head.partition_no ?? "—"}</Detail>
            <Detail label="Variety">{variety ?? "—"}</Detail>
            <Detail label="Type of application">{head.type_of_application ?? "—"}</Detail>
            <Detail label="Coverage">{head.coverage ?? "—"}</Detail>
            <Detail label="Volume of water">{head.volume_of_water ?? "—"}</Detail>
            <Detail label="Area">{head.area_ha != null ? `${head.area_ha} ha` : "—"}</Detail>
            <Detail label="Start date">
              {formatDate(head.start_date ?? head.recorded_at)}
            </Detail>
            <Detail label="Start time">{head.start_time ?? "—"}</Detail>
            <Detail label="Scouting report date">
              {head.scout_report_date ? formatDate(head.scout_report_date) : "—"}
            </Detail>
            <Detail label="Prepared by">{operator ?? "—"}</Detail>
          </dl>
          {head.comments && (
            <div className="border-t border-line px-5 py-4">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Comments</p>
              <p className="mt-0.5 text-sm text-ink-soft">{head.comments}</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Products ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title={`Products · ${rows.length}`}
            subtitle="Everything in the tank, with dosing and intervals"
          />
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Product</th>
                  <th className="px-3 py-2.5 font-semibold">Active ingredient</th>
                  <th className="px-3 py-2.5 font-semibold">Target</th>
                  <th className="px-3 py-2.5 font-semibold">WHO</th>
                  <th className="px-3 py-2.5 font-semibold">RAC</th>
                  <th className="px-3 py-2.5 font-semibold">Rate</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Unit price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">REI</th>
                  <th className="px-3 py-2.5 text-right font-semibold">PHI</th>
                  <th className="px-3 py-2.5 font-semibold">Safe to cut</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="px-5 py-2.5 font-semibold text-ink">{r.product ?? "—"}</td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {[r.active_ingredient1, r.active_ingredient2]
                        .filter(Boolean)
                        .join(" + ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {[r.target1, r.target2].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.who_class ? (
                        <Badge color={isHazardous(r.who_class) ? "#dc2626" : undefined}>
                          {r.who_class}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-faint">{r.rac_code ?? "—"}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{r.rate ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                      {r.qty ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                      {r.buying_price != null ? money(r.buying_price) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                      {r.rei ? `${r.rei}h` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                      {r.phi_days != null ? `${r.phi_days}d` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-faint">
                      {r.safe_harvest_date ? formatDate(r.safe_harvest_date) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">
                      {money(r.cost_of_chemical)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-surface">
                  <td colSpan={11} className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink">
                    {money(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Status, paperwork, and the scouting behind it ── */}
      <div className="px-6">
        <SprayProgramPanel programId={programId} records={rows} />
      </div>

      <SprayProgramBuilder
        open={editing}
        onClose={() => setEditing(false)}
        editing={{ programId, records: rows }}
        context={{
          greenhouseId: head.greenhouse_id,
          greenhouseLabel: greenhouse,
          bedCode: head.bed_code,
          varietyCode: head.variety_code,
          recommendationId: head.recommendation_id,
        }}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  hex,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  hex?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tabular-nums" style={{ color: hex ?? "#0f172a" }}>
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-ink-faint">{note}</p>}
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
