"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Camera,
  FileCheck2,
  MapPin,
  Paperclip,
  SprayCan,
  StickyNote,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";

import { STATUS_HEX } from "@/components/SprayProgramPanel";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import {
  REC_STATUS_HEX,
  REC_STATUS_LABEL,
  SCOUTING_LABEL,
  bedLabel,
  formatDate,
  money,
  severityHex,
} from "@/lib/format";
import { useDiseases, usePests, useRound } from "@/lib/hooks";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  applied: "Applied",
  reviewed: "Reviewed",
};

/**
 * A scouting report — one round, many records.
 *
 * A farm says "scouting report" and means the whole walk, not a single
 * observation. This is that unit, and it answers the question the record page
 * could not: what did this report lead to?
 */
export default function ScoutingRoundPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = decodeURIComponent(params.batchId);
  const q = useRound(batchId);
  const pests = usePests();
  const diseases = useDiseases();
  const [showClean, setShowClean] = useState(false);

  if (q.isLoading) {
    return (
      <div className="p-8">
        <Spinner label="Loading scouting report…" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-8">
        <EmptyState>Scouting report not found.</EmptyState>
      </div>
    );
  }

  const { round: r, entries, recommendations, programs } = q.data;
  const pestName = new Map((pests.data ?? []).map((p) => [p.id, p.name]));
  const diseaseName = new Map((diseases.data ?? []).map((d) => [d.id, d.name]));
  const findings = entries.filter((e) => e.severity > 0);
  const shown = showClean ? entries : findings;
  const cleanCount = entries.length - findings.length;

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={`Scouting report — ${r.greenhouse ?? "Unknown block"}`}
        subtitle={`${r.scout ?? "Unknown scout"} · ${formatDate(r.started_at)} · ${r.records} records across ${r.beds} beds`}
        actions={
          <Link
            href="/scouting"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink"
          >
            <ArrowLeft size={15} /> All scouting
          </Link>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-5">
        <Tile label="Records" value={String(r.records)} />
        <Tile label="Beds walked" value={String(r.beds)} icon={<MapPin size={13} />} />
        <Tile label="Findings" value={String(r.findings)} icon={<Bug size={13} />} />
        <Tile
          label="Worst severity"
          value={`${r.max_severity} / 5`}
          hex={severityHex(r.max_severity)}
        />
        <Tile
          label="Spray programs"
          value={String(programs.length)}
          icon={<SprayCan size={13} />}
          hex={programs.length ? "#0891b2" : undefined}
        />
      </div>

      {/* ── The answer to the client's question ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Spray programs raised from this report"
            subtitle="What this round led to"
          />
          {programs.length === 0 ? (
            <EmptyState>
              No spray program has been raised from this report yet.
              {recommendations.length > 0 &&
                " There are open recommendations below awaiting a decision."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {programs.map((p) => (
                <li key={p.program_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <SprayCan size={16} className="shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">
                        {p.products.join(", ") || "—"}
                      </span>
                      <Badge color={STATUS_HEX[p.program_status]}>
                        {STATUS_LABEL[p.program_status] ?? p.program_status}
                      </Badge>
                      {p.attachments > 0 && (
                        <span className="flex items-center gap-1 text-xs text-ink-faint">
                          <Paperclip size={11} /> {p.attachments}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                      {p.greenhouse ?? "—"}
                      {p.bed_code && ` · ${bedLabel(p.bed_code)}`} ·{" "}
                      {formatDate(p.start_date)}
                      {p.safe_harvest_date &&
                        ` · safe to cut ${formatDate(p.safe_harvest_date)}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">
                    {money(p.total_cost)}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/spray/${encodeURIComponent(p.program_id)}`}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open program
                    </Link>
                    <Link
                      href={`/spray-approval/${encodeURIComponent(p.program_id)}`}
                      target="_blank"
                      className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                    >
                      <FileCheck2 size={12} /> Sheet
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Recommendations this round raised ── */}
      {recommendations.length > 0 && (
        <div className="px-6">
          <Card>
            <CardHeader
              title={`Recommendations raised · ${recommendations.length}`}
              subtitle="Thresholds crossed by this round's findings"
            />
            <ul className="divide-y divide-line">
              {recommendations.map((rec) => (
                <li key={rec.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Badge color={REC_STATUS_HEX[rec.status]}>
                    {REC_STATUS_LABEL[rec.status]}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm text-ink">
                    {rec.note ?? `Recommendation #${rec.id}`}
                  </span>
                  {rec.outcome_note && (
                    <span className="text-xs text-ink-faint">{rec.outcome_note}</span>
                  )}
                  <Link
                    href="/recommendations"
                    className="text-xs font-semibold text-brand-700 hover:underline"
                  >
                    Board →
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ── The round itself ── */}
      <div className="px-6">
        <Card>
          <CardHeader
            title="Records in this round"
            subtitle={showClean ? "Whole round" : "Findings first, worst severity at the top"}
            actions={
              cleanCount > 0 ? (
                <button
                  onClick={() => setShowClean((v) => !v)}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface hover:text-ink"
                >
                  {showClean
                    ? `Hide ${cleanCount} clean bed${cleanCount === 1 ? "" : "s"}`
                    : `Show ${cleanCount} clean bed${cleanCount === 1 ? "" : "s"}`}
                </button>
              ) : undefined
            }
          />
          {r.session_comment && (
            <p className="border-b border-line bg-surface px-5 py-3 text-sm text-ink-soft">
              <span className="font-semibold text-ink">Scout&apos;s remark: </span>
              {r.session_comment}
            </p>
          )}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold">Bed</th>
                  {/* "Type" was the scouting method and "Target" the thing
                      found — neither name said so, and side by side they read
                      as two halves of one idea. */}
                  <th className="px-3 py-2.5 font-semibold">Scouting method</th>
                  <th className="px-3 py-2.5 font-semibold">Pest / Disease</th>
                  <th className="px-3 py-2.5 font-semibold">Variety</th>
                  <th className="px-3 py-2.5 font-semibold">Crop stage</th>
                  <th className="px-3 py-2.5 font-semibold">Where on plant</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Counts</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Severity (0–5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((e) => {
                  // Which of the two it is matters agronomically — a disease
                  // and a pest with similar names get very different
                  // chemistry — so the row says which, not just the name.
                  const target =
                    e.disease_id != null
                      ? (diseaseName.get(e.disease_id) ?? "Disease")
                      : e.pest_id != null
                        ? (pestName.get(e.pest_id) ?? "Pest")
                        : "—";
                  const targetKind =
                    e.disease_id != null
                      ? "disease"
                      : e.pest_id != null
                        ? "pest"
                        : null;
                  const counts = [
                    e.sticky_trap_bug_count > 0 && `${e.sticky_trap_bug_count} trap`,
                    e.lure_bug_count > 0 && `${e.lure_bug_count} lure`,
                    e.fcm_count > 0 && `${e.fcm_count} FCM`,
                    e.beneficials_count > 0 &&
                      `${e.beneficials_count} beneficials`,
                  ].filter(Boolean) as string[];

                  return (
                    <Fragment key={e.id}>
                      <tr className="hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-2.5 align-top">
                          <Link
                            href={`/scouting/${e.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {new Date(e.recorded_at).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 align-top text-ink-soft">
                          {e.bed_code ? bedLabel(e.bed_code) : "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top text-ink-faint">
                          {SCOUTING_LABEL[e.scouting_for]}
                        </td>
                        <td className="px-3 py-2.5 align-top font-medium text-ink">
                          {target}
                          {targetKind && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                              {targetKind}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-ink-soft">
                          {e.variety_code ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top text-ink-soft">
                          {e.stage ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top text-ink-soft">
                          {e.location_on_plant ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top text-xs text-ink-faint">
                          {counts.length ? counts.join(" · ") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          <span
                            className="inline-block min-w-[1.75rem] rounded px-1.5 py-0.5 text-xs font-bold text-white"
                            style={{ backgroundColor: severityHex(e.severity) }}
                          >
                            {e.severity}
                          </span>
                        </td>
                      </tr>

                      {/* The scout's own words, in full. Truncating a note to a
                          column width loses the half of it that says why. */}
                      {(e.notes || e.image_url || e.flagged) && (
                        <tr className="border-b border-line">
                          <td />
                          <td colSpan={8} className="px-3 pb-3 pt-0">
                            <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                              {e.notes && (
                                <span className="flex max-w-2xl items-start gap-1.5 text-xs text-ink-soft">
                                  <StickyNote
                                    size={11}
                                    className="mt-0.5 shrink-0 text-ink-faint"
                                  />
                                  {e.notes}
                                </span>
                              )}
                              {e.image_url && (
                                <Link
                                  href={`/scouting/${e.id}`}
                                  className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                                >
                                  <Camera size={11} /> Photo
                                </Link>
                              )}
                              {e.flagged && (
                                <span className="flex items-center gap-1 text-xs text-amber-700">
                                  <AlertTriangle size={11} />
                                  {e.flag_reason ?? "Flagged for review"}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-6 text-center text-ink-faint">
                      Every bed walked came back clean.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
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
