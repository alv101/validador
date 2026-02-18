import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getHistoryEntries } from "@/features/offlineQueue/db";
import type { HistoryEntry, ValidationOutcome } from "@/types/history";

type OutcomeFilter = "ALL" | "VALID" | "INVALID" | "DUPLICATE" | "OFFLINE";

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OutcomeFilter>("ALL");

  useEffect(() => {
    void getHistoryEntries().then(setEntries);
  }, []);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();

    return entries.filter((entry) => {
      if (filter !== "ALL" && entry.outcome !== filter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return entry.locator.toUpperCase().includes(normalizedQuery);
    });
  }, [entries, filter, query]);

  const renderOutcomeLabel = (outcome: ValidationOutcome): string => outcome;

  return (
    <main className="page">
      <header className="topbar">
        <h1>Historial local</h1>
        <nav className="nav-inline">
          <Link to="/scan">Escanear</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <section className="actions stack" style={{ maxWidth: 360 }}>
        <input
          placeholder="Buscar por locator"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value as OutcomeFilter)}>
          <option value="ALL">Todos</option>
          <option value="VALID">VALID</option>
          <option value="INVALID">INVALID</option>
          <option value="DUPLICATE">DUPLICATE</option>
          <option value="OFFLINE">OFFLINE</option>
        </select>
      </section>

      {visibleEntries.length === 0 ? <p>No hay resultados para el filtro actual.</p> : null}

      <ul className="history-list">
        {visibleEntries.map((entry) => (
          <li key={entry.id} className="history-item">
            <strong>{renderOutcomeLabel(entry.outcome)}</strong>
            <span>{entry.locator}</span>
            <span>{entry.serviceId}</span>
            <span>{new Date(entry.at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
