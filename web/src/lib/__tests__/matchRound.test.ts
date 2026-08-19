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
});
