import type { DataSource } from 'typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { BlogPost } from '@/blog/entities/blog-post.entity';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { MenuItem, MenuItemGroup } from '@/content/entities/menu-item.entity';
import { Menu, type MenuKey } from '@/content/entities/menu.entity';
import { SiteSettings } from '@/content/entities/site-settings.entity';
import { Media } from '@/media/entities/media.entity';

/*
 * Test data factories: save a valid row with sensible defaults, so each test
 * only spells out what it's about: `createMedia(ds, { width: null })`.
 * Values that must be unique get a counter, so repeated calls never collide.
 * Add one factory per entity as entities arrive (createProduct, ...).
 */

let sequence = 0;
const next = () => ++sequence;

export function createMedia(
  dataSource: DataSource,
  overrides: Partial<Media> = {},
): Promise<Media> {
  const n = next();
  const repository = dataSource.getRepository(Media);
  return repository.save(
    repository.create({
      url: `/uploads/test-${n}.jpg`,
      mime: 'image/jpeg',
      size: 1024,
      width: 800,
      height: 600,
      alt: `Test image ${n}`,
      ...overrides,
    }),
  );
}

export function createCategory(
  dataSource: DataSource,
  overrides: Partial<ProductCategory> = {},
): Promise<ProductCategory> {
  const n = next();
  const repository = dataSource.getRepository(ProductCategory);
  return repository.save(
    repository.create({
      name: `Category ${n}`,
      slug: `category-${n}`,
      position: 0,
      ...overrides,
    }),
  );
}

/** E.g. `createProduct(ds, { categories: [pizza], image, price: 18900 })`. */
export function createProduct(
  dataSource: DataSource,
  overrides: Partial<Product> = {},
): Promise<Product> {
  const n = next();
  const repository = dataSource.getRepository(Product);
  return repository.save(
    repository.create({
      slug: `product-${n}`,
      title: `Product ${n}`,
      description: `<p>Description ${n}</p>`,
      price: 10000,
      weight: 300,
      calories: 400,
      categories: [],
      image: null,
      ...overrides,
    }),
  );
}

/** The single settings row (id 1). */
export function createSettings(
  dataSource: DataSource,
  overrides: Partial<SiteSettings> = {},
): Promise<SiteSettings> {
  const repository = dataSource.getRepository(SiteSettings);
  return repository.save(
    repository.create({
      siteName: 'SimpleFood',
      phone: '+380 44 123 45 67',
      address: 'Kyiv, Khreshchatyk St, 1',
      workingHours: 'Mon–Sun 10:00–22:00',
      takingOrdersHours: 'until 21:30',
      facebook: 'https://facebook.com/simplefood',
      instagram: 'https://instagram.com/simplefood',
      seo: { title: 'SimpleFood', description: 'Home-style food delivery' },
      ...overrides,
    }),
  );
}

/** E.g. `createMenu(ds, MenuKey.Header, [{ title: 'Home', position: 1 }])`. */
export async function createMenu(
  dataSource: DataSource,
  key: MenuKey,
  items: Partial<MenuItem>[] = [],
): Promise<Menu> {
  const menu = await dataSource.getRepository(Menu).save({ key });
  const itemRepository = dataSource.getRepository(MenuItem);
  menu.items = await itemRepository.save(
    items.map((item) => {
      const n = next();
      return itemRepository.create({
        title: `Item ${n}`,
        link: `/item-${n}`,
        className: null,
        group: MenuItemGroup.Main,
        position: 0,
        ...item,
        menu,
      });
    }),
  );
  return menu;
}

export function createBlogCategory(
  dataSource: DataSource,
  overrides: Partial<BlogCategory> = {},
): Promise<BlogCategory> {
  const n = next();
  const repository = dataSource.getRepository(BlogCategory);
  return repository.save(
    repository.create({
      name: `Blog category ${n}`,
      slug: `blog-category-${n}`,
      ...overrides,
    }),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date `days` from now: negative = in the past. */
export const daysFromNow = (days: number) =>
  new Date(Date.now() + days * DAY_MS);

/**
 * Published a day ago by default. `publishedAt: null` makes a draft, a future
 * date (`daysFromNow(1)`) a scheduled post.
 */
export function createBlogPost(
  dataSource: DataSource,
  overrides: Partial<BlogPost> = {},
): Promise<BlogPost> {
  const n = next();
  const repository = dataSource.getRepository(BlogPost);
  return repository.save(
    repository.create({
      slug: `blog-post-${n}`,
      title: `Blog post ${n}`,
      text: `## Post ${n}\n\nSome **news** about our dishes.`,
      image: null,
      seo: { title: null, description: null },
      publishedAt: daysFromNow(-1),
      categories: [],
      ...overrides,
    }),
  );
}
