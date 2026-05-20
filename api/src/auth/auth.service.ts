import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DbService } from '../db/db.service';

type DbUserRow = {
  id: string;
  username: string;
  password_hash: string;
  active: boolean;
};

type JwtPayload = {
  sub?: string;
  username?: string;
  roles?: string[];
};

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly jwt: JwtService) {}

  async login(username: string, password: string) {
    const user = await this.findUserByUsername(username);
    if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const roles = await this.getUserRoles(user.id);

    const payload = {
      sub: user.id,
      username: user.username,
      roles,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return { accessToken };
  }

  async validateJwtPayload(payload: JwtPayload) {
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.findActiveUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User is no longer active');
    }

    const roles = await this.getUserRoles(user.id);

    return {
      userId: user.id,
      username: user.username,
      roles,
    };
  }

  private async findUserByUsername(username: string): Promise<DbUserRow | null> {
    const { rows } = await this.db.query<DbUserRow>(
      `SELECT id, username, password_hash, active
       FROM users
       WHERE username = $1`,
      [username],
    );

    return rows[0] ?? null;
  }

  private async findActiveUserById(userId: string): Promise<DbUserRow | null> {
    const { rows } = await this.db.query<DbUserRow>(
      `SELECT id, username, password_hash, active
       FROM users
       WHERE id = $1
         AND active = true`,
      [userId],
    );

    return rows[0] ?? null;
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ name: string }>(
      `SELECT r.name
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.name);
  }
}
