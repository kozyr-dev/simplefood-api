import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenusController } from '@/content/controllers/menus.controller';
import { SettingsController } from '@/content/controllers/settings.controller';
import { MenuItem } from '@/content/entities/menu-item.entity';
import { Menu } from '@/content/entities/menu.entity';
import { SiteSettings } from '@/content/entities/site-settings.entity';
import { MenusService } from '@/content/services/menus.service';
import { SettingsService } from '@/content/services/settings.service';

/** Site-wide content: settings and navigation menus (pages arrive in 2.5). */
@Module({
  imports: [TypeOrmModule.forFeature([SiteSettings, Menu, MenuItem])],
  controllers: [SettingsController, MenusController],
  providers: [SettingsService, MenusService],
})
export class ContentModule {}
