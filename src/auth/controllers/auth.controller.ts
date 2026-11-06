import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { hours, minutes, Throttle } from '@nestjs/throttler';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import {
  ApiAuth,
  ApiDataResponse,
  ApiRateLimited,
} from '@/common/http/api-responses.decorator';
import { NoStore } from '@/common/http/no-store.decorator';
import type { DataResponse } from '@/common/http/responses';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { ThrottleBy } from '../decorators/throttle-by.decorator';
import { AuthResultDto } from '../dto/auth-result.dto';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { AuthService } from '../services/auth.service';
import type { AuthUser } from '../types/auth.types';

// Rate limited: logout gets the module's default (30 per minute).
@ApiTags('auth')
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
@ApiRateLimited()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Creates a customer account and logs it in. */
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @NoStore()
  @HttpCode(HttpStatus.CREATED)
  @ApiDataResponse(AuthResultDto, { status: HttpStatus.CREATED })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'The email (`EMAIL_TAKEN`) or username (`USERNAME_TAKEN`) is in use, in any letter case.',
  })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.register(dto) };
  }

  /** Logs in with email or username; starts a new session. */
  @Public()
  @Post('login')
  // Per IP and identifier; the 6th try in a minute blocks for 5 minutes.
  @ThrottleBy('identifier')
  @Throttle({
    default: { limit: 5, ttl: minutes(1), blockDuration: minutes(5) },
  })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AuthResultDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Wrong identifier or password (`INVALID_CREDENTIALS`); the response does not say which.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The password is right but the account is blocked (`ACCOUNT_BLOCKED`).',
  })
  async login(@Body() dto: LoginDto): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.login(dto) };
  }

  /**
   * Exchanges a refresh token for a new pair. The token sent is used up:
   * store the new one. Public: the access token has usually expired by now.
   */
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AuthTokensDto)
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Unknown, expired or already used (`INVALID_REFRESH_TOKEN`): log in again. ' +
      'Reusing a used token ends its whole session.',
  })
  async refresh(
    @Body() { refreshToken }: RefreshTokenDto,
  ): Promise<DataResponse<AuthTokensDto>> {
    return { data: await this.auth.refresh(refreshToken) };
  }

  /**
   * Ends the session the refresh token belongs to. Always 204, also for an
   * unknown or expired token. Public: the refresh token proves the session.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'The session has ended, or there was none to end.',
  })
  async logout(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    await this.auth.logout(refreshToken);
  }

  /** Changes the password and ends every other session. */
  @Post('change-password')
  // Per account (see AuthThrottlerGuard): it checks the current password.
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @NoStore()
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiDataResponse(AuthResultDto)
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Validation failed, or `currentPassword` is wrong (`WRONG_PASSWORD`).',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.changePassword(user, dto) };
  }
}
