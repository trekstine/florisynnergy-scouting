import type { SprayRecord } from "./types";

/**
 * The identity of a spray program.
 *
 * Records written before programs existed — and standalone mobile captures —
 * carry no `program_id`, so each becomes its own single-product program keyed
 * by record id. Three screens derived this independently and disagreed on the
 * fallback, which meant an approval sheet linked from one page 404ed. One
 * definition, used everywhere.
 */
export function programKey(r: SprayRecord): string {
  return r.program_id?.trim() || `#${r.id}`;
}

/**
 * The spray CSV, in one place.
 *
 * Both the Spray Programs page and the Analytics → Programs report offer this
 * download. They had drifted — one wrote thirteen columns, the other
 * twenty-six — which meant the file you got depended on which screen you
 * happened to be looking at. A compliance export cannot work that way.
 *
 * One row per *product*, not per program: an auditor needs the dose and cost
 * of each chemical in the tank, not a rolled-up total.
 */
const COLUMNS = [
  "program_id",
  "greenhouse",
  "bed",
  "partition",
  "variety",
  "start_date",
  "start_time",
  "scout_report_date",
  "application_type",
  "coverage",
  "water_volume",
  "product",
  "active_ingredient",
  "target",
  "who_class",
  "rac_code",
  "rate_per_100l",
  "quantity",
  "unit_price",
  "cost",
  "rei_hours",
  "phi_days",
  "safe_harvest_date",
  "recommendation_id",
  "prepared_by",
  "comments",
] as const;

export interface SprayExportLookups {
  greenhouse: (id: number) => string;
  variety: (code: string) => string;
  employee: (id: number) => string;
}

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function row(r: SprayRecord, programId: string, look: SprayExportLookups): string {
  return [
    programId,
    r.greenhouse_id != null ? look.greenhouse(r.greenhouse_id) : "",
    r.bed_code ?? "",
    r.partition_no ?? "",
    r.variety_code ? look.variety(r.variety_code) : "",
    r.start_date ?? "",
    r.start_time ?? "",
    r.scout_report_date ?? "",
    r.type_of_application ?? "",
    r.coverage ?? "",
    r.volume_of_water ?? "",
    r.product ?? "",
    r.active_ingredient1 ?? "",
    [r.target1, r.target2].filter(Boolean).join(" / "),
    r.who_class ?? "",
    r.rac_code ?? "",
    r.rate ?? "",
    r.qty ?? "",
    r.buying_price ?? "",
    r.cost_of_chemical ?? "",
    r.rei ?? "",
    r.phi_days ?? "",
    r.safe_harvest_date ?? "",
    r.recommendation_id ?? "",
    r.scout_id != null ? look.employee(r.scout_id) : "",
    r.comments ?? "",
  ]
    .map(esc)
    .join(",");
}

/** Build the CSV text for a set of programs, each already grouped. */
export function buildSprayCsv(
  groups: { id: string; records: SprayRecord[] }[],
  look: SprayExportLookups,
): string {
  const lines = groups.flatMap((g) => g.records.map((r) => row(r, g.id, look)));
  return [COLUMNS.join(","), ...lines].join("\n");
}

/** Trigger a browser download. Kept separate so the builder stays testable. */
export function downloadCsv(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
