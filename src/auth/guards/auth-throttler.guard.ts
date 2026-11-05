import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthRequest } from '../types/auth.types';

type ThrottledRequest = AuthRequest & { ip?: string; body?: unknown };

/**
 * Rate limits for routes that check a password or create accounts. Not
 * global (D12): every server-rendered page reaches the API from the Next
 * server's one IP, so a global per-IP limit would take the whole site down.
 * Apply it with `@UseGuards(AuthThrottlerGuard)` and set the limits with
 * `@Throttle()`. Counters live in memory, per process: use a shared store
 * (Redis) before running more than one instance.
 *
 * Who a request counts against:
 * - a logged-in caller: their account, from any IP, so a stolen access token
 *   can't spread password guesses over many addresses;
 * - a body with `identifier` (login): the IP and that identifier, so one
 *   client failing logins can't lock everyone behind the same IP out, and
 *   one account's lockout ends with its block;
 * - otherwise: the IP.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: ThrottledRequest): Promise<string> {
    if (req.user) {
      return `user:${req.user.id}`;
    }
    // The base tracker: req.ip, with IPv6 reduced to its /64 network.
    const ip = await super.getTracker(req);
    // Runs before the pipes: the body is raw JSON, so normalise it the way
    // the lookup does (trimmed, case-insensitive).
    const { identifier } = (req.body ?? {}) as { identifier?: unknown };
    return typeof identifier === 'string'
      ? `${ip}|${identifier.trim().toLowerCase()}`
      : ip;
  }
}
