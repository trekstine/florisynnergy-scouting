"use client";

import { ArrowRight, CalendarDays, Clock, MapPin, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardHeader, EmptyState, Spinner } from "@/components/ui";
import { severityHex } from "@/lib/format";
import { useScoutMovement } from "@/lib/hooks";
import type { Filters, MovementDay, MovementStop } from "@/lib/types";

/** Stable colour per block so the same greenhouse reads the same all day. */
const BLOCK_COLORS: readonly string[] = [
  "#059669",
  "#0891b2",
  "#7c3aed",
  "#f59e0b",
  "#dc2626",
  "#0ea5e9",
];

function blockHex(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return BLOCK_COLORS[Math.abs(h) % BLOCK_COLORS.length] ?? BLOCK_COLORS[0]!;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function duration(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${Math.round(mins - h * 60)}m`;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export function ScoutMovementPanel({
  scoutId,
  filters,
}: {
  scoutId: number | null;
  filters: Filters;
}) {
  const q = useScoutMovement(scoutId, filters);

  if (scoutId == null) {
    return (
      <Card>
        <CardHeader title="Movement timeline" subtitle="Select a scout to trace their walk" />
        <EmptyState>
          <MapPin className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
          Pick a scout from the table to see which beds they visited, in what order, and how long
          they spent on each.
        </EmptyState>
      </Card>
    );
  }

  if (q.isLoading) {
    return (
      <Card>
        <div className="p-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const m = q.data;
  if (!m || m.days.length === 0) {
    return (
      <Card>
        <CardHeader title="Movement timeline" />
        <EmptyState>No records for this scout in the selected range.</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={`${m.name} — movement`}
        subtitle="Consecutive records at one bed collapse into a single stop"
      />

      <div className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-4">
        <Stat label="Records" value={String(m.total_records)} />
        <Stat label="Beds visited" value={String(m.total_beds)} icon={<MapPin className="h-3 w-3" />} />
        <Stat label="Active time" value={duration(m.active_minutes)} icon={<Clock className="h-3 w-3" />} />
        <Stat
          label="Median / bed"
          value={m.median_minutes_per_bed != null ? `${m.median_minutes_per_bed}m` : "—"}
          icon={<Timer className="h-3 w-3" />}
        />
      </div>

      <div className="space-y-4 p-5">
        {m.days.map((d) => (
          <DayCard key={d.date} day={d} />
        ))}
      </div>
    </Card>
  );
}

function DayCard({ day }: { day: MovementDay }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2.5">
        <CalendarDays className="h-3.5 w-3.5 text-brand-600" />
        <span className="text-sm font-semibold text-ink">{dayLabel(day.date)}</span>
        <span className="text-xs text-ink-faint">
          {hhmm(day.first_seen)} – {hhmm(day.last_seen)}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
            {day.records} record{day.records === 1 ? "" : "s"}
          </span>
          <span>{day.beds} beds</span>
          <span>{duration(day.active_minutes)} active</span>
        </span>
      </div>

      {/* Route: the order of blocks walked. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
        {day.greenhouses.map((g, i) => (
          <span key={`${g}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="h-3 w-3 text-ink-faint" />}
            <span
              className="rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                color: blockHex(g),
                backgroundColor: `${blockHex(g)}1f`,
                border: `1px solid ${blockHex(g)}4d`,
              }}
            >
              {g}
            </span>
          </span>
        ))}
      </div>

      <ul className="divide-y divide-line">
        {day.stops.map((s, i) => (
          <StopRow key={`${s.started_at}-${i}`} stop={s} />
        ))}
      </ul>
    </div>
  );
}

function StopRow({ stop: s }: { stop: MovementStop }) {
  const hex = blockHex(s.greenhouse);
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface">
      <span className="w-11 shrink-0 tabular-nums text-xs text-ink-faint">
        {hhmm(s.started_at)}
      </span>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-ink">{s.bed_code ?? "Block-level"}</span>
        <span className="text-ink-faint"> · {s.greenhouse}</span>
        {s.agents.length > 0 && (
          <span className="text-ink-faint"> · {s.agents.join(", ")}</span>
        )}
      </span>
      {s.max_severity > 0 && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: severityHex(s.max_severity) }}
          title="Highest severity recorded at this stop"
        >
          S{s.max_severity}
        </span>
      )}
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-faint">
        {s.minutes != null ? `${s.minutes}m` : "—"}
      </span>
    </li>
  );
}
