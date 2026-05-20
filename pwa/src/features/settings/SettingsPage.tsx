import { NavLink } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { getDeviceId } from "@/lib/deviceId";
import { BrandBar } from "@/components/BrandBar";

const RESET_CONFIRMATION_TEXT = "RESET VALIDATIONS";

export function SettingsPage() {
  const { logout, me } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<{
    enabled: boolean;
    requiresAdminKey: boolean;
    canExecuteFromUi: boolean;
  } | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");

  const isAdmin = useMemo(() => {
    const roles = [...(me?.roles ?? []), ...(me?.user?.roles ?? [])];
    return roles.some((role) => role.toUpperCase() === "ADMIN");
  }, [me]);

  useEffect(() => {
    if (!isAdmin) {
      setResetStatus(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await apiFetch<{
          enabled: boolean;
          requiresAdminKey: boolean;
          canExecuteFromUi: boolean;
        }>("/validations/admin/reset-status", { method: "GET" });
        if (cancelled) return;
        setResetStatus(status);
      } catch {
        if (cancelled) return;
        setResetStatus({ enabled: false, requiresAdminKey: false, canExecuteFromUi: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const handleResetValidationData = async () => {
    const confirmed = window.confirm(
      "Esto eliminará historial, consumos, idempotencia y locator tickets. ¿Seguro que quieres continuar?",
    );
    if (!confirmed) return;

    setIsResetting(true);
    setResetError(null);
    setResetMessage(null);

    try {
      const response = await apiFetch<{
        ok: boolean;
        deleted: {
          validations: number;
          validatedTicketConsumptions: number;
          validationIdempotency: number;
          locatorTickets: number;
        };
      }>("/validations/admin/reset", { method: "POST" });

      setResetMessage(
        `Deleted: validations=${response.deleted.validations}, consumptions=${response.deleted.validatedTicketConsumptions}, idempotency=${response.deleted.validationIdempotency}, locatorTickets=${response.deleted.locatorTickets}`,
      );
      setResetConfirmation("");
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Could not reset validation data.");
    } finally {
      setIsResetting(false);
    }
  };

  const resetPhraseOk = resetConfirmation.trim().toUpperCase() === RESET_CONFIRMATION_TEXT;

  return (
    <main className="page">
      <BrandBar />
      <header className="topbar">
        <h1>Settings</h1>
        <nav className="nav-inline">
          <NavLink to="/scan" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Escanear
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Historial
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin/live" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
              Monitor vivo
            </NavLink>
          ) : null}
        </nav>
      </header>

      <section className="card">
        <p>
          <strong>Device ID:</strong> {getDeviceId()}
        </p>
        <button type="button" onClick={logout}>
          Cerrar sesión
        </button>
        {isAdmin && resetStatus?.enabled && resetStatus.canExecuteFromUi ? (
          <>
            <p>
              Acción sensible. Para habilitar el borrado escribe <strong>{RESET_CONFIRMATION_TEXT}</strong>.
            </p>
            <input
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder={RESET_CONFIRMATION_TEXT}
            />
            <button
              type="button"
              onClick={() => void handleResetValidationData()}
              disabled={isResetting || !resetPhraseOk}
            >
              {isResetting ? "Resetting..." : "Reset validation tables"}
            </button>
            {resetMessage ? <p>{resetMessage}</p> : null}
            {resetError ? <p className="text-error">{resetError}</p> : null}
          </>
        ) : null}
        {isAdmin && resetStatus && (!resetStatus.enabled || !resetStatus.canExecuteFromUi) ? (
          <p>Reset de validaciones deshabilitado en UI. Si hace falta, ejecútalo solo desde backend con control adicional.</p>
        ) : null}
      </section>
    </main>
  );
}
