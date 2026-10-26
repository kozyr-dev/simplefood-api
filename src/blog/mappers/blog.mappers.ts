import { toSeoDto } from '@/common/seo/seo.mapper';
import type { BlogCategoryDto } from '@/blog/dto/blog-category.dto';
import type { BlogPostSummaryDto } from '@/blog/dto/blog-post-summary.dto';
import type { BlogPostDto } from '@/blog/dto/blog-post.dto';
import type { BlogCategory } from '@/blog/entities/blog-category.entity';
import type { BlogPost } from '@/blog/entities/blog-post.entity';
import { toMediaDtoOrNull } from '@/media/mappers/media.mapper';
import { toExcerpt } from './markdown-excerpt';

/** Display order of a post's categories: by name. */
export function compareBlogCategories(a: BlogCategory, b: BlogCategory) {
  return a.name.localeCompare(b.name);
}

export function toBlogCategoryDto(category: BlogCategory): BlogCategoryDto {
  return { id: category.id, name: category.name, slug: category.slug };
}

/**
 * List item: a plain-text excerpt instead of the full markdown.
 * Expects `image` and `categories` to be loaded, and a *published* post:
 * the public queries only return those (`isPublishedNow()`), so a missing
 * `publishedAt` here is a bug in the query, reported loudly instead of
 * sent to clients as `null`.
 */
export function toBlogPostSummaryDto(post: BlogPost): BlogPostSummaryDto {
  if (!post.publishedAt) {
    throw new Error(
      `Blog post ${post.id} is not published; public queries must filter with isPublishedNow()`,
    );
  }

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: toExcerpt(post.text),
    image: toMediaDtoOrNull(post.image),
    publishedAt: post.publishedAt,
    categories: [...(post.categories ?? [])]
      .sort(compareBlogCategories)
      .map(toBlogCategoryDto),
  };
}

/** One post: the summary fields plus the full markdown, SEO and updatedAt. */
export function toBlogPostDto(post: BlogPost): BlogPostDto {
  return Object.assign(toBlogPostSummaryDto(post), {
    text: post.text,
    seo: toSeoDto(post.seo),
    updatedAt: post.updatedAt,
  });
}
