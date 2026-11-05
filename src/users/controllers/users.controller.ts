import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { AuthThrottlerGuard } from '@/auth/guards/auth-throttler.guard';
import type { AuthUser } from '@/auth/types/auth.types';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import { NoStore } from '@/common/http/no-store.decorator';
import type { DataResponse } from '@/common/http/responses';
import { UpdateMeDto } from '../dto/update-me.dto';
import { UserDto } from '../dto/user.dto';
import { UsersService } from '../services/users.service';

/*
 * Only the caller's own account: the id comes from the access token, never
 * from the URL, so one user can't even ask for another. Needs a login (no
 * @Public()); personal data, so @NoStore().
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The logged-in user's account. */
  @Get('me')
  @NoStore()
  @ApiDataResponse(UserDto)
  async getMe(@CurrentUser() caller: AuthUser): Promise<DataResponse<UserDto>> {
    return { data: await this.users.getProfile(caller.id) };
  }

  /**
   * Changes the fields sent; `null` clears `phone` or `address`. Changing
   * the email needs `currentPassword`. Rate limited per account, since it
   * can check the password.
   */
  @Patch('me')
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @NoStore()
  @ApiDataResponse(UserDto)
  async updateMe(
    @CurrentUser() caller: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<DataResponse<UserDto>> {
    return { data: await this.users.updateProfile(caller.id, dto) };
  }
}
