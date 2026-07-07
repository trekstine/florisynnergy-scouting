"use client";

import { useMemo, useState } from "react";

import { HBarChart, HeatMatrix, SeverityHistogram, TrendChart } from "@/components/charts";
import { FilterBar, defaultFilters } from "@/components/FilterBar";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { money, relativeTime } from "@/lib/format";
import {
  useBreakdown,
  usePestMatrix,
  useScoutSummary,
  useSeverityDist,
  useSprayCost,
  useTrend,
} from "@/lib/hooks";
import type { Filters } from "@/lib/types";

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters(30));

  const trend = useTrend(filters);
  const pestBreak = useBreakdown("pest", filters);
  const diseaseBreak = useBreakdown("disease", filters);
  const varietyBreak = useBreakdown("variety", filters);
  const ghBreak = useBreakdown("greenhouse", filters);
  const sevDist = useSeverityDist(filters);
  const matrix = usePestMatrix(filters);
  const scouts = useScoutSummary(filters);
  const sprayCost = useSprayCost();

  const { rows, cols, lookup } = useMemo(() => {
    const cells = matrix.data ?? [];
    const r = new Set<string>();
    const c = new Set<string>();
    const map = new Map<string, number>();
    for (const x of cells) {
      r.add(x.pest);
      c.add(x.greenhouse);
      map.set(`${x.pest}|${x.greenhouse}`, x.avg_severity);
    }
    const colSort = (a: string, b: string) =>
      (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0);
    return { rows: [...r].sort(), cols: [...c].sort(colSort), lookup: map };
  }, [matrix.data]);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader title="Analytics" subtitle="Pressure trends, breakdowns & scout performance" />
      <div className="px-6">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      <div className="px-6">
        <Card>
          <CardHeader title="Pressure trend" subtitle="Records, over-ETL & average severity over time" />
          <div className="p-4">
            {trend.isLoading ? <Spinner /> : <TrendChart data={trend.data ?? []} height={300} />}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        <Breakdown title="Top pests" q={pestBreak} color="#10b981" />
        <Breakdown title="Top diseases" q={diseaseBreak} color="#f59e0b" />
        <Breakdown title="Pressure by variety" q={varietyBreak} color="#6366f1" />
      </div>

      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Severity distribution" />
          <div className="p-4">{sevDist.isLoading ? <Spinner /> : <SeverityHistogram data={sevDist.data ?? []} height={240} />}</div>
        </Card>
        <Card>
          <CardHeader title="Records by greenhouse" />
          <div className="p-4">
            {ghBreak.isLoading ? <Spinner /> : (
              <HBarChart data={(ghBreak.data ?? []).slice(0, 12).map((r) => ({ label: r.key, value: r.records }))} height={240} color="#0ea5e9" />
            )}
          </div>
        </Card>
      </div>

      <div className="px-6">
        <Card>
          <CardHeader title="Pest × greenhouse matrix" subtitle="Average severity (green → red)" />
          <div className="p-4">
            {matrix.isLoading && <Spinner />}
            {!matrix.isLoading && rows.length === 0 && <EmptyState>No pest records in range.</EmptyState>}
            {rows.length > 0 && <HeatMatrix rows={rows} cols={cols} value={(r, c) => lookup.get(`${r}|${c}`) ?? null} />}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scout accountability" subtitle="Records & coverage in range" />
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Scout</th>
                  <th className="px-3 py-2.5 font-semibold">Records</th>
                  <th className="px-3 py-2.5 font-semibold">Greenhouses</th>
                  <th className="px-3 py-2.5 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(scouts.data ?? []).map((s) => (
                  <tr key={s.scout_id} className="hover:bg-surface">
                    <td className="px-5 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 tabular-nums">{s.records}</td>
                    <td className="px-3 py-2.5 tabular-nums">{s.greenhouses_visited}</td>
                    <td className="px-3 py-2.5 text-ink-faint">{relativeTime(s.last_seen)}</td>
                  </tr>
                ))}
                {scouts.data?.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-ink-faint">No scout activity.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Spray cost by greenhouse" subtitle={`Total ${money((sprayCost.data ?? []).reduce((s, r) => s + r.total_cost, 0))}`} />
          <div className="p-4">
            {sprayCost.isLoading ? <Spinner /> : (sprayCost.data ?? []).length === 0 ? (
              <EmptyState>No spray records yet.</EmptyState>
            ) : (
              <HBarChart
                data={(sprayCost.data ?? []).slice(0, 12).map((r) => ({ label: r.greenhouse, value: r.total_cost }))}
                color="#059669"
                height={240}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Breakdown({
  title,
  q,
  color,
}: {
  title: string;
  q: { data?: { key: string; records: number; over_threshold: number }[]; isLoading: boolean };
  color: string;
}) {
  const total = (q.data ?? []).reduce((s, r) => s + r.records, 0);
  return (
    <Card>
      <CardHeader title={title} actions={<Badge>{total} recs</Badge>} />
      <div className="p-4">
        {q.isLoading ? <Spinner /> : (q.data ?? []).length === 0 ? (
          <EmptyState>No data.</EmptyState>
        ) : (
          <HBarChart data={(q.data ?? []).slice(0, 8).map((r) => ({ label: r.key, value: r.records }))} color={color} height={200} />
        )}
      </div>
    </Card>
  );
}
