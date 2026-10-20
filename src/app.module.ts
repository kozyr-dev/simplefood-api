import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import databaseConfig from './config/database.config';
import validationSchema from './config/env.validation';
import loggerConfig from './config/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [databaseConfig, loggerConfig],
    }),
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    LoggerModule.forRootAsync(loggerConfig.asProvider()),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
