"use client";

import { Filter } from "lucide-react";

import { Select } from "@/components/ui";
import { SCOUTING_LABEL } from "@/lib/format";
import { useGreenhouses, usePests } from "@/lib/hooks";
import type { Filters, ScoutingFor } from "@/lib/types";

const RANGES: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export function defaultFilters(days = 30): Filters {
  return { start: isoDaysAgo(days), end: new Date().toISOString().slice(0, 10) };
}

export function FilterBar({
  value,
  onChange,
  showGreenhouse = true,
  showPest = true,
  showType = true,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  showGreenhouse?: boolean;
  showPest?: boolean;
  showType?: boolean;
}) {
  const greenhouses = useGreenhouses();
  const pests = usePests();

  const activeDays = RANGES.find((r) => value.start === isoDaysAgo(r.days))?.days ?? 30;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-card">
      <span className="flex items-center gap-1.5 pl-1 pr-2 text-xs font-semibold text-ink-faint">
        <Filter size={14} /> Filters
      </span>

      <div className="flex overflow-hidden rounded-lg border border-line">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() =>
              onChange({ ...value, start: isoDaysAgo(r.days), end: new Date().toISOString().slice(0, 10) })
            }
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeDays === r.days ? "bg-brand-600 text-white" : "bg-white text-ink-soft hover:bg-surface"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {showGreenhouse && (
        <Select
          className="!w-auto !py-1.5 text-xs"
          value={value.greenhouse_id ?? ""}
          onChange={(e) => onChange({ ...value, greenhouse_id: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">All greenhouses</option>
          {(greenhouses.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      )}

      {showPest && (
        <Select
          className="!w-auto !py-1.5 text-xs"
          value={value.pest_id ?? ""}
          onChange={(e) => onChange({ ...value, pest_id: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">All pests</option>
          {(pests.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      )}

      {showType && (
        <Select
          className="!w-auto !py-1.5 text-xs"
          value={value.scouting_for ?? ""}
          onChange={(e) => onChange({ ...value, scouting_for: (e.target.value || undefined) as ScoutingFor | undefined })}
        >
          <option value="">All types</option>
          {(["disease", "pest", "lure", "sticky_trap"] as ScoutingFor[]).map((k) => (
            <option key={k} value={k}>{SCOUTING_LABEL[k]}</option>
          ))}
        </Select>
      )}

      {(value.greenhouse_id || value.pest_id || value.scouting_for) && (
        <button
          onClick={() => onChange({ start: value.start, end: value.end })}
          className="text-xs font-semibold text-brand-700 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
