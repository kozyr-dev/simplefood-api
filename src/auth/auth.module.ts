import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import authConfig from '@/config/auth.config';
import { PasswordService } from './services/password.service';

/** Passwords and, as phase 3 goes on, tokens, guards and the /auth routes. */
@Module({
  imports: [ConfigModule.forFeature(authConfig)],
  providers: [PasswordService],
})
export class AuthModule {}
