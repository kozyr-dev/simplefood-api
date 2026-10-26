import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from '@/health/health.module';
import { MediaModule } from '@/media/media.module';
import { CatalogModule } from '@/catalog/catalog.module';
import { ContentModule } from '@/content/content.module';
import { BlogModule } from './blog/blog.module';
import databaseConfig from '@/config/database.config';
import validationSchema from '@/config/env.validation';
import loggerConfig from '@/config/logger.config';

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
    MediaModule,
    CatalogModule,
    ContentModule,
    BlogModule,
  ],
})
export class AppModule {}
