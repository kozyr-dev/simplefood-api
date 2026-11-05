import { UserRole } from '../entities/user.entity';

/** The account as its owner sees it. Never the password hash or `blocked`. */
export class UserDto {
  /** @example "019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b" */
  id: string;

  /** @example "Ivan Petrenko" */
  username: string;

  /** @example "ivan@example.com" */
  email: string;

  /** @example "+380 67 123 45 67" */
  phone: string | null;

  /** @example "Kyiv, Khreshchatyk St, 1" */
  address: string | null;

  /** @example "customer" */
  role: UserRole;

  createdAt: Date;
}
