import { describe, expect, it } from "vitest";

/**
 * Splitting chemical spend across the blocks it went on.
 *
 * A ranked bar answers "which product costs most" and stops. The next question
 * is always *where* — one block driving a product's whole spend is a different
 * problem from the same spend spread evenly, and both look identical on a
 * single bar.
 *
 * The risk in stacking is arithmetic: a segment counted twice, or a block
 * folded into "Other" and then lost. Each bar's segments must add back up to
 * the product's real total, or the chart quietly overstates the spend.
 *
 * Mirrors the shaping in the analytics page.
 */
interface Row {
  product: string;
  greenhouse: string;
  cost: number;
}

function shape(rows: Row[], topN = 6) {
  const spendPerBlock = new Map<string, number>();
  for (const r of rows) {
    spendPerBlock.set(r.greenhouse, (spendPerBlock.get(r.greenhouse) ?? 0) + r.cost);
  }
  const top = [...spendPerBlock.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name);
  const named = new Set(top);
  const bucket = (gh: string) => (named.has(gh) ? gh : "Other blocks");

  const built = new Map<string, Record<string, string | number>>();
  for (const r of rows) {
    const row = built.get(r.product) ?? { label: r.product };
    const key = bucket(r.greenhouse);
    row[key] = ((row[key] as number) ?? 0) + r.cost;
    built.set(r.product, row);
  }

  const out = [...built.values()].map((row) => {
    const cleaned: Record<string, string | number> = { label: String(row.label) };
    let total = 0;
    for (const [k, v] of Object.entries(row)) {
      if (k === "label") continue;
      const n = Math.round((v as number) * 100) / 100;
      if (n > 0) {
        cleaned[k] = n;
        total += n;
      }
    }
    cleaned.__total = total;
    return cleaned;
  });

  const keys = [...top];
  if (spendPerBlock.size > top.length) keys.push("Other blocks");
  return { rows: out, keys };
}

const DATA: Row[] = [
  { product: "Oberon", greenhouse: "GH01", cost: 4000 },
  { product: "Oberon", greenhouse: "GH02", cost: 1000 },
  { product: "Switch", greenhouse: "GH01", cost: 2000 },
  { product: "Ortiva", greenhouse: "GH03", cost: 500 },
];

describe("chemical spend split by block", () => {
  it("keeps each product's total intact across its segments", () => {
    // The whole point: stacking must not invent or lose money.
    const { rows } = shape(DATA);
    const oberon = rows.find((r) => r.label === "Oberon")!;
    expect(oberon.__total).toBe(5000);
    expect(oberon.GH01).toBe(4000);
    expect(oberon.GH02).toBe(1000);
  });

  it("adds up to the same grand total as an unsplit chart would", () => {
    const { rows } = shape(DATA);
    const stacked = rows.reduce((s, r) => s + (r.__total as number), 0);
    const flat = DATA.reduce((s, r) => s + r.cost, 0);
    expect(stacked).toBe(flat);
  });

  it("folds the long tail into one series rather than dropping it", () => {
    // Twenty stacked segments is a smear, but a block silently omitted would
    // understate the product it belongs to.
    const many: Row[] = Array.from({ length: 10 }, (_, i) => ({
      product: "Oberon",
      greenhouse: `GH${String(i + 1).padStart(2, "0")}`,
      cost: 100 * (10 - i),
    }));
    const { rows, keys } = shape(many, 6);
    expect(keys).toHaveLength(7);
    expect(keys.at(-1)).toBe("Other blocks");
    expect(rows[0]!.__total).toBe(many.reduce((s, r) => s + r.cost, 0));
    expect(rows[0]!["Other blocks"]).toBe(100 + 200 + 300 + 400);
  });

  it("names the biggest-spending blocks, not the first ones seen", () => {
    const { keys } = shape(
      [
        { product: "X", greenhouse: "small", cost: 1 },
        { product: "X", greenhouse: "big", cost: 999 },
      ],
      1,
    );
    expect(keys[0]).toBe("big");
    expect(keys).toContain("Other blocks");
  });

  it("omits a zero segment rather than drawing an empty band", () => {
    const { rows } = shape([
      { product: "X", greenhouse: "GH01", cost: 100 },
      { product: "X", greenhouse: "GH02", cost: 0 },
    ]);
    expect(rows[0]!.GH01).toBe(100);
    expect(rows[0]!.GH02).toBeUndefined();
  });

  it("copes with no data at all", () => {
    const { rows, keys } = shape([]);
    expect(rows).toEqual([]);
    expect(keys).toEqual([]);
  });
});
