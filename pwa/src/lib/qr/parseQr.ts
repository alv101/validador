type ParsedQrPayload = {
  locator: string;
  dni?: string;
};

function isLikelySpanishDniNie(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^\d{8}[A-Z]$/.test(normalized) || /^[XYZ]\d{7}[A-Z]$/.test(normalized);
}

export function parseQrPayload(raw: string): ParsedQrPayload | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // JSON format
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as { locator?: unknown; dni?: unknown };
      if (typeof obj.locator === "string") {
        return normalize({
          locator: obj.locator,
          dni: typeof obj.dni === "string" ? obj.dni : undefined,
        });
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
  const dni = map.get("dni");

  if (locator) {
    return normalize({ locator, dni });
  }

  // fallback: "LOCATOR|DNI" or "LOCATOR-DNI"
  const splitMatch = text.match(/^([^|\-\s]+)[|\-\s]+([^|\-\s]+)$/);
  if (splitMatch && isLikelySpanishDniNie(splitMatch[2])) {
    return normalize({ locator: splitMatch[1], dni: splitMatch[2] });
  }

  return null;
}

function normalize(input: ParsedQrPayload): ParsedQrPayload {
  const normalizedDni = input.dni?.trim().toUpperCase();
  return normalizedDni
    ? {
        locator: input.locator.trim().toUpperCase(),
        dni: normalizedDni,
      }
    : {
        locator: input.locator.trim().toUpperCase(),
      };
}
