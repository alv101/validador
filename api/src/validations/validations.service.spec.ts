import { BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ValidationsService } from './validations.service';
import type { TicketingAdapter, TicketingLocatorCandidate } from './ticketing.adapter';

type ValidationInsertRow = {
  result: 'ERROR' | 'INVALID' | 'VALID' | 'DUPLICATE';
  created_at: Date;
  updated_at: Date;
};

type IdempotencyRow = {
  request_hash: string;
  response_json: unknown;
};

type ConsumptionRow = {
  ticket_key: string;
  locator: string;
  service_id: string | null;
  validated_by: string | null;
  validated_username: string | null;
  validated_roles: string | null;
  validated_dni: string | null;
  created_at: Date;
};

type QueryResult<T> = {
  rows: T[];
  rowCount?: number;
};

type TxSnapshot = {
  validations: ValidationInsertRow[];
  idempotency: Map<string, IdempotencyRow>;
  consumptions: ConsumptionRow[];
};

class FakePoolClient {
  constructor(private readonly db: FakeDbService) {}

  async query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    const safeParams = params ?? [];

    if (text.includes('/* validate-locator:idempotency-get */')) {
      const idempotencyKey = String(safeParams[0]);
      const found = this.db.idempotency.get(idempotencyKey);
      return { rows: found ? ([found] as unknown as T[]) : [] };
    }

    if (text.includes('/* validate-locator:idempotency-save */')) {
      const idempotencyKey = String(safeParams[0]);
      const requestHash = String(safeParams[1]);
      const responseJson = JSON.parse(String(safeParams[2]));

      if (this.db.idempotency.has(idempotencyKey)) {
        return { rows: [], rowCount: 0 };
      }

      this.db.idempotency.set(idempotencyKey, {
        request_hash: requestHash,
        response_json: responseJson,
      });
      return { rows: ([{ id: 1 }] as unknown as T[]), rowCount: 1 };
    }

    if (text.includes('FROM validated_ticket_consumptions') && text.includes('ticket_key = ANY')) {
      const keys = safeParams[0] as string[];

      if (text.includes('MAX(created_at) AS last_consumed_at')) {
        const rows = this.db.consumptions.filter((item) => keys.includes(item.ticket_key));
        const latest = rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null;
        return { rows: ([{ last_consumed_at: latest?.created_at ?? null }] as unknown as T[]) };
      }

      const rows = this.db.consumptions
        .filter((item) => keys.includes(item.ticket_key))
        .map((item) => ({ ticket_key: item.ticket_key }));
      return { rows: rows as unknown as T[] };
    }

    if (text.includes('INSERT INTO validated_ticket_consumptions')) {
      const ticketKey = String(safeParams[0]);
      const locator = String(safeParams[1]);
      const serviceId = safeParams[2] === null ? null : String(safeParams[2]);
      const validatedBy = safeParams[3] === null ? null : String(safeParams[3]);
      const validatedUsername = safeParams[4] === null ? null : String(safeParams[4]);
      const validatedRoles = safeParams[5] === null ? null : String(safeParams[5]);
      const validatedDni = safeParams[6] === null ? null : String(safeParams[6]);

      if (this.db.consumptions.some((item) => item.ticket_key === ticketKey)) {
        return { rows: [], rowCount: 0 };
      }

      this.db.consumptions.push({
        ticket_key: ticketKey,
        locator,
        service_id: serviceId,
        validated_by: validatedBy,
        validated_username: validatedUsername,
        validated_roles: validatedRoles,
        validated_dni: validatedDni,
        created_at: this.db.nextNow(),
      });
      return { rows: [] as T[], rowCount: 1 };
    }

    if (text.includes('INSERT INTO validations')) {
      const result = String(safeParams[2]) as ValidationInsertRow['result'];
      const now = this.db.nextNow();
      const row: ValidationInsertRow = {
        result,
        created_at: now,
        updated_at: now,
      };
      this.db.validations.push(row);
      return { rows: ([row] as unknown as T[]) };
    }

    throw new Error(`Unhandled query: ${text}`);
  }
}

class FakeDbService {
  validations: ValidationInsertRow[] = [];
  idempotency = new Map<string, IdempotencyRow>();
  consumptions: ConsumptionRow[] = [];

  private nowCursor = new Date('2026-02-18T10:00:00.000Z').getTime();
  private txQueue: Promise<void> = Promise.resolve();

  nextNow(): Date {
    this.nowCursor += 1000;
    return new Date(this.nowCursor);
  }

  async withTransaction<T>(fn: (client: FakePoolClient) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const snapshot = this.snapshot();
      try {
        return await fn(new FakePoolClient(this));
      } catch (error) {
        this.restore(snapshot);
        throw error;
      }
    };

    const pending = this.txQueue.then(run, run);
    this.txQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private snapshot(): TxSnapshot {
    return {
      validations: this.validations.map((row) => ({ ...row })),
      idempotency: new Map(this.idempotency.entries()),
      consumptions: this.consumptions.map((row) => ({ ...row })),
    };
  }

  private restore(snapshot: TxSnapshot): void {
    this.validations = snapshot.validations.map((row) => ({ ...row }));
    this.idempotency = new Map(snapshot.idempotency.entries());
    this.consumptions = snapshot.consumptions.map((row) => ({ ...row }));
  }
}

class FakeTicketingAdapter implements TicketingAdapter {
  constructor(private readonly candidatesByKey: Map<string, TicketingLocatorCandidate[]>) {}

  async check() {
    return { ok: true as const, ref: 'legacy' };
  }

  async listLocatorCandidates(input: {
    locator: string;
    dni: string;
    serviceId: string | null;
  }): Promise<TicketingLocatorCandidate[]> {
    const key = `${input.locator}|${input.serviceId ?? 'NULL'}`;
    return [...(this.candidatesByKey.get(key) ?? [])];
  }
}

function key(locator: string, serviceId: string | null): string {
  return `${locator}|${serviceId ?? 'NULL'}`;
}

describe('ValidationsService.validateLocator (ticketing mode)', () => {
  let service: ValidationsService;
  let fakeDb: FakeDbService;
  let envBackup: string | undefined;

  beforeEach(() => {
    envBackup = process.env.VALIDATE_LOCATOR_SOURCE;
    process.env.VALIDATE_LOCATOR_SOURCE = 'ticketing';
    fakeDb = new FakeDbService();
  });

  afterEach(() => {
    process.env.VALIDATE_LOCATOR_SOURCE = envBackup;
  });

  it('consumes ticketing candidates one by one and ends with NO_REMAINING', async () => {
    const adapter = new FakeTicketingAdapter(
      new Map([
        [
          key('LOC123', 'S1'),
          [
            { ticketKey: 'tk-1', sequence: 1, dni: '12345678Z', ref: 'B-1001' },
            { ticketKey: 'tk-2', sequence: 2, dni: '12345678Z', ref: 'B-1002' },
          ],
        ],
      ]),
    );
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    const first = await service.validateLocator(
      { locator: 'LOC123', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'k-1', userId: 'driver-1', username: 'driver', roles: ['DRIVER'] },
    );
    const second = await service.validateLocator(
      { locator: 'LOC123', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'k-2', userId: 'driver-1', username: 'driver', roles: ['DRIVER'] },
    );
    const third = await service.validateLocator(
      { locator: 'LOC123', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'k-3', userId: 'driver-1', username: 'driver', roles: ['DRIVER'] },
    );

    expect(first.result).toBe('VALID');
    expect(first.ticket?.ticketId).toBe('tk-1');
    expect(first.ticket?.ref).toBe('B-1001');
    expect(first.remainingAfter).toBe(1);

    expect(second.result).toBe('VALID');
    expect(second.ticket?.ticketId).toBe('tk-2');
    expect(second.ticket?.ref).toBe('B-1002');
    expect(second.remainingAfter).toBe(0);

    expect(third.result).toBe('DUPLICATE');
    expect(third.reason).toBe('NO_REMAINING');
    expect(third.remainingAfter).toBe(0);
    expect(third.duplicateRecordedAt).toBeDefined();
  });

  it('returns INVALID + NOT_FOUND when ticketing has no candidates', async () => {
    const adapter = new FakeTicketingAdapter(new Map());
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    const response = await service.validateLocator(
      { locator: 'UNKNOWN', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'k-not-found' },
    );

    expect(response.result).toBe('INVALID');
    expect(response.reason).toBe('NOT_FOUND');
  });

  it('returns INVALID + DNI_MISMATCH when candidates exist but DNI does not match', async () => {
    const adapter = new FakeTicketingAdapter(
      new Map([[key('LOC-DNI', 'S1'), [{ ticketKey: 'tk-dni', sequence: 1, dni: '99999999R', ref: 'B-2001' }]]]),
    );
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    const response = await service.validateLocator(
      { locator: 'LOC-DNI', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'k-dni-mismatch' },
    );

    expect(response.result).toBe('INVALID');
    expect(response.reason).toBe('DNI_MISMATCH');
  });

  it('returns same response for same idempotency key without consuming extra tickets', async () => {
    const adapter = new FakeTicketingAdapter(
      new Map([[key('LOC-IDEMP', 'S1'), [{ ticketKey: 'tk-idemp', sequence: 1, dni: '12345678Z', ref: 'B-3001' }]]]),
    );
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    const first = await service.validateLocator(
      { locator: 'LOC-IDEMP', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'same-key', userId: 'driver-2' },
    );

    const second = await service.validateLocator(
      { locator: 'LOC-IDEMP', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'same-key', userId: 'driver-2' },
    );

    const afterReplay = await service.validateLocator(
      { locator: 'LOC-IDEMP', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'new-key', userId: 'driver-2' },
    );

    expect(second).toEqual(first);
    expect(afterReplay.result).toBe('DUPLICATE');
    expect(afterReplay.reason).toBe('NO_REMAINING');
  });

  it('handles concurrent requests: only one consumes when one candidate remains', async () => {
    const adapter = new FakeTicketingAdapter(
      new Map([[key('LOC-RACE', 'S1'), [{ ticketKey: 'tk-race', sequence: 1, dni: '12345678Z', ref: 'B-4001' }]]]),
    );
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    const [a, b] = await Promise.all([
      service.validateLocator(
        { locator: 'LOC-RACE', dni: '12345678Z', serviceId: 'S1' },
        { idempotencyKey: 'race-1', userId: 'driver-a' },
      ),
      service.validateLocator(
        { locator: 'LOC-RACE', dni: '12345678Z', serviceId: 'S1' },
        { idempotencyKey: 'race-2', userId: 'driver-b' },
      ),
    ]);

    const validCount = [a, b].filter((item) => item.result === 'VALID').length;
    const duplicateCount = [a, b].filter(
      (item) => item.result === 'DUPLICATE' && item.reason === 'NO_REMAINING',
    ).length;

    expect(validCount).toBe(1);
    expect(duplicateCount).toBe(1);
  });

  it('rejects same idempotency key with different payload', async () => {
    const adapter = new FakeTicketingAdapter(
      new Map([
        [key('LOC-CONFLICT', 'S1'), [{ ticketKey: 'tk-conflict', sequence: 1, dni: '12345678Z', ref: 'B-5001' }]],
      ]),
    );
    service = new ValidationsService(fakeDb as unknown as DbService, adapter);

    await service.validateLocator(
      { locator: 'LOC-CONFLICT', dni: '12345678Z', serviceId: 'S1' },
      { idempotencyKey: 'conflict' },
    );

    await expect(
      service.validateLocator(
        { locator: 'LOC-CONFLICT', dni: 'X1234567L', serviceId: 'S1' },
        { idempotencyKey: 'conflict' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
