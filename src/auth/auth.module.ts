import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig, { type AuthConfig } from '@/config/auth.config';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  AccessTokensService,
  jwtModuleOptions,
} from './services/access-tokens.service';
import { PasswordService } from './services/password.service';
import { RefreshTokensService } from './services/refresh-tokens.service';

/** Passwords and tokens; guards and the /auth routes follow in phase 3. */
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
  providers: [PasswordService, AccessTokensService, RefreshTokensService],
})
export class AuthModule {}
