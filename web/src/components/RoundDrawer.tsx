"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  Camera,
  MapPin,
  SprayCan,
  StickyNote,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Badge, EmptyState, Spinner } from "@/components/ui";
import {
  REC_STATUS_HEX,
  REC_STATUS_LABEL,
  SCOUTING_LABEL,
  bedLabel,
  formatDate,
  severityHex,
} from "@/lib/format";
import { useDiseases, usePests, useRound } from "@/lib/hooks";

/**
 * A scouting round, in a slide-over.
 *
 * Reading a spray program and checking the scouting that justified it is one
 * question, not two. Navigating away to answer it loses the expanded program,
 * the filters and the scroll position — and the manager has to find their way
 * back. The drawer keeps the program on screen behind it.
 *
 * The full page still exists for when the round is the subject rather than the
 * evidence; the footer links to it.
 */
export function RoundDrawer({
  batchId,
  onClose,
}: {
  batchId: string | null;
  onClose: () => void;
}) {
  const q = useRound(batchId);
  const pests = usePests();
  const diseases = useDiseases();

  // Escape closes it, as it does for every other overlay in the portal.
  useEffect(() => {
    if (!batchId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [batchId, onClose]);

  if (!batchId) return null;

  const d = q.data;
  const r = d?.round;
  const pestName = new Map((pests.data ?? []).map((p) => [p.id, p.name]));
  const diseaseName = new Map((diseases.data ?? []).map((x) => [x.id, x.name]));
  const findings = (d?.entries ?? [])
    .filter((e) => e.severity > 0)
    .sort((a, b) => b.severity - a.severity);
  const cleanBeds = (d?.entries.length ?? 0) - findings.length;

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      {/* The program stays visible behind the scrim — that is the point. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-ink/30"
      />

      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Scouting behind this block
            </p>
            <h2 className="truncate text-base font-bold text-ink">
              {r?.greenhouse ?? "Scouting round"}
            </h2>
            {r && (
              <p className="mt-0.5 text-sm text-ink-faint">
                {r.scout ?? "Unknown scout"} · {formatDate(r.started_at)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {q.isLoading ? (
            <div className="p-8">
              <Spinner label="Loading the round…" />
            </div>
          ) : !d || !r ? (
            <div className="p-5">
              <EmptyState>That scouting round could not be loaded.</EmptyState>
            </div>
          ) : (
            <>
              {/* What the walk covered */}
              <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
                <Stat label="Beds" value={String(r.beds)} icon={<MapPin size={11} />} />
                <Stat
                  label="Findings"
                  value={String(r.findings)}
                  icon={<Bug size={11} />}
                />
                <Stat
                  label="Worst"
                  value={String(r.max_severity)}
                  hex={r.max_severity > 0 ? severityHex(r.max_severity) : undefined}
                />
                <Stat label="Clean" value={String(cleanBeds)} />
              </div>

              {r.session_comment && (
                <p className="border-b border-line bg-surface px-5 py-3 text-sm text-ink-soft">
                  <span className="font-semibold text-ink">Scout&apos;s remark: </span>
                  {r.session_comment}
                </p>
              )}

              {/* Recommendations this round raised */}
              {d.recommendations.length > 0 && (
                <section className="border-b border-line px-5 py-4">
                  <h3 className="mb-2 text-sm font-bold text-ink">
                    Recommendations raised · {d.recommendations.length}
                  </h3>
                  <ul className="space-y-1.5">
                    {d.recommendations.map((rec) => (
                      <li key={rec.id} className="flex items-start gap-2 text-sm">
                        <Badge color={REC_STATUS_HEX[rec.status]}>
                          {REC_STATUS_LABEL[rec.status]}
                        </Badge>
                        <span className="min-w-0 flex-1 text-ink-soft">
                          {rec.note ?? `Recommendation #${rec.id}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Other programs off the same round — useful context when you
                  arrived here from one of them. */}
              {d.programs.length > 0 && (
                <section className="border-b border-line px-5 py-4">
                  <h3 className="mb-2 text-sm font-bold text-ink">
                    Programs from this report · {d.programs.length}
                  </h3>
                  <ul className="space-y-1.5">
                    {d.programs.map((p) => (
                      <li
                        key={p.program_id}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <SprayCan size={13} className="shrink-0 text-brand-700" />
                        <Link
                          href={`/spray/${encodeURIComponent(p.program_id)}`}
                          className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline"
                        >
                          {p.products.join(", ") || "—"}
                        </Link>
                        <span className="text-xs text-ink-faint">
                          {formatDate(p.start_date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* The findings themselves, worst first */}
              <section className="px-5 py-4">
                <h3 className="mb-2 text-sm font-bold text-ink">
                  {findings.length > 0
                    ? `Findings · ${findings.length}`
                    : "Findings"}
                </h3>
                {findings.length === 0 ? (
                  <p className="text-sm text-ink-faint">
                    Every bed walked came back clean.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {findings.map((e) => {
                      const target =
                        e.disease_id != null
                          ? (diseaseName.get(e.disease_id) ?? "Disease")
                          : e.pest_id != null
                            ? (pestName.get(e.pest_id) ?? "Pest")
                            : "—";
                      return (
                        <li key={e.id} className="flex items-start gap-3 py-2.5">
                          <span
                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
                            style={{ backgroundColor: severityHex(e.severity) }}
                          >
                            {e.severity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">
                              {target}
                              <span className="font-normal text-ink-faint">
                                {" · "}
                                {e.bed_code ? bedLabel(e.bed_code) : "block-level"}
                              </span>
                            </p>
                            <p className="text-xs text-ink-faint">
                              {SCOUTING_LABEL[e.scouting_for]}
                              {e.variety_code && ` · ${e.variety_code}`}
                              {e.stage && ` · ${e.stage}`}
                              {e.location_on_plant && ` · ${e.location_on_plant}`}
                            </p>
                            {e.notes && (
                              <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-soft">
                                <StickyNote
                                  size={11}
                                  className="mt-0.5 shrink-0 text-ink-faint"
                                />
                                {e.notes}
                              </p>
                            )}
                            <span className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
                              {e.image_url && (
                                <Link
                                  href={`/scouting/${e.id}`}
                                  className="flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                                >
                                  <Camera size={10} /> Photo
                                </Link>
                              )}
                              {e.flagged && (
                                <span className="flex items-center gap-1 text-amber-700">
                                  <AlertTriangle size={10} />
                                  {e.flag_reason ?? "Flagged"}
                                </span>
                              )}
                              <Link
                                href={`/scouting/${e.id}`}
                                className="hover:underline"
                              >
                                Record #{e.id}
                              </Link>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3">
          <p className="text-xs text-ink-faint">
            The full report has the whole round, clean beds included.
          </p>
          <Link
            href={`/scouting/rounds/${encodeURIComponent(batchId)}`}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Open report <ArrowUpRight size={14} />
          </Link>
        </footer>
      </aside>
    </div>
  );
}

function Stat({
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
    <div className="bg-white px-3 py-2.5 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </p>
      <p
        className="mt-0.5 text-lg font-bold tabular-nums"
        style={{ color: hex ?? "#0f172a" }}
      >
        {value}
      </p>
    </div>
  );
}
