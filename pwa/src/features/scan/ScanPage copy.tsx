import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

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

type ScannerControls = {
  stop: () => void;
};

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

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickPreferredCamera(cameras: CameraDevice[]): string | null {
  if (cameras.length === 0) return null;
  const rear = cameras.find((camera) => /back|rear|environment|trasera/i.test(camera.label));
  return rear?.deviceId ?? cameras[0].deviceId;
}

function stopVideoTracks(videoElement: HTMLVideoElement | null): void {
  if (!videoElement) return;
  const stream = videoElement.srcObject;
  if (!(stream instanceof MediaStream)) return;

  for (const track of stream.getTracks()) {
    track.stop();
  }
  videoElement.srcObject = null;
}

export function ScanPage() {
  const { logout } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopScanRef = useRef<null | (() => void)>(null);
  const startingRef = useRef(false);

  const lastReadAtRef = useRef(0);
  const lastRawRef = useRef<string | null>(null);
  const lastRawAtRef = useRef(0);
  const processingRef = useRef(false);

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);

  const submitValidation = useCallback(
    async (payload: ValidateRequest) => {
      const idempotencyKey = createRequestId();
      const now = new Date().toISOString();

      try {
        const response = await apiFetch<ValidateResponse>("/validate", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
        });

        setFeedback({
          message: response.result,
          outcome: response.result,
          createdAt: response.timestamps.createdAt,
          updatedAt: response.timestamps.updatedAt,
        });
        return;
      } catch (error) {
        if (isNetworkError(error) || !navigator.onLine) {
          setFeedback({
            message: "SIN CONEXIÓN — NO VALIDADO",
            outcome: "OFFLINE",
            createdAt: now,
            updatedAt: now,
          });
          return;
        }

        if (error instanceof HttpError) {
          if (error.status === 401 || error.status === 403) {
            setFeedback({
              message: "Sesión caducada",
              outcome: "ERROR",
              createdAt: now,
              updatedAt: now,
            });
            logout();
            return;
          }

          if (error.status >= 500) {
            setFeedback({
              message: "Servidor no disponible",
              outcome: "ERROR",
              createdAt: now,
              updatedAt: now,
            });
            return;
          }

          if (error.status >= 400) {
            setFeedback({
              message: "Solicitud inválida",
              outcome: "ERROR",
              createdAt: now,
              updatedAt: now,
            });
            return;
          }
        }

        setFeedback({
          message: "ERROR",
          outcome: "ERROR",
          createdAt: now,
          updatedAt: now,
        });
      }
    },
    [logout],
  );

  const handleRawQr = useCallback(
    async (raw: string) => {
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

      const parsed = parseQrPayload(raw);
      if (!parsed) return;

      processingRef.current = true;
      lastReadAtRef.current = now;
      lastRawRef.current = raw;
      lastRawAtRef.current = now;

      if (typeof navigator.vibrate === "function") {
        navigator.vibrate(120);
      }

      try {
        await submitValidation({ locator: parsed.locator, serviceId: "UNSET_SERVICE" });
      } finally {
        processingRef.current = false;
      }
    },
    [submitValidation],
  );

  useEffect(() => {
    let cancelled = false;

    const loadCameras = async () => {
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("Este navegador no soporta acceso a cámara.");
        return;
      }

      try {
        setCameraError(null);

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Cámara ${index + 1}`,
          }));

        if (cancelled) return;

        setCameraDevices(cameras);
        const preferred = pickPreferredCamera(cameras);
        setSelectedDeviceId(preferred ?? undefined);

        if (cameras.length === 0) {
          setCameraError("No se encontraron cámaras disponibles.");
        }
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : "Permiso de cámara denegado.";
        setCameraDevices([]);
        setSelectedDeviceId(undefined);
        setCameraError(`No se puede iniciar cámara. ${message}`);
      }
    };

    void loadCameras();

    return () => {
      cancelled = true;
    };
  }, [cameraRetryNonce]);

  useEffect(() => {

  const videoElement = videoRef.current;
  if (!videoElement || cameraError) return;

  // Evita doble inicio (muy común en dev con React.StrictMode)
  if (startingRef.current) return;
  startingRef.current = true;

  let cancelled = false;

  // Para cualquier scan anterior antes de iniciar otro
  stopScanRef.current?.();
  stopScanRef.current = null;
  stopVideoTracks(videoElement);

  void (async () => {
    try {
      const zxing = (await import("@zxing/browser")) as ZXingModule;
      const reader = new zxing.BrowserMultiFormatReader();

      const controls = await reader.decodeFromVideoDevice(
        selectedDeviceId,
        videoElement,
        (result: { getText: () => string } | undefined) => {
          if (result) void handleRawQr(result.getText());
        },
      );

      if (cancelled) {
        controls.stop();
        stopVideoTracks(videoElement);
        return;
      }

      // Importante: envolver
      stopScanRef.current = () => controls.stop();
    } catch (error) {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : "Error al iniciar la cámara.";
      setCameraError(`No se puede iniciar cámara. ${message}`);
    } finally {
      startingRef.current = false;
    }
  })();

  return () => {
    cancelled = true;
    stopScanRef.current?.();
    stopScanRef.current = null;
    stopVideoTracks(videoElement);
    startingRef.current = false;
  };
}, [cameraError, handleRawQr, selectedDeviceId]);


  const retryCamera = useCallback(() => {
    setCameraError(null);
    setCameraRetryNonce((value) => value + 1);
  }, []);

  return (
    <main className="page">
      <header className="topbar">
        <h1>Escáner QR</h1>
        <nav className="nav-inline">
          <Link to="/history">Historial</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      {cameraDevices.length > 1 ? (
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
