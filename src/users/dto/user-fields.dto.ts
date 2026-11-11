import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** A phone number as people type it; shared with checkout (orders). */
export const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
export const PHONE_MESSAGE =
  '$property must be 7-20 digits, spaces, "-", "(", ")", optionally after "+"';

/*
 * The editable account fields and their rules, in one place: registration
 * picks some (auth's RegisterDto), PATCH /users/me takes them all as
 * optional (UpdateMeDto). Never a request body itself.
 *
 * The entity's CHECK constraints repeat the username and email rules for
 * writers that skip the DTOs (the data migration, the admin CLI).
 */
export class UserFieldsDto {
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
   * Contact phone, optional: `null` for none.
   * @example "+380 67 123 45 67"
   */
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string | null;

  /**
   * Delivery address, optional: `null` for none.
   * @example "Kyiv, Khreshchatyk St, 1, apt. 5"
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string | null;
}
