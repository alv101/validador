import { BadRequestException, Injectable } from '@nestjs/common';
import { TicketingSqlServerService } from './ticketing-sqlserver.service';

type RouteOption = { itineraryId: string; label: string };

type DepartureOption = {
  departureId: string;
  itineraryId: string;
  date: string;
  time: string;
  timeLabel: string;
};

type BusOption = { busNumber: string; label?: string };

type TicketingCatalogMode = 'fake' | 'sqlserver';

type ItineraryRow = {
  itineraryId?: unknown;
  label?: unknown;
};

type DepartureRow = {
  departureId?: unknown;
  itineraryId?: unknown;
  date?: unknown;
  time?: unknown;
  timeLabel?: unknown;
};

type BusRow = {
  busNumber?: unknown;
  label?: unknown;
};

const SQL_ITINERARIES = `

SELECT DISTINCT
  d.itinerario as itineraryId,iti_descripcion as label
FROM (
  SELECT itinerario
  FROM  [192.168.33.15\\PESADB].[SAE_TAQUILLA].[dbo].[PS_WEBORIGENDESTINO]
  WHERE fecha = cast(floor(cast(getdate() as float)) as datetime)
    AND tipo  = 'Web'
) AS d
LEFT JOIN  [192.168.33.15\\PESADB].[SAE_LOCALIZA].[dbo].[cvi_itinerarios] AS i
  ON d.itinerario = i.iti_id  
ORDER BY iti_descripcion
`;

const SQL_DEPARTURES = `
/*
 * TODO(TICKETING_DB): ORIGEN HORARIOS/SALIDAS
 * Reemplazar esta query de ejemplo por la consulta real en SQL Server 2005.
 * Debe devolver aliases exactos: departureId, itineraryId, date, time, timeLabel
 * Params disponibles: @itineraryId (VARCHAR), @dateYYYYMMDD (VARCHAR 8)

SELECT TOP 0
  CAST(NULL AS VARCHAR(64)) AS departureId,
  CAST(NULL AS VARCHAR(64)) AS itineraryId,
  CAST(NULL AS VARCHAR(10)) AS date,
  CAST(NULL AS VARCHAR(5)) AS time,
  CAST(NULL AS VARCHAR(5)) AS timeLabel
 
SELECT DISTINCT
   CAST(d.itinerario AS VARCHAR(64)) + '_' + CONVERT(VARCHAR(8), d.fecha, 112) + '_' +
    LEFT(CONVERT(VARCHAR(8), d.hora, 108), 5) AS departureId,
  CAST(d.itinerario AS VARCHAR(64)) AS itineraryId,
  CONVERT(VARCHAR(10), d.fecha, 120) AS date,              -- YYYY-MM-DD
  LEFT(CONVERT(VARCHAR(8), d.hora, 108), 5) AS time,       -- HH:mm
  LEFT(CONVERT(VARCHAR(8), d.hora, 108), 5) AS timeLabel   -- HH:mm
FROM [192.168.33.15\\PESADB].[SAE_TAQUILLA].[dbo].[PS_WEBORIGENDESTINO] d
  WHERE CONVERT(VARCHAR(8), d.fecha, 112) = @dateYYYYMMDD
--  WHERE fecha = @dateYYYYMMDD
  AND d.tipo = 'Web'
  AND CAST(d.itinerario AS VARCHAR(64)) = @itineraryId
  AND CAST(CONVERT(VARCHAR(10), d.fecha, 120) + ' ' + CONVERT(VARCHAR(8), d.hora, 108) AS DATETIME)
      > DATEADD(MINUTE, -15, GETDATE())
ORDER BY time ASC
*/

WITH base AS (
    SELECT
        d.servicio,
        d.itinerario,
        d.fecha,
        d.hora,
        ROW_NUMBER() OVER (
            PARTITION BY d.servicio
            ORDER BY d.hora ASC
        ) AS rn
    FROM [192.168.33.15\\PESADB].[SAE_TAQUILLA].[dbo].[PS_WEBORIGENDESTINO] d
    WHERE
        d.tipo = 'Web'
        AND d.itinerario =  @itineraryId
        -- filtro por fecha SIN convertir:
        AND d.fecha = @dateYYYYMMDD
)
SELECT
    servicio,
    CAST(itinerario AS varchar(64)) + '_' + CONVERT(char(8), fecha, 112) + '_' + LEFT(CONVERT(char(8), hora, 108), 5) + '_' + CAST(servicio AS varchar(64)) AS departureId,
    CAST(itinerario AS varchar(64)) AS itineraryId,
    CONVERT(char(10), fecha, 120) AS [date],
    LEFT(CONVERT(char(8), hora, 108), 5) AS [time],
    LEFT(CONVERT(char(8), hora, 108), 5) AS timeLabel
FROM base
WHERE rn = 1
AND 
            CAST(fecha AS datetime) + CAST(hora AS datetime)
         > DATEADD(MINUTE, -15, GETDATE())
ORDER BY [time];


`;

const SQL_BUSES = `
/*
 * TODO(TICKETING_DB): ORIGEN BUSES
 * Reemplazar esta query de ejemplo por la consulta real en SQL Server 2005.
 * Debe devolver aliases exactos: busNumber, label
 */
SELECT TOP 0
  CAST(NULL AS VARCHAR(32)) AS busNumber,
  CAST(NULL AS VARCHAR(255)) AS label
`;

@Injectable()
export class ServiceCatalogService {
  // `fake` mantiene la app operativa; cambia a `sqlserver` cuando implementes consultas reales.
  private readonly mode: TicketingCatalogMode =
    process.env.TICKETING_CATALOG_MODE === 'sqlserver' ? 'sqlserver' : 'fake';

  constructor(private readonly ticketingSqlServer: TicketingSqlServerService) {}

  async listItineraries(dateYYYYMMDD: string): Promise<RouteOption[]> {
    this.assertDateYYYYMMDD(dateYYYYMMDD);

    if (this.mode === 'fake') {
      return this.listItinerariesFake();
    }

    return this.queryItinerariesFromTicketingSqlServer(dateYYYYMMDD);
  }

  async listDepartures(itineraryId: string, dateYYYYMMDD: string): Promise<DepartureOption[]> {
    const normalizedItineraryId = itineraryId?.trim();
    if (!normalizedItineraryId) {
      throw new BadRequestException('itineraryId is required');
    }

    this.assertDateYYYYMMDD(dateYYYYMMDD);

    if (this.mode === 'fake') {
      return this.listDeparturesFake(normalizedItineraryId, dateYYYYMMDD);
    }

    return this.queryDeparturesFromTicketingSqlServer(normalizedItineraryId, dateYYYYMMDD);
  }

  async listBuses(): Promise<BusOption[]> {
    if (this.mode === 'fake') {
      return this.listBusesFake();
    }

    return this.queryBusesFromTicketingSqlServer();
  }

  private listItinerariesFake(): RouteOption[] {
    return [
      { itineraryId: 'ITI-001', label: 'Linea Centro -> Norte' },
      { itineraryId: 'ITI-002', label: 'Linea Norte -> Aeropuerto' },
      { itineraryId: 'ITI-003', label: 'Linea Sur -> Terminal' },
    ];
  }

  private listDeparturesFake(itineraryId: string, dateYYYYMMDD: string): DepartureOption[] {
    const date = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`;

    const all: DepartureOption[] = [
      { departureId: 'DEP-1001', itineraryId: 'ITI-001', date, time: '08:15', timeLabel: '08:15' },
      { departureId: 'DEP-1002', itineraryId: 'ITI-001', date, time: '10:00', timeLabel: '10:00' },
      { departureId: 'DEP-2001', itineraryId: 'ITI-002', date, time: '09:05', timeLabel: '09:05' },
      { departureId: 'DEP-3001', itineraryId: 'ITI-003', date, time: '07:45', timeLabel: '07:45' },
    ];

    return all.filter((item) => item.itineraryId === itineraryId).sort((a, b) => a.time.localeCompare(b.time));
  }

  private listBusesFake(): BusOption[] {
    return [
      { busNumber: '101', label: 'Bus 101' },
      { busNumber: '207', label: 'Bus 207' },
      { busNumber: '315', label: 'Bus 315' },
    ];
  }

  private async queryItinerariesFromTicketingSqlServer(dateYYYYMMDD: string): Promise<RouteOption[]> {
    const rows = await this.ticketingSqlServer.query<ItineraryRow>(SQL_ITINERARIES, { dateYYYYMMDD });

    return rows
      .map((row) => ({
        itineraryId: this.normalizeString(row.itineraryId),
        label: this.normalizeString(row.label),
      }))
      .filter((row) => row.itineraryId.length > 0)
      .map((row) => ({
        itineraryId: row.itineraryId,
        label: row.label || row.itineraryId,
      }));
  }

  private async queryDeparturesFromTicketingSqlServer(
    itineraryId: string,
    dateYYYYMMDD: string,
  ): Promise<DepartureOption[]> {
    const rows = await this.ticketingSqlServer.query<DepartureRow>(SQL_DEPARTURES, {
      itineraryId,
      dateYYYYMMDD,
    });

    return rows
      .map((row) => ({
        departureId: this.normalizeString(row.departureId),
        itineraryId: this.normalizeString(row.itineraryId),
        date: this.normalizeString(row.date),
        time: this.normalizeString(row.time),
        timeLabel: this.normalizeString(row.timeLabel),
      }))
      .filter((row) => row.departureId && row.itineraryId && row.date && row.time)
      .map((row) => ({
        departureId: row.departureId,
        itineraryId: row.itineraryId,
        date: row.date,
        time: row.time,
        timeLabel: row.timeLabel || row.time,
      }));
  }

  private async queryBusesFromTicketingSqlServer(): Promise<BusOption[]> {
    const rows = await this.ticketingSqlServer.query<BusRow>(SQL_BUSES);

    return rows
      .map((row) => ({
        busNumber: this.normalizeString(row.busNumber),
        label: this.normalizeString(row.label),
      }))
      .filter((row) => row.busNumber.length > 0)
      .map((row) => ({
        busNumber: row.busNumber,
        label: row.label || undefined,
      }));
  }

  private normalizeString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }

  private assertDateYYYYMMDD(dateYYYYMMDD: string): void {
    if (!/^\d{8}$/.test(dateYYYYMMDD)) {
      throw new BadRequestException('date must be YYYYMMDD');
    }
  }
}
