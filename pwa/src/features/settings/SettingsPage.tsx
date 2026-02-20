import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { getDeviceId } from "@/lib/deviceId";

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
      "This will delete validation data (history, consumptions, idempotency, locator tickets). Continue?",
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
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Could not reset validation data.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <h1>Settings</h1>
        <nav className="nav-inline">
          <Link to="/scan">Escanear</Link>
          <Link to="/history">Historial backend</Link>
          {isAdmin ? <Link to="/admin/live">Monitor vivo</Link> : null}
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
            <button type="button" onClick={() => void handleResetValidationData()} disabled={isResetting}>
              {isResetting ? "Resetting..." : "Reset validation tables"}
            </button>
            {resetMessage ? <p>{resetMessage}</p> : null}
            {resetError ? <p className="text-error">{resetError}</p> : null}
          </>
        ) : null}
        {isAdmin && resetStatus && (!resetStatus.enabled || !resetStatus.canExecuteFromUi) ? (
          <p>Reset de validaciones deshabilitado en este entorno.</p>
        ) : null}
      </section>
    </main>
  );
}
