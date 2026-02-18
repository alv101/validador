import type { ValidateRequest } from "@/types/validations";

export function parseQrPayload(raw: string): ValidateRequest | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // JSON format
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Partial<ValidateRequest>;
      if (typeof obj.locator === "string" && typeof obj.serviceId === "string") {
        return normalize({ locator: obj.locator, serviceId: obj.serviceId });
      }
    } catch {
      // fallthrough
    }
  }

  // "locator:ABC;serviceId:S1" format
  const parts = text.split(";").map((p) => p.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const p of parts) {
    const [k, ...rest] = p.split(":");
    if (!k || rest.length === 0) continue;
    map.set(k.trim().toLowerCase(), rest.join(":").trim());
  }

  const locator = map.get("locator");
  const serviceId = map.get("serviceid") ?? map.get("service_id");

  if (!locator || !serviceId) return null;
  return normalize({ locator, serviceId });
}

function normalize(input: ValidateRequest): ValidateRequest {
  return {
    locator: input.locator.trim().toUpperCase(),
    serviceId: input.serviceId.trim(),
  };
}
