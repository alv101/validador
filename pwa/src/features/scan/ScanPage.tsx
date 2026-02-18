import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { addHistoryEntry } from "@/features/offlineQueue/db";
import { useAuth } from "@/features/auth/AuthContext";
import { shouldIgnoreDuplicateRaw } from "@/features/scan/scanUtils";
import { HttpError, apiFetch, isNetworkError } from "@/lib/apiClient";
import { parseQrPayload } from "@/lib/qr/parseQr";
import type { ValidationOutcome } from "@/types/history";
import type { ValidateRequest, ValidateResponse } from "@/types/validations";

type ScanFeedback = {
  message: string;
  outcome: ValidationOutcome;
  createdAt?: string;
  updatedAt?: string;
};

type CameraDevice = {
  deviceId: string;
  label: string;
};

type ScannerControls = { stop: () => void };

type ZXingModule = {
  BrowserMultiFormatReader: new () => {
    decodeFromVideoDevice: (
      deviceId: string | undefined,
      previewElem: string | HTMLVideoElement | undefined,
      callbackFn: (result: { getText: () => string } | undefined) => void,
    ) => Promise<ScannerControls>;
  };
};

const COOLDOWN_MS = 1500;
const SAME_RAW_DEDUPE_MS = 3000;

const RESULT_CLASS: Record<ValidationOutcome, string> = {
  VALID: "result result--valid",
  INVALID: "result result--invalid",
  DUPLICATE: "result result--duplicate",
  ERROR: "result result--error",
  OFFLINE: "result result--error",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickPreferredCamera(cameras: CameraDevice[]): string | null {
  if (cameras.length === 0) return null;
  const rear = cameras.find((c) => /back|rear|environment|trasera/i.test(c.label));
  if (rear) return rear.deviceId;
  // Si no hay labels (típico sin permisos), en móvil suele ser la última
  return cameras[cameras.length - 1].deviceId;
}

function hardResetVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.pause();
  } catch {}
  const stream = video.srcObject;
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) track.stop();
  }
  video.srcObject = null;
  try {
    video.removeAttribute("src");
    video.load();
  } catch {}
}

function humanizeMediaError(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as any).name) : "";
  const msg = err && typeof err === "object" && "message" in err ? String((err as any).message) : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró una cámara válida.";
    case "NotReadableError":
      return "La cámara está ocupada o no se puede iniciar.";
    case "AbortError":
      return "Inicio/reproducción interrumpida (HMR/recarga).";
    default:
      return msg || "Error al iniciar cámara.";
  }
}

export function ScanPage() {
  const { logout } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const controlsRef = useRef<ScannerControls | null>(null);
  const startTokenRef = useRef(0);

  const lastReadAtRef = useRef(0);
  const lastRawRef = useRef<string | null>(null);
  const lastRawAtRef = useRef(0);
  const processingRef = useRef(false);

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  // ✅ Nuevo: cuando enumerateDevices no existe, no mostramos selector, pero sí escaneamos
  const [canEnumerate, setCanEnumerate] = useState<boolean>(true);

  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);

  const hardStopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;
    hardResetVideo(videoRef.current);
  }, []);

  // Vite HMR: parar cámara en refresh de módulos (evita AbortError)
  useEffect(() => {
    // @ts-expect-error vite
    if (import.meta?.hot) {
      // @ts-expect-error vite
      import.meta.hot.dispose(() => hardStopScanner());
    }
  }, [hardStopScanner]);

  const addHistory = useCallback(async (payload: ValidateRequest, outcome: ValidationOutcome, at: string) => {
    const id = `${at}:${payload.locator}:${payload.serviceId}`;
    await addHistoryEntry({ id, locator: payload.locator, serviceId: payload.serviceId, outcome, at });
  }, []);

  const submitValidation = useCallback(
    async (payload: ValidateRequest) => {
      const idempotencyKey = createRequestId();
      const now = new Date().toISOString();

      try {
        const response = await apiFetch<ValidateResponse>("/validate", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Idempotency-Key": idempotencyKey },
        });

        setFeedback({
          message: response.result,
          outcome: response.result,
          createdAt: response.timestamps.createdAt,
          updatedAt: response.timestamps.updatedAt,
        });

        await addHistory(payload, response.result, response.timestamps.updatedAt);
        return;
      } catch (error) {
        if (isNetworkError(error) || !navigator.onLine) {
          setFeedback({ message: "SIN CONEXIÓN — NO VALIDADO", outcome: "OFFLINE", createdAt: now, updatedAt: now });
          await addHistory(payload, "OFFLINE", now);
          return;
        }

        if (error instanceof HttpError) {
          if (error.status === 401 || error.status === 403) {
            setFeedback({ message: "Sesión caducada", outcome: "ERROR", createdAt: now, updatedAt: now });
            await addHistory(payload, "ERROR", now);
            logout();
            return;
          }
          if (error.status >= 500) {
            setFeedback({ message: "Servidor no disponible", outcome: "ERROR", createdAt: now, updatedAt: now });
            await addHistory(payload, "ERROR", now);
            return;
          }
          if (error.status >= 400) {
            setFeedback({ message: "Solicitud inválida", outcome: "ERROR", createdAt: now, updatedAt: now });
            await addHistory(payload, "ERROR", now);
            return;
          }
        }

        setFeedback({ message: "ERROR", outcome: "ERROR", createdAt: now, updatedAt: now });
        await addHistory(payload, "ERROR", now);
      }
    },
    [addHistory, logout],
  );

  const handleRawQr = useCallback(
    async (raw: string) => {
      const nowIso = new Date().toISOString();

      // ✅ Debug claro de lectura (puedes quitarlo luego)
      setFeedback({
        message: `QR leído: ${raw.slice(0, 80)}${raw.length > 80 ? "..." : ""}`,
        outcome: "VALID",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const parsed = parseQrPayload(raw);
      if (!parsed) {
        setFeedback({
          message: `QR leído pero NO válido para esta app: ${raw.slice(0, 80)}${raw.length > 80 ? "..." : ""}`,
          outcome: "INVALID",
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        return;
      }

      const now = Date.now();
      if (processingRef.current) return;
      if (now - lastReadAtRef.current < COOLDOWN_MS) return;

      if (
        shouldIgnoreDuplicateRaw({
          raw,
          lastRaw: lastRawRef.current,
          nowMs: now,
          lastRawAtMs: lastRawAtRef.current,
          windowMs: SAME_RAW_DEDUPE_MS,
        })
      ) {
        return;
      }

      processingRef.current = true;
      lastReadAtRef.current = now;
      lastRawRef.current = raw;
      lastRawAtRef.current = now;

      if (typeof navigator.vibrate === "function") navigator.vibrate(120);

      try {
        await submitValidation(parsed);
      } finally {
        processingRef.current = false;
      }
    },
    [submitValidation],
  );

  // ✅ MODIFICADO: ya NO falla si enumerateDevices no existe o rompe.
  useEffect(() => {
    let cancelled = false;

    const loadCameras = async () => {
      const md = navigator.mediaDevices;

      if (!md?.getUserMedia) {
        setCameraError("Este navegador no soporta acceso a cámara (getUserMedia).");
        setCanEnumerate(false);
        setCameraDevices([]);
        setSelectedDeviceId(undefined);
        return;
      }

      // Si enumerateDevices no existe: degradamos a "sin selector"
      if (!md.enumerateDevices) {
        setCanEnumerate(false);
        setCameraDevices([]);
        setSelectedDeviceId(undefined);
        // No ponemos cameraError: dejamos que el scanner intente con deviceId undefined
        return;
      }

      try {
        setCameraError(null);
        setCanEnumerate(true);

        const devices = await md.enumerateDevices();
        const cameras = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${i + 1}` }));

        if (cancelled) return;

        setCameraDevices(cameras);

        const stillExists = selectedDeviceId && cameras.some((c) => c.deviceId === selectedDeviceId);
        if (!stillExists) {
          const preferred = pickPreferredCamera(cameras);
          setSelectedDeviceId(preferred ?? undefined);
        }

        if (cameras.length === 0) {
          // En algunos móviles, enumerateDevices puede devolver vacío por permisos/HTTP.
          // Degradamos igualmente: sin selector, pero dejamos intentar al scanner.
          setCanEnumerate(false);
          setCameraDevices([]);
          setSelectedDeviceId(undefined);
        }
      } catch (e) {
        if (cancelled) return;
        // Enumerar falló → degradamos a "sin selector"
        setCanEnumerate(false);
        setCameraDevices([]);
        setSelectedDeviceId(undefined);
      }
    };

    void loadCameras();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRetryNonce]);

  // Scanner: funciona con selectedDeviceId undefined (cámara por defecto)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (cameraError) return;

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");

    const myToken = ++startTokenRef.current;
    let cancelled = false;

    const start = async () => {
      hardStopScanner();
      await sleep(60);
      if (cancelled || startTokenRef.current !== myToken) return;

      try {
        const zxing = (await import("@zxing/browser")) as ZXingModule;
        const reader = new zxing.BrowserMultiFormatReader();

        const controls = await reader.decodeFromVideoDevice(selectedDeviceId, video, (result: any) => {
          if (!result) return;
          const raw = typeof result.getText === "function" ? result.getText() : String(result.text ?? "");
          void handleRawQr(raw);
        });

        if (cancelled || startTokenRef.current !== myToken) {
          try {
            controls.stop();
          } catch {}
          hardResetVideo(video);
          return;
        }

        controlsRef.current = controls;
      } catch (e) {
        if (cancelled || startTokenRef.current !== myToken) return;
        setCameraError(`No se puede iniciar cámara/ZXing. ${humanizeMediaError(e)}`);
        hardResetVideo(video);
      }
    };

    void start();

    return () => {
      cancelled = true;
      startTokenRef.current++;
      hardStopScanner();
    };
  }, [cameraError, selectedDeviceId, handleRawQr, hardStopScanner, cameraRetryNonce]);

  const retryCamera = useCallback(() => {
    setCameraError(null);
    setFeedback(null);
    hardStopScanner();
    setCameraRetryNonce((v) => v + 1);
  }, [hardStopScanner]);

  return (
    <main className="page">
      <header className="topbar">
        <h1>Escáner QR</h1>
        <nav className="nav-inline">
          <Link to="/history">Historial</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      {/* ✅ Selector solo si enumerateDevices funciona y hay más de 1 */}
      {canEnumerate && cameraDevices.length > 1 ? (
        <section className="actions">
          <label>
            Cámara
            <select
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              style={{ marginLeft: 8 }}
            >
              {cameraDevices.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {/* ✅ Ayuda al usuario si no se puede enumerar */}
      {!canEnumerate ? (
        <p style={{ opacity: 0.8 }}>
          No se pueden listar cámaras en este navegador/contexto. Se usará la cámara por defecto.
        </p>
      ) : null}

      {cameraError ? <p className="text-error">{cameraError}</p> : null}

      <section className="scanner">
        <video ref={videoRef} className="scanner__video" muted playsInline />
      </section>

      <section className="actions">
        <button type="button" onClick={retryCamera}>
          Reintentar cámara
        </button>
      </section>

      {feedback ? (
        <section className={RESULT_CLASS[feedback.outcome]}>
          <p className="result__label">{feedback.message}</p>
          {feedback.createdAt ? <p>createdAt: {feedback.createdAt}</p> : null}
          {feedback.updatedAt ? <p>updatedAt: {feedback.updatedAt}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
