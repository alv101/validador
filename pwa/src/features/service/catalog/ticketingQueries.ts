/**
 * TODO(TICKETING_DB):
 * Reemplazar stubs por consultas reales a la BBDD de ticketing.
 * Mantener las formas RouteOption/DepartureOption/BusOption desde serviceCatalog.
 */
export async function queryItinerariesFromTicketing(_dateYYYYMMDD: string): Promise<never> {
  throw new Error("TODO(TICKETING_DB): Implementar queryItinerariesFromTicketing");
}

export async function queryDeparturesFromTicketing(
  _itineraryId: string,
  _dateYYYYMMDD: string,
): Promise<never> {
  throw new Error("TODO(TICKETING_DB): Implementar queryDeparturesFromTicketing");
}

export async function queryBusesFromTicketing(): Promise<never> {
  throw new Error("TODO(TICKETING_DB): Implementar queryBusesFromTicketing");
}
