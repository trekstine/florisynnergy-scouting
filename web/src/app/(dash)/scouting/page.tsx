"use client";

import {
  AlertTriangle,
  Bug,
  Camera,
  Check,
  ClipboardList,
  Download,
  Leaf,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  FilterBar,
  RANGES_WITH_TODAY,
  defaultFilters,
  isoDaysAgo,
} from "@/components/FilterBar";
import { PaginationBar, usePagination } from "@/components/Pagination";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import {
  REC_STATUS_HEX,
  REC_STATUS_LABEL,
  SCOUTING_LABEL,
  VERIFICATION_LABEL,
  bedLabel,
  formatDateTime,
  isVerified,
  relativeTime,
  severityHex,
} from "@/lib/format";
import {
  useCreateRecommendation,
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePests,
  useRecommendations,
  useScouting,
  useScoutSummary,
  useVarieties,
} from "@/lib/hooks";
import type { Filters, Recommendation, ScoutingRecord } from "@/lib/types";

/** Shared with the dashboard, so "Today" means the same thing on both. */
const RANGES = RANGES_WITH_TODAY;

const RANGE_NOUN: Record<number, string> = {
  1: "today",
  7: "in the last 7 days",
  30: "in the last 30 days",
  90: "in the last 90 days",
};

/** A scouting record joined with resolved names, flags, and its recommendation. */
interface Row {
  r: ScoutingRecord;
  isDisease: boolean;
  target: string;
  threshold: number | null;
  overEtl: boolean;
  rec: Recommendation | undefined;
  unverified: boolean;
  photoMissing: boolean;
  ghLabel: string;
  scoutLabel: string;
  varietyLabel: string;
  pestCount: number;
}

export default function ScoutingPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters(7));
  const [sort, setSort] = useState<"pressure" | "recent">("pressure");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const start = filters.start ?? "";
  const end = filters.end ?? "";
  const activeDays =
    RANGES.find((r) => filters.start === isoDaysAgo(r.days))?.days ?? 0;
  const rangeNoun = RANGE_NOUN[activeDays] ?? "in range";

  const greenhouses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const varieties = useVarieties();
  const employees = useEmployees();
  const recs = useRecommendations();
  const createRec = useCreateRecommendation();

  const scouting = useScouting({
    greenhouse_id: filters.greenhouse_id,
    scouting_for: filters.scouting_for || undefined,
    scout_id: filters.scout_id,
    pest_id: filters.pest_id,
    disease_id: filters.disease_id,
    variety_code: filters.variety_code,
    start,
    end,
    limit: 1000,
  });
  const scoutSummary = useScoutSummary(filters);

  // ── Lookups ──
  const ghName = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of greenhouses.data ?? []) m.set(g.id, g.code ?? g.name);
    return m;
  }, [greenhouses.data]);
  const pestById = useMemo(() => {
    const m = new Map<number, { name: string; threshold: number }>();
    for (const p of pests.data ?? []) m.set(p.id, p);
    return m;
  }, [pests.data]);
  const diseaseById = useMemo(() => {
    const m = new Map<number, { name: string; threshold: number }>();
    for (const d of diseases.data ?? []) m.set(d.id, d);
    return m;
  }, [diseases.data]);
  const varietyByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of varieties.data ?? []) m.set(v.code, v.name);
    return m;
  }, [varieties.data]);
  const scoutName = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employees.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employees.data]);
  // Recommendation index: greenhouse + agent → rec (open/planned preferred).
  const { openRecByKey, anyRecByKey } = useMemo(() => {
    const open = new Map<string, Recommendation>();
    const any = new Map<string, Recommendation>();
    const keyOf = (rc: Recommendation) =>
      rc.greenhouse_id == null
        ? null
        : rc.disease_id != null
          ? `${rc.greenhouse_id}:d${rc.disease_id}`
          : rc.pest_id != null
            ? `${rc.greenhouse_id}:p${rc.pest_id}`
            : null;
    for (const rc of recs.data ?? []) {
      const k = keyOf(rc);
      if (!k) continue;
      if (!any.has(k)) any.set(k, rc);
      if ((rc.status === "open" || rc.status === "planned") && !open.has(k))
        open.set(k, rc);
    }
    return { openRecByKey: open, anyRecByKey: any };
  }, [recs.data]);

  const rows: Row[] = useMemo(() => {
    const keyOf = (r: ScoutingRecord) =>
      r.greenhouse_id == null
        ? null
        : r.disease_id != null
          ? `${r.greenhouse_id}:d${r.disease_id}`
          : r.pest_id != null
            ? `${r.greenhouse_id}:p${r.pest_id}`
            : null;
    return (scouting.data ?? []).map((r) => {
      const isDisease = r.scouting_for === "disease";
      const pest = r.pest_id ? pestById.get(r.pest_id) : undefined;
      const disease = r.disease_id ? diseaseById.get(r.disease_id) : undefined;
      const target = isDisease
        ? (disease?.name ?? "Disease")
        : (pest?.name ?? (r.pest_id ? `#${r.pest_id}` : "—"));
      const threshold = isDisease
        ? (disease?.threshold ?? null)
        : (pest?.threshold ?? null);
      const overEtl =
        threshold != null &&
        r.severity >= threshold &&
        r.severity > 0 &&
        (r.pest_id != null || r.disease_id != null);
      const key = keyOf(r);
      const rec = key
        ? (openRecByKey.get(key) ?? anyRecByKey.get(key))
        : undefined;
      return {
        r,
        isDisease,
        target,
        threshold,
        overEtl,
        rec,
        unverified: !isVerified(r.verification_method),
        photoMissing: !r.image_url,
        ghLabel: r.greenhouse_id
          ? (ghName.get(r.greenhouse_id) ?? `#${r.greenhouse_id}`)
          : "—",
        scoutLabel: r.scout_id
          ? (scoutName.get(r.scout_id) ?? `#${r.scout_id}`)
          : "—",
        varietyLabel: r.variety_code
          ? (varietyByCode.get(r.variety_code) ?? r.variety_code)
          : "—",
        pestCount: r.fcm_count + r.sticky_trap_bug_count + r.lure_bug_count,
      };
    });
  }, [
    scouting.data,
    pestById,
    diseaseById,
    ghName,
    scoutName,
    varietyByCode,
    openRecByKey,
    anyRecByKey,
  ]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "recent") {
      copy.sort((a, b) => b.r.recorded_at.localeCompare(a.r.recorded_at));
    } else {
      copy.sort(
        (a, b) =>
          Number(b.overEtl) - Number(a.overEtl) ||
          b.r.severity - a.r.severity ||
          b.r.recorded_at.localeCompare(a.r.recorded_at),
      );
    }
    return copy;
  }, [rows, sort]);

  // ── Summary metrics ──
  const summary = useMemo(() => {
    const n = rows.length;
    const overEtl = rows.filter((x) => x.overEtl).length;
    const unverified = rows.filter((x) => x.unverified).length;
    const avg = n ? rows.reduce((s, x) => s + x.r.severity, 0) / n : 0;
    return { n, overEtl, unverified, avg };
  }, [rows]);

  // ── Coverage (greenhouses scouted in the selected window) ──
  const coverage = useMemo(() => {
    const scouted = new Set<number>();
    for (const x of rows)
      if (x.r.greenhouse_id != null) scouted.add(x.r.greenhouse_id);
    const all = [...(greenhouses.data ?? [])].sort((a, b) => a.id - b.id);
    return { all, scouted, overdue: all.length - scouted.size };
  }, [rows, greenhouses.data]);

  const selected = useMemo(
    () => sorted.find((x) => x.r.id === selectedId) ?? null,
    [sorted, selectedId],
  );

  // Reset to page 1 whenever the result set changes underneath — otherwise a
  // narrowing filter can leave you stranded on an empty page.
  const paged = usePagination(sorted, 25, `${JSON.stringify(filters)}|${sort}`);

  function exportCsv() {
    const head = [
      "recorded_at",
      "greenhouse",
      "bed",
      "type",
      "target",
      "variety",
      "severity",
      "etl",
      "over_etl",
      "verification",
      "scout",
      "stage",
      "location_on_plant",
      "beneficials",
      "sticky_trap_count",
      "lure_count",
      "fcm_count",
      "has_photo",
      "flagged",
      "flag_reason",
      "notes",
      "session_comment",
      "batch_id",
    ];
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      // Excel runs a cell starting =, +, - or @ as a formula, and a scout's
      // note is free text.
      const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = sorted.map((x) =>
      [
        x.r.recorded_at,
        x.ghLabel,
        x.r.bed_code ?? "",
        SCOUTING_LABEL[x.r.scouting_for],
        x.target,
        x.varietyLabel,
        x.r.severity,
        x.threshold ?? "",
        x.overEtl ? "yes" : "no",
        VERIFICATION_LABEL[x.r.verification_method],
        x.scoutLabel,
        x.r.stage ?? "",
        x.r.location_on_plant ?? "",
        x.r.beneficials_count,
        x.r.sticky_trap_bug_count,
        x.r.lure_bug_count,
        x.r.fcm_count,
        x.r.image_url ? "yes" : "no",
        x.r.flagged ? "yes" : "no",
        x.r.flag_reason ?? "",
        x.r.notes ?? "",
        x.r.session_comment ?? "",
        x.r.batch_id ?? "",
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scouting_${start}_to_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loading = scouting.isLoading;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Scouting"
        subtitle="Field observations, coverage, and threshold triage"
        actions={
          <div className="flex items-center gap-2">
            {/* A farm thinks in reports (rounds), not individual records —
                this is the way into that view. */}
            <Link
              href="/scouting/rounds"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ClipboardList className="h-4 w-4" /> Scouting reports
            </Link>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters — the same shared bar the rest of the portal uses, plus a
          scout selector and a "Today" preset that only make sense here. */}
      <div className="flex flex-wrap items-center gap-2 px-6">
        <FilterBar
          value={filters}
          onChange={setFilters}
          showScout
          ranges={RANGES}
        />
        {scouting.isFetching && <Spinner label="" />}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 px-6 md:grid-cols-4">
        <Metric
          label={`Records ${rangeNoun}`.trim()}
          value={summary.n}
          hint="One record = one bed, one agent"
        />
        <Metric
          label="Over ETL"
          value={summary.overEtl}
          tone={summary.overEtl ? "#dc2626" : undefined}
          hint="Past the economic threshold — action warranted"
        />
        <Metric
          label="Unverified"
          value={summary.unverified}
          tone={summary.unverified ? "#f59e0b" : undefined}
          hint="No GPS or QR proof the scout was at the bed"
        />
        <Metric
          label="Avg severity"
          value={summary.avg.toFixed(1)}
          hint="Across all records, on the 0–5 scale"
        />
      </div>

      {/* Coverage strip */}
      <div className="px-6">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-ink">
              Coverage {rangeNoun}
            </span>
            <span className="text-sm text-ink-faint">
              {coverage.scouted.size} of {coverage.all.length} greenhouses
              scouted
            </span>
            {coverage.overdue > 0 && (
              <span className="ml-auto text-sm font-semibold text-red-600">
                {coverage.overdue} not scouted
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {coverage.all.map((g) => {
              const on = coverage.scouted.has(g.id);
              return (
                <span
                  key={g.id}
                  title={`${g.name} — ${on ? "scouted" : "not scouted"} ${rangeNoun}`}
                  className="flex h-6 min-w-[34px] items-center justify-center rounded px-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: on ? "#10b98122" : "#dc262618",
                    color: on ? "#047857" : "#b91c1c",
                  }}
                >
                  {/* Stripping the letters out of the name leaves nothing at
                      all for a block named without a number, which is how an
                      unlabelled chip appeared in the row. Fall back to the
                      name rather than to empty. */}
                  {g.code || g.name.replace(/\D/g, "") || g.name}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#10b98122]" />
              scouted {rangeNoun}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#dc262618]" />
              not scouted {rangeNoun}
            </span>
          </div>
          {scoutSummary.data && scoutSummary.data.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              {scoutSummary.data.map((s) => (
                <div
                  key={s.scout_id}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5"
                >
                  <div className="text-sm font-semibold text-ink">{s.name}</div>
                  <div className="text-xs text-ink-faint">
                    {s.records} records · {s.greenhouses_visited} greenhouse
                    {s.greenhouses_visited === 1 ? "" : "s"} · last scouted{" "}
                    {relativeTime(s.last_seen)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Observations */}
      <div className="px-6">
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <span className="text-sm font-semibold text-ink">Observations</span>
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {(["pressure", "recent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors " +
                    (sort === s
                      ? "bg-brand-600 text-white"
                      : "text-ink-soft hover:bg-surface")
                  }
                >
                  {s === "pressure" ? "By pressure" : "Most recent"}
                </button>
              ))}
            </div>
            <span className="ml-auto text-sm text-ink-faint">
              {sorted.length} records
            </span>
          </div>

          {loading ? (
            <div className="px-5 py-8">
              <Spinner />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-5">
              <EmptyState>
                No scouting matches these filters. Widen the date range or clear
                a filter.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {paged.paged.map((x) => (
                <li key={x.r.id}>
                  <button
                    onClick={() => setSelectedId(x.r.id)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface"
                  >
                    {/* The number on its own read as a count. It is a
                        severity, on a 0–5 scale, and the tile now says so. */}
                    <span
                      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none"
                      style={{
                        backgroundColor: `${severityHex(x.r.severity)}33`,
                        color: "#0f172a",
                      }}
                    >
                      <span className="text-[8px] font-semibold uppercase tracking-wider opacity-60">
                        sev
                      </span>
                      <span className="mt-0.5 text-sm font-bold">
                        {x.r.severity}
                        <span className="text-[9px] font-semibold opacity-60">/5</span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
                        {x.ghLabel}
                        {x.r.bed_code && ` · ${bedLabel(x.r.bed_code)}`} · {x.target}
                      </span>
                      {/* Every value on this line was a bare word between
                          dots — "Pink Floyd" is a rose, "Adult" a life stage,
                          and nothing said which was which. Each carries its
                          own field name now. */}
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">
                        <Named label="Scouted for">
                          {SCOUTING_LABEL[x.r.scouting_for]}
                        </Named>
                        {" · "}
                        <Named label="Variety">{x.varietyLabel}</Named>
                        {" · "}
                        <Named label="Scout">{x.scoutLabel}</Named>
                        {" · "}
                        <Named label="Stage">{x.r.stage ?? "not recorded"}</Named>
                        {" · "}
                        <Named label="Recorded">
                          {formatDateTime(x.r.recorded_at)}
                        </Named>
                      </span>

                      {/* What the scout actually recorded, beyond the severity
                          number — where on the plant, what they caught, what
                          they wrote down. A record is an observation, and the
                          observation is mostly in these fields. */}
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {x.r.location_on_plant && (
                          <Chip icon={<Leaf size={10} />} label="on plant">
                            {x.r.location_on_plant}
                          </Chip>
                        )}
                        {x.r.beneficials_count > 0 && (
                          <Chip icon={<ShieldCheck size={10} />} tone="#047857">
                            {x.r.beneficials_count} beneficial
                            {x.r.beneficials_count === 1 ? "" : "s"} counted
                          </Chip>
                        )}
                        {x.r.sticky_trap_bug_count > 0 && (
                          <Chip icon={<Bug size={10} />}>
                            {x.r.sticky_trap_bug_count} caught on sticky trap
                          </Chip>
                        )}
                        {x.r.lure_bug_count > 0 && (
                          <Chip icon={<Bug size={10} />}>
                            {x.r.lure_bug_count} caught in lure
                          </Chip>
                        )}
                        {x.r.fcm_count > 0 && (
                          <Chip icon={<Bug size={10} />}>
                            {x.r.fcm_count} false codling moth
                          </Chip>
                        )}
                        {x.r.image_url && (
                          <Chip icon={<Camera size={10} />} tone="#0369a1">
                            field photo
                          </Chip>
                        )}
                      </span>

                      {x.r.notes && (
                        <span className="mt-1 flex items-start gap-1.5 text-xs text-ink-soft">
                          <StickyNote
                            size={11}
                            className="mt-0.5 shrink-0 text-ink-faint"
                          />
                          <span className="line-clamp-2">{x.r.notes}</span>
                        </span>
                      )}
                      {x.r.session_comment && !x.r.notes && (
                        <span className="mt-1 block truncate text-xs italic text-ink-faint">
                          &ldquo;{x.r.session_comment}&rdquo;
                        </span>
                      )}
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      {x.overEtl && <Badge color="#dc2626">Over ETL</Badge>}
                      {x.r.flagged && <Badge color="#dc2626">Anomaly</Badge>}
                      {x.unverified && (
                        <Badge color="#f59e0b">Unverified</Badge>
                      )}
                      {x.rec && !x.overEtl && (
                        <Badge color={REC_STATUS_HEX[x.rec.status]}>
                          {REC_STATUS_LABEL[x.rec.status]}
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && sorted.length > 0 && (
            <PaginationBar
              page={paged.page}
              totalPages={paged.totalPages}
              pageSize={paged.pageSize}
              total={paged.total}
              onPage={paged.setPage}
              onPageSize={paged.setPageSize}
            />
          )}
        </Card>
      </div>

      {selected && (
        <RecordDetail
          row={selected}
          onClose={() => setSelectedId(null)}
          onCreateRec={() =>
            createRec.mutate({
              greenhouse_id: selected.r.greenhouse_id!,
              bed_code: selected.r.bed_code,
              pest_id: selected.r.pest_id,
              disease_id: selected.r.disease_id,
              trigger_severity: selected.r.severity,
            })
          }
          creating={createRec.isPending}
        />
      )}
    </div>
  );
}

/** A small fact off the record — worth showing, not worth a column. */
/** A value with its field name, so a bare word is never left to be guessed. */
function Named({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <span className="opacity-70">{label} </span>
      {children}
    </span>
  );
}

function Chip({
  icon,
  tone,
  label,
  children,
}: {
  icon: React.ReactNode;
  tone?: string;
  /** For chips whose value alone is ambiguous — "Middle" of what? */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: tone ?? "#64748b" }}
    >
      {icon}
      {label && <span className="opacity-70">{label}</span>}
      {children}
    </span>
  );
}

/**
 * A headline number with its name — and, where the name is jargon, what it
 * means. "Over ETL" is a term of art; a manager reading the portal for the
 * first time should not have to ask.
 */
function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs font-semibold text-ink-faint">{label}</div>
      <div
        className="mt-1 text-2xl font-bold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</div>}
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-sm font-medium text-ink">{children}</div>
    </div>
  );
}

function RecordDetail({
  row,
  onClose,
  onCreateRec,
  creating,
}: {
  row: Row;
  onClose: () => void;
  onCreateRec: () => void;
  creating: boolean;
}) {
  const { r } = row;
  const ratio =
    row.pestCount > 0
      ? r.beneficials_count > 0
        ? `${row.pestCount}:${r.beneficials_count}`
        : "no beneficials"
      : null;
  const ratioTone =
    row.pestCount === 0
      ? undefined
      : r.beneficials_count === 0
        ? "#dc2626"
        : row.pestCount / r.beneficials_count >= 5
          ? "#f59e0b"
          : "#10b981";

  return (
    <div
      className="fixed inset-0 z-[1200] flex justify-end bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scouting record detail"
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="text-base font-bold text-ink">
              {row.ghLabel} · {r.bed_code ?? "—"}
            </div>
            <div className="text-sm text-ink-faint">
              {SCOUTING_LABEL[r.scouting_for]} · {row.target}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Severity + flags */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold"
              style={{
                backgroundColor: `${severityHex(r.severity)}33`,
                color: "#0f172a",
              }}
            >
              Severity {r.severity}
              {row.threshold != null && (
                <span className="font-medium text-ink-faint">
                  / ETL {row.threshold}
                </span>
              )}
            </span>
            {row.overEtl && <Badge color="#dc2626">Over ETL</Badge>}
            {row.r.flagged && <Badge color="#dc2626">Anomaly</Badge>}
            {row.unverified ? (
              <Badge color="#f59e0b">
                <ShieldAlert className="h-3 w-3" /> Unverified
              </Badge>
            ) : (
              <Badge color="#10b981">
                <ShieldCheck className="h-3 w-3" />{" "}
                {VERIFICATION_LABEL[r.verification_method]}
              </Badge>
            )}
          </div>

          {row.r.flagged && row.r.flag_reason && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{row.r.flag_reason}</span>
            </div>
          )}

          {/* Photo */}
          {r.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.image_url}
              alt="Field capture"
              className="w-full rounded-lg border border-line object-cover"
            />
          ) : (
            <div className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface text-ink-faint">
              <Camera className="h-6 w-6" />
              <span className="text-xs">No field photo</span>
            </div>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <DetailField label="Variety">{row.varietyLabel}</DetailField>
            <DetailField label="Scout">{row.scoutLabel}</DetailField>
            <DetailField label="Stage">{r.stage ?? "—"}</DetailField>
            <DetailField label="On plant">
              {r.location_on_plant ?? "—"}
            </DetailField>
            <DetailField label="Recorded">
              {formatDateTime(r.recorded_at)}
            </DetailField>
            <DetailField label="Verification">
              {VERIFICATION_LABEL[r.verification_method]}
            </DetailField>
            <DetailField label="Variety code">
              {r.variety_code ?? "—"}
            </DetailField>
            <DetailField label="Counts">
              {r.fcm_count +
                r.sticky_trap_bug_count +
                r.lure_bug_count +
                r.beneficials_count}
            </DetailField>
          </div>

          {/* Counts */}
          <div className="rounded-lg border border-line">
            <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Bug className="mr-1 inline h-3.5 w-3.5" /> Counts
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm">
              <Count label="FCM" value={r.fcm_count} />
              <Count label="Sticky trap" value={r.sticky_trap_bug_count} />
              <Count label="Lure" value={r.lure_bug_count} />
              <Count label="Beneficials" value={r.beneficials_count} />
            </div>
            {ratio && (
              <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-sm">
                <span className="text-ink-faint">Pest : beneficial</span>
                <Badge color={ratioTone}>{ratio}</Badge>
              </div>
            )}
          </div>

          {/* Notes */}
          {r.notes && (
            <div>
              <div className="text-xs text-ink-faint">Notes</div>
              <p className="mt-0.5 text-sm text-ink-soft">{r.notes}</p>
            </div>
          )}

          {/* GPS */}
          <DetailField label="GPS">
            {r.gps_lat != null && r.gps_lng != null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <MapPin className="h-3.5 w-3.5 text-ink-faint" />
                {r.gps_lat.toFixed(5)}, {r.gps_lng.toFixed(5)}
              </span>
            ) : (
              "—"
            )}
          </DetailField>

          {/* Recommendation loop */}
          <div className="border-t border-line pt-4">
            {row.rec ? (
              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">
                    Recommendation #{row.rec.id}
                  </span>
                  <Badge color={REC_STATUS_HEX[row.rec.status]}>
                    {REC_STATUS_LABEL[row.rec.status]}
                  </Badge>
                </div>
                {row.rec.note && (
                  <p className="mt-1 text-sm text-ink-soft">{row.rec.note}</p>
                )}
                <Link
                  href="/recommendations"
                  className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline"
                >
                  Open on Action board →
                </Link>
              </div>
            ) : row.overEtl ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">
                  Over ETL with no open recommendation.
                </p>
                <Button
                  className="mt-2"
                  onClick={onCreateRec}
                  disabled={creating}
                >
                  {creating ? (
                    "Creating…"
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Create recommendation
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                {row.threshold != null
                  ? "Below ETL — no intervention needed."
                  : "No threshold agent on this record."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
