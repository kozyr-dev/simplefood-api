import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { MenusController } from './controllers/menus.controller';
import { PagesController } from './controllers/pages.controller';
import { SettingsController } from './controllers/settings.controller';
import { MenuItem } from './entities/menu-item.entity';
import { Menu } from './entities/menu.entity';
import { PageSection } from './entities/page-section.entity';
import { Page } from './entities/page.entity';
import { SiteSettings } from './entities/site-settings.entity';
import { MenusService } from './services/menus.service';
import { PagesService } from './services/pages.service';
import { SectionReferencesService } from './services/section-references.service';
import { SettingsService } from './services/settings.service';
import { Media } from '@/media/entities/media.entity';

/**
 * Site-wide content: settings, navigation menus and pages with sections.
 * Sections refer to media, products and blog categories, which are read
 * here directly (read-only). If product visibility rules grow, move those
 * queries behind a service exported by CatalogModule instead.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SiteSettings,
      Menu,
      MenuItem,
      Page,
      PageSection,
      Media,
      Product,
      BlogCategory,
    ]),
  ],
  controllers: [SettingsController, MenusController, PagesController],
  providers: [
    SettingsService,
    MenusService,
    PagesService,
    SectionReferencesService,
  ],
})
export class ContentModule {}
