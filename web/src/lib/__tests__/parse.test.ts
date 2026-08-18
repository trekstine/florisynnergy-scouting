import { describe, expect, it } from "vitest";

import { readDetail } from "../client-api";
import { looseNumber } from "../parse";

describe("looseNumber", () => {
  // The exact shape the server stores. `compose_spray` writes
  // f"{rate:g}/100L", and the backend test suite asserts on that string too —
  // if one side ever changes, both fail together.
  it("reads the rate out of the label the server actually stores", () => {
    expect(looseNumber("75/100L")).toBe(75);
    expect(looseNumber("50/100L")).toBe(50);
    expect(looseNumber("0.5/100L")).toBe(0.5);
  });

  it("reads a volume carrying a unit", () => {
    expect(looseNumber("1000 L")).toBe(1000);
    expect(looseNumber("1,200")).toBe(1200);
  });

  it("returns null rather than zero when there is no number", () => {
    // This is the whole bug: `Number(x) || 0` sent 0, and the API declares
    // both rate and volume gt=0, so every such product was rejected.
    for (const empty of ["", "n/a", "ml/100L", null, undefined]) {
      expect(looseNumber(empty)).toBeNull();
    }
  });

  it("does not read a number out of a denominator", () => {
    // Unanchored, this would return 100 and dose the tank against it.
    expect(looseNumber("ml/100L")).toBeNull();
  });

  it("rejects zero and negatives, which no field here accepts", () => {
    expect(looseNumber("0")).toBeNull();
    expect(looseNumber(0)).toBeNull();
    expect(looseNumber("-5")).toBeNull();
  });

  it("passes a usable number straight through", () => {
    expect(looseNumber(42)).toBe(42);
  });
});

describe("readDetail", () => {
  it("renders FastAPI's validation list as a sentence", () => {
    // Previously this object went to `new Error()` and reached the screen as
    // "[object Object]" — a rejected save that explained nothing.
    expect(
      readDetail(
        [
          {
            loc: ["body", "items"],
            msg: "List should have at least 1 item after validation, not 0",
          },
        ],
        "fallback",
      ),
    ).toBe("items: List should have at least 1 item after validation, not 0");
  });

  it("names the field inside a nested payload", () => {
    expect(
      readDetail(
        [{ loc: ["body", "tanks", 0, "lines", 1, "unit"], msg: "Input should be a valid string" }],
        "fallback",
      ),
    ).toBe("tanks → 0 → lines → 1 → unit: Input should be a valid string");
  });

  it("joins more than one problem", () => {
    expect(
      readDetail(
        [
          { loc: ["body", "rate"], msg: "Input should be greater than 0" },
          { loc: ["body", "volume_of_water_l"], msg: "Input should be greater than 0" },
        ],
        "fallback",
      ),
    ).toBe(
      "rate: Input should be greater than 0; volume_of_water_l: Input should be greater than 0",
    );
  });

  it("passes a plain string detail through unchanged", () => {
    expect(readDetail("This sheet has been signed", "fallback")).toBe(
      "This sheet has been signed",
    );
  });

  it("falls back when there is nothing usable", () => {
    expect(readDetail(undefined, "Request failed (500)")).toBe("Request failed (500)");
    expect(readDetail([], "Request failed (500)")).toBe("Request failed (500)");
    expect(readDetail({ nope: true }, "Request failed (500)")).toBe("Request failed (500)");
  });
});
