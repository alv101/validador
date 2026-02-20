import { Injectable } from '@nestjs/common';
import { TicketingSqlServerService } from './ticketing-sqlserver.service';
import { TicketingAdapter, TicketingCheckResult, TicketingLocatorCandidate } from './ticketing.adapter';

type CheckRow = {
  ok?: unknown;
  reason?: unknown;
  ref?: unknown;
};

type ListLocatorCandidatesRow = {
  ticketKey?: unknown;
  sequence?: unknown;
  dni?: unknown;
  ref?: unknown;
};

const SQL_CHECK = `
/*
 * TODO(TICKETING_DB): VALIDACION BASICA LOCATOR + SERVICE
 * Reemplazar por query real en SQL Server 2005.
 * Debe devolver 1 fila con aliases exactos:
 *   ok (bit/int/string bool), reason (nullable), ref (nullable)
 * Params:
 *   @locator (VARCHAR)
 *   @serviceId (VARCHAR)
 */
SELECT TOP 0
  CAST(NULL AS INT) AS ok,
  CAST(NULL AS VARCHAR(64)) AS reason,
  CAST(NULL AS VARCHAR(128)) AS ref
`;

const SQL_LIST_LOCATOR_CANDIDATES = `
/*
 * TODO(TICKETING_DB): LISTA DE CANDIDATOS LOCATOR + SERVICE (READ-ONLY)
 * Reemplazar por query real en SQL Server 2005 (sin UPDATE/DELETE).
 * Debe devolver N filas con aliases exactos:
 *   ticketKey (string unico por ticket)
 *   sequence (nullable int; orden de consumo)
 *   dni (nullable; para validacion por DNI)
 *   ref (nullable; referencia adicional)
 * Params:
 *   @locator (VARCHAR)
 *   @dni (VARCHAR)
 *   @serviceId (VARCHAR nullable)

SELECT TOP 0
  CAST(NULL AS VARCHAR(128)) AS ticketKey,
  CAST(NULL AS INT) AS sequence,
  CAST(NULL AS VARCHAR(32)) AS dni,
  CAST(NULL AS VARCHAR(128)) AS ref
 */
DECLARE @p1 INT, @p2 INT;
DECLARE @svcItinerary VARCHAR(64);
DECLARE @svcDate VARCHAR(8);
DECLARE @svcTime VARCHAR(5);


SET @p1 = CHARINDEX('_', @serviceId);
SET @p2 = CHARINDEX('_', @serviceId, @p1 + 1);

SET @svcItinerary = CASE WHEN @p1 > 0 THEN LEFT(@serviceId, @p1 - 1) ELSE NULL END;
SET @svcDate = CASE WHEN @p1 > 0 AND @p2 > @p1 THEN SUBSTRING(@serviceId, @p1 + 1, @p2 - @p1 - 1) ELSE NULL END;
SET @svcTime = CASE WHEN @p2 > 0 THEN SUBSTRING(@serviceId, @p2 + 1, 5) ELSE NULL END;

SELECT
  ROW_NUMBER() OVER (ORDER BY b.idbillete) AS sequence,
  CAST(b.idbillete AS VARCHAR(128)) AS ticketKey,
  UPPER(REPLACE(@dni, ' ', '')) AS dni,
  CAST(b.numero AS VARCHAR(128)) AS ref
FROM [192.168.33.15\\PESADB].[SAE_TAQUILLA].[dbo].[PS_BILLETES] b
WHERE b.buscador = @locator
  AND ISNULL(b.idtransaccion, '') <> ''
  AND b.anulado = 'N'
  AND (@svcDate IS NULL OR CONVERT(VARCHAR(8), b.fechaservicio, 112) = @svcDate)
  AND (@svcItinerary IS NULL OR CAST(b.itinerario AS VARCHAR(64)) = @svcItinerary)
  AND (@svcTime IS NULL OR LEFT(CONVERT(VARCHAR(8), b.horaservicio, 108), 5) = @svcTime)
ORDER BY b.idbillete ASC;


  `;

@Injectable()
export class TicketingSqlServerAdapter implements TicketingAdapter {
  constructor(private readonly sqlServer: TicketingSqlServerService) {}

  async check(locator: string, serviceId: string): Promise<TicketingCheckResult> {
    const rows = await this.sqlServer.query<CheckRow>(SQL_CHECK, {
      locator: locator.trim().toUpperCase(),
      serviceId: serviceId.trim(),
    });

    const row = rows[0];
    if (!row) {
      return {
        ok: false,
        reason: 'NOT_FOUND',
      };
    }

    return {
      ok: this.toBoolean(row.ok),
      reason: this.toStringOrUndefined(row.reason),
      ref: this.toStringOrUndefined(row.ref),
    };
  }

  async listLocatorCandidates(input: {
    locator: string;
    dni: string;
    serviceId: string | null;
  }): Promise<TicketingLocatorCandidate[]> {
    const rows = await this.sqlServer.query<ListLocatorCandidatesRow>(SQL_LIST_LOCATOR_CANDIDATES, {
      locator: input.locator.trim().toUpperCase(),
      dni: input.dni.trim().toUpperCase(),
      serviceId: input.serviceId,
    });

    return rows
      .map((row) => ({
        ticketKey: this.toStringOrUndefined(row.ticketKey) ?? '',
        sequence: this.toNumberOrUndefined(row.sequence),
        dni: this.toStringOrUndefined(row.dni),
        ref: this.toStringOrUndefined(row.ref),
      }))
      .filter((row) => row.ticketKey.length > 0);
  }

  private toStringOrUndefined(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const asString = String(value).trim();
    return asString.length > 0 ? asString : undefined;
  }

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : undefined;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'ok';
    }
    return false;
  }
}
