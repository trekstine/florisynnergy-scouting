"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useRounds } from "@/lib/hooks";
import type { RoundSummary } from "@/lib/types";

/**
 * Resolve a spray program back to the scouting round that justified it.
 *
 * A program carries the block and the scout report date, not a batch id, so
 * the round has to be matched: the walk of that block on the report date, or
 * failing that the last walk before it. Without this the trail ended at an
 * unfiltered list of every observation on the farm, which answers nothing.
 */
export function pickRound(rounds: RoundSummary[], reportDate: string | null): RoundSummary | null {
  if (!rounds.length) return null;
  if (!reportDate) return rounds[0]!; // already newest-first
  const day = reportDate.slice(0, 10);
  const exact = rounds.find((r) => r.started_at.slice(0, 10) === day);
  if (exact) return exact;
  const before = rounds.filter((r) => r.started_at.slice(0, 10) <= day);
  return before[0] ?? null;
}

export function ScoutingBehindLink({
  greenhouseId,
  reportDate,
  className = "flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline",
  label = "Scouting behind this block",
}: {
  greenhouseId: number | null;
  reportDate: string | null;
  className?: string;
  label?: string;
}) {
  const q = useRounds(greenhouseId != null ? { greenhouse_id: greenhouseId, limit: 100 } : null);
  const round = useMemo(() => pickRound(q.data ?? [], reportDate), [q.data, reportDate]);

  if (greenhouseId == null) return null;

  // Until the round resolves, fall back to the reports list filtered to this
  // block — still the right place, just one click further from the answer.
  const href = round
    ? `/scouting/rounds/${encodeURIComponent(round.batch_id)}`
    : `/scouting/rounds?greenhouse=${greenhouseId}`;

  return (
    <Link href={href} className={className}>
      <ClipboardList size={13} /> {label}
    </Link>
  );
}
