"use client";

import { ArrowDownRight, ArrowUpRight, Beaker, CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

import { Badge, PageHeader, Select, Spinner } from "@/components/ui";
import { REC_STATUS_HEX, REC_STATUS_LABEL, relativeTime } from "@/lib/format";
import {
  useChemicals,
  useCompliance,
  useGreenhouses,
  useRecommendations,
  useRecOutcomes,
  useReopenRecommendation,
  useSprayFromRecommendation,
  useUpdateRecommendation,
  useVerifyRecommendation,
} from "@/lib/hooks";
import type {
  Chemical,
  ComplianceLevel,
  OutcomeVerdict,
  Recommendation,
  RecommendationOutcome,
  RecStatus,
} from "@/lib/types";

const COLUMNS: RecStatus[] = ["open", "planned", "actioned", "resolved"];
const NEXT: Record<RecStatus, RecStatus | null> = {
  open: "planned",
  planned: "actioned",
  actioned: "resolved",
  resolved: null,
};

const VERDICT: Record<OutcomeVerdict, { label: string; hex: string }> = {
  no_data: { label: "No follow-up", hex: "#94a3b8" },
  resolved_ready: { label: "Recovered", hex: "#059669" },
  recovering: { label: "Recovering", hex: "#f59e0b" },
  not_responding: { label: "Not responding", hex: "#dc2626" },
};

const SOURCE_LABEL: Record<string, string> = {
  default: "base ETL",
  greenhouse: "block rule",
  variety: "variety rule",
  "variety+greenhouse": "variety + block rule",
};

const LEVEL_HEX: Record<ComplianceLevel, string> = {
  block: "#dc2626",
  warn: "#f59e0b",
  info: "#64748b",
};

export default function RecommendationsPage() {
  const recs = useRecommendations();
  const greenhouses = useGreenhouses();
  const chemicals = useChemicals();
  const outcomes = useRecOutcomes();

  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.name);
    return m;
  }, [greenhouses.data]);

  const outcomeById = useMemo(() => {
    const m = new Map<number, RecommendationOutcome>();
    for (const o of outcomes.data ?? []) m.set(o.recommendation_id, o);
    return m;
  }, [outcomes.data]);

  const byStatus = useMemo(() => {
    const m: Record<RecStatus, Recommendation[]> = { open: [], planned: [], actioned: [], resolved: [] };
    for (const r of recs.data ?? []) m[r.status].push(r);
    return m;
  }, [recs.data]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recommendations"
        subtitle="Observation → intervention → outcome"
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
                <RecCard
                  key={r.id}
                  rec={r}
                  col={col}
                  ghName={ghName}
                  outcome={outcomeById.get(r.id)}
                  chemicals={chemicals.data ?? []}
                />
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

function RecCard({
  rec: r,
  col,
  ghName,
  outcome: oc,
  chemicals,
}: {
  rec: Recommendation;
  col: RecStatus;
  ghName: Map<number, string>;
  outcome: RecommendationOutcome | undefined;
  chemicals: Chemical[];
}) {
  const update = useUpdateRecommendation();
  const verify = useVerifyRecommendation();
  const spray = useSprayFromRecommendation();
  const reopen = useReopenRecommendation();
  const compliance = useCompliance(r.id, r.recommended_chemical_id);

  const comp = compliance.data;
  const isBlocked = comp?.blocked ?? false;

  return (
    <div className="rounded-lg border border-line bg-white p-3 shadow-card">
      <p className="text-sm font-medium text-ink">{r.note ?? "Intervention"}</p>
      <p className="mt-1 text-xs text-ink-faint">
        {r.greenhouse_id ? (ghName.get(r.greenhouse_id) ?? `GH #${r.greenhouse_id}`) : "—"}
        {r.bed_code ? ` · ${r.bed_code}` : ""} · {relativeTime(r.created_at)}
      </p>
      {r.effective_threshold != null && (
        <p className="mt-1 text-xs text-ink-faint">
          <span className="font-semibold text-ink-soft">Why:</span> severity {r.trigger_severity} ≥ ETL{" "}
          {r.effective_threshold} · {SOURCE_LABEL[r.threshold_source ?? "default"] ?? r.threshold_source}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge color="#dc2626">baseline {r.trigger_severity}</Badge>
        {r.post_severity != null && <Badge color="#059669">post {r.post_severity}</Badge>}
        {r.reopened_count > 0 && <Badge color="#7c3aed">reopened ×{r.reopened_count}</Badge>}
      </div>

      {r.outcome_note && <p className="mt-1.5 text-xs italic text-ink-soft">{r.outcome_note}</p>}

      {oc && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
          <Badge color={VERDICT[oc.verdict].hex}>{VERDICT[oc.verdict].label}</Badge>
          {oc.latest_severity != null && (
            <span className="flex items-center gap-1 text-xs text-ink-soft">
              now {oc.latest_severity} / ETL {oc.effective_threshold}
              {oc.delta != null && oc.delta !== 0 && (
                <span className="inline-flex items-center" style={{ color: oc.delta < 0 ? "#059669" : "#dc2626" }}>
                  {oc.delta < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  {Math.abs(oc.delta)}
                </span>
              )}
            </span>
          )}
        </div>
      )}

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
            {chemicals.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          {/* Compliance gate */}
          {r.recommended_chemical_id != null && comp && comp.issues.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-surface px-2.5 py-1.5">
              {comp.issues.map((i) => (
                <li key={i.code} className="flex items-start gap-1.5 text-xs" style={{ color: LEVEL_HEX[i.level] }}>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_HEX[i.level] }} />
                  <span className={i.level === "info" ? "text-ink-faint" : ""}>{i.message}</span>
                </li>
              ))}
            </ul>
          )}

          {isBlocked ? (
            <button
              onClick={() => spray.mutate({ id: r.id, body: { override: true } })}
              disabled={spray.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-40"
              style={{ backgroundColor: "#dc2626" }}
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Override &amp; generate
            </button>
          ) : (
            <button
              onClick={() => spray.mutate({ id: r.id, body: {} })}
              disabled={!r.recommended_chemical_id || spray.isPending}
              title={r.recommended_chemical_id ? undefined : "Assign a chemical first"}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Beaker className="h-3.5 w-3.5" /> Generate spray program
            </button>
          )}

          {oc && oc.latest_severity != null && (
            <button
              onClick={() => verify.mutate(r.id)}
              disabled={verify.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {oc.verdict === "resolved_ready" ? "Verify & resolve" : "Record outcome"}
            </button>
          )}

          {NEXT[col] && (
            <button
              onClick={() => update.mutate({ id: r.id, body: { status: NEXT[col] } })}
              className="w-full rounded-lg px-3 py-1 text-xs font-semibold text-ink-faint hover:text-ink"
            >
              Move to {REC_STATUS_LABEL[NEXT[col]!]} →
            </button>
          )}
        </div>
      )}

      {col === "resolved" && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            onClick={() => reopen.mutate({ id: r.id })}
            disabled={reopen.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        </div>
      )}
    </div>
  );
}
