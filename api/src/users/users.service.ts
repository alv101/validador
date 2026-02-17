import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseError, PoolClient } from 'pg';
import { DbService } from '../db/db.service';

type CreateUserInput = {
  username: string;
  password: string;
  roles: string[];
};

type UpdateUserInput = {
  active?: boolean;
  roles?: string[];
};

type UserListRow = {
  id: string;
  username: string;
  active: boolean;
  roles: string[];
};

type RoleRow = {
  id: string;
  name: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async create(input: CreateUserInput) {
    this.validateCreateInput(input);
    const normalizedRoles = this.normalizeRoles(input.roles);
    const passwordHash = await argon2.hash(input.password);

    try {
      return await this.db.withTransaction(async (client) => {
        const roleIds = await this.resolveRoleIds(client, normalizedRoles);

        const created = await client.query<{ id: string; username: string; active: boolean }>(
          `INSERT INTO users (username, password_hash, active)
           VALUES ($1, $2, true)
           RETURNING id, username, active`,
          [input.username.trim(), passwordHash],
        );
        const user = created.rows[0];

        for (const roleId of roleIds) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)`,
            [user.id, roleId],
          );
        }

        return {
          id: user.id,
          username: user.username,
          active: user.active,
          roles: normalizedRoles,
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Username already exists');
      }
      throw error;
    }
  }

  async list() {
    const { rows } = await this.db.query<UserListRow>(
      `SELECT u.id,
              u.username,
              u.active,
              COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id, u.username, u.active
       ORDER BY u.username ASC`,
    );

    return rows;
  }

  async update(userId: string, input: UpdateUserInput) {
    this.validateUserId(userId);
    this.validateUpdateInput(input);
    const normalizedRoles = input.roles ? this.normalizeRoles(input.roles) : undefined;

    return this.db.withTransaction(async (client) => {
      const userExists = await client.query<{ id: string }>(
        `SELECT id
         FROM users
         WHERE id = $1`,
        [userId],
      );
      if (userExists.rows.length === 0) {
        throw new NotFoundException('User not found');
      }

      if (typeof input.active === 'boolean') {
        await client.query(
          `UPDATE users
           SET active = $2
           WHERE id = $1`,
          [userId, input.active],
        );
      }

      if (normalizedRoles) {
        const roleIds = await this.resolveRoleIds(client, normalizedRoles);
        await client.query(
          `DELETE FROM user_roles
           WHERE user_id = $1`,
          [userId],
        );

        for (const roleId of roleIds) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)`,
            [userId, roleId],
          );
        }
      }

      const updated = await client.query<UserListRow>(
        `SELECT u.id,
                u.username,
                u.active,
                COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.id = $1
         GROUP BY u.id, u.username, u.active`,
        [userId],
      );

      if (updated.rows.length === 0) {
        throw new NotFoundException('User not found');
      }

      return updated.rows[0];
    });
  }

  private validateCreateInput(input: CreateUserInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body');
    }
    this.validateUsername(input.username);
    this.validatePassword(input.password);
    this.validateRoles(input.roles);
  }

  private validateUpdateInput(input: UpdateUserInput) {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Invalid request body');
    }
    const hasActive = Object.prototype.hasOwnProperty.call(input, 'active');
    const hasRoles = Object.prototype.hasOwnProperty.call(input, 'roles');
    if (!hasActive && !hasRoles) {
      throw new BadRequestException('You must send active and/or roles');
    }

    if (hasActive && typeof input.active !== 'boolean') {
      throw new BadRequestException('active must be boolean');
    }

    if (hasRoles) {
      this.validateRoles(input.roles as string[]);
    }
  }

  private validateUserId(userId: string) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new BadRequestException('Invalid user id');
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId.trim())) {
      throw new BadRequestException('Invalid user id');
    }
  }

  private validateUsername(username: string) {
    if (typeof username !== 'string') {
      throw new BadRequestException('username must be string');
    }

    const value = username.trim();
    if (value.length < 3 || value.length > 50) {
      throw new BadRequestException('username length must be 3..50');
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
      throw new BadRequestException('username has invalid characters');
    }
  }

  private validatePassword(password: string) {
    if (typeof password !== 'string') {
      throw new BadRequestException('password must be string');
    }
    if (password.length < 8 || password.length > 128) {
      throw new BadRequestException('password length must be 8..128');
    }
  }

  private validateRoles(roles: string[]) {
    if (!Array.isArray(roles)) {
      throw new BadRequestException('roles must be an array of strings');
    }
    if (roles.length === 0) {
      throw new BadRequestException('roles cannot be empty');
    }
    for (const role of roles) {
      if (typeof role !== 'string' || role.trim().length === 0) {
        throw new BadRequestException('roles must contain non-empty strings');
      }
    }
  }

  private normalizeRoles(roles: string[]): string[] {
    const unique = new Set<string>();
    for (const role of roles) {
      unique.add(role.trim().toUpperCase());
    }
    return [...unique];
  }

  private async resolveRoleIds(client: PoolClient, roles: string[]) {
    const { rows } = await client.query<RoleRow>(
      `SELECT id, name
       FROM roles
       WHERE name = ANY($1::text[])`,
      [roles],
    );

    if (rows.length !== roles.length) {
      const found = new Set(rows.map((r) => r.name));
      const missing = roles.filter((role) => !found.has(role));
      throw new BadRequestException(`Unknown roles: ${missing.join(', ')}`);
    }

    return rows.map((row) => row.id);
  }

  private isUniqueViolation(error: unknown): error is DatabaseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as DatabaseError).code === '23505'
    );
  }
}
