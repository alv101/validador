import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import {
  TicketingLocatorCandidate,
  TicketingCheckResult,
  TICKETING_ADAPTER,
} from './ticketing.adapter';
import type { TicketingAdapter } from './ticketing.adapter';

type ValidationResult = 'ERROR' | 'INVALID' | 'VALID' | 'DUPLICATE';
type ValidationReason = 'NO_REMAINING' | 'NOT_FOUND' | 'DNI_MISMATCH';

type ValidationRow = {
  result: ValidationResult;
  created_at: Date;
  updated_at: Date;
};

type ValidateInput = {
  locator: string;
  serviceId: string;
};

type ListValidationsOptions = {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  locator?: string;
  serviceId?: string;
  result?: string;
  actorUserId?: string;
  actorRoles?: string[];
};

type ValidationHistoryRow = {
  id: number;
  locator: string;
  service_id: string;
  result: ValidationResult;
  reason: string | null;
  ref: string | null;
  created_at: Date;
  updated_at: Date;
  validated_by: string | null;
  validated_username: string | null;
  validated_roles: string | null;
  validated_dni: string | null;
};

type ValidationHistoryCountRow = {
  total: number;
};

type ValidateLocatorInput = {
  locator: string;
  dni: string;
  serviceId?: string;
};

type ValidateLocatorOptions = {
  idempotencyKey?: string;
  userId?: string;
  username?: string;
  roles?: string[];
};

type ResetValidationOptions = {
  actorUserId?: string;
  actorUsername?: string;
  actorRoles?: string[];
  ip?: string;
  resetAdminKey?: string;
};

type ValidateLocatorResponse = {
  result: ValidationResult;
  reason?: ValidationReason;
  duplicateRecordedAt?: string;
  ticket?: {
    ticketId: string;
    ref?: string;
    sequence?: number;
    remainingAfter?: number;
  };
  remainingAfter?: number;
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
};

type ValidateLocatorMode = 'local' | 'ticketing';

type LocatorStatsRow = {
  total_count: number;
  dni_bound_count: number;
  matching_dni_count: number;
};

type NextTicketRow = {
  id: string;
  sequence: number | null;
};

type RemainingRow = {
  remaining: number;
};

type LatestValidatedAtRow = {
  last_validated_at: Date | null;
};

type LatestConsumptionAtRow = {
  last_consumed_at: Date | null;
};

type IdempotencyRow = {
  request_hash: string;
  response_json: ValidateLocatorResponse;
};

type RawValidationTableRow = {
  id: number;
  locator: string;
  service_id: string;
  result: ValidationResult;
  reason: string | null;
  ref: string | null;
  created_at: Date;
  updated_at: Date;
};

type RawConsumptionTableRow = {
  id: number;
  ticket_key: string;
  locator: string;
  service_id: string | null;
  validated_by: string | null;
  validated_username: string | null;
  validated_roles: string | null;
  validated_dni: string | null;
  created_at: Date;
};

type RawIdempotencyTableRow = {
  id: number;
  idempotency_key: string;
  endpoint: string;
  request_hash: string;
  response_json: unknown;
  created_at: Date;
};

type RawLocatorTicketRow = {
  id: number;
  locator: string;
  dni: string | null;
  service_id: string | null;
  sequence: number | null;
  validated_at: Date | null;
  validated_by: string | null;
  validated_dni: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ValidationsService {
  private readonly logger = new Logger(ValidationsService.name);
  private readonly validateLocatorMode: ValidateLocatorMode =
    process.env.VALIDATE_LOCATOR_SOURCE === 'local' ? 'local' : 'ticketing';

  constructor(
    private readonly db: DbService,
    @Inject(TICKETING_ADAPTER) private readonly ticketingAdapter: TicketingAdapter,
  ) {}

  getResetValidationStatus() {
    const enabled = (process.env.VALIDATIONS_RESET_ENABLED ?? '').toLowerCase() === 'true';
    const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    const allowInProduction = (process.env.ALLOW_VALIDATIONS_RESET_IN_PROD ?? '').toLowerCase() === 'true';
    const requiresAdminKey = isProduction;

    const effectiveEnabled = enabled && (!isProduction || allowInProduction);
    const canExecuteFromUi = effectiveEnabled && !requiresAdminKey;

    return {
      enabled: effectiveEnabled,
      requiresAdminKey,
      canExecuteFromUi,
    };
  }

  async getValidationTablesSnapshot(limitRaw?: number) {
    const limit = this.normalizeAdminTablesLimit(limitRaw);

    const [validations, consumptions, idempotency, locatorTickets] = await Promise.all([
      this.db.query<RawValidationTableRow>(
        `SELECT id, locator, service_id, result, reason, ref, created_at, updated_at
         FROM validations
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      ),
      this.db.query<RawConsumptionTableRow>(
        `SELECT id, ticket_key, locator, service_id, validated_by, validated_username, validated_roles, validated_dni, created_at
         FROM validated_ticket_consumptions
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      ),
      this.db.query<RawIdempotencyTableRow>(
        `SELECT id, idempotency_key, endpoint, request_hash, response_json, created_at
         FROM validation_idempotency
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      ),
      this.db.query<RawLocatorTicketRow>(
        `SELECT id, locator, dni, service_id, sequence, validated_at, validated_by, validated_dni, created_at, updated_at
         FROM locator_tickets
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      ),
    ]);

    return {
      limit,
      tables: {
        validations: validations.rows.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        })),
        validated_ticket_consumptions: consumptions.rows.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
        })),
        validation_idempotency: idempotency.rows.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
        })),
        locator_tickets: locatorTickets.rows.map((row) => ({
          ...row,
          validated_at: row.validated_at ? row.validated_at.toISOString() : null,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        })),
      },
    };
  }

  async resetValidationData(options: ResetValidationOptions = {}) {
    this.assertResetAllowed(options);

    return this.db.withTransaction(async (client) => {
      const validations = await client.query(`DELETE FROM validations`);
      const consumptions = await client.query(`DELETE FROM validated_ticket_consumptions`);
      const idempotency = await client.query(`DELETE FROM validation_idempotency`);
      const locatorTickets = await client.query(`DELETE FROM locator_tickets`);

      this.logger.warn(
        `[reset-validations] executed userId=${options.actorUserId ?? '-'} username=${options.actorUsername ?? '-'} ip=${options.ip ?? '-'} roles=${(options.actorRoles ?? []).join(',')}`,
      );

      return {
        ok: true,
        deleted: {
          validations: validations.rowCount ?? 0,
          validatedTicketConsumptions: consumptions.rowCount ?? 0,
          validationIdempotency: idempotency.rowCount ?? 0,
          locatorTickets: locatorTickets.rowCount ?? 0,
        },
      };
    });
  }

  async validate(input: ValidateInput) {
    const { locator, serviceId } = this.normalizeInput(input);

    const row = await this.db.withTransaction(async (client) => {
      let adapterResult: TicketingCheckResult;

      try {
        adapterResult = await this.ticketingAdapter.check(locator, serviceId);
      } catch {
        return this.insertValidation(client, {
          locator,
          serviceId,
          result: 'ERROR',
        });
      }

      if (!adapterResult.ok) {
        return this.insertValidation(client, {
          locator,
          serviceId,
          result: 'INVALID',
          reason: adapterResult.reason,
          ref: adapterResult.ref,
        });
      }

      try {
        return await this.insertValidation(client, {
          locator,
          serviceId,
          result: 'VALID',
          reason: adapterResult.reason,
          ref: adapterResult.ref,
        });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          return this.insertValidation(client, {
            locator,
            serviceId,
            result: 'DUPLICATE',
            reason: adapterResult.reason,
            ref: adapterResult.ref,
          });
        }
        throw error;
      }
    });

    return {
      result: row.result,
      timestamps: {
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  async listValidations(options: ListValidationsOptions = {}) {
    const pageSize = this.normalizeHistoryPageSize(options.pageSize);
    const page = this.normalizeHistoryPage(options.page);
    const offset = (page - 1) * pageSize;
    const roleSet = new Set((options.actorRoles ?? []).map((role) => role.toUpperCase()));
    const isAdmin = roleSet.has('ADMIN');

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (options.dateFrom) {
      const parsed = this.parseISODateStart(options.dateFrom);
      params.push(parsed.toISOString());
      whereClauses.push(`v.created_at >= $${params.length}::timestamptz`);
    }

    if (options.dateTo) {
      const parsed = this.parseISODateEnd(options.dateTo);
      params.push(parsed.toISOString());
      whereClauses.push(`v.created_at <= $${params.length}::timestamptz`);
    }

    if (options.locator && options.locator.trim().length > 0) {
      params.push(`%${options.locator.trim()}%`);
      whereClauses.push(`v.locator ILIKE $${params.length}`);
    }

    if (options.serviceId && options.serviceId.trim().length > 0) {
      params.push(options.serviceId.trim());
      whereClauses.push(`v.service_id = $${params.length}`);
    }

    if (options.result && options.result.trim().length > 0) {
      const normalizedResult = options.result.trim().toUpperCase();
      if (!['VALID', 'INVALID', 'DUPLICATE', 'ERROR'].includes(normalizedResult)) {
        throw new BadRequestException('result must be one of VALID, INVALID, DUPLICATE, ERROR');
      }
      params.push(normalizedResult);
      whereClauses.push(`v.result = $${params.length}`);
    }

    if (!isAdmin) {
      if (!options.actorUserId) {
        return { page, pageSize, total: 0, items: [] as Array<ReturnType<typeof this.mapHistoryRow>> };
      }
      params.push(options.actorUserId);
      whereClauses.push(`c.validated_by = $${params.length}`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM validations v
      LEFT JOIN validated_ticket_consumptions c
        ON c.ticket_key = v.ref
      ${whereSQL}
    `;

    const countResult = await this.db.query<ValidationHistoryCountRow>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    const listParams = [...params, pageSize, offset];
    const { rows } = await this.db.query<ValidationHistoryRow>(
      `SELECT
         v.id,
         v.locator,
         v.service_id,
         v.result,
         v.reason,
         v.ref,
         v.created_at,
         v.updated_at,
         c.validated_by,
         c.validated_username,
         c.validated_roles,
         c.validated_dni
       FROM validations v
       LEFT JOIN validated_ticket_consumptions c
         ON c.ticket_key = v.ref
       ${whereSQL}
       ORDER BY v.created_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams,
    );

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.mapHistoryRow(row)),
    };
  }

  async validateLocator(input: ValidateLocatorInput, options: ValidateLocatorOptions): Promise<ValidateLocatorResponse> {
    const normalized = this.normalizeValidateLocatorInput(input);
    const idempotencyKey = options.idempotencyKey?.trim() || undefined;
    const requestHash = this.buildRequestHash(normalized);

    try {
      return await this.db.withTransaction(async (client) => {
        if (idempotencyKey) {
          const existing = await this.findIdempotentResponse(client, idempotencyKey);
          if (existing) {
            if (existing.request_hash !== requestHash) {
              throw new BadRequestException('Idempotency-Key already used with different payload');
            }
            return existing.response_json;
          }
        }

        const response =
          this.validateLocatorMode === 'local'
            ? await this.consumeNextTicketByLocator(client, normalized, options.userId)
            : await this.validateLocatorAgainstTicketing(client, normalized, {
                userId: options.userId,
                username: options.username,
                roles: options.roles,
              });

        if (idempotencyKey) {
          await this.persistIdempotentResponse(client, {
            idempotencyKey,
            requestHash,
            response,
          });
        }

        return response;
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('validateLocator failed with unexpected error', error as Error);
      throw new InternalServerErrorException({
        result: 'ERROR',
      });
    }
  }

  private normalizeInput(input: ValidateInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body');
    }

    if (typeof input.locator !== 'string' || typeof input.serviceId !== 'string') {
      throw new BadRequestException('locator and serviceId must be strings');
    }

    const locator = input.locator.trim().toUpperCase();
    const serviceId = input.serviceId.trim();

    if (locator.length === 0 || serviceId.length === 0) {
      throw new BadRequestException('locator and serviceId cannot be empty');
    }

    return { locator, serviceId };
  }

  private normalizeHistoryPage(value?: number): number {
    const safe = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 1;
    if (safe < 1) return 1;
    return safe;
  }

  private normalizeHistoryPageSize(value?: number): number {
    const safe = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 50;
    if (safe < 1) return 1;
    if (safe > 200) return 200;
    return safe;
  }

  private normalizeAdminTablesLimit(value?: number): number {
    const safe = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 50;
    if (safe < 1) return 1;
    if (safe > 300) return 300;
    return safe;
  }

  private parseISODateStart(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('dateFrom must be YYYY-MM-DD');
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private parseISODateEnd(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('dateTo must be YYYY-MM-DD');
    }
    return new Date(`${value}T23:59:59.999Z`);
  }

  private mapHistoryRow(row: ValidationHistoryRow) {
    return {
      id: row.id,
      locator: row.locator,
      serviceId: row.service_id,
      result: row.result,
      reason: row.reason ?? undefined,
      ref: row.ref ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      actor: row.validated_by
        ? {
            userId: row.validated_by,
            username: row.validated_username ?? undefined,
            roles: row.validated_roles ? row.validated_roles.split(',').map((r) => r.trim()).filter(Boolean) : [],
            dni: row.validated_dni ?? undefined,
          }
        : undefined,
    };
  }

  private normalizeValidateLocatorInput(input: ValidateLocatorInput): {
    locator: string;
    dni: string;
    serviceId: string | null;
  } {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body');
    }

    const fallbackParts = typeof input.locator === 'string' ? this.trySplitLocatorDni(input.locator) : null;

    const rawLocator =
      typeof input.locator === 'string' && input.locator.trim().length > 0
        ? input.locator
        : (fallbackParts?.locator ?? '');
    const rawDni =
      typeof input.dni === 'string' && input.dni.trim().length > 0 ? input.dni : (fallbackParts?.dni ?? '');

    if (typeof rawLocator !== 'string' || typeof rawDni !== 'string') {
      throw new BadRequestException('locator and dni must be strings');
    }

    const locator = rawLocator.trim().toUpperCase();
    const dni = this.normalizeDni(rawDni);
    const serviceId =
      typeof input.serviceId === 'string' && input.serviceId.trim().length > 0 ? input.serviceId.trim() : null;

    if (locator.length === 0 || dni.length === 0) {
      throw new BadRequestException('locator and dni cannot be empty');
    }

    return { locator, dni, serviceId };
  }

  private trySplitLocatorDni(raw: string): { locator: string; dni: string } | null {
    const text = raw.trim();
    if (!text) return null;

    const match = text.match(/^([^|\-\s]+)[|\-\s]+([^|\-\s]+)$/);
    if (!match) return null;

    return {
      locator: match[1],
      dni: match[2],
    };
  }

  private normalizeDni(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
  }

  private isValidSpanishDniNie(dni: string): boolean {
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';

    if (/^\d{8}[A-Z]$/.test(dni)) {
      const number = Number(dni.slice(0, 8));
      const letter = dni.slice(8);
      return letters[number % 23] === letter;
    }

    if (/^[XYZ]\d{7}[A-Z]$/.test(dni)) {
      const prefix = dni[0] === 'X' ? '0' : dni[0] === 'Y' ? '1' : '2';
      const number = Number(`${prefix}${dni.slice(1, 8)}`);
      const letter = dni.slice(8);
      return letters[number % 23] === letter;
    }

    return false;
  }

  private buildRequestHash(input: { locator: string; dni: string; serviceId: string | null }): string {
    const payload = JSON.stringify({
      locator: input.locator,
      dni: input.dni,
      serviceId: input.serviceId,
    });

    return createHash('sha256').update(payload).digest('hex');
  }

  private async consumeNextTicketByLocator(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
    userId?: string,
  ): Promise<ValidateLocatorResponse> {
    const stats = await this.getLocatorStats(client, input);

    if (!this.isValidSpanishDniNie(input.dni)) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        }),
        {
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        },
      );
    }

    if (stats.total_count === 0) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'NOT_FOUND',
        }),
        {
          result: 'INVALID',
          reason: 'NOT_FOUND',
        },
      );
    }

    const hasDniAssociation = stats.dni_bound_count > 0;
    if (hasDniAssociation && stats.matching_dni_count === 0) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        }),
        {
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        },
      );
    }

    const nextTicket = await this.getNextPendingTicket(client, input, hasDniAssociation);

    if (!nextTicket) {
      const duplicateRecordedAt = await this.getLatestLocalValidatedAt(client, input, hasDniAssociation);
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'DUPLICATE',
          reason: 'NO_REMAINING',
        }),
        {
          result: 'DUPLICATE',
          reason: 'NO_REMAINING',
          remainingAfter: 0,
          duplicateRecordedAt: duplicateRecordedAt?.toISOString(),
        },
      );
    }

    const consumedTicket = await this.markTicketAsValidated(client, nextTicket.id, userId, input.dni);
    const remainingAfter = await this.getRemainingPendingCount(client, input, hasDniAssociation);

    return this.buildFunctionalResponse(
      await this.insertValidation(client, {
        locator: input.locator,
        serviceId: input.serviceId ?? '',
        result: 'VALID',
        ref: consumedTicket.id,
      }),
      {
        result: 'VALID',
        remainingAfter,
        ticket: {
          ticketId: consumedTicket.id,
          sequence: consumedTicket.sequence ?? undefined,
          remainingAfter,
        },
      },
    );
  }

  private async validateLocatorAgainstTicketing(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
    actor?: { userId?: string; username?: string; roles?: string[] },
  ): Promise<ValidateLocatorResponse> {
    if (!this.isValidSpanishDniNie(input.dni)) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        }),
        {
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        },
      );
    }

    if (!this.ticketingAdapter.listLocatorCandidates) {
      throw new InternalServerErrorException('Ticketing adapter does not implement listLocatorCandidates');
    }

    const rawCandidates = await this.ticketingAdapter.listLocatorCandidates({
      locator: input.locator,
      dni: input.dni,
      serviceId: input.serviceId,
    });
    this.logger.log(
      `[validate-locator] locator=${input.locator} serviceId=${input.serviceId ?? 'NULL'} candidates=${rawCandidates.length}`,
    );

    if (rawCandidates.length === 0) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'NOT_FOUND',
        }),
        {
          result: 'INVALID',
          reason: 'NOT_FOUND',
        },
      );
    }

    const sortedCandidates = [...rawCandidates].sort((a, b) => {
      const aSeq = a.sequence ?? Number.MAX_SAFE_INTEGER;
      const bSeq = b.sequence ?? Number.MAX_SAFE_INTEGER;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.ticketKey.localeCompare(b.ticketKey);
    });

    const hasDniAssociation = sortedCandidates.some((candidate) => Boolean(candidate.dni?.trim()));
    const eligibleCandidates = hasDniAssociation
      ? sortedCandidates.filter(
          (candidate) => this.normalizeDni(candidate.dni ?? '') === input.dni,
        )
      : sortedCandidates;
    this.logger.log(
      `[validate-locator] hasDniAssociation=${hasDniAssociation} eligible=${eligibleCandidates.length} scannedDni=${input.dni}`,
    );

    if (eligibleCandidates.length === 0) {
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        }),
        {
          result: 'INVALID',
          reason: 'DNI_MISMATCH',
        },
      );
    }

    const consumedSet = new Set(await this.getConsumedTicketKeys(client, eligibleCandidates.map((x) => x.ticketKey)));
    let selected: TicketingLocatorCandidate | null = null;

    for (const candidate of eligibleCandidates) {
      if (consumedSet.has(candidate.ticketKey)) continue;
      const consumed = await this.tryConsumeTicketingCandidate(client, {
        ticketKey: candidate.ticketKey,
        locator: input.locator,
        serviceId: input.serviceId,
        userId: actor?.userId,
        username: actor?.username,
        roles: actor?.roles,
        validatedDni: input.dni,
      });
      if (consumed) {
        selected = candidate;
        consumedSet.add(candidate.ticketKey);
        this.logger.log(`[validate-locator] consumed ticketKey=${candidate.ticketKey}`);
        break;
      }
      consumedSet.add(candidate.ticketKey);
    }

    if (!selected) {
      const duplicateRecordedAt = await this.getLatestTicketingConsumptionAt(
        client,
        eligibleCandidates.map((candidate) => candidate.ticketKey),
      );
      return this.buildFunctionalResponse(
        await this.insertValidation(client, {
          locator: input.locator,
          serviceId: input.serviceId ?? '',
          result: 'DUPLICATE',
          reason: 'NO_REMAINING',
        }),
        {
          result: 'DUPLICATE',
          reason: 'NO_REMAINING',
          remainingAfter: 0,
          duplicateRecordedAt: duplicateRecordedAt?.toISOString(),
        },
      );
    }

    const remainingAfter = eligibleCandidates.filter((candidate) => !consumedSet.has(candidate.ticketKey)).length;
    this.logger.log(`[validate-locator] remainingAfter=${remainingAfter}`);

    const validationRow = await this.insertValidation(client, {
      locator: input.locator,
      serviceId: input.serviceId ?? '',
      result: 'VALID',
      ref: selected.ref ?? selected.ticketKey,
    });

    return this.buildFunctionalResponse(validationRow, {
      result: 'VALID',
      remainingAfter,
      ticket: {
        ticketId: selected.ticketKey,
        ref: selected.ref ?? undefined,
        sequence: selected.sequence,
        remainingAfter,
      },
    });
  }

  private async getConsumedTicketKeys(client: PoolClient, ticketKeys: string[]): Promise<string[]> {
    if (ticketKeys.length === 0) return [];

    const { rows } = await client.query<{ ticket_key: string }>(
      `SELECT ticket_key
       FROM validated_ticket_consumptions
       WHERE ticket_key = ANY($1::text[])`,
      [ticketKeys],
    );

    return rows.map((row) => row.ticket_key);
  }

  private async tryConsumeTicketingCandidate(
    client: PoolClient,
    input: {
      ticketKey: string;
      locator: string;
      serviceId: string | null;
      userId?: string;
      username?: string;
      roles?: string[];
      validatedDni: string;
    },
  ): Promise<boolean> {
    const rolesText = input.roles && input.roles.length > 0 ? input.roles.join(',') : null;
    const { rowCount } = await client.query(
      `INSERT INTO validated_ticket_consumptions (
         ticket_key,
         locator,
         service_id,
         validated_by,
         validated_username,
         validated_roles,
         validated_dni
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ticket_key) DO NOTHING`,
      [
        input.ticketKey,
        input.locator,
        input.serviceId,
        input.userId ?? null,
        input.username ?? null,
        rolesText,
        input.validatedDni,
      ],
    );

    return (rowCount ?? 0) > 0;
  }

  private async getLocatorStats(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
  ): Promise<LocatorStatsRow> {
    const { rows } = await client.query<LocatorStatsRow>(
      `/* validate-locator:stats */
       SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE dni IS NOT NULL AND BTRIM(dni) <> '')::int AS dni_bound_count,
         COUNT(*) FILTER (
           WHERE UPPER(REGEXP_REPLACE(COALESCE(dni, ''), '\\s+', '', 'g')) = $3
         )::int AS matching_dni_count
       FROM locator_tickets
       WHERE locator = $1
         AND ($2::text IS NULL OR service_id = $2)`,
      [input.locator, input.serviceId, input.dni],
    );

    return rows[0] ?? { total_count: 0, dni_bound_count: 0, matching_dni_count: 0 };
  }

  private async getNextPendingTicket(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
    enforceDniMatch: boolean,
  ): Promise<NextTicketRow | null> {
    const { rows } = await client.query<NextTicketRow>(
      `/* validate-locator:next-ticket */
       SELECT id::text AS id, sequence
       FROM locator_tickets
       WHERE locator = $1
         AND ($2::text IS NULL OR service_id = $2)
         AND validated_at IS NULL
         AND ($3::boolean = false OR UPPER(REGEXP_REPLACE(COALESCE(dni, ''), '\\s+', '', 'g')) = $4)
       ORDER BY sequence ASC NULLS LAST, created_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [input.locator, input.serviceId, enforceDniMatch, input.dni],
    );

    return rows[0] ?? null;
  }

  private async markTicketAsValidated(
    client: PoolClient,
    ticketId: string,
    userId: string | undefined,
    normalizedDni: string,
  ): Promise<NextTicketRow> {
    const { rows } = await client.query<NextTicketRow>(
      `/* validate-locator:consume-ticket */
       UPDATE locator_tickets
       SET validated_at = NOW(),
           updated_at = NOW(),
           validated_by = $2,
           validated_dni = $3
       WHERE id = $1::bigint
       RETURNING id::text AS id, sequence`,
      [ticketId, userId ?? null, normalizedDni],
    );

    if (!rows[0]) {
      throw new InternalServerErrorException('Failed to consume pending ticket');
    }

    return rows[0];
  }

  private async getRemainingPendingCount(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
    enforceDniMatch: boolean,
  ): Promise<number> {
    const { rows } = await client.query<RemainingRow>(
      `/* validate-locator:remaining */
       SELECT COUNT(*)::int AS remaining
       FROM locator_tickets
       WHERE locator = $1
         AND ($2::text IS NULL OR service_id = $2)
         AND validated_at IS NULL
         AND ($3::boolean = false OR UPPER(REGEXP_REPLACE(COALESCE(dni, ''), '\\s+', '', 'g')) = $4)`,
      [input.locator, input.serviceId, enforceDniMatch, input.dni],
    );

    return rows[0]?.remaining ?? 0;
  }

  private async getLatestLocalValidatedAt(
    client: PoolClient,
    input: { locator: string; dni: string; serviceId: string | null },
    enforceDniMatch: boolean,
  ): Promise<Date | null> {
    const { rows } = await client.query<LatestValidatedAtRow>(
      `SELECT MAX(validated_at) AS last_validated_at
       FROM locator_tickets
       WHERE locator = $1
         AND ($2::text IS NULL OR service_id = $2)
         AND validated_at IS NOT NULL
         AND ($3::boolean = false OR UPPER(REGEXP_REPLACE(COALESCE(dni, ''), '\\s+', '', 'g')) = $4)`,
      [input.locator, input.serviceId, enforceDniMatch, input.dni],
    );

    return rows[0]?.last_validated_at ?? null;
  }

  private async getLatestTicketingConsumptionAt(client: PoolClient, ticketKeys: string[]): Promise<Date | null> {
    if (ticketKeys.length === 0) return null;

    const { rows } = await client.query<LatestConsumptionAtRow>(
      `SELECT MAX(created_at) AS last_consumed_at
       FROM validated_ticket_consumptions
       WHERE ticket_key = ANY($1::text[])`,
      [ticketKeys],
    );

    return rows[0]?.last_consumed_at ?? null;
  }

  private buildFunctionalResponse(
    row: ValidationRow,
    body: Omit<ValidateLocatorResponse, 'timestamps'>,
  ): ValidateLocatorResponse {
    return {
      ...body,
      timestamps: {
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    };
  }

  private async findIdempotentResponse(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<IdempotencyRow | null> {
    const { rows } = await client.query<IdempotencyRow>(
      `/* validate-locator:idempotency-get */
       SELECT request_hash, response_json
       FROM validation_idempotency
       WHERE idempotency_key = $1
         AND endpoint = 'validate-locator'
       FOR UPDATE`,
      [idempotencyKey],
    );

    return rows[0] ?? null;
  }

  private async persistIdempotentResponse(
    client: PoolClient,
    input: {
      idempotencyKey: string;
      requestHash: string;
      response: ValidateLocatorResponse;
    },
  ): Promise<void> {
    const insertResult = await client.query<{ id: number }>(
      `/* validate-locator:idempotency-save */
       INSERT INTO validation_idempotency (idempotency_key, endpoint, request_hash, response_json)
       VALUES ($1, 'validate-locator', $2, $3::jsonb)
       ON CONFLICT (idempotency_key, endpoint) DO NOTHING
       RETURNING id`,
      [input.idempotencyKey, input.requestHash, JSON.stringify(input.response)],
    );

    if (insertResult.rowCount && insertResult.rowCount > 0) {
      return;
    }

    const existing = await this.findIdempotentResponse(client, input.idempotencyKey);
    if (!existing) {
      throw new InternalServerErrorException('Failed to persist idempotency result');
    }

    if (existing.request_hash !== input.requestHash) {
      throw new BadRequestException('Idempotency-Key already used with different payload');
    }
  }

  private async insertValidation(
    client: PoolClient,
    input: {
      locator: string;
      serviceId: string;
      result: ValidationResult;
      reason?: string;
      ref?: string;
    },
  ) {
    const { rows } = await client.query<ValidationRow>(
      `INSERT INTO validations (locator, service_id, result, reason, ref)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING result, created_at, updated_at`,
      [input.locator, input.serviceId, input.result, input.reason ?? null, input.ref ?? null],
    );

    return rows[0];
  }

  private isUniqueViolation(error: unknown): error is { code?: string } {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }

    return (error as { code?: string }).code === '23505';
  }

  private assertResetAllowed(options: ResetValidationOptions): void {
    const enabled = (process.env.VALIDATIONS_RESET_ENABLED ?? '').toLowerCase() === 'true';
    if (!enabled) {
      this.logger.warn(
        `[reset-validations] blocked reason=disabled userId=${options.actorUserId ?? '-'} username=${options.actorUsername ?? '-'} ip=${options.ip ?? '-'}`,
      );
      throw new NotFoundException();
    }

    const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (!isProduction) {
      return;
    }

    const allowInProduction = (process.env.ALLOW_VALIDATIONS_RESET_IN_PROD ?? '').toLowerCase() === 'true';
    if (!allowInProduction) {
      this.logger.warn(
        `[reset-validations] blocked reason=prod-disabled userId=${options.actorUserId ?? '-'} username=${options.actorUsername ?? '-'} ip=${options.ip ?? '-'}`,
      );
      throw new NotFoundException();
    }

    const expectedAdminKey = process.env.VALIDATIONS_RESET_ADMIN_KEY?.trim();
    const providedAdminKey = options.resetAdminKey?.trim();

    if (!expectedAdminKey || providedAdminKey !== expectedAdminKey) {
      this.logger.warn(
        `[reset-validations] blocked reason=invalid-admin-key userId=${options.actorUserId ?? '-'} username=${options.actorUsername ?? '-'} ip=${options.ip ?? '-'}`,
      );
      throw new ForbiddenException('Missing or invalid reset admin key');
    }
  }
}
