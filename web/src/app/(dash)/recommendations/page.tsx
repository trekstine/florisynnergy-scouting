"use client";

import { useMemo } from "react";

import { Badge, PageHeader, Select, Spinner } from "@/components/ui";
import { REC_STATUS_HEX, REC_STATUS_LABEL, relativeTime } from "@/lib/format";
import {
  useChemicals,
  useGreenhouses,
  useRecommendations,
  useUpdateRecommendation,
} from "@/lib/hooks";
import type { Recommendation, RecStatus } from "@/lib/types";

const COLUMNS: RecStatus[] = ["open", "planned", "actioned", "resolved"];
const NEXT: Record<RecStatus, RecStatus | null> = {
  open: "planned",
  planned: "actioned",
  actioned: "resolved",
  resolved: null,
};

export default function RecommendationsPage() {
  const recs = useRecommendations();
  const greenhouses = useGreenhouses();
  const chemicals = useChemicals();
  const update = useUpdateRecommendation();

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  const byStatus = useMemo(() => {
    const m: Record<RecStatus, Recommendation[]> = { open: [], planned: [], actioned: [], resolved: [] };
    for (const r of recs.data ?? []) m[r.status].push(r);
    return m;
  }, [recs.data]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recommendations"
        subtitle="Threshold-triggered interventions"
        actions={recs.isFetching ? <Spinner /> : undefined}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-6 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col} className="flex min-h-0 flex-col rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: REC_STATUS_HEX[col] }} />
                {REC_STATUS_LABEL[col]}
              </span>
              <span className="text-xs font-semibold text-ink-faint">{byStatus[col].length}</span>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-3">
              {byStatus[col].map((r) => (
                <div key={r.id} className="rounded-lg border border-line bg-white p-3 shadow-card">
                  <p className="text-sm font-medium text-ink">{r.note ?? "Intervention"}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {r.greenhouse_id ? ghName.get(r.greenhouse_id) ?? `GH #${r.greenhouse_id}` : "—"}
                    {r.bed_code ? ` · ${r.bed_code}` : ""} · {relativeTime(r.created_at)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge color="#dc2626">sev {r.trigger_severity}</Badge>
                    {r.post_severity != null && <Badge color="#059669">post {r.post_severity}</Badge>}
                  </div>

                  {col !== "resolved" && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      <Select
                        className="text-xs"
                        value={r.recommended_chemical_id ?? ""}
                        onChange={(e) =>
                          update.mutate({
                            id: r.id,
                            body: { recommended_chemical_id: e.target.value ? Number(e.target.value) : null },
                          })
                        }
                      >
                        <option value="">Assign chemical…</option>
                        {(chemicals.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                      {NEXT[col] && (
                        <button
                          onClick={() => update.mutate({ id: r.id, body: { status: NEXT[col] } })}
                          className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                        >
                          Advance to {REC_STATUS_LABEL[NEXT[col]!]}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {byStatus[col].length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-ink-faint">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
