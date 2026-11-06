import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '@/config/auth.config';
import { UsersController } from './controllers/users.controller';
import { AccountToken } from './entities/account-token.entity';
import { User } from './entities/user.entity';
import { AccountTokensService } from './services/account-tokens.service';
import { PasswordService } from './services/password.service';
import { UsersService } from './services/users.service';

/**
 * User accounts, their passwords (hashing), single-use account tokens
 * (password-reset and verification links) and the `/users/me` profile.
 * Exports the services for AuthModule (login, register, change-password,
 * password reset);
 * it never imports AuthModule back. The auth decorators it uses are plain
 * functions, and the guards are global.
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([User, AccountToken]),
  ],
  controllers: [UsersController],
  providers: [UsersService, PasswordService, AccountTokensService],
  exports: [UsersService, PasswordService, AccountTokensService],
})
export class UsersModule {}
