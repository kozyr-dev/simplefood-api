import {
  IsByteLength,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from '../services/password.service';

/**
 * bcrypt ignores bytes after the 72nd, so a longer password is refused
 * instead of silently cut (D9). Cyrillic letters take 2 bytes, emoji 4.
 */
export const PASSWORD_BYTES_MESSAGE = `$property must be at most ${PASSWORD_MAX_BYTES} bytes in UTF-8 (fewer characters with non-Latin letters or emoji)`;

/*
 * No `role`: registration always creates a customer. The global
 * ValidationPipe has `forbidNonWhitelisted`, so a body that sends one is
 * rejected with 400 instead of being ignored.
 */
export class RegisterDto {
  /**
   * Shown in the UI. Letters of any script, digits and spaces; no `@`
   * (login tells email and username apart by it).
   * @example "Ivan Petrenko"
   */
  @IsString()
  @Length(2, 50)
  @Matches(/^[^@\p{Cc}]+$/u, {
    message: 'username must not contain "@" or control characters',
  })
  username: string;

  /** @example "ivan@example.com" */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /**
   * 8 characters or more, at most 72 bytes in UTF-8.
   * @example "correct horse battery"
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @IsByteLength(0, PASSWORD_MAX_BYTES, { message: PASSWORD_BYTES_MESSAGE })
  password: string;

  /** @example "+380 67 123 45 67" */
  @IsOptional()
  @Matches(/^\+?[\d\s()-]{7,20}$/, {
    message:
      'phone must be 7-20 digits, spaces, "-", "(", ")", optionally after "+"',
  })
  phone?: string;
}
