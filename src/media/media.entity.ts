import { Check, Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../database/entities/base.entity';

/** One resized variant of an image (generated on upload, phase 5). */
export interface MediaFormat {
  url: string;
  width: number;
  height: number;
}

/** Responsive variants, keyed by size name. Only images have them. */
export type MediaFormats = Partial<
  Record<'thumbnail' | 'small' | 'medium' | 'large', MediaFormat>
>;

/**
 * An uploaded file (product photos, blog images, page section images).
 * Read side only for now: uploads come in phase 5, and the existing files
 * arrive with the Strapi data migration in phase 6.
 */
// Named constraints: a violation then reads `violates check constraint
// "CHK_media_size_non_negative"`, not a generated hash.
@Entity()
@Check('CHK_media_size_non_negative', '"size" >= 0')
@Check('CHK_media_width_positive', '"width" IS NULL OR "width" > 0')
@Check('CHK_media_height_positive', '"height" IS NULL OR "height" > 0')
export class Media extends AppBaseEntity {
  /** Relative path, e.g. `/uploads/borscht_3f9a.jpg` (absolute URLs: phase 5). */
  @Column({ type: 'text' })
  url: string;

  /** MIME type, e.g. `image/jpeg`. */
  @Column({ type: 'varchar', length: 100 })
  mime: string;

  /** File size in bytes (Strapi stores kilobytes; converted on migration). */
  @Column({ type: 'integer' })
  size: number;

  /** Pixel dimensions; null for files that aren't images. */
  @Column({ type: 'integer', nullable: true })
  width: number | null;

  @Column({ type: 'integer', nullable: true })
  height: number | null;

  /** Alternative text for screen readers and SEO. */
  @Column({ type: 'text', nullable: true })
  alt: string | null;

  /** Optional grouping in the admin (e.g. `products`, `blog`). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  folder: string | null;

  @Column({ type: 'jsonb', nullable: true })
  formats: MediaFormats | null;
}
