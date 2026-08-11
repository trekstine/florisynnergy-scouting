"use client";

import { ArrowLeft, Bug, MapPin, SprayCan } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PaginationBar, usePagination } from "@/components/Pagination";
import { Badge, Card, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDate, severityHex } from "@/lib/format";
import { useGreenhouses, useRounds } from "@/lib/hooks";

/**
 * Scouting reports — one row per round.
 *
 * The records list answers "what was seen"; this answers "what walks have we
 * done, and did anything come of them". The last column is the point: a round
 * with findings and no spray program is a round still waiting on a decision.
 */
export default function ScoutingRoundsPage() {
  const [greenhouse, setGreenhouse] = useState<string>("");
  const houses = useGreenhouses();
  const q = useRounds({
    greenhouse_id: greenhouse ? Number(greenhouse) : undefined,
    limit: 300,
  });
  const rows = q.data ?? [];
  const paged = usePagination(rows, 25, greenhouse);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Scouting reports"
        subtitle="Every round walked, and what each one led to"
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

      <div className="px-6">
        <Card>
          {q.isLoading ? (
            <div className="p-8">
              <Spinner label="Loading rounds…" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState>No scouting rounds recorded yet.</EmptyState>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-5 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Greenhouse</th>
                      <th className="px-3 py-2.5 font-semibold">Scout</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Beds</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Findings</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Worst</th>
                      <th className="px-3 py-2.5 font-semibold">Agents seen</th>
                      <th className="px-3 py-2.5 font-semibold">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paged.paged.map((r) => (
                      <tr key={r.batch_id} className="hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <Link
                            href={`/scouting/rounds/${encodeURIComponent(r.batch_id)}`}
                            className="font-semibold text-brand-700 hover:underline"
                          >
                            {formatDate(r.started_at)}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-ink">
                          {r.greenhouse ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-ink-soft">{r.scout ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={11} className="text-ink-faint" />
                            {r.beds}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          <span className="inline-flex items-center gap-1">
                            <Bug size={11} className="text-ink-faint" />
                            {r.findings}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className="inline-block min-w-[1.75rem] rounded px-1.5 py-0.5 text-xs font-bold text-white"
                            style={{ backgroundColor: severityHex(r.max_severity) }}
                          >
                            {r.max_severity}
                          </span>
                        </td>
                        <td className="max-w-xs truncate px-3 py-2.5 text-ink-faint">
                          {r.agents.length ? r.agents.join(", ") : "clean"}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.programs > 0 ? (
                            <Badge color="#0891b2">
                              <SprayCan size={11} /> {r.programs} program
                              {r.programs === 1 ? "" : "s"}
                            </Badge>
                          ) : r.findings > 0 ? (
                            <Badge color="#d97706">No program yet</Badge>
                          ) : (
                            <span className="text-xs text-ink-faint">Nothing to action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={paged.page}
                totalPages={paged.totalPages}
                pageSize={paged.pageSize}
                total={paged.total}
                onPage={paged.setPage}
                onPageSize={paged.setPageSize}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
