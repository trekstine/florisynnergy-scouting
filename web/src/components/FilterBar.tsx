"use client";

import { Filter, X } from "lucide-react";

import {
  DateRange,
  PRESETS_WITH_TODAY,
  isoDaysAgo,
  today,
  type RangePreset,
} from "@/components/DateRange";
import { Select } from "@/components/ui";
import { SCOUTING_LABEL } from "@/lib/format";
import {
  useDiseases,
  useEmployees,
  useGreenhouses,
  usePests,
  useVarieties,
} from "@/lib/hooks";
import type { Filters, ScoutingFor } from "@/lib/types";

/**
 * Presets for the screens a manager opens to ask "what happened today".
 *
 * `days: 1` really does mean today only — `isoDaysAgo` subtracts `days - 1`,
 * so the window starts this morning rather than yesterday's.
 */
export const RANGES_WITH_TODAY = PRESETS_WITH_TODAY;

export { isoDaysAgo };

export function defaultFilters(days = 30): Filters {
  return { start: isoDaysAgo(days), end: today() };
}

export function FilterBar({
  value,
  onChange,
  showGreenhouse = true,
  showPest = true,
  showDisease = true,
  showVariety = true,
  showScout = false,
  showType = true,
  ranges,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  showGreenhouse?: boolean;
  showPest?: boolean;
  showDisease?: boolean;
  showVariety?: boolean;
  /** Off by default — only record-level views filter by who captured. */
  showScout?: boolean;
  showType?: boolean;
  /** Override the date presets, e.g. to offer "Today" on the records list. */
  ranges?: RangePreset[];
}) {
  const greenhouses = useGreenhouses();
  const pests = usePests();
  const diseases = useDiseases();
  const varieties = useVarieties();
  const employees = useEmployees();

  const scouts = (employees.data ?? []).filter((e) => e.role === "scout");

  const hasActive =
    value.greenhouse_id != null ||
    value.pest_id != null ||
    value.disease_id != null ||
    value.variety_code != null ||
    value.scout_id != null ||
    !!value.scouting_for;

  const sel = "!w-auto !py-1.5 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-card">
      <span className="flex items-center gap-1.5 pl-1 pr-2 text-xs font-semibold text-ink-faint">
        <Filter size={14} /> Filters
      </span>

      <DateRange
        value={value}
        onChange={(range) => onChange({ ...value, ...range })}
        presets={ranges}
      />

      {showGreenhouse && (
        <Select
          className={sel}
          title="Greenhouse"
          value={value.greenhouse_id ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              greenhouse_id: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        >
          <option value="">All greenhouses</option>
          {(greenhouses.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      )}

      {showPest && (
        <Select
          className={sel}
          title="Pest"
          value={value.pest_id ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              pest_id: e.target.value ? Number(e.target.value) : undefined,
              // Pest and disease are mutually exclusive on a record.
              disease_id: e.target.value ? undefined : value.disease_id,
            })
          }
        >
          <option value="">All pests</option>
          {(pests.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}

      {showDisease && (
        <Select
          className={sel}
          title="Disease"
          value={value.disease_id ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              disease_id: e.target.value ? Number(e.target.value) : undefined,
              pest_id: e.target.value ? undefined : value.pest_id,
            })
          }
        >
          <option value="">All diseases</option>
          {(diseases.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}

      {showVariety && (
        <Select
          className={sel}
          title="Variety"
          value={value.variety_code ?? ""}
          onChange={(e) =>
            onChange({ ...value, variety_code: e.target.value || undefined })
          }
        >
          <option value="">All varieties</option>
          {(varieties.data ?? []).map((v) => (
            <option key={v.id} value={v.code}>
              {v.name}
            </option>
          ))}
        </Select>
      )}

      {showScout && (
        <Select
          className={sel}
          title="Scout"
          value={value.scout_id ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              scout_id: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        >
          <option value="">All scouts</option>
          {scouts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}

      {showType && (
        <Select
          className={sel}
          title="Scouting type"
          value={value.scouting_for ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              scouting_for: (e.target.value || undefined) as
                | ScoutingFor
                | undefined,
            })
          }
        >
          <option value="">All types</option>
          {(["disease", "pest", "lure", "sticky_trap"] as ScoutingFor[]).map((k) => (
            <option key={k} value={k}>
              {SCOUTING_LABEL[k]}
            </option>
          ))}
        </Select>
      )}

      {hasActive && (
        <button
          onClick={() => onChange({ start: value.start, end: value.end })}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}
