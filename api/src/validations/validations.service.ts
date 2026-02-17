import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import {
  TicketingCheckResult,
  TICKETING_ADAPTER,
} from './ticketing.adapter';
import type { TicketingAdapter } from './ticketing.adapter';

type ValidationResult = 'ERROR' | 'INVALID' | 'VALID' | 'DUPLICATE';

type ValidationRow = {
  result: ValidationResult;
  created_at: Date;
  updated_at: Date;
};

type ValidateInput = {
  locator: string;
  serviceId: string;
};

@Injectable()
export class ValidationsService {
  constructor(
    private readonly db: DbService,
    @Inject(TICKETING_ADAPTER) private readonly ticketingAdapter: TicketingAdapter,
  ) {}

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
}
