"use client";

import { CalendarOff, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RoundDrawer } from "@/components/RoundDrawer";
import { formatDate } from "@/lib/format";
import { useRounds } from "@/lib/hooks";
import type { RoundSummary } from "@/lib/types";

/** What the block's scouting history has to say about a given date. */
export interface RoundMatch {
  /** The round walked on the report date itself, if there is one. */
  exact: RoundSummary | null;
  /** The most recent round *before* that date — a fallback, never a substitute. */
  nearest: RoundSummary | null;
  /** The date we were looking for, or null if the programme carries none. */
  wanted: string | null;
  /** Every round inside the programme's own scouting window, newest first. */
  inWindow: RoundSummary[];
}

/**
 * Match a spray programme to the scouting round that justified it.
 *
 * A programme carries the block and the scout report date, not a batch id, so
 * the round has to be found. The rule that matters is what happens when there
 * is no round on that date, and the old one was wrong twice over: it quietly
 * opened the nearest earlier round, and — when the programme had no report date
 * at all — the *newest* round on the block, which could be weeks after the
 * spray. Either way the manager was reading one day's findings while believing
 * they were another's, with nothing on screen to say so.
 *
 * So this returns both answers and refuses to choose between them. An exact
 * match opens directly; anything else is offered by name, with its date, for
 * the reader to accept deliberately.
 */
export function matchRound(
  rounds: RoundSummary[],
  reportDate: string | null,
  reportEndDate?: string | null,
): RoundMatch {
  const from = reportDate ? reportDate.slice(0, 10) : null;
  // An absent end means the window is that one day, not an open interval.
  const to = reportEndDate ? reportEndDate.slice(0, 10) : from;
  if (!rounds.length) return { exact: null, nearest: null, wanted: from, inWindow: [] };

  // No date on the programme is a gap in the record, not licence to guess.
  // Without one there is no "nearest" to speak of either — the newest round on
  // the block is not evidence for a spray of unknown date.
  if (!from) {
    return { exact: null, nearest: null, wanted: null, inWindow: [] };
  }

  // Everything the programme's own window covers, newest first. A spray that
  // answers a Monday and a Thursday walk should show both, not pick one and
  // discard the other.
  const inWindow = rounds
    .filter((r) => {
      const day = r.started_at.slice(0, 10);
      return day >= from && day <= (to ?? from);
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  if (inWindow.length) {
    return { exact: inWindow[0]!, nearest: null, wanted: from, inWindow };
  }

  const before = rounds
    .filter((r) => r.started_at.slice(0, 10) < from)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  return { exact: null, nearest: before[0] ?? null, wanted: from, inWindow: [] };
}

export function ScoutingBehindLink({
  greenhouseId,
  reportDate,
  reportEndDate,
  className = "flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline",
  label = "Scouting behind this block",
}: {
  greenhouseId: number | null;
  reportDate: string | null;
  /** End of the programme's scouting window, when it answers more than one walk. */
  reportEndDate?: string | null;
  className?: string;
  label?: string;
}) {
  const q = useRounds(
    greenhouseId != null ? { greenhouse_id: greenhouseId, limit: 100 } : null,
  );
  const match = useMemo(
    () => matchRound(q.data ?? [], reportDate, reportEndDate),
    [q.data, reportDate, reportEndDate],
  );
  const [open, setOpen] = useState<string | null>(null);

  if (greenhouseId == null) return null;

  // Checking the scouting behind a spray is a glance, not a destination — it
  // opens over the programme rather than navigating away from it, so the tank
  // mix, the filters and the scroll position all survive the trip.
  const openDrawer = (e: React.MouseEvent, batchId: string) => {
    // The analytics table toggles a programme on row click; opening the drawer
    // must not also collapse the row underneath it.
    e.stopPropagation();
    setOpen(batchId);
  };

  if (match.exact) {
    const extra = match.inWindow.slice(1);
    return (
      <>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={(e) => openDrawer(e, match.exact!.batch_id)}
            className={className}
          >
            <ClipboardList size={13} /> {label}
          </button>
          {/* A programme answering several walks names them all. Opening only
              the latest would quietly drop the evidence for the rest. */}
          {extra.map((r) => (
            <button
              key={r.batch_id}
              type="button"
              onClick={(e) => openDrawer(e, r.batch_id)}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              {formatDate(r.started_at)}
            </button>
          ))}
        </span>
        <RoundDrawer batchId={open} onClose={() => setOpen(null)} />
      </>
    );
  }

  // No round on the day. Say so, and name the date of the nearest one before
  // opening it — the reader decides whether an older walk is evidence.
  if (match.nearest) {
    const day = formatDate(match.nearest.started_at);
    return (
      <>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-faint">
          <CalendarOff size={12} className="shrink-0" />
          <span>
            No scouting on{" "}
            {match.wanted ? formatDate(match.wanted) : "the report date"}.
          </span>
          <button
            type="button"
            onClick={(e) => openDrawer(e, match.nearest!.batch_id)}
            className="font-semibold text-brand-700 hover:underline"
          >
            Open the round of {day}
          </button>
        </span>
        <RoundDrawer batchId={open} onClose={() => setOpen(null)} />
      </>
    );
  }

  // Nothing to point at — either the programme carries no report date, or the
  // block has no earlier round. The filtered list is the honest destination.
  return (
    <Link
      href={`/scouting/rounds?greenhouse=${greenhouseId}`}
      className="flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-brand-700 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <ClipboardList size={13} />
      {match.wanted
        ? `No scouting on or before ${formatDate(match.wanted)} — see all rounds`
        : "No report date on this program — see all rounds"}
    </Link>
  );
}
