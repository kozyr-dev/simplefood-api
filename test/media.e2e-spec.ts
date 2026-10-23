import {
  DataSource,
  In,
  type DataSourceOptions,
  type Repository,
} from 'typeorm';
import databaseConfig from '../src/config/database.config';
import { Media } from '../src/media/media.entity';

/*
 * The Media table against real Postgres: what AppBaseEntity generates (UUIDv7
 * ids, timestamps), the jsonb column, and the database-level constraints.
 * Cleans up its own rows, since other e2e files share this database.
 */
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Media entity (e2e)', () => {
  let dataSource: DataSource;
  let media: Repository<Media>;
  const createdIds: string[] = [];

  const newMedia = (overrides: Partial<Media> = {}) =>
    media.create({
      url: `/uploads/test-${Math.random().toString(36).slice(2)}.jpg`,
      mime: 'image/jpeg',
      size: 1024,
      width: 800,
      height: 600,
      ...overrides,
    });

  const save = async (entity: Media) => {
    const saved = await media.save(entity);
    createdIds.push(saved.id);
    return saved;
  };

  beforeAll(async () => {
    dataSource = await new DataSource({
      ...databaseConfig(),
      logging: false,
    } as DataSourceOptions).initialize();
    media = dataSource.getRepository(Media);
  });

  afterAll(async () => {
    if (createdIds.length) await media.delete({ id: In(createdIds) });
    await dataSource?.destroy();
  });

  describe('AppBaseEntity columns', () => {
    it('gets a UUIDv7 id from Postgres, readable right after save', async () => {
      const saved = await save(newMedia());

      expect(saved.id).toMatch(UUID_V7);
    });

    it('generates ids that sort by creation time', async () => {
      const first = await save(newMedia());
      const second = await save(newMedia());

      expect(first.id < second.id).toBe(true);
    });

    it('sets createdAt and updatedAt, and bumps updatedAt on update', async () => {
      const saved = await save(newMedia());
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt.getTime()).toBe(saved.createdAt.getTime());

      await new Promise((resolve) => setTimeout(resolve, 10));
      saved.alt = 'changed';
      const updated = await media.save(saved);

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        saved.createdAt.getTime(),
      );
    });
  });

  it('stores and returns formats as an object (jsonb)', async () => {
    const formats = {
      thumbnail: { url: '/uploads/thumbnail_a.jpg', width: 156, height: 104 },
      small: { url: '/uploads/small_a.jpg', width: 500, height: 333 },
    };
    const saved = await save(newMedia({ formats }));

    const loaded = await media.findOneByOrFail({ id: saved.id });
    expect(loaded.formats).toEqual(formats);
  });

  it('allows files without dimensions (non-images)', async () => {
    const saved = await save(
      newMedia({ mime: 'application/pdf', width: null, height: null }),
    );

    expect(await media.findOneByOrFail({ id: saved.id })).toMatchObject({
      width: null,
      height: null,
      formats: null,
    });
  });

  it.each([
    ['CHK_media_size_non_negative', { size: -1 }],
    ['CHK_media_width_positive', { width: 0 }],
    ['CHK_media_height_positive', { height: -5 }],
  ])('rejects invalid data in the database (%s)', async (constraint, bad) => {
    await expect(media.save(newMedia(bad))).rejects.toThrow(constraint);
  });
});
