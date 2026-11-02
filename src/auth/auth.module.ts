import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import {
  AccessTokensService,
  jwtModuleOptions,
} from './services/access-tokens.service';
import { PasswordService } from './services/password.service';
import { RefreshTokensService } from './services/refresh-tokens.service';

/**
 * Passwords, tokens and the global guards: every route needs a login unless
 * it's `@Public()`. The /auth routes follow in phase 3.
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (auth: AuthConfig) => jwtModuleOptions(auth),
    }),
    TypeOrmModule.forFeature([RefreshToken]),
  ],
  providers: [
    PasswordService,
    AccessTokensService,
    RefreshTokensService,
    // Global guards run in the order they're registered: authenticate first,
    // so RolesGuard sees request.user.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
