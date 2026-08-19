"use client";

import { CalendarRange, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * One date-range control for the whole portal.
 *
 * There were three idioms before this: the filter bar's day-count pills, the
 * reports list's own range ids, and nothing at all on fertigation. Adding a
 * custom range to each separately would have made four. This owns the
 * question — presets *and* an arbitrary range — and every screen asks it the
 * same way, so "Last 30 days" cannot come to mean two different windows
 * depending on which page you are standing on.
 *
 * The value is a pair of inclusive `YYYY-MM-DD` strings, which is what the API
 * takes. `undefined` on either end means unbounded.
 */

export interface DateRangeValue {
  start?: string;
  end?: string;
}

export interface RangePreset {
  label: string;
  /** Days back, inclusive of today. `null` means no bound at all. */
  days: number | null;
}

/** Local midnight N-1 days back, as `YYYY-MM-DD`. `days: 1` is today. */
export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return isoDay(d);
}

/**
 * A local calendar date, not a UTC one.
 *
 * `toISOString()` converts to UTC first, so east of Greenwich — Kenya is UTC+3
 * — every window computed between local midnight and 03:00 came out a day
 * early. "Today" meant yesterday, and every other preset was shifted with it.
 * A narrow window, but it is the window a night-shift check or an early
 * handover falls in, and a filter that quietly answers the wrong question is
 * worse than one that fails.
 */
export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function today(): string {
  return isoDay(new Date());
}

export const DEFAULT_PRESETS: RangePreset[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export const PRESETS_WITH_TODAY: RangePreset[] = [
  { label: "Today", days: 1 },
  ...DEFAULT_PRESETS,
];

/** Which preset, if any, the current value corresponds to. */
export function activePreset(
  value: DateRangeValue,
  presets: RangePreset[],
): RangePreset | null {
  const now = today();
  return (
    presets.find((p) =>
      p.days == null
        ? !value.start && !value.end
        : value.start === isoDaysAgo(p.days) && (!value.end || value.end === now),
    ) ?? null
  );
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/** How the chosen window reads in a sentence — used by export filenames too. */
export function describeRange(
  value: DateRangeValue,
  presets: RangePreset[] = DEFAULT_PRESETS,
): string {
  const preset = activePreset(value, presets);
  if (preset) return preset.label;
  if (value.start && value.end) return `${pretty(value.start)} – ${pretty(value.end)}`;
  if (value.start) return `From ${pretty(value.start)}`;
  if (value.end) return `Up to ${pretty(value.end)}`;
  return "All time";
}

export function DateRange({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className = "",
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  presets?: RangePreset[];
  className?: string;
}) {
  const preset = activePreset(value, presets);
  const isCustom = !preset && (!!value.start || !!value.end);

  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.start ?? "");
  const [draftEnd, setDraftEnd] = useState(value.end ?? today());
  const box = useRef<HTMLDivElement>(null);

  // Re-seed the draft whenever the popover opens, so it starts from whatever
  // is actually in force rather than from a stale earlier edit.
  useEffect(() => {
    if (!open) return;
    setDraftStart(value.start ?? "");
    setDraftEnd(value.end ?? today());
  }, [open, value.start, value.end]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Backwards is the one input mistake worth blocking: it silently returns
  // nothing, which reads as "no data" rather than "impossible range".
  const backwards = !!draftStart && !!draftEnd && draftStart > draftEnd;

  function apply() {
    if (backwards) return;
    onChange({
      ...value,
      start: draftStart || undefined,
      end: draftEnd || undefined,
    });
    setOpen(false);
  }

  return (
    <div className={`relative flex items-center ${className}`} ref={box}>
      <div className="flex overflow-hidden rounded-lg border border-line">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() =>
              onChange({
                ...value,
                start: p.days == null ? undefined : isoDaysAgo(p.days),
                end: p.days == null ? undefined : today(),
              })
            }
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              preset?.label === p.label
                ? "bg-brand-600 text-white"
                : "bg-white text-ink-soft hover:bg-surface"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Pick an exact range"
          className={`flex items-center gap-1.5 border-l border-line px-3 py-1.5 text-xs font-semibold transition-colors ${
            isCustom ? "bg-brand-600 text-white" : "bg-white text-ink-soft hover:bg-surface"
          }`}
        >
          <CalendarRange size={13} />
          {/* When a custom range is in force the button *is* the label — a
              chip reading "Custom" would hide the dates the reader chose. */}
          {isCustom ? describeRange(value, presets) : "Custom"}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-[1100] mt-1.5 w-72 rounded-xl border border-line bg-white p-3 shadow-2xl">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                From
              </span>
              <input
                type="date"
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(e) => setDraftStart(e.target.value)}
                className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                To
              </span>
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            {backwards ? (
              <span className="font-semibold text-red-700">
                The start is after the end — that range holds no days.
              </span>
            ) : (
              "Both days are included."
            )}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftStart("");
                setDraftEnd("");
              }}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-faint hover:bg-surface hover:text-ink"
            >
              <X size={12} className="mr-1 inline" />
              Clear both
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={backwards}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={13} /> Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
