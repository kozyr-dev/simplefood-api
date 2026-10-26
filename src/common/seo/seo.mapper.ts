import type { Seo } from '@/database/entities/seo.embedded';
import type { SeoDto } from './seo.dto';

/** Embedded `Seo` columns -> API shape. Shared by settings, blog and pages. */
export function toSeoDto(seo: Seo | null | undefined): SeoDto {
  return {
    title: seo?.title ?? null,
    description: seo?.description ?? null,
  };
}
