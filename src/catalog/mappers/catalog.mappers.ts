import { toMediaDtoOrNull } from '@/media/mappers/media.mapper';
import type { ProductCategoryDto } from '../dto/product-category.dto';
import type { ProductDto } from '../dto/product.dto';
import type { ProductCategory } from '../entities/product-category.entity';
import type { Product } from '../entities/product.entity';

/** Display order of categories: `position`, then `name`. */
export function compareCategories(a: ProductCategory, b: ProductCategory) {
  return a.position - b.position || a.name.localeCompare(b.name);
}

export function toProductCategoryDto(
  category: ProductCategory,
): ProductCategoryDto {
  return { id: category.id, name: category.name, slug: category.slug };
}

/**
 * Entity -> API shape. Expects `image` and `categories` to be loaded.
 * Categories are sorted here, so the order never depends on how Postgres
 * happened to return the joined rows.
 */
export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price: product.price,
    weight: product.weight,
    calories: product.calories,
    available: product.available,
    featured: product.featured,
    favorite: product.favorite,
    image: toMediaDtoOrNull(product.image),
    categories: [...(product.categories ?? [])]
      .sort(compareCategories)
      .map(toProductCategoryDto),
  };
}
