import { describe, expect, it } from "vitest";
import { formatMillions, per90, tenthsToMillions } from "../src/numbers.ts";

describe("price units", () => {
  it("converts tenths to millions", () => {
    expect(tenthsToMillions(55)).toBe(5.5);
    expect(tenthsToMillions(145)).toBe(14.5);
    expect(tenthsToMillions(40)).toBe(4);
  });

  it("formats for display", () => {
    expect(formatMillions(55)).toBe("£5.5m");
    expect(formatMillions(40)).toBe("£4.0m");
  });
});

describe("per90", () => {
  it("scales by minutes", () => {
    expect(per90(2, 180)).toBe(1);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(per90(3, 0)).toBe(0);
  });
});
