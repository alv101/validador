import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const db = {
    query: jest.fn(),
  };

  const jwt = {
    signAsync: jest.fn(),
  } as unknown as JwtService;

  let service: AuthService;

  beforeEach(() => {
    db.query.mockReset();
    service = new AuthService(db as any, jwt);
  });

  it('reloads current username and roles when validating jwt payload', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', username: 'driver.current', password_hash: 'hash', active: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ name: 'DRIVER' }, { name: 'ADMIN' }],
      });

    await expect(
      service.validateJwtPayload({
        sub: 'user-1',
        username: 'driver.old',
        roles: ['DRIVER'],
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      username: 'driver.current',
      roles: ['DRIVER', 'ADMIN'],
    });
  });

  it('rejects jwt payload when user is no longer active', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.validateJwtPayload({
        sub: 'user-1',
        username: 'driver',
        roles: ['DRIVER'],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
