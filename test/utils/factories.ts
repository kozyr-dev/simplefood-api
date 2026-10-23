import type { DataSource } from 'typeorm';
import { Media } from '../../src/media/media.entity';

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
