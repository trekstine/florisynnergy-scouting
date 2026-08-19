"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Leaf,
  MapPin,
  ShieldCheck,
  SprayCan,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  DateRange,
  describeRange,
  isoDaysAgo,
  today,
  type DateRangeValue,
  type RangePreset,
} from "@/components/DateRange";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDate, severityHex } from "@/lib/format";
import {
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePests,
  useRounds,
  useVarieties,
} from "@/lib/hooks";
import { downloadRoundsCsv } from "@/lib/roundExport";
import type { RoundSummary } from "@/lib/types";

/**
 * Scouting reports — what was walked, when, what was found, and what came of it.
 *
 * A manager arrives with a question shaped like "what did we find yesterday,
 * and where" — so rounds are grouped by the day they were walked, with each
 * day's totals on a header you can collapse. The filters answer the second
 * question they always ask: "show me only the mildew rounds".
 */
export default function ScoutingRoundsPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <RoundsList />
    </Suspense>
  );
}

/**
 * Yesterday is its own preset here and nowhere else, because this is the
 * screen a farm manager opens to ask "what did the scouts find yesterday" —
 * a window ending last night rather than one running up to now.
 */
const RANGES: RangePreset[] = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "All", days: null },
];

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
  const [greenhouse, setGreenhouse] = useState(search.get("greenhouse") ?? "");
  const [pest, setPest] = useState("");
  const [disease, setDisease] = useState("");
  const [variety, setVariety] = useState("");
  const [scout, setScout] = useState("");
  const [minSeverity, setMinSeverity] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => {
    // Deep links may still carry ?range=7 from an older link; honour it.
    const legacy = search.get("range");
    if (legacy === "") return {};
    const days = Number(legacy || 7);
    return Number.isFinite(days) && days > 0
      ? { start: isoDaysAgo(days), end: today() }
      : { start: isoDaysAgo(7), end: today() };
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const houses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const varieties = useVarieties();
  const employees = useEmployees();

  const q = useRounds({
    greenhouse_id: greenhouse ? Number(greenhouse) : undefined,
    pest_id: pest ? Number(pest) : undefined,
    disease_id: disease ? Number(disease) : undefined,
    variety_code: variety || undefined,
    scout_id: scout ? Number(scout) : undefined,
    min_severity: minSeverity ? Number(minSeverity) : undefined,
    limit: 500,
  });

  /**
   * Rounds bucketed by the day they were walked.
   *
   * "Yesterday" is its own bucket rather than only a filter, because the
   * question is usually comparative — yesterday against the day before — and
   * filtering would throw the comparison away.
   */
  const days = useMemo(() => {
    const rows = q.data ?? [];
    // Compared as local calendar days, not as instants: a round walked at
    // 07:00 belongs to that morning's date wherever the server stored it, and
    // comparing timestamps would drop the first three hours of every day in
    // any timezone ahead of UTC.
    const kept = rows.filter((r) => {
      const day = new Date(r.started_at).toLocaleDateString("en-CA");
      if (range.start && day < range.start) return false;
      if (range.end && day > range.end) return false;
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
        hotspots: rounds.reduce((s, r) => s + r.hotspots, 0),
        worst: rounds.reduce((s, r) => Math.max(s, r.max_severity), 0),
        programs: rounds.reduce((s, r) => s + r.programs, 0),
      }));
  }, [q.data, range.start, range.end]);

  /** Exactly the rows on screen, in the order they appear. */
  const visible = useMemo(() => days.flatMap((d) => d.rounds), [days]);

  const activeFilters = useMemo(() => {
    const out: string[] = [];
    const label = (id: string, list: { id: number; name: string }[]) =>
      list.find((x) => x.id === Number(id))?.name;
    if (greenhouse) out.push(`Greenhouse: ${label(greenhouse, houses.data ?? []) ?? greenhouse}`);
    if (pest) out.push(`Pest: ${label(pest, pests.data ?? []) ?? pest}`);
    if (disease) out.push(`Disease: ${label(disease, diseases.data ?? []) ?? disease}`);
    if (variety) {
      const v = (varieties.data ?? []).find((x) => x.code === variety);
      out.push(`Variety: ${v ? `${v.name} (${v.code})` : variety}`);
    }
    if (scout) out.push(`Scout: ${label(scout, employees.data ?? []) ?? scout}`);
    if (minSeverity) out.push(`Severity ${minSeverity}+`);
    out.push(describeRange(range, RANGES));
    return out;
  }, [
    greenhouse, pest, disease, variety, scout, minSeverity, range,
    houses.data, pests.data, diseases.data, varieties.data, employees.data,
  ]);

  const filtered =
    !!greenhouse || !!pest || !!disease || !!variety || !!scout || !!minSeverity;

  function clearFilters() {
    setGreenhouse("");
    setPest("");
    setDisease("");
    setVariety("");
    setScout("");
    setMinSeverity("");
  }

  function toggleDay(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const total = visible.length;
  const allCollapsed = days.length > 0 && days.every((d) => collapsed.has(d.key));

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Scouting reports"
        subtitle="Grouped by the day they were walked, newest first"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => downloadRoundsCsv(visible, activeFilters)}
              disabled={!total}
            >
              <Download className="h-4 w-4" /> Export CSV
              {total > 0 && ` (${total})`}
            </Button>
            <Link
              href="/scouting"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> All records
            </Link>
          </div>
        }
      />

      {/* ── Filters ── */}
      <div className="px-6">
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <Filter label="Greenhouse">
              <Select value={greenhouse} onChange={(e) => setGreenhouse(e.target.value)}>
                <option value="">All greenhouses</option>
                {(houses.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Pest">
              <Select value={pest} onChange={(e) => setPest(e.target.value)}>
                <option value="">Any pest</option>
                {(pests.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Disease">
              <Select value={disease} onChange={(e) => setDisease(e.target.value)}>
                <option value="">Any disease</option>
                {(diseases.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Variety">
              <Select value={variety} onChange={(e) => setVariety(e.target.value)}>
                <option value="">Any variety</option>
                {(varieties.data ?? []).map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Scout">
              <Select value={scout} onChange={(e) => setScout(e.target.value)}>
                <option value="">Any scout</option>
                {(employees.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Severity at least">
              <Select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
                <option value="">Any severity</option>
                <option value="1">1 — anything found</option>
                <option value="3">3 — worth watching</option>
                <option value="4">4 — hotspot</option>
                <option value="5">5 — severe</option>
              </Select>
            </Filter>
          </div>

          {/* Range chips — "what happened yesterday" in one click. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            <DateRange value={range} onChange={setRange} presets={RANGES} />
            {filtered && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-faint hover:bg-surface hover:text-ink"
              >
                <X size={13} /> Clear filters
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              {days.length > 0 && (
                <button
                  onClick={() =>
                    setCollapsed(allCollapsed ? new Set() : new Set(days.map((d) => d.key)))
                  }
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  {allCollapsed ? "Expand all" : "Collapse all"}
                </button>
              )}
              <span className="text-xs text-ink-faint">
                {total} report{total === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        </Card>
      </div>

      {/* ── The rounds ── */}
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
              No scouting rounds match.{" "}
              {filtered ? "Try clearing a filter." : "Try a wider date range."}
            </EmptyState>
          </Card>
        ) : (
          days.map((day) => {
            const isShut = collapsed.has(day.key);
            return (
              <Card key={day.key}>
                {/* The day header answers the question on its own. */}
                <button
                  onClick={() => toggleDay(day.key)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3 text-left transition-colors hover:bg-line/40"
                >
                  {isShut ? (
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" />
                  ) : (
                    <ChevronDown size={15} className="shrink-0 text-ink-faint" />
                  )}
                  <h3 className="text-sm font-bold text-ink">{day.label}</h3>
                  <span className="text-xs text-ink-faint">
                    {day.rounds.length} report{day.rounds.length === 1 ? "" : "s"} ·{" "}
                    {day.blocks} block{day.blocks === 1 ? "" : "s"} walked · {day.beds}{" "}
                    beds walked
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    {day.findings > 0 ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
                        <Bug size={12} className="text-ink-faint" />
                        {day.findings} finding{day.findings === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700">All clean</span>
                    )}
                    {day.hotspots > 0 && (
                      <Badge color="#dc2626">
                        <AlertTriangle size={11} /> {day.hotspots} hotspot
                        {day.hotspots === 1 ? "" : "s"}
                      </Badge>
                    )}
                    {/* A bare coloured number reads as a count of something.
                        It is a severity, and it is the worst one — say both,
                        and say what it is out of. */}
                    {day.worst > 0 && (
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: severityHex(day.worst) }}
                      >
                        Worst severity {day.worst}/5
                      </span>
                    )}
                    {day.programs > 0 && (
                      <Badge color="#0891b2">
                        <SprayCan size={11} /> {day.programs} spray program
                        {day.programs === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </span>
                </button>

                {!isShut && (
                  <ul className="divide-y divide-line">
                    {day.rounds.map((r) => (
                      <li key={r.batch_id}>
                        <Link
                          href={`/scouting/rounds/${encodeURIComponent(r.batch_id)}`}
                          className="block px-5 py-3.5 transition-colors hover:bg-surface"
                        >
                          {/* Line 1 — where, how bad, what came of it. */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">
                              {r.greenhouse ?? "Unknown block"}
                            </span>
                            {r.greenhouse_code && (
                              <span className="text-[11px] text-ink-faint">
                                {r.greenhouse_code}
                              </span>
                            )}
                            {r.max_severity > 0 && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                                style={{ backgroundColor: severityHex(r.max_severity) }}
                              >
                                Worst severity {r.max_severity}/5
                              </span>
                            )}
                            {r.hotspots > 0 && (
                              <Badge color="#dc2626">
                                <AlertTriangle size={11} /> {r.hotspots} hotspot
                                {r.hotspots === 1 ? "" : "s"}
                              </Badge>
                            )}
                            {r.programs > 0 ? (
                              <Badge color="#0891b2">
                                <SprayCan size={11} /> {r.programs} spray program
                                {r.programs === 1 ? "" : "s"}
                              </Badge>
                            ) : r.findings > 0 ? (
                              <Badge color="#d97706">No spray program yet</Badge>
                            ) : null}
                            {r.flagged > 0 && (
                              <Badge color="#b45309">
                                {r.flagged} flagged for review
                              </Badge>
                            )}
                          </div>

                          {/* Line 2 — the counts a manager scans.
                              Every one of these carries its own noun. The
                              icons alone were ambiguous ("1 of 2" of what?)
                              and a tooltip is no use to somebody scanning. */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                            <Stat icon={<MapPin size={11} />} title="Beds walked">
                              {r.beds} bed{r.beds === 1 ? "" : "s"} walked
                              {r.clean_beds > 0 && (
                                <span className="text-ink-faint">
                                  {" "}
                                  · {r.clean_beds} clean
                                </span>
                              )}
                            </Stat>
                            <Stat icon={<Bug size={11} />} title="Records with a finding">
                              {r.findings} of {r.records} record
                              {r.records === 1 ? "" : "s"} found something
                            </Stat>
                            {r.beneficials > 0 && (
                              <Stat icon={<ShieldCheck size={11} />} title="Beneficials counted">
                                {r.beneficials} beneficials counted
                              </Stat>
                            )}
                            {r.photos > 0 && (
                              <Stat icon={<Camera size={11} />} title="Field photos">
                                {r.photos} photo{r.photos === 1 ? "" : "s"}
                              </Stat>
                            )}
                            <Stat icon={<Clock size={11} />} title="Time in the block">
                              Started{" "}
                              {new Date(r.started_at).toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {r.duration_minutes > 0 &&
                                ` · ${r.duration_minutes} min in block`}
                            </Stat>
                            <span className="text-ink-faint">
                              Scouted by {r.scout ?? "unknown scout"}
                            </span>
                          </div>

                          {/* Line 3 — what was actually seen.
                              Three differently-coloured chip families with no
                              captions asked the reader to learn a colour code.
                              "Thrips" next to "PNK" is a pest next to a rose
                              variety, and nothing on the row said so. */}
                          {(r.pests.length > 0 ||
                            r.diseases.length > 0 ||
                            r.varieties.length > 0) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              {r.pests.length > 0 && (
                                <ChipGroup label={r.pests.length === 1 ? "Pest" : "Pests"}>
                                  {r.pests.map((n) => (
                                    <span
                                      key={`p-${n}`}
                                      className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                                    >
                                      {n}
                                    </span>
                                  ))}
                                </ChipGroup>
                              )}
                              {r.diseases.length > 0 && (
                                <ChipGroup
                                  label={r.diseases.length === 1 ? "Disease" : "Diseases"}
                                >
                                  {r.diseases.map((n) => (
                                    <span
                                      key={`d-${n}`}
                                      className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800"
                                    >
                                      {n}
                                    </span>
                                  ))}
                                </ChipGroup>
                              )}
                              {r.varieties.length > 0 && (
                                <ChipGroup
                                  label={
                                    r.varieties.length === 1 ? "Variety" : "Varieties"
                                  }
                                >
                                  {r.varieties.map((v) => (
                                    <span
                                      key={`v-${v}`}
                                      className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-faint"
                                    >
                                      <Leaf size={10} /> {v}
                                    </span>
                                  ))}
                                </ChipGroup>
                              )}
                            </div>
                          )}

                          {r.session_comment && (
                            <p className="mt-1.5 truncate text-xs text-ink-faint">
                              <span className="font-semibold">Scout&apos;s remark: </span>
                              <span className="italic">
                                &ldquo;{r.session_comment}&rdquo;
                              </span>
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

/** A captioned run of chips — the caption is what makes the colour redundant. */
function ChipGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      {children}
    </span>
  );
}

function Stat({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1 tabular-nums" title={title}>
      <span className="text-ink-faint">{icon}</span>
      {children}
    </span>
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
