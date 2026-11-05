import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, type Repository } from 'typeorm';
import type { UserDto } from '@/users/dto/user.dto';
import { User, UserRole } from '@/users/entities/user.entity';
import { bearer, loginAs } from './utils/auth';
import { resetDatabase } from './utils/database';
import { createUser, TEST_PASSWORD } from './utils/factories';
import { createTestApp, UUID } from './utils/test-app';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let users: Repository<User>;
  let user: User;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    user = await createUser(dataSource, {
      username: 'Ivan Petrenko',
      email: 'ivan@example.com',
      phone: '+380 67 123 45 67',
      address: 'Kyiv, Khreshchatyk St, 1',
    });
    ({ accessToken: token } = await loginAs(app, user));
  });

  afterAll(async () => {
    await app.close();
  });

  const getMe = (accessToken = token) =>
    request(app.getHttpServer()).get('/api/users/me').set(bearer(accessToken));

  const patchMe = (body: object, accessToken = token) =>
    request(app.getHttpServer())
      .patch('/api/users/me')
      .set(bearer(accessToken))
      .send(body);

  const stored = (id = user.id) => users.findOneByOrFail({ id });

  /** The error body, without the per-request id. */
  const errorOf = (res: request.Response) => {
    const { requestId, ...rest } = (
      res.body as { error: { requestId: string } }
    ).error;
    expect(requestId).toMatch(UUID);
    return rest;
  };

  describe('GET /users/me', () => {
    it('returns the caller, without the hash or the blocked flag', async () => {
      const res = await getMe().expect(200);

      expect(res.body).toEqual({
        data: {
          id: user.id,
          username: 'Ivan Petrenko',
          email: 'ivan@example.com',
          phone: '+380 67 123 45 67',
          address: 'Kyiv, Khreshchatyk St, 1',
          role: 'customer',
          createdAt: user.createdAt.toISOString(),
        },
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('needs a login (401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .expect(401);

      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it.each([
      ['blocked', (id: string) => users.update(id, { blocked: true })],
      ['deleted', (id: string) => users.delete(id)],
    ])(
      'refuses a user %s since the token was issued (401, so the client refreshes and is logged out)',
      async (_, change) => {
        await change(user.id);

        const res = await getMe().expect(401);

        expect(errorOf(res)).toEqual({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      },
    );

    it('shows every caller their own account, and only that', async () => {
      const other = await createUser(dataSource);
      const otherToken = (await loginAs(app, other)).accessToken;

      expect((await getMe().expect(200)).body.data.id).toBe(user.id);
      expect((await getMe(otherToken).expect(200)).body.data.id).toBe(other.id);
    });

    it('has no route that takes a user id', async () => {
      await request(app.getHttpServer())
        .get(`/api/users/${user.id}`)
        .set(bearer(token))
        .expect(404);
    });
  });

  describe('PATCH /users/me', () => {
    it('changes the fields sent and keeps the others', async () => {
      const res = await patchMe({
        username: 'Іван Петренко',
        address: 'Lviv, Rynok Sq, 2',
      }).expect(200);

      expect(res.body.data).toMatchObject({
        username: 'Іван Петренко',
        email: 'ivan@example.com',
        phone: '+380 67 123 45 67',
        address: 'Lviv, Rynok Sq, 2',
      });
      expect(res.headers['cache-control']).toBe('no-store');
      expect((await getMe()).body.data).toEqual(res.body.data);
    });

    it('clears phone and address with null', async () => {
      const res = await patchMe({ phone: null, address: null }).expect(200);

      expect(res.body.data).toMatchObject({ phone: null, address: null });
      expect(await stored()).toMatchObject({ phone: null, address: null });
    });

    it('changes nothing for an empty body, not even updatedAt', async () => {
      const before = (await getMe()).body.data as UserDto;
      const { updatedAt } = await stored();

      const res = await patchMe({}).expect(200);

      expect(res.body.data).toEqual(before);
      expect((await stored()).updatedAt).toEqual(updatedAt);
    });

    it('refuses null for username (400), changing nothing', async () => {
      const res = await patchMe({ username: null, phone: null }).expect(400);

      expect(errorOf(res)).toMatchObject({
        code: 'BAD_REQUEST',
        details: [{ field: 'username', messages: expect.any(Array) }],
      });
      expect((await stored()).phone).toBe('+380 67 123 45 67');
    });

    it.each([
      ['role', { role: UserRole.Admin }],
      ['blocked', { blocked: false }],
    ])(
      'refuses %s in the body (400): nobody can promote or unblock themselves',
      async (field, body) => {
        const res = await patchMe(body).expect(400);

        expect(res.body.error.details).toEqual([
          { field, messages: [`property ${field} should not exist`] },
        ]);
        expect((await stored()).role).toBe(UserRole.Customer);
      },
    );

    it('changes only the caller, never anyone else', async () => {
      const other = await createUser(dataSource);
      const otherBefore = await stored(other.id);

      await patchMe({ username: 'Renamed' }).expect(200);

      expect((await stored()).username).toBe('Renamed');
      expect(await stored(other.id)).toEqual(otherBefore);
    });

    it.each([
      ['blocked', (id: string) => users.update(id, { blocked: true })],
      ['deleted', (id: string) => users.delete(id)],
    ])(
      'refuses a user %s since the token was issued (401)',
      async (_, change) => {
        await change(user.id);

        await patchMe({ username: 'Renamed' }).expect(401);
      },
    );

    it('needs a login (401)', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/me')
        .send({ username: 'Renamed' })
        .expect(401);
    });

    describe('email', () => {
      it('needs the current password to change (400 CURRENT_PASSWORD_REQUIRED)', async () => {
        const res = await patchMe({ email: 'new@example.com' }).expect(400);

        expect(errorOf(res)).toEqual({
          status: 400,
          code: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Changing the email requires currentPassword',
        });
        expect((await stored()).email).toBe('ivan@example.com');
      });

      it('refuses a wrong current password (400 WRONG_PASSWORD, not 401)', async () => {
        const res = await patchMe({
          email: 'new@example.com',
          currentPassword: 'wrong password',
        }).expect(400);

        expect(errorOf(res)).toEqual({
          status: 400,
          code: 'WRONG_PASSWORD',
          message: 'Current password is incorrect',
        });
        expect((await stored()).email).toBe('ivan@example.com');
      });

      it('changes with the right password; login then uses the new email', async () => {
        const res = await patchMe({
          email: 'new@example.com',
          currentPassword: TEST_PASSWORD,
        }).expect(200);

        expect(res.body.data.email).toBe('new@example.com');
        await loginAs(app, { email: 'new@example.com' });
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ identifier: 'ivan@example.com', password: TEST_PASSWORD })
          .expect(401);
      });

      it('needs no password when the email sent is the current one (a full form)', async () => {
        await patchMe({
          username: 'Renamed',
          email: 'ivan@example.com',
          phone: '+380 67 123 45 67',
        }).expect(200);
      });

      it('checks a current password sent without an email change too', async () => {
        await patchMe({
          username: 'Renamed',
          currentPassword: 'wrong password',
        }).expect(400);

        expect((await stored()).username).toBe('Ivan Petrenko');
      });
    });

    describe('taken email or username', () => {
      beforeEach(async () => {
        await createUser(dataSource, {
          username: 'Taken Name',
          email: 'taken@example.com',
        });
      });

      it('refuses an email in use, in any case (409 EMAIL_TAKEN)', async () => {
        const res = await patchMe({
          email: 'TAKEN@example.com',
          currentPassword: TEST_PASSWORD,
        }).expect(409);

        expect(errorOf(res)).toEqual({
          status: 409,
          code: 'EMAIL_TAKEN',
          message: 'An account with this email already exists',
        });
      });

      it('refuses a username in use, in any case (409 USERNAME_TAKEN)', async () => {
        const res = await patchMe({ username: 'taken name' }).expect(409);

        expect(errorOf(res)).toMatchObject({ code: 'USERNAME_TAKEN' });
        expect((await stored()).username).toBe('Ivan Petrenko');
      });
    });
  });
});
