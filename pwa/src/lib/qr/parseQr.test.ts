import { describe, expect, it } from "vitest";

import { parseQrPayload } from "@/lib/qr/parseQr";

describe("parseQrPayload", () => {
  it("parses JSON payload with locator", () => {
    const result = parseQrPayload('{"locator":" abc123 ","dni":"12345678z"}');
    expect(result).toEqual({ locator: "ABC123", dni: "12345678Z" });
  });

  it("parses locator+dni text payload", () => {
    const result = parseQrPayload("locator: qwe999 ; dni: 12345678z");
    expect(result).toEqual({ locator: "QWE999", dni: "12345678Z" });
  });

  it("parses split locator-dni payload", () => {
    const result = parseQrPayload("abc123|12345678z");
    expect(result).toEqual({ locator: "ABC123", dni: "12345678Z" });
  });

  it("does not parse split payload when second part is not a valid DNI/NIE format", () => {
    expect(parseQrPayload("abc123|001*00241*16480209")).toBeNull();
    expect(parseQrPayload("$98996361*DGT-001*00241*16480209*200740007*202602201945$")).toBeNull();
  });

  it("returns null for invalid payload", () => {
    expect(parseQrPayload("locator-only")).toBeNull();
    expect(parseQrPayload("{}")).toBeNull();
    expect(parseQrPayload("   ")).toBeNull();
  });
});
