import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '@/media/entities/media.entity';

/**
 * Shares the Media repository with the modules that return media (catalog,
 * blog, pages). Upload endpoints arrive in phase 5.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  exports: [TypeOrmModule],
})
export class MediaModule {}
