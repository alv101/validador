import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useActiveService } from "@/features/service/ActiveServiceContext";
import { listBuses, listDepartures, listItineraries } from "@/features/service/catalog/serviceCatalog";
import { toYYYYMMDD, toYYYYMMDDWithHyphen } from "@/features/service/dateUtils";
import type { BusOption, DepartureOption, RouteOption } from "@/types/service";
import { BrandBar } from "@/components/BrandBar";

type CatalogState = {
  itineraries: RouteOption[];
  departures: DepartureOption[];
  buses: BusOption[];
};

const EMPTY_CATALOG: CatalogState = {
  itineraries: [],
  departures: [],
  buses: [],
};

const WINDOW_PAST_MINUTES = 30;
const WINDOW_FUTURE_HOURS = 1;

function sortDeparturesByTimeAsc(items: DepartureOption[]): DepartureOption[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time));
}

function parseDepartureLocalDateTime(item: DepartureOption): Date | null {
  const [year, month, day] = item.date.split("-").map(Number);
  const [hours, minutes] = item.time.split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function filterDeparturesByCurrentTimeWindow(items: DepartureOption[], now: Date): DepartureOption[] {
  const windowStart = new Date(now.getTime() - WINDOW_PAST_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + WINDOW_FUTURE_HOURS * 60 * 60 * 1000);

  return items.filter((item) => {
    const departureAt = parseDepartureLocalDateTime(item);
    if (!departureAt) return false;
    return departureAt >= windowStart && departureAt <= windowEnd;
  });
}

export function ServiceSelectPage() {
  const navigate = useNavigate();
  const { setActiveService, activeService } = useActiveService();

  const [catalog, setCatalog] = useState<CatalogState>(EMPTY_CATALOG);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeWindowInfo, setTimeWindowInfo] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const queryDateYYYYMMDD = useMemo(() => toYYYYMMDD(today), [today]);
  const uiDateYYYYMMDD = useMemo(() => toYYYYMMDDWithHyphen(today), [today]);

  const [selectedItineraryId, setSelectedItineraryId] = useState<string>("");
  const [selectedDepartureId, setSelectedDepartureId] = useState<string>("");
  const [selectedBusNumber, setSelectedBusNumber] = useState<string>(activeService?.busNumber ?? "");

  const selectedItinerary = useMemo(
    () => catalog.itineraries.find((item) => item.itineraryId === selectedItineraryId) ?? null,
    [catalog.itineraries, selectedItineraryId],
  );

  const selectedDeparture = useMemo(
    () => catalog.departures.find((item) => item.departureId === selectedDepartureId) ?? null,
    [catalog.departures, selectedDepartureId],
  );

  const loadDepartures = useCallback(
    async (itineraryId: string) => {
      setLoadingDepartures(true);
      setLoadError(null);
      try {
        const now = new Date();
        const departures = await listDepartures(itineraryId, queryDateYYYYMMDD);
        const sorted = sortDeparturesByTimeAsc(departures);
        const filtered = filterDeparturesByCurrentTimeWindow(sorted, now);
        const visible = filtered.length > 0 ? filtered : sorted;

        setCatalog((prev) => ({ ...prev, departures: visible }));
        setSelectedDepartureId(visible[0]?.departureId ?? "");
        setTimeWindowInfo(
          filtered.length > 0
            ? `Mostrando salidas entre ${WINDOW_PAST_MINUTES} min antes y ${WINDOW_FUTURE_HOURS} h despues de la hora actual.`
            : "No hay salidas cercanas a la hora actual. Mostrando todas las salidas del dia.",
        );
      } catch {
        setCatalog((prev) => ({ ...prev, departures: [] }));
        setSelectedDepartureId("");
        setLoadError("No se pudieron cargar las salidas. Reintenta.");
        setTimeWindowInfo(null);
      } finally {
        setLoadingDepartures(false);
      }
    },
    [queryDateYYYYMMDD],
  );

  const loadInitialCatalog = useCallback(async () => {
    setLoadingInitial(true);
    setLoadError(null);

    try {
      const now = new Date();
      const [itineraries, buses] = await Promise.all([listItineraries(queryDateYYYYMMDD), listBuses()]);
      const departuresPerItinerary = await Promise.all(
        itineraries.map(async (itinerary) => {
          try {
            const departures = await listDepartures(itinerary.itineraryId, queryDateYYYYMMDD);
            const sorted = sortDeparturesByTimeAsc(departures);
            const filtered = filterDeparturesByCurrentTimeWindow(sorted, now);
            return { itineraryId: itinerary.itineraryId, sorted, filtered };
          } catch {
            return { itineraryId: itinerary.itineraryId, sorted: [] as DepartureOption[], filtered: [] as DepartureOption[] };
          }
        }),
      );

      const filteredItineraryIds = new Set(
        departuresPerItinerary.filter((entry) => entry.filtered.length > 0).map((entry) => entry.itineraryId),
      );
      const visibleItineraries =
        filteredItineraryIds.size > 0
          ? itineraries.filter((itinerary) => filteredItineraryIds.has(itinerary.itineraryId))
          : itineraries;

      const initialItineraryId = visibleItineraries[0]?.itineraryId ?? "";
      const initialBusNumber = buses[0]?.busNumber ?? "";

      setCatalog({ itineraries: visibleItineraries, departures: [], buses });
      setSelectedItineraryId(initialItineraryId);
      setSelectedBusNumber((current) => current || initialBusNumber);

      if (initialItineraryId) {
        const selectedEntry = departuresPerItinerary.find((entry) => entry.itineraryId === initialItineraryId);
        const visibleDepartures =
          selectedEntry && selectedEntry.filtered.length > 0 ? selectedEntry.filtered : selectedEntry?.sorted ?? [];

        setCatalog((prev) => ({ ...prev, departures: visibleDepartures }));
        setSelectedDepartureId(visibleDepartures[0]?.departureId ?? "");
        setTimeWindowInfo(
          filteredItineraryIds.size > 0
            ? `Mostrando trayectos y salidas entre ${WINDOW_PAST_MINUTES} min antes y ${WINDOW_FUTURE_HOURS} h despues de la hora actual.`
            : "No hay servicios cercanos a la hora actual. Mostrando todos los servicios del dia.",
        );
      } else {
        setCatalog((prev) => ({ ...prev, departures: [] }));
        setSelectedDepartureId("");
        setTimeWindowInfo(null);
      }
    } catch {
      setCatalog(EMPTY_CATALOG);
      setSelectedItineraryId("");
      setSelectedDepartureId("");
      setLoadError("No se pudo cargar el catalogo de servicio.");
      setTimeWindowInfo(null);
    } finally {
      setLoadingInitial(false);
    }
  }, [queryDateYYYYMMDD]);

  useEffect(() => {
    void loadInitialCatalog();
  }, [loadInitialCatalog]);

  const handleItineraryChange = async (itineraryId: string) => {
    setSelectedItineraryId(itineraryId);
    setSelectedDepartureId("");

    if (!itineraryId) {
      setCatalog((prev) => ({ ...prev, departures: [] }));
      return;
    }

    await loadDepartures(itineraryId);
  };

  const canSubmit = Boolean(selectedItinerary && selectedDeparture && selectedBusNumber.trim());

  const handleSubmit = () => {
    if (!selectedItinerary || !selectedDeparture) return;

    setActiveService({
      itineraryId: selectedItinerary.itineraryId,
      itineraryLabel: selectedItinerary.label,
      departureId: selectedDeparture.departureId,
      departureDate: selectedDeparture.date,
      departureTime: selectedDeparture.time,
      busNumber: selectedBusNumber.trim(),
      selectedAt: new Date().toISOString(),
    });

    navigate("/scan", { replace: true });
  };

  return (
    <main className="page">
      <BrandBar />
      <header className="topbar">
        <h1>Seleccionar servicio</h1>
        <nav className="nav-inline">
          <NavLink to="/scan" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Escanear
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Historial
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
            Settings
          </NavLink>
        </nav>
      </header>

      <p>Fecha operativa: {uiDateYYYYMMDD} (query ticketing: {queryDateYYYYMMDD})</p>

      {loadingInitial ? <p>Cargando catalogo de servicio...</p> : null}
      {loadError ? <p className="text-error">{loadError}</p> : null}
      {timeWindowInfo ? <p>{timeWindowInfo}</p> : null}

      <section className="card stack service-card">
        <label className="stack">
          Trayecto
          <select
            disabled={loadingInitial || catalog.itineraries.length === 0}
            value={selectedItineraryId}
            onChange={(event) => void handleItineraryChange(event.target.value)}
          >
            {catalog.itineraries.length === 0 ? <option value="">Sin itinerarios</option> : null}
            {catalog.itineraries.map((itinerary) => (
              <option key={itinerary.itineraryId} value={itinerary.itineraryId}>
                {itinerary.label}
              </option>
            ))}
          </select>
        </label>

        <label className="stack service-field service-field--narrow">
          Salida
          <select
            className="service-select--narrow"
            disabled={loadingInitial || loadingDepartures || catalog.departures.length === 0}
            value={selectedDepartureId}
            onChange={(event) => setSelectedDepartureId(event.target.value)}
          >
            {loadingDepartures ? <option value="">Cargando salidas...</option> : null}
            {!loadingDepartures && catalog.departures.length === 0 ? <option value="">Sin salidas</option> : null}
            {catalog.departures.map((departure) => (
              <option key={departure.departureId} value={departure.departureId}>
                {departure.timeLabel} ({departure.date})
              </option>
            ))}
          </select>
        </label>

        <label className="stack service-field service-field--narrow">
          Bus
          {catalog.buses.length > 0 ? (
            <select
              className="service-select--narrow"
              value={selectedBusNumber}
              onChange={(event) => setSelectedBusNumber(event.target.value)}
            >
              {catalog.buses.map((bus) => (
                <option key={bus.busNumber} value={bus.busNumber}>
                  {bus.label ?? `Bus ${bus.busNumber}`}
                </option>
              ))}
            </select>
          ) : (
            <input
              placeholder="Numero de bus"
              value={selectedBusNumber}
              onChange={(event) => setSelectedBusNumber(event.target.value)}
            />
          )}
        </label>

        <p className="banner">
          <strong>serviceId (departureId):</strong> {selectedDepartureId || "Sin salida seleccionada"}
        </p>
      </section>

      <section className="actions">
        <button type="button" disabled={!canSubmit || loadingInitial || loadingDepartures} onClick={handleSubmit}>
          Empezar validacion
        </button>
        <button type="button" onClick={() => void loadInitialCatalog()} style={{ marginLeft: 8 }}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
