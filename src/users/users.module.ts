import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '@/config/auth.config';
import { UsersController } from './controllers/users.controller';
import { User } from './entities/user.entity';
import { PasswordService } from './services/password.service';
import { UsersService } from './services/users.service';

/**
 * User accounts, their passwords (hashing) and the `/users/me` profile.
 * Exports both services for AuthModule (login, register, change-password);
 * it never imports AuthModule back. The auth decorators it uses are plain
 * functions, and the guards are global.
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [UsersController],
  providers: [UsersService, PasswordService],
  exports: [UsersService, PasswordService],
})
export class UsersModule {}
