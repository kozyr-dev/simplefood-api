import { Check, Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '@/database/entities/base.entity';

export enum UserRole {
  Customer = 'customer',
  Editor = 'editor',
  Admin = 'admin',
}

/**
 * Not `user`: that's a reserved word in Postgres (`SELECT * FROM user`
 * returns the current database role).
 *
 * The checks repeat the DTO rules for writers that skip the DTOs (the data
 * migration, AdminJS). An email always has an `@` and a username never does,
 * so login by "email or username" can never match two different users.
 */
@Entity('app_user')
@Unique('UQ_user_email', ['email'])
@Unique('UQ_user_username', ['username'])
@Check(
  'CHK_app_user_email',
  `char_length("email") <= 254 AND position('@' in "email") > 1`,
)
@Check(
  'CHK_app_user_username',
  `char_length("username") BETWEEN 2 AND 50 AND position('@' in "username") = 0`,
)
export class User extends AppBaseEntity {
  /**
   * Shown in the UI; letters of any script and spaces are allowed (Strapi
   * usernames have both). citext: unique regardless of case.
   */
  @Column({ type: 'citext' })
  username: string;

  /** citext (EnableCitext migration): `Ivan@Mail.com` and `ivan@mail.com` are one account. */
  @Column({ type: 'citext' })
  email: string;

  /**
   * bcrypt (Strapi's `$2a$10$` hashes included). `select: false`: loaded only
   * when asked for (`addSelect('user.passwordHash')`), so it can't reach a
   * response by accident; hence optional, like any column that isn't loaded.
   */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  /** Registration always creates customers; only admins grant other roles. */
  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.Customer,
  })
  role: UserRole;

  /** Blocked users can't log in or refresh; their sessions are revoked. */
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  /**
   * When the owner proved they read mail at `email` (a verification or
   * password-reset link); `null` until then, and again after an email change.
   */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;
}
