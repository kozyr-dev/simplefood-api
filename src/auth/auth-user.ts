import type { UserRole } from '@/users/entities/user.entity';

/**
 * Who is calling: read from a valid access token, without a database query.
 * `role` is the role when the token was issued (at most JWT_ACCESS_TTL ago).
 */
export interface AuthUser {
  id: string;
  role: UserRole;
}
