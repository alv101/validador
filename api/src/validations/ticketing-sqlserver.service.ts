import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SqlParamValue = string | number | boolean | Date | null;
type SqlServerConfig = {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  options: {
    instanceName: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
  };
  connectionTimeout: number;
  requestTimeout: number;
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
  };
};

type SqlRequest = {
  input: (name: string, value: SqlParamValue) => void;
  query: <T>(sql: string) => Promise<{ recordset: T[] }>;
};

type SqlConnectionPool = {
  request: () => SqlRequest;
  close: () => Promise<void>;
};

type SqlConnectionPoolCtor = new (config: SqlServerConfig) => {
  connect: () => Promise<SqlConnectionPool>;
};

@Injectable()
export class TicketingSqlServerService implements OnModuleDestroy {
  private readonly logger = new Logger(TicketingSqlServerService.name);
  private pool: SqlConnectionPool | null = null;
  private readonly isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  private readonly sqlDebugEnabled = (process.env.TICKETING_SQL_DEBUG ?? '').toLowerCase() === 'true';

  constructor(private readonly config: ConfigService) {}

  async query<T extends Record<string, unknown>>(
    sql: string,
    params: Record<string, SqlParamValue> = {},
  ): Promise<T[]> {
    const startedAt = Date.now();
    try {
      const pool = await this.getPool();
      const request = pool.request();

      for (const [name, value] of Object.entries(params)) {
        request.input(name, value);
      }
      const result = await request.query<T>(sql);

      const durationMs = Date.now() - startedAt;
      this.logger.log(`[TICKETING_QUERY] ok durationMs=${durationMs} rows=${result.recordset.length}`);
      if (this.sqlDebugEnabled && !this.isProduction) {
        this.logger.debug(`[TICKETING_SQL_DEBUG] sql=${this.compactSql(sql)}`);
        this.logger.debug(`[TICKETING_SQL_DEBUG] params=${JSON.stringify(this.maskParams(params))}`);
      }

      return result.recordset;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(`[TICKETING_QUERY] error durationMs=${durationMs}`);
      this.logger.error('Ticketing SQL Server query failed', error as Error);
      throw new InternalServerErrorException('Error consultando la BBDD de ticketing');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.pool) return;

    await this.pool.close();
    this.pool = null;
  }

  private async getPool(): Promise<SqlConnectionPool> {
    if (this.pool) return this.pool;

    const config: SqlServerConfig = {
      server: this.config.get<string>('TICKETING_DB_HOST', '192.168.200.3'),
      port: Number(this.config.get<string>('TICKETING_DB_PORT', '1433')),
      user: this.config.get<string>('TICKETING_DB_USER', ''),
      password: this.config.get<string>('TICKETING_DB_PASS', ''),
      database: this.config.get<string>('TICKETING_DB_NAME', ''),
      options: {
        instanceName: this.config.get<string>('TICKETING_DB_INSTANCE', 'server2003'),
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      connectionTimeout: Number(this.config.get<string>('TICKETING_DB_CONNECT_TIMEOUT_MS', '15000')),
      requestTimeout: Number(this.config.get<string>('TICKETING_DB_REQUEST_TIMEOUT_MS', '20000')),
      pool: {
        min: 0,
        max: Number(this.config.get<string>('TICKETING_DB_POOL_MAX', '5')),
        idleTimeoutMillis: Number(this.config.get<string>('TICKETING_DB_IDLE_TIMEOUT_MS', '30000')),
      },
    };

    let ConnectionPool: SqlConnectionPoolCtor;
    try {
      const mssql = require('mssql') as { ConnectionPool: SqlConnectionPoolCtor };
      ConnectionPool = mssql.ConnectionPool;
    } catch {
      throw new InternalServerErrorException(
        "Dependencia 'mssql' no instalada. Ejecuta: npm install mssql en /api para usar SQL Server en ticketing",
      );
    }

    this.pool = await new ConnectionPool(config).connect();
    this.logger.log(
      `Ticketing SQL Server conectado a ${config.server}\\${config.options?.instanceName ?? ''} (${config.database})`,
    );

    return this.pool;
  }

  private compactSql(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  private maskParams(params: Record<string, SqlParamValue>): Record<string, string | number | boolean | null> {
    const masked: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value instanceof Date) {
        masked[key] = value.toISOString();
        continue;
      }
      if (typeof value !== 'string') {
        masked[key] = value;
        continue;
      }

      if (/dni|password|pass|token|secret|jwt/i.test(key)) {
        masked[key] = this.maskString(value);
        continue;
      }

      if (/locator|service/i.test(key)) {
        masked[key] = this.maskMiddle(value);
        continue;
      }

      masked[key] = value;
    }
    return masked;
  }

  private maskString(value: string): string {
    if (value.length <= 2) return '**';
    return `${value[0]}***${value[value.length - 1]}`;
  }

  private maskMiddle(value: string): string {
    if (value.length <= 6) return `${value.slice(0, 1)}***${value.slice(-1)}`;
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
}
