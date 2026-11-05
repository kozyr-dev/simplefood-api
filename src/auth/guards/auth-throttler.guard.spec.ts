import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { UserRole } from '@/users/entities/user.entity';
import type { AuthRequest } from '../types/auth.types';
import { AuthThrottlerGuard } from './auth-throttler.guard';

/** Makes the protected tracker callable. */
class TestGuard extends AuthThrottlerGuard {
  tracker(req: object): Promise<string> {
    return this.getTracker(req as AuthRequest);
  }
}

const guard = new TestGuard(
  { throttlers: [] },
  new ThrottlerStorageService(),
  new Reflector(),
);

const IP = '203.0.113.7';
const USER_ID = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b';

describe('AuthThrottlerGuard', () => {
  it('counts a logged-in caller against their account, whatever the IP', async () => {
    const user = { id: USER_ID, role: UserRole.Customer };

    expect(await guard.tracker({ ip: IP, user })).toBe(`user:${USER_ID}`);
    expect(await guard.tracker({ ip: '198.51.100.2', user })).toBe(
      `user:${USER_ID}`,
    );
  });

  it('counts a login against the IP and the identifier', async () => {
    expect(
      await guard.tracker({ ip: IP, body: { identifier: 'ivan@example.com' } }),
    ).toBe(`${IP}|ivan@example.com`);
  });

  it('normalises the identifier as the lookup does: trimmed, any case', async () => {
    expect(
      await guard.tracker({
        ip: IP,
        body: { identifier: ' Ivan@Example.COM ' },
      }),
    ).toBe(`${IP}|ivan@example.com`);
  });

  it.each([
    ['no body', undefined],
    ['a body without identifier', { refreshToken: 'x' }],
    ['a non-string identifier', { identifier: ['ivan@example.com'] }],
    ['an array body', [{ identifier: 'ivan@example.com' }]],
  ])('counts against the IP alone for %s', async (_, body) => {
    expect(await guard.tracker({ ip: IP, body })).toBe(IP);
  });

  it('keeps the base IPv6 handling: one /64 network is one client', async () => {
    const a = await guard.tracker({ ip: '2001:db8:1:2:aaaa::1' });
    const b = await guard.tracker({ ip: '2001:db8:1:2:bbbb::2' });

    expect(a).toBe(b);
    expect(a).not.toBe(await guard.tracker({ ip: '2001:db8:1:3::1' }));
  });
});
