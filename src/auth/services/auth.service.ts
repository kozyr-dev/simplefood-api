import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toUserDto } from '@/users/mappers/user.mapper';
import { UsersService } from '@/users/services/users.service';
import type { User } from '@/users/entities/user.entity';
import type { AuthResultDto } from '../dto/auth-result.dto';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { LoginDto } from '../dto/login.dto';
import type { RegisterDto } from '../dto/register.dto';
import type { AuthUser } from '../types/auth.types';
import { AccessTokensService } from './access-tokens.service';
import { PASSWORD_MAX_BYTES, PasswordService } from './password.service';
import {
  RefreshTokensService,
  type IssuedRefreshToken,
} from './refresh-tokens.service';

/** Same answer for an unknown identifier and a wrong password. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Invalid email/username or password',
    code: 'INVALID_CREDENTIALS',
  });
}

/**
 * The /auth flows. Passwords are hashed before a transaction starts (bcrypt
 * takes ~200 ms at cost 12; no connection is held meanwhile).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokensService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates a customer and logs them in. 409 for a taken email/username. */
  async register({
    username,
    email,
    password,
    phone,
  }: RegisterDto): Promise<AuthResultDto> {
    const passwordHash = await this.passwords.hash(password);
    // One transaction: no account is left behind if issuing the session fails.
    return this.dataSource.transaction(async (manager) => {
      const user = await this.users.create(
        { username, email, passwordHash, phone: phone ?? null },
        manager,
      );
      return this.result(
        user,
        await this.refreshTokens.issue(user.id, manager),
      );
    });
  }

  async login({ identifier, password }: LoginDto): Promise<AuthResultDto> {
    const user = await this.users.findByIdentifierWithPassword(identifier);
    const hash = user?.passwordHash;
    // Unknown users are checked against a dummy hash: same time, same 401.
    const matches = await this.passwords.verify(password, hash);
    if (!user || !hash || !matches) {
      throw invalidCredentials();
    }
    // Only after the right password: don't tell strangers an account is blocked.
    if (user.blocked) {
      throw new ForbiddenException({
        message: 'This account is blocked',
        code: 'ACCOUNT_BLOCKED',
      });
    }

    // Strapi's cost-10 hashes are upgraded while the password is at hand
    // (D8). A legacy password over 72 bytes can't be re-hashed: bcrypt only
    // ever used its first 72 bytes, and hash() refuses the rest.
    if (
      this.passwords.needsRehash(hash) &&
      Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES
    ) {
      await this.users.setPassword(
        user.id,
        await this.passwords.hash(password),
      );
    }

    return this.result(user, await this.refreshTokens.issue(user.id));
  }

  /** A new token pair for a valid refresh token; 401 otherwise. */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    return this.tokens(rotated.user, rotated.refreshToken);
  }

  /** Ends the token's session. Unknown tokens are ignored. */
  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revokeFamily(refreshToken);
  }

  /**
   * Sets a new password and ends every session, this one included; the
   * caller continues with the new pair. Access tokens already issued stay
   * valid until they expire (D3).
   */
  async changePassword(
    caller: AuthUser,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<AuthResultDto> {
    const user = await this.users.findByIdWithPassword(caller.id);
    // Deleted or blocked since the access token was issued.
    if (!user?.passwordHash || user.blocked) {
      throw new UnauthorizedException('Authentication required');
    }
    // 400, not 401: the frontend answers any 401 with a token refresh (D13).
    if (!(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new BadRequestException({
        message: 'Current password is incorrect',
        code: 'WRONG_PASSWORD',
      });
    }

    const passwordHash = await this.passwords.hash(newPassword);
    return this.dataSource.transaction(async (manager) => {
      await this.users.setPassword(user.id, passwordHash, manager);
      await this.refreshTokens.revokeAllForUser(user.id, manager);
      return this.result(
        user,
        await this.refreshTokens.issue(user.id, manager),
      );
    });
  }

  private async tokens(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthTokensDto> {
    return {
      accessToken: await this.accessTokens.sign({
        id: user.id,
        role: user.role,
      }),
      expiresIn: this.accessTokens.ttlSeconds,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  private async result(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<AuthResultDto> {
    return Object.assign(await this.tokens(user, refreshToken), {
      user: toUserDto(user),
    });
  }
}
