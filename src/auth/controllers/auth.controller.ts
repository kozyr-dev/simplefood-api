import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoStore } from '@/common/http/no-store.decorator';
import type { DataResponse } from '@/common/http/responses';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import type { AuthResultDto } from '../dto/auth-result.dto';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthService } from '../services/auth.service';
import type { AuthUser } from '../types/auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Creates a customer account and logs it in. */
  @Public()
  @Post('register')
  @NoStore()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.register(dto) };
  }

  /** Logs in with email or username; starts a new session. */
  @Public()
  @Post('login')
  @NoStore()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.login(dto) };
  }

  /**
   * Exchanges a refresh token for a new pair. The token sent is used up:
   * store the new one. Public: the access token has usually expired by now.
   */
  @Public()
  @Post('refresh')
  @NoStore()
  @HttpCode(HttpStatus.OK)
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
  async logout(@Body() { refreshToken }: RefreshTokenDto): Promise<void> {
    await this.auth.logout(refreshToken);
  }

  /** Changes the password and ends every other session. */
  @Post('change-password')
  @NoStore()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<DataResponse<AuthResultDto>> {
    return { data: await this.auth.changePassword(user, dto) };
  }
}
