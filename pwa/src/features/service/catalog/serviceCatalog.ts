import type { BusOption, DepartureOption, RouteOption } from "@/types/service";
import { apiFetch } from "@/lib/apiClient";
import {
  queryBusesFromTicketing,
  queryDeparturesFromTicketing,
  queryItinerariesFromTicketing,
} from "@/features/service/catalog/ticketingQueries";

const USE_TICKETING_DB = false;
const USE_API_SERVICE_CATALOG = true;
const FAKE_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FAKE_ITINERARIES: RouteOption[] = [
  { itineraryId: "ITI-001", label: "Linea Centro -> Norte" },
  { itineraryId: "ITI-002", label: "Linea Norte -> Aeropuerto" },
  { itineraryId: "ITI-003", label: "Linea Sur -> Terminal" },
];

const FAKE_DEPARTURES: DepartureOption[] = [
  { departureId: "DEP-1001", itineraryId: "ITI-001", date: "2026-02-19", time: "08:15", timeLabel: "08:15" },
  { departureId: "DEP-1002", itineraryId: "ITI-001", date: "2026-02-19", time: "10:00", timeLabel: "10:00" },
  { departureId: "DEP-2001", itineraryId: "ITI-002", date: "2026-02-19", time: "09:05", timeLabel: "09:05" },
  { departureId: "DEP-3001", itineraryId: "ITI-003", date: "2026-02-19", time: "07:45", timeLabel: "07:45" },
];

const FAKE_BUSES: BusOption[] = [
  { busNumber: "101", label: "Bus 101" },
  { busNumber: "207", label: "Bus 207" },
  { busNumber: "315", label: "Bus 315" },
];

function sortByTimeAsc(a: DepartureOption, b: DepartureOption): number {
  return a.time.localeCompare(b.time);
}

function fromYYYYMMDDToHyphenDate(dateYYYYMMDD: string): string {
  if (dateYYYYMMDD.length !== 8) return dateYYYYMMDD;
  return `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`;
}

export async function listItineraries(dateYYYYMMDD: string): Promise<RouteOption[]> {
  if (USE_API_SERVICE_CATALOG) {
    try {
      return await apiFetch<RouteOption[]>(`/service-catalog/itineraries?date=${dateYYYYMMDD}`, { method: "GET" });
    } catch {
      // Fallback local para no bloquear flujo en desarrollo sin API disponible.
    }
  }

  /**
   * TODO(TICKETING_DB):
   * Reemplazar esta implementacion fake por consulta real a BBDD ticketing.
   * Ejemplo SQL (no implementar aqui):
   * SELECT itinerary_id AS itineraryId, label
   * FROM ticketing.itineraries
   * WHERE operation_date = :dateYYYYMMDD
   * ORDER BY label ASC;
   * IMPORTANTE: mantener la forma de RouteOption.
   */
  if (USE_TICKETING_DB) {
    return queryItinerariesFromTicketing(dateYYYYMMDD);
  }

  await sleep(FAKE_DELAY_MS);
  return [...FAKE_ITINERARIES];
}

export async function listDepartures(itineraryId: string, dateYYYYMMDD: string): Promise<DepartureOption[]> {
  if (USE_API_SERVICE_CATALOG) {
    try {
      return await apiFetch<DepartureOption[]>(
        `/service-catalog/departures?itineraryId=${encodeURIComponent(itineraryId)}&date=${dateYYYYMMDD}`,
        { method: "GET" },
      );
    } catch {
      // Fallback local para no bloquear flujo en desarrollo sin API disponible.
    }
  }

  /**
   * TODO(TICKETING_DB):
   * Reemplazar esta implementacion fake por consulta real a BBDD ticketing.
   * Ejemplo SQL (no implementar aqui):
   * SELECT departure_id AS departureId, itinerary_id AS itineraryId, departure_date AS date,
   *        departure_time AS time, TO_CHAR(departure_time, 'HH24:MI') AS timeLabel
   * FROM ticketing.departures
   * WHERE itinerary_id = :itineraryId AND operation_date = :dateYYYYMMDD
   * ORDER BY departure_time ASC;
   * IMPORTANTE: mantener la forma de DepartureOption.
   */
  if (USE_TICKETING_DB) {
    return queryDeparturesFromTicketing(itineraryId, dateYYYYMMDD);
  }

  await sleep(FAKE_DELAY_MS);
  const dateWithHyphen = fromYYYYMMDDToHyphenDate(dateYYYYMMDD);

  return FAKE_DEPARTURES.filter((departure) => {
    if (departure.itineraryId !== itineraryId) return false;
    if (dateWithHyphen && departure.date !== dateWithHyphen) return false;
    return true;
  }).sort(sortByTimeAsc);
}

export async function listBuses(): Promise<BusOption[]> {
  if (USE_API_SERVICE_CATALOG) {
    try {
      return await apiFetch<BusOption[]>("/service-catalog/buses", { method: "GET" });
    } catch {
      // Fallback local para no bloquear flujo en desarrollo sin API disponible.
    }
  }

  /**
   * TODO(TICKETING_DB):
   * Reemplazar esta implementacion fake por consulta real a BBDD ticketing.
   * Ejemplo SQL (no implementar aqui):
   * SELECT bus_number AS busNumber, display_name AS label
   * FROM ticketing.buses
   * WHERE active = TRUE
   * ORDER BY bus_number ASC;
   * IMPORTANTE: mantener la forma de BusOption.
   */
  if (USE_TICKETING_DB) {
    return queryBusesFromTicketing();
  }

  await sleep(FAKE_DELAY_MS);
  return [...FAKE_BUSES];
}
