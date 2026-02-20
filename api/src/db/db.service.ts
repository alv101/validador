import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      max: 10,
    });
  }

  async onModuleInit() {
    await this.ensureValidationLocatorSchema();
  }

  query<T = unknown>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private async ensureValidationLocatorSchema(): Promise<void> {
    try {
      await this.query(`
        CREATE TABLE IF NOT EXISTS locator_tickets (
          id BIGSERIAL PRIMARY KEY,
          locator TEXT NOT NULL,
          dni TEXT NULL,
          service_id TEXT NULL,
          sequence INTEGER NULL,
          validated_at TIMESTAMPTZ NULL,
          validated_by TEXT NULL,
          validated_dni TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_locator_tickets_lookup
          ON locator_tickets(locator, service_id, validated_at, sequence, created_at)
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS validation_idempotency (
          id BIGSERIAL PRIMARY KEY,
          idempotency_key TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (idempotency_key, endpoint)
        )
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS validated_ticket_consumptions (
          id BIGSERIAL PRIMARY KEY,
          ticket_key TEXT NOT NULL UNIQUE,
          locator TEXT NOT NULL,
          service_id TEXT NULL,
          validated_by TEXT NULL,
          validated_username TEXT NULL,
          validated_roles TEXT NULL,
          validated_dni TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.query(`
        ALTER TABLE validated_ticket_consumptions
        ADD COLUMN IF NOT EXISTS validated_username TEXT NULL
      `);

      await this.query(`
        ALTER TABLE validated_ticket_consumptions
        ADD COLUMN IF NOT EXISTS validated_roles TEXT NULL
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_validated_ticket_consumptions_locator_service
          ON validated_ticket_consumptions(locator, service_id, created_at)
      `);
    } catch (error) {
      this.logger.error('Failed ensuring validation schema', error as Error);
      throw error;
    }
  }
}
