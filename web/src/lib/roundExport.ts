import { downloadCsv } from "@/lib/sprayExport";
import type { RoundSummary } from "@/lib/types";

/**
 * Export the scouting reports list.
 *
 * Exports exactly what the screen is showing — same filters, same rows, same
 * order. An export that quietly returned everything would be worse than none
 * at all: the numbers in the spreadsheet would not reconcile with the numbers
 * the manager just read, and they would trust the wrong one.
 */
const COLUMNS: { header: string; value: (r: RoundSummary) => string | number }[] = [
  { header: "Date", value: (r) => r.started_at.slice(0, 10) },
  {
    header: "Start time",
    value: (r) =>
      new Date(r.started_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
  },
  {
    header: "End time",
    value: (r) =>
      new Date(r.ended_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
  },
  { header: "Duration (min)", value: (r) => r.duration_minutes },
  { header: "Greenhouse", value: (r) => r.greenhouse ?? "" },
  { header: "Block code", value: (r) => r.greenhouse_code ?? "" },
  { header: "Scout", value: (r) => r.scout ?? "" },
  { header: "Varieties", value: (r) => r.varieties.join("; ") },
  { header: "Records", value: (r) => r.records },
  { header: "Beds walked", value: (r) => r.beds },
  { header: "Clean beds", value: (r) => r.clean_beds },
  { header: "Findings", value: (r) => r.findings },
  { header: "Hotspots (sev 4+)", value: (r) => r.hotspots },
  { header: "Worst severity", value: (r) => r.max_severity },
  { header: "Pests found", value: (r) => r.pests.join("; ") },
  { header: "Diseases found", value: (r) => r.diseases.join("; ") },
  { header: "Beneficials counted", value: (r) => r.beneficials },
  { header: "Photos", value: (r) => r.photos },
  { header: "Flagged records", value: (r) => r.flagged },
  { header: "Spray programs raised", value: (r) => r.programs },
  { header: "Scout's remark", value: (r) => r.session_comment ?? "" },
  { header: "Report ID", value: (r) => r.batch_id },
];

function cell(value: string | number): string {
  const text = String(value ?? "");
  // Excel reads a leading =, +, - or @ as a formula. Field notes are free
  // text, so a note starting "=" would execute on open.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildRoundsCsv(
  rounds: RoundSummary[],
  /** The filters in force, written into the file so it explains itself later. */
  context?: string[],
): string {
  const lines: string[] = [];
  if (context?.length) {
    lines.push(cell(`Florisynergy IPM — scouting reports`));
    lines.push(cell(context.join(" · ")));
    lines.push("");
  }
  lines.push(COLUMNS.map((c) => cell(c.header)).join(","));
  for (const r of rounds) {
    lines.push(COLUMNS.map((c) => cell(c.value(r))).join(","));
  }
  return lines.join("\n");
}

export function downloadRoundsCsv(rounds: RoundSummary[], context?: string[]): void {
  downloadCsv(
    buildRoundsCsv(rounds, context),
    `scouting_reports_${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
