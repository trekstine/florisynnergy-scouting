"use client";

import { useMemo } from "react";

import { HBarChart } from "@/components/charts";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { useGreenhouses, useSpray, useSprayCost } from "@/lib/hooks";

export default function SprayPage() {
  const spray = useSpray();
  const cost = useSprayCost();
  const greenhouses = useGreenhouses();

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  const totalCost = (cost.data ?? []).reduce((s, r) => s + r.total_cost, 0);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Spray Programs" subtitle="Chemical applications & cost control" />

      <div className="grid grid-cols-1 gap-5 px-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Cost by greenhouse" subtitle={`Total ${money(totalCost)}`} />
          <div className="p-5">
            {cost.isLoading && <Spinner />}
            <HBarChart
              data={(cost.data ?? []).slice(0, 10).map((r) => ({
                label: r.greenhouse,
                value: r.total_cost,
              }))}
              color="#059669"
              height={300}
            />
            {!cost.isLoading && (cost.data ?? []).length === 0 && (
              <EmptyState>No spray records yet.</EmptyState>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent applications" subtitle={`${spray.data?.length ?? 0} product rows`} />
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Greenhouse</th>
                  <th className="px-3 py-2.5 font-semibold">Product</th>
                  <th className="px-3 py-2.5 font-semibold">WHO</th>
                  <th className="px-3 py-2.5 font-semibold">Coverage</th>
                  <th className="px-3 py-2.5 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(spray.data ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-soft">{formatDate(s.start_date ?? s.recorded_at)}</td>
                    <td className="px-3 py-2.5">{s.greenhouse_id ? ghName.get(s.greenhouse_id) ?? "—" : "—"}</td>
                    <td className="px-3 py-2.5 font-medium">{s.product ?? "—"}</td>
                    <td className="px-3 py-2.5">{s.who_class ? <Badge>{s.who_class}</Badge> : "—"}</td>
                    <td className="px-3 py-2.5">{s.coverage ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(s.cost_of_chemical)}</td>
                  </tr>
                ))}
                {spray.data?.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-faint">No spray records yet — captured from the mobile app.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
