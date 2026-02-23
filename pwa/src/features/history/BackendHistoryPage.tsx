import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { apiFetch } from "@/lib/apiClient";
import { toYYYYMMDDWithHyphen } from "@/features/service/dateUtils";
import type { BackendHistoryResponse } from "@/types/backendHistory";
import type { ValidationResult } from "@/types/validations";
import { BrandBar } from "@/components/BrandBar";

type OutcomeFilter = "ALL" | ValidationResult;

export function BackendHistoryPage() {
  const [items, setItems] = useState<BackendHistoryResponse["items"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OutcomeFilter>("ALL");
  const [serviceIdQuery, setServiceIdQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(() => toYYYYMMDDWithHyphen(new Date()));
  const [dateTo, setDateTo] = useState(() => toYYYYMMDDWithHyphen(new Date()));
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedFilter, setAppliedFilter] = useState<OutcomeFilter>("ALL");
  const [appliedServiceIdQuery, setAppliedServiceIdQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
      if (appliedQuery.trim()) {
        params.set("locator", appliedQuery.trim());
      }
      if (appliedServiceIdQuery.trim()) {
        params.set("serviceId", appliedServiceIdQuery.trim());
      }
      if (appliedFilter !== "ALL") {
        params.set("result", appliedFilter);
      }

      const data = await apiFetch<BackendHistoryResponse>(`/validations/history?${params.toString()}`, {
        method: "GET",
      });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("No se pudo cargar el historial del backend.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilter, appliedQuery, appliedServiceIdQuery, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="page">
      <BrandBar />
      <header className="topbar">
        <h1>Historial</h1>
        <nav className="nav-inline">
          <NavLink to="/scan" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Escanear
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Settings
          </NavLink>
        </nav>
      </header>

      <section className="actions history-filters">
        <input
          placeholder="Buscar por locator"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <input
          placeholder="Filtrar por serviceId"
          value={serviceIdQuery}
          onChange={(event) => setServiceIdQuery(event.target.value)}
        />
        <label className="stack">
          Desde
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="stack">
          Hasta
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <div className="history-filters__footer">
          <label className="stack">
            Resultado
            <select value={filter} onChange={(event) => setFilter(event.target.value as OutcomeFilter)}>
              <option value="ALL">Todos</option>
              <option value="VALID">VALID</option>
              <option value="INVALID">INVALID</option>
              <option value="DUPLICATE">DUPLICATE</option>
              <option value="ERROR">ERROR</option>
            </select>
          </label>
          <label className="stack">
            Lin/Pág
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setAppliedQuery(query);
              setAppliedServiceIdQuery(serviceIdQuery);
              setAppliedFilter(filter);
            }}
          >
            Aplicar
          </button>
        </div>
      </section>

      {loading ? <p>Cargando historial backend...</p> : null}
      {error ? <p className="text-error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p>No hay resultados para el filtro actual.</p> : null}

      <ul className="history-list">
        {items.map((entry) => (
          <li key={entry.id} className="history-item">
            <strong>{entry.result}</strong>
            <span>{entry.locator}</span>
            <span>{entry.serviceId}</span>
            <span>{entry.reason ?? "-"}</span>
            <span>{new Date(entry.createdAt).toLocaleString()}</span>
            <span>
              {entry.actor?.username ?? entry.actor?.userId ?? "-"}
              {entry.actor?.roles && entry.actor.roles.length > 0 ? ` (${entry.actor.roles.join(",")})` : ""}
            </span>
          </li>
        ))}
      </ul>

      <section className="actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Anterior
        </button>
        <span>
          Página {page} / {totalPages} · Total {total}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Siguiente
        </button>
      </section>
    </main>
  );
}
