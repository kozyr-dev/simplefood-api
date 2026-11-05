import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /**
   * Email or username.
   * @example "ivan@example.com"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;

  /**
   * No length rules here: accounts migrated from Strapi may have shorter
   * passwords. Capped only to bound the work per request.
   * @example "correct horse battery"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password: string;
}
