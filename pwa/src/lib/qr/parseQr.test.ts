import { describe, expect, it } from "vitest";

import { parseQrPayload } from "@/lib/qr/parseQr";

describe("parseQrPayload", () => {
  it("parses JSON payload", () => {
    const result = parseQrPayload('{"locator":" abc123 ","serviceId":" S1 "}');
    expect(result).toEqual({ locator: "ABC123", serviceId: "S1" });
  });

  it("parses locator/serviceId text payload", () => {
    const result = parseQrPayload("locator: qwe999 ; serviceId: checkin");
    expect(result).toEqual({ locator: "QWE999", serviceId: "checkin" });
  });

  it("returns null for invalid payload", () => {
    expect(parseQrPayload("locator-only")).toBeNull();
    expect(parseQrPayload('{"locator":"A"}')).toBeNull();
    expect(parseQrPayload("   ")).toBeNull();
  });
});
