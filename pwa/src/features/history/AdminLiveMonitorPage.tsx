import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "@/lib/apiClient";

const REFRESH_MS = 2000;

export function AdminLiveMonitorPage() {
  const [snapshot, setSnapshot] = useState<{
    limit: number;
    tables: {
      validations: Array<Record<string, unknown>>;
      validated_ticket_consumptions: Array<Record<string, unknown>>;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{
        limit: number;
        tables: {
          validations: Array<Record<string, unknown>>;
          validated_ticket_consumptions: Array<Record<string, unknown>>;
        };
      }>("/validations/admin/tables?limit=50", { method: "GET" });
      setSnapshot(data);
      setLastRefreshAt(new Date().toISOString());
      setError(null);
    } catch {
      setError("No se pudo actualizar el monitor en vivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <main className="page" style={{ maxWidth: "min(98vw, 1800px)" }}>
      <header className="topbar">
        <h1>Monitor validaciones (vivo)</h1>
        <nav className="nav-inline">
          <Link to="/scan">Escanear</Link>
          <Link to="/history">Historial</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <p>Tablas Postgres de validaciones (snapshot en vivo).</p>
      <p>Límite por tabla: {snapshot?.limit ?? 50}</p>
      <p>Auto refresh: cada {REFRESH_MS / 1000}s</p>
      <p>Última actualización: {lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString() : "-"}</p>

      {loading ? <p>Cargando monitor en vivo...</p> : null}
      {error ? <p className="text-error">{error}</p> : null}

      {snapshot ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <section className="card" style={{ width: "100%", maxWidth: "none" }}>
            <h2>validations ({snapshot.tables.validations.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>id</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>locator</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>service_id</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>result</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>reason</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>ref</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.tables.validations.map((row) => (
                    <tr key={String(row.id)}>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.id ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.locator ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.service_id ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.result ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.reason ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.ref ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>
                        {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ width: "100%", maxWidth: "none" }}>
            <h2>validated_ticket_consumptions ({snapshot.tables.validated_ticket_consumptions.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>id</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>ticket_key</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>locator</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>service_id</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>validated_by</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>validated_dni</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px", whiteSpace: "nowrap" }}>created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.tables.validated_ticket_consumptions.map((row) => (
                    <tr key={String(row.id)}>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.id ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.ticket_key ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.locator ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.service_id ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.validated_by ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>{String(row.validated_dni ?? "-")}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px", whiteSpace: "nowrap" }}>
                        {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
