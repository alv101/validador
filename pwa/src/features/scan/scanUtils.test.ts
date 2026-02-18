import { describe, expect, it } from "vitest";

import { shouldIgnoreDuplicateRaw } from "@/features/scan/scanUtils";

describe("shouldIgnoreDuplicateRaw", () => {
  it("ignores same raw inside dedupe window", () => {
    const result = shouldIgnoreDuplicateRaw({
      raw: "locator:ABC;serviceId:S1",
      lastRaw: "locator:ABC;serviceId:S1",
      nowMs: 1000,
      lastRawAtMs: 500,
    });

    expect(result).toBe(true);
  });

  it("does not ignore when raw changes or window elapsed", () => {
    expect(
      shouldIgnoreDuplicateRaw({
        raw: "locator:ABC;serviceId:S1",
        lastRaw: "locator:XYZ;serviceId:S1",
        nowMs: 1000,
        lastRawAtMs: 500,
      }),
    ).toBe(false);

    expect(
      shouldIgnoreDuplicateRaw({
        raw: "locator:ABC;serviceId:S1",
        lastRaw: "locator:ABC;serviceId:S1",
        nowMs: 5000,
        lastRawAtMs: 1000,
      }),
    ).toBe(false);
  });
});
