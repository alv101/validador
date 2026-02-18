import { getDeviceId } from "@/lib/deviceId";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type TokenGetter = () => string | null;

type UnauthorizedHandler = () => void;

let getToken: TokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler | null = null;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function configureApiClient(config: {
  getToken: TokenGetter;
  onUnauthorized?: UnauthorizedHandler;
}): void {
  getToken = config.getToken;
  onUnauthorized = config.onUnauthorized ?? null;
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError) return true;
  return error instanceof Error && /Failed to fetch|NetworkError/i.test(error.message);
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch<T>(
  path: string,
  opts: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": getDeviceId(),
    ...(opts.headers ?? {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    ...opts,
    headers,
  });

  if (response.status === 401) {
    onUnauthorized?.();
    throw new HttpError(401, "Unauthorized");
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "Request failed");
    throw new HttpError(response.status, message || response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}
