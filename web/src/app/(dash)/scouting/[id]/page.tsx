"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  CalendarDays,
  FileCheck2,
  MapPin,
  SprayCan,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import {
  REC_STATUS_HEX,
  REC_STATUS_LABEL,
  SCOUTING_LABEL,
  VERIFICATION_LABEL,
  formatDate,
  formatDateTime,
  money,
  severityHex,
} from "@/lib/format";
import { useScoutingDetail } from "@/lib/hooks";
import { programKey } from "@/lib/sprayExport";
import type { ScoutingHistoryPoint } from "@/lib/types";

/**
 * One scouting observation, in full.
 *
 * The map and the tables can only ever show a line each. This is where a
 * manager lands when that line raises a question — and, crucially, where the
 * observation connects forward to the recommendation it triggered and the
 * spray that answered it.
 */
export default function ScoutingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const q = useScoutingDetail(Number.isFinite(id) ? id : null);

  if (q.isLoading) {
    return (
      <div className="p-8">
        <Spinner label="Loading record…" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-8">
        <EmptyState>Scouting record #{params.id} was not found.</EmptyState>
      </div>
    );
  }

  const d = q.data;
  const r = d.record;
  const target = d.disease ?? d.pest ?? SCOUTING_LABEL[r.scouting_for];
  const count =
    r.scouting_for === "sticky_trap"
      ? r.sticky_trap_bug_count
      : r.scouting_for === "lure"
        ? r.lure_bug_count
        : null;

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={target}
        subtitle={`${d.greenhouse ?? "Unknown block"} · ${r.bed_code ?? "no bed"} · ${formatDateTime(r.recorded_at)}`}
        actions={
          <Link
            href="/scouting"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink"
          >
            <ArrowLeft size={15} /> All records
          </Link>
        }
      />

      {r.flagged && (
        <div className="mx-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Flagged for review</p>
            <p className="text-xs text-amber-800">{r.flag_reason ?? "Anomalous reading."}</p>
          </div>
        </div>
      )}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Tile
          label="Severity"
          value={`${r.severity} / 5`}
          hex={severityHex(r.severity)}
          icon={<Bug size={14} />}
        />
        <Tile label="Beneficials" value={String(r.beneficials_count)} />
        {count != null && <Tile label="Trap count" value={String(count)} />}
        <Tile
          label="Capture"
          value={VERIFICATION_LABEL[r.verification_method]}
          icon={<MapPin size={14} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        {/* ── The observation ── */}
        <Card className="lg:col-span-2">
          <CardHeader title="Observation" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3">
            <Field label="Greenhouse">
              {r.greenhouse_id != null ? (
                <Link
                  href={`/map?greenhouse=${r.greenhouse_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {d.greenhouse ?? `#${r.greenhouse_id}`}
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Bed">{r.bed_code ?? "—"}</Field>
            <Field label="Variety">{d.variety ?? "—"}</Field>
            <Field label="Scouting for">{SCOUTING_LABEL[r.scouting_for]}</Field>
            <Field label="Pest">{d.pest ?? "—"}</Field>
            <Field label="Disease">{d.disease ?? "—"}</Field>
            <Field label="Stage">{r.stage ?? "—"}</Field>
            <Field label="On the plant">{r.location_on_plant ?? "—"}</Field>
            <Field label="Recorded">{formatDateTime(r.recorded_at)}</Field>
          </dl>
          {(r.notes || r.session_comment) && (
            <div className="space-y-3 border-t border-line px-5 py-4">
              {r.notes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-faint">
                    Scout&apos;s note
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{r.notes}</p>
                </div>
              )}
              {r.session_comment && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-faint">
                    Session remark
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">{r.session_comment}</p>
                </div>
              )}
            </div>
          )}
          {r.image_url && (
            <div className="border-t border-line p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.image_url}
                alt="Field photo"
                className="max-h-80 rounded-lg border border-line"
              />
            </div>
          )}
        </Card>

        {/* ── Who and when ── */}
        <Card>
          <CardHeader
            title="Scouting round"
            subtitle="The batch this came in with"
            actions={
              r.batch_id ? (
                <Link
                  href={`/scouting/rounds/${r.batch_id}`}
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  Open full report →
                </Link>
              ) : undefined
            }
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5">
            <Field label="Scout" icon={<User size={12} />}>
              {d.scout ?? "—"}
            </Field>
            <Field label="Records in round">{d.session_records || "—"}</Field>
            <Field label="Beds covered">{d.session_beds || "—"}</Field>
            <Field label="Round date" icon={<CalendarDays size={12} />}>
              {d.session_started_at ? formatDate(d.session_started_at) : "—"}
            </Field>
          </dl>
        </Card>
      </div>

      {/* ── History on this bed ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title={`${target} on ${r.bed_code ?? "this bed"} over time`}
            subtitle="Every reading of this agent on this bed — is it climbing?"
          />
          <div className="p-5">
            {d.history.length <= 1 ? (
              <EmptyState>No earlier readings to compare against.</EmptyState>
            ) : (
              <SeverityStrip points={d.history} />
            )}
          </div>
        </Card>
      </div>

      {/* ── The loop: observation → recommendation → spray ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="What happened next"
            subtitle="The recommendation this pressure raised, and the spray that answered it"
          />
          {d.recommendation_id == null ? (
            <EmptyState>
              No recommendation raised — this reading sits below its threshold.
            </EmptyState>
          ) : (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <Badge color={REC_STATUS_HEX[d.recommendation_status ?? "open"]}>
                  {REC_STATUS_LABEL[d.recommendation_status ?? "open"]}
                </Badge>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {d.recommendation_note ?? `Recommendation #${d.recommendation_id}`}
                </span>
                <Link
                  href="/recommendations"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  Open board →
                </Link>
              </div>

              {d.recommendation_outcome && (
                <p className="text-sm text-ink-soft">
                  <span className="font-semibold text-ink">Outcome: </span>
                  {d.recommendation_outcome}
                </p>
              )}

              {d.sprays.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Nothing has been sprayed against this yet.
                </p>
              ) : (
                <div className="overflow-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
                        <th className="px-3 py-2 font-semibold">Applied</th>
                        <th className="px-3 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold">Cost</th>
                        <th className="px-3 py-2 font-semibold">Safe to cut</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {d.sprays.map((s) => (
                        <tr key={s.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-soft">
                            {formatDate(s.start_date ?? s.recorded_at)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink">
                            {s.product ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-soft">{s.rate ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.qty ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {s.cost_of_chemical != null ? money(s.cost_of_chemical) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-ink-faint">
                            {s.safe_harvest_date ? formatDate(s.safe_harvest_date) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/spray-approval/${encodeURIComponent(programKey(s))}`}
                              target="_blank"
                              className="flex items-center gap-1 whitespace-nowrap font-semibold text-brand-700 hover:underline"
                            >
                              <FileCheck2 size={12} /> Sheet
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Link
                href="/spray"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
              >
                <SprayCan size={13} /> All spray programs
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** A compact severity timeline — the current reading marked. */
function SeverityStrip({ points }: { points: ScoutingHistoryPoint[] }) {
  return (
    <ul className="flex flex-wrap items-end gap-3">
      {points.map((p) => (
        <li key={p.id} className="flex flex-col items-center gap-1">
          <span
            className="flex w-10 items-end justify-center rounded-t text-[10px] font-bold text-white"
            style={{
              height: `${16 + p.severity * 14}px`,
              backgroundColor: severityHex(p.severity),
              outline: p.is_this ? "2px solid #0f172a" : undefined,
            }}
          >
            {p.severity}
          </span>
          <span className="text-[10px] text-ink-faint">{formatDate(p.recorded_at)}</span>
          {p.is_this ? (
            <span className="text-[10px] font-semibold text-ink">this</span>
          ) : (
            <Link
              href={`/scouting/${p.id}`}
              className="text-[10px] text-brand-700 hover:underline"
            >
              open
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function Tile({
  label,
  value,
  hex,
  icon,
}: {
  label: string;
  value: string;
  hex?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </p>
      <p
        className="mt-1 text-xl font-bold tabular-nums"
        style={{ color: hex ?? "#0f172a" }}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
