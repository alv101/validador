import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";
import { shouldIgnoreDuplicateRaw } from "@/features/scan/scanUtils";
import { useActiveService } from "@/features/service/ActiveServiceContext";
import { HttpError, apiFetch, isNetworkError } from "@/lib/apiClient";
import { parseQrPayload } from "@/lib/qr/parseQr";
import { BrandBar } from "@/components/BrandBar";
import type { ValidationOutcome } from "@/types/history";
import type { ValidateLocatorRequest, ValidateRequest, ValidateResponse, ValidationReason } from "@/types/validations";

type ScanFeedback = {
  message: string;
  outcome: ValidationOutcome;
  invalidReason?: string;
  duplicateRecordedAt?: string;
  locator?: string;
  validatedTicketId?: string;
  ticketNumber?: string;
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

let feedbackAudioContext: AudioContext | null = null;

function getFeedbackAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!feedbackAudioContext) {
    feedbackAudioContext = new AudioContextCtor();
  }

  return feedbackAudioContext;
}

function unlockFeedbackAudio(): void {
  const ctx = getFeedbackAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

function playFeedbackTone(outcome: ValidationOutcome): void {
  const ctx = getFeedbackAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const isSuccess = outcome === "VALID";
  const frequency = isSuccess ? 1174.7 : 523.3;
  const durationSeconds = isSuccess ? 0.12 : 0.16;

  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(isSuccess ? 0.3 : 0.36, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationSeconds);
  } catch {
    // Ignore audio errors (blocked autoplay, unsupported device, etc.)
  }
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toOutcomeMessageEs(outcome: ValidationOutcome): string {
  switch (outcome) {
    case "VALID":
      return "VALIDO";
    case "INVALID":
      return "INVALIDO";
    case "DUPLICATE":
      return "DUPLICADO";
    case "ERROR":
      return "ERROR";
    case "OFFLINE":
      return "SIN CONEXION - NO VALIDADO";
    default:
      return outcome;
  }
}

function toInvalidReasonEs(reason?: ValidationReason): string {
  switch (reason) {
    case "NOT_FOUND":
      return "No existe billete asociado al servicio actual para este localizador.";
    case "DNI_MISMATCH":
      return "El DNI no coincide con el billete.";
    case "NO_REMAINING":
      return "No quedan billetes pendientes de validar.";
    default:
      return "No cumple las reglas de validacion.";
  }
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
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { activeService, clearActiveService } = useActiveService();
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
    if (import.meta.hot) {
      import.meta.hot.dispose(() => hardStopScanner());
    }
  }, [hardStopScanner]);

  useEffect(() => {
    if (!feedback) return;
    playFeedbackTone(feedback.outcome);
  }, [feedback]);

  useEffect(() => {
    const unlock = () => unlockFeedbackAudio();

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const submitValidation = useCallback(
    async (payload: ValidateRequest | ValidateLocatorRequest) => {
      const idempotencyKey = createRequestId();
      const now = new Date().toISOString();
      const isLocatorValidation = "dni" in payload;

      try {
        const response = await apiFetch<ValidateResponse>(isLocatorValidation ? "/validate-locator" : "/validate", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Idempotency-Key": idempotencyKey },
        });

        setFeedback({
          message: toOutcomeMessageEs(response.result),
          outcome: response.result,
          invalidReason: response.result === "INVALID" ? toInvalidReasonEs(response.reason) : undefined,
          duplicateRecordedAt: response.duplicateRecordedAt,
          locator: payload.locator,
          validatedTicketId: response.ticket?.ticketId,
          ticketNumber: response.ticket?.ref,
          createdAt: response.timestamps.createdAt,
          updatedAt: response.timestamps.updatedAt,
        });
        return;
      } catch (error) {
        if (isNetworkError(error) || !navigator.onLine) {
          setFeedback({
            message: "SIN CONEXIÓN — NO VALIDADO",
            outcome: "OFFLINE",
            locator: payload.locator,
            createdAt: now,
            updatedAt: now,
          });
          return;
        }

        if (error instanceof HttpError) {
          if (error.status === 401) {
            setFeedback({
              message: "Sesion caducada",
              outcome: "ERROR",
              locator: payload.locator,
              createdAt: now,
              updatedAt: now,
            });
            logout();
            return;
          }
          if (error.status === 403) {
            setFeedback({
              message: "Sin permisos para validar",
              outcome: "ERROR",
              locator: payload.locator,
              createdAt: now,
              updatedAt: now,
            });
            return;
          }
          if (error.status >= 500) {
            setFeedback({
              message: "Servidor no disponible",
              outcome: "ERROR",
              locator: payload.locator,
              createdAt: now,
              updatedAt: now,
            });
            return;
          }
          if (error.status >= 400) {
            setFeedback({
              message: "Solicitud inválida",
              outcome: "ERROR",
              locator: payload.locator,
              createdAt: now,
              updatedAt: now,
            });
            return;
          }
        }

        setFeedback({
          message: "ERROR",
          outcome: "ERROR",
          locator: payload.locator,
          createdAt: now,
          updatedAt: now,
        });
      }
    },
    [logout],
  );

  const handleRawQr = useCallback(
    async (raw: string) => {
      if (!activeService) return;

      const nowIso = new Date().toISOString();

      const parsed = parseQrPayload(raw);
      if (!parsed) {
        setFeedback({
          message: "INVALIDO",
          outcome: "INVALID",
          invalidReason: "QR no valido para esta app.",
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
        const payloadBase = {
          locator: parsed.locator,
          serviceId: activeService.departureId,
          itineraryId: activeService.itineraryId,
          busNumber: activeService.busNumber,
        };

        await submitValidation(
          parsed.dni
            ? {
                ...payloadBase,
                dni: parsed.dni,
              }
            : payloadBase,
        );
      } finally {
        processingRef.current = false;
      }
    },
    [activeService, submitValidation],
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

  const handleChangeService = useCallback(() => {
    hardStopScanner();
    setFeedback(null);
    setCameraError(null);
    clearActiveService();
    navigate("/service", { replace: true });
  }, [clearActiveService, hardStopScanner, navigate]);

  return (
    <main className="page scan-page">
      <BrandBar />
      <header className="topbar">
        <h1>Escáner QR</h1>
        <nav className="nav-inline">
          <NavLink to="/history" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Historial
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Settings
          </NavLink>
        </nav>
      </header>

      {activeService ? (
        <section className="banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            Servicio: {activeService.itineraryLabel} · {activeService.departureTime} · Bus {activeService.busNumber}
          </span>
          <button type="button" onClick={handleChangeService}>
            Cambiar servicio
          </button>
        </section>
      ) : null}

      <section className="actions actions--inline">
        {/* ✅ Selector solo si enumerateDevices funciona y hay más de 1 */}
        {canEnumerate && cameraDevices.length > 1 ? (
          <label className="camera-control">
            Cámara
            <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
              {cameraDevices.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" onClick={retryCamera}>
          Activar cámara
        </button>
      </section>

      {/* ✅ Ayuda al usuario si no se puede enumerar */}
      {!canEnumerate ? (
        <p style={{ opacity: 0.8 }}>
          No se pueden listar cámaras en este navegador/contexto. Se usará la cámara por defecto.
        </p>
      ) : null}

      {cameraError ? <p className="text-error">{cameraError}</p> : null}

      <section className="scan-layout">
        <section className="scanner">
          <video ref={videoRef} className="scanner__video" muted playsInline />
        </section>

        {feedback ? (
          <section className={`${RESULT_CLASS[feedback.outcome]} scan-layout__result`}>
            <p className="result__label">{feedback.message}</p>
            {feedback.outcome === "INVALID" && feedback.invalidReason ? <p>motivo: {feedback.invalidReason}</p> : null}
            {feedback.outcome === "DUPLICATE" && feedback.duplicateRecordedAt ? (
              <p>validado previamente: {new Date(feedback.duplicateRecordedAt).toLocaleString()}</p>
            ) : null}
            <p>localizador: {feedback.locator ?? "-"}</p>
            <p>id ticket validado: {feedback.validatedTicketId ?? "-"}</p>
            <p>número billete: {feedback.ticketNumber ?? "-"}</p>
          </section>
        ) : (
          <section className="result scan-layout__result scan-layout__result--empty">
            <p className="result__label">Esperando escaneo</p>
            <p>Aún no hay lecturas en esta sesión.</p>
            <p>Cuando valides un QR, el resultado aparecerá aquí.</p>
          </section>
        )}
      </section>
    </main>
  );
}
