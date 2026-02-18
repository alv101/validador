export function shouldIgnoreDuplicateRaw(params: {
  raw: string;
  lastRaw: string | null;
  nowMs: number;
  lastRawAtMs: number;
  windowMs?: number;
}): boolean {
  const { raw, lastRaw, nowMs, lastRawAtMs, windowMs = 3000 } = params;
  return raw === lastRaw && nowMs - lastRawAtMs < windowMs;
}
