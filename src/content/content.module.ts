import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { MenusController } from '@/content/controllers/menus.controller';
import { PagesController } from '@/content/controllers/pages.controller';
import { SettingsController } from '@/content/controllers/settings.controller';
import { MenuItem } from '@/content/entities/menu-item.entity';
import { Menu } from '@/content/entities/menu.entity';
import { PageSection } from '@/content/entities/page-section.entity';
import { Page } from '@/content/entities/page.entity';
import { SiteSettings } from '@/content/entities/site-settings.entity';
import { MenusService } from '@/content/services/menus.service';
import { PagesService } from '@/content/services/pages.service';
import { SectionReferencesService } from '@/content/services/section-references.service';
import { SettingsService } from '@/content/services/settings.service';
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
