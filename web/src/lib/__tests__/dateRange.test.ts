import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activePreset,
  describeRange,
  isoDay,
  isoDaysAgo,
  PRESETS_WITH_TODAY,
  today,
  type RangePreset,
} from "../../components/DateRange";

const PRESETS: RangePreset[] = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "All", days: null },
];

describe("isoDay", () => {
  it("returns the local calendar date, not the UTC one", () => {
    // The farm is in Kenya, UTC+3. At 01:30 on 14 August local time it is
    // still 22:30 on the 13th in UTC, so `toISOString()` — which the old code
    // used — answered "2026-08-13" and shifted every window back a day.
    expect(isoDay(new Date(2026, 7, 14, 1, 30))).toBe("2026-08-14");
  });

  it("does not roll backwards just before midnight", () => {
    expect(isoDay(new Date(2026, 7, 14, 23, 59))).toBe("2026-08-14");
  });

  it("does not roll forwards just after midnight", () => {
    expect(isoDay(new Date(2026, 7, 14, 0, 1))).toBe("2026-08-14");
  });
});

describe("isoDaysAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 9, 0)); // 14 Aug 2026, 09:00 local
  });
  afterEach(() => vi.useRealTimers());

  it("counts today as day one", () => {
    // "Today" must mean today, not today-and-yesterday.
    expect(isoDaysAgo(1)).toBe("2026-08-14");
    expect(today()).toBe("2026-08-14");
  });

  it("spans the number of days named, inclusive of both ends", () => {
    expect(isoDaysAgo(7)).toBe("2026-08-08"); // 8th…14th is seven days
    expect(isoDaysAgo(30)).toBe("2026-07-16");
  });

  it("works at 00:30, when a UTC-based version would slip a day", () => {
    vi.setSystemTime(new Date(2026, 7, 14, 0, 30));
    expect(isoDaysAgo(1)).toBe("2026-08-14");
  });
});

describe("activePreset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("recognises a preset window", () => {
    expect(activePreset({ start: "2026-08-08", end: "2026-08-14" }, PRESETS)?.label).toBe("7d");
  });

  it("recognises the unbounded preset", () => {
    expect(activePreset({}, PRESETS)?.label).toBe("All");
  });

  it("returns nothing for a hand-picked window", () => {
    // Which is what tells the UI to show the dates rather than a preset pill.
    expect(activePreset({ start: "2026-07-01", end: "2026-07-31" }, PRESETS)).toBeNull();
  });

  it("does not mistake a window ending in the past for a preset", () => {
    // Same start as "7d" but ending three days ago — a different question.
    expect(activePreset({ start: "2026-08-08", end: "2026-08-11" }, PRESETS)).toBeNull();
  });
});

describe("describeRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("names the preset when one is in force", () => {
    expect(describeRange({ start: "2026-08-08", end: "2026-08-14" }, PRESETS)).toBe("7d");
  });

  it("spells out a hand-picked window", () => {
    expect(describeRange({ start: "2026-07-01", end: "2026-07-31" }, PRESETS)).toBe(
      "1 Jul 26 – 31 Jul 26",
    );
  });

  it("handles a half-open window", () => {
    expect(describeRange({ start: "2026-07-01" }, PRESETS)).toBe("From 1 Jul 26");
    expect(describeRange({ end: "2026-07-31" }, PRESETS)).toBe("Up to 31 Jul 26");
  });

  it("says All time when nothing is bounded", () => {
    expect(describeRange({}, [])).toBe("All time");
  });
});

describe("the shared presets", () => {
  it("lead with Today", () => {
    // The dashboard and the records list both use this; if they ever stopped
    // sharing it, "Today" could come to mean two windows.
    expect(PRESETS_WITH_TODAY[0]?.days).toBe(1);
    expect(PRESETS_WITH_TODAY.map((p) => p.label)).toEqual(["Today", "7d", "30d", "90d"]);
  });
});
