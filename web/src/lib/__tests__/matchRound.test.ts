import { describe, expect, it } from "vitest";

import { matchRound } from "../../components/ScoutingBehindLink";
import type { RoundSummary } from "../types";

function round(startedAt: string, id = startedAt): RoundSummary {
  // Only the two fields the matcher reads matter; the rest is filler.
  return { batch_id: id, started_at: startedAt } as unknown as RoundSummary;
}

// Newest first, as the API returns them.
const ROUNDS = [
  round("2026-08-10T07:15:00Z"),
  round("2026-08-06T14:51:00Z"),
  round("2026-07-29T08:00:00Z"),
  round("2026-07-22T09:30:00Z"),
];

describe("matchRound", () => {
  it("opens the round walked on the report date", () => {
    const m = matchRound(ROUNDS, "2026-07-29");
    expect(m.exact?.started_at).toBe("2026-07-29T08:00:00Z");
    expect(m.nearest).toBeNull();
  });

  it("accepts a full timestamp as the report date", () => {
    expect(matchRound(ROUNDS, "2026-08-06T00:00:00Z").exact?.batch_id).toBe(
      "2026-08-06T14:51:00Z",
    );
  });

  it("offers the nearest earlier round instead of substituting it", () => {
    // The client's bug: a spray on 30 Jul silently showed the 29 Jul round as
    // though it were that day's. Now the caller gets both facts and has to say
    // which it is showing.
    const m = matchRound(ROUNDS, "2026-07-30");
    expect(m.exact).toBeNull();
    expect(m.nearest?.started_at).toBe("2026-07-29T08:00:00Z");
    expect(m.wanted).toBe("2026-07-30");
  });

  it("never reaches forward for a later round", () => {
    // 20 Jul predates every round on the block. Showing the 22 Jul walk would
    // claim a spray was justified by scouting that had not happened yet.
    const m = matchRound(ROUNDS, "2026-07-20");
    expect(m.exact).toBeNull();
    expect(m.nearest).toBeNull();
  });

  it("returns nothing at all when the programme has no report date", () => {
    // This was the worse half of the bug: with no date it fell back to
    // rounds[0], the *newest* round on the block — which can be weeks after
    // the spray it was meant to justify.
    const m = matchRound(ROUNDS, null);
    expect(m.exact).toBeNull();
    expect(m.nearest).toBeNull();
    expect(m.wanted).toBeNull();
  });

  it("picks the last walk when a block was scouted twice in a day", () => {
    const twice = [
      round("2026-08-06T16:40:00Z", "afternoon"),
      round("2026-08-06T07:10:00Z", "morning"),
    ];
    expect(matchRound(twice, "2026-08-06").exact?.batch_id).toBe("afternoon");
  });

  it("copes with a block that has never been scouted", () => {
    const m = matchRound([], "2026-08-06");
    expect(m.exact).toBeNull();
    expect(m.nearest).toBeNull();
  });

  // ── the window, not the point ──────────────────────────────────────────
  it("returns every round inside the programme's own window", () => {
    // A spray raised on 11 Aug answering the walks of 6 and 10 Aug. Both are
    // its evidence; showing only one would drop half the justification.
    const m = matchRound(ROUNDS, "2026-08-06", "2026-08-10");
    expect(m.inWindow.map((r) => r.started_at)).toEqual([
      "2026-08-10T07:15:00Z",
      "2026-08-06T14:51:00Z",
    ]);
    // The newest in the window is what opens first.
    expect(m.exact?.started_at).toBe("2026-08-10T07:15:00Z");
    expect(m.nearest).toBeNull();
  });

  it("treats a missing end as a single day, not an open interval", () => {
    // Without this, one absent end date would sweep in every later round and
    // the programme would claim scouting that had not happened when it was
    // raised.
    const m = matchRound(ROUNDS, "2026-07-29");
    expect(m.inWindow).toHaveLength(1);
    expect(m.exact?.started_at).toBe("2026-07-29T08:00:00Z");
  });

  it("includes both ends of the window", () => {
    const m = matchRound(ROUNDS, "2026-07-22", "2026-07-29");
    expect(m.inWindow).toHaveLength(2);
  });

  it("falls back to the nearest earlier round when the window is empty", () => {
    const m = matchRound(ROUNDS, "2026-08-01", "2026-08-04");
    expect(m.inWindow).toHaveLength(0);
    expect(m.exact).toBeNull();
    expect(m.nearest?.started_at).toBe("2026-07-29T08:00:00Z");
  });

  it("does not reach past the end of the window", () => {
    // 10 Aug sits outside a window closing on the 6th.
    const m = matchRound(ROUNDS, "2026-08-06", "2026-08-06");
    expect(m.inWindow.map((r) => r.started_at)).toEqual(["2026-08-06T14:51:00Z"]);
  });

  // ── the report's own window, and nothing outside it ────────────────────
  it("never reaches back before the window's start", () => {
    // The bug the client hit: the programme panel asked for every record on
    // the block with no lower bound, so a spray answering one Tuesday walk
    // listed months of unrelated findings.
    const m = matchRound(ROUNDS, "2026-08-06", "2026-08-10");
    const days = m.inWindow.map((r) => r.started_at.slice(0, 10));
    expect(days.every((d) => d >= "2026-08-06")).toBe(true);
    expect(days).not.toContain("2026-07-29");
    expect(days).not.toContain("2026-07-22");
  });

  it("shows nothing at all when the programme carries no scouting date", () => {
    // Rather than falling back to the spray's own start date, which is the day
    // it was applied and not the day it was justified.
    const m = matchRound(ROUNDS, null, null);
    expect(m.inWindow).toHaveLength(0);
    expect(m.exact).toBeNull();
    expect(m.nearest).toBeNull();
  });

  it("matches on the local calendar day, not the UTC one", () => {
    // The farm is UTC+3. A round at 21:30 UTC on the 5th is 00:30 local on the
    // 6th, so it belongs to the 6th — which is the day the API would have
    // returned it for when the programme was raised.
    const lateUtc = [round("2026-08-05T21:30:00Z", "just-after-midnight-local")];
    const m = matchRound(lateUtc, "2026-08-06", "2026-08-06");
    expect(m.inWindow.map((r) => r.batch_id)).toEqual(["just-after-midnight-local"]);
  });
});
