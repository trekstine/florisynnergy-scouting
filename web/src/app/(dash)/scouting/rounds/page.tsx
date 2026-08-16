"use client";

import { ArrowLeft, Bug, MapPin, SprayCan } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Badge, Card, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDate, severityHex } from "@/lib/format";
import { useGreenhouses, useRounds } from "@/lib/hooks";
import type { RoundSummary } from "@/lib/types";

/**
 * Scouting reports — what was walked, when, and what came of it.
 *
 * A manager arrives at this page with a question shaped like "what did we find
 * yesterday, and in which block?". So the rounds are grouped by the day they
 * were walked, newest first, with each day's totals on the header — you can
 * answer that question without opening anything.
 */
export default function ScoutingRoundsPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <RoundsList />
    </Suspense>
  );
}

const RANGES = [
  { id: "1", label: "Today" },
  { id: "2", label: "Yesterday" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "", label: "All" },
] as const;

/** Local midnight, N days back — the boundary a farm actually means by "yesterday". */
function dayStart(daysAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function RoundsList() {
  // Deep links from a spray program arrive pre-filtered to its block.
  const search = useSearchParams();
  const [greenhouse, setGreenhouse] = useState<string>(search.get("greenhouse") ?? "");
  const [range, setRange] = useState<string>(search.get("range") ?? "7");
  const houses = useGreenhouses();

  const q = useRounds({
    greenhouse_id: greenhouse ? Number(greenhouse) : undefined,
    limit: 500,
  });

  /**
   * Rounds bucketed by the day they were walked.
   *
   * "Yesterday" is its own bucket rather than a filter, because the question
   * is usually comparative — yesterday against the day before — and a filter
   * would throw away the comparison.
   */
  const days = useMemo(() => {
    const rows = q.data ?? [];
    const from =
      range === ""
        ? null
        : range === "2"
          ? dayStart(1) // yesterday only
          : dayStart(Number(range) - 1);
    const to = range === "2" ? dayStart(0) : null;

    const kept = rows.filter((r) => {
      const at = new Date(r.started_at);
      if (from && at < from) return false;
      if (to && at >= to) return false;
      return true;
    });

    const buckets = new Map<string, RoundSummary[]>();
    for (const r of kept) {
      const key = new Date(r.started_at).toLocaleDateString("en-CA"); // YYYY-MM-DD, local
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }

    return [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rounds]) => ({
        key,
        label: dayLabel(key),
        rounds: rounds.sort((a, b) => b.started_at.localeCompare(a.started_at)),
        blocks: new Set(rounds.map((r) => r.greenhouse ?? r.greenhouse_id)).size,
        beds: rounds.reduce((s, r) => s + r.beds, 0),
        findings: rounds.reduce((s, r) => s + r.findings, 0),
        worst: rounds.reduce((s, r) => Math.max(s, r.max_severity), 0),
        programs: rounds.reduce((s, r) => s + r.programs, 0),
      }));
  }, [q.data, range]);

  const total = days.reduce((s, d) => s + d.rounds.length, 0);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Scouting reports"
        subtitle="Grouped by the day they were walked, newest first"
        actions={
          <div className="flex items-center gap-2">
            <Select value={greenhouse} onChange={(e) => setGreenhouse(e.target.value)}>
              <option value="">All greenhouses</option>
              {(houses.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Link
              href="/scouting"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> All records
            </Link>
          </div>
        }
      />

      {/* Range chips — "what happened yesterday" in one click. */}
      <div className="flex flex-wrap items-center gap-1.5 px-6">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              range === r.id
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-line text-ink-soft hover:bg-surface hover:text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-faint">
          {total} report{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-4 px-6">
        {q.isLoading ? (
          <Card>
            <div className="p-8">
              <Spinner label="Loading reports…" />
            </div>
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <EmptyState>
              No scouting rounds in this window.
              {range !== "" && " Try a wider range."}
            </EmptyState>
          </Card>
        ) : (
          days.map((day) => (
            <Card key={day.key}>
              {/* The day header answers the question on its own. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3">
                <h3 className="text-sm font-bold text-ink">{day.label}</h3>
                <span className="text-xs text-ink-faint">
                  {day.rounds.length} report{day.rounds.length === 1 ? "" : "s"} ·{" "}
                  {day.blocks} block{day.blocks === 1 ? "" : "s"} · {day.beds} beds
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {day.findings > 0 ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
                      <Bug size={12} className="text-ink-faint" />
                      {day.findings} finding{day.findings === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700">
                      All clean
                    </span>
                  )}
                  {day.worst > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: severityHex(day.worst) }}
                      title="Worst severity seen that day"
                    >
                      {day.worst}
                    </span>
                  )}
                  {day.programs > 0 && (
                    <Badge color="#0891b2">
                      <SprayCan size={11} /> {day.programs}
                    </Badge>
                  )}
                </span>
              </div>

              <ul className="divide-y divide-line">
                {day.rounds.map((r) => (
                  <li key={r.batch_id}>
                    <Link
                      href={`/scouting/rounds/${encodeURIComponent(r.batch_id)}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">
                            {r.greenhouse ?? "Unknown block"}
                          </span>
                          {r.max_severity > 0 && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                              style={{ backgroundColor: severityHex(r.max_severity) }}
                            >
                              {r.max_severity}
                            </span>
                          )}
                          {r.programs > 0 ? (
                            <Badge color="#0891b2">
                              <SprayCan size={11} /> {r.programs} program
                              {r.programs === 1 ? "" : "s"}
                            </Badge>
                          ) : r.findings > 0 ? (
                            <Badge color="#d97706">No program yet</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-faint">
                          {r.scout ?? "Unknown scout"} ·{" "}
                          {new Date(r.started_at).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {r.agents.length > 0 && ` · ${r.agents.join(", ")}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-ink-soft">
                        <span className="flex items-center gap-1" title="Beds walked">
                          <MapPin size={12} className="text-ink-faint" />
                          {r.beds}
                        </span>
                        <span className="flex items-center gap-1" title="Findings">
                          <Bug size={12} className="text-ink-faint" />
                          {r.findings}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

/** "Today" and "Yesterday" read faster than a date, for the two days that matter most. */
function dayLabel(key: string): string {
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = dayStart(1).toLocaleDateString("en-CA");
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return formatDate(key);
}
