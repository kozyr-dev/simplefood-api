import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResultDto } from '@/auth/dto/auth-result.dto';
import type { User } from '@/users/entities/user.entity';
import { TEST_PASSWORD } from './factories';

/**
 * Logs `user` in through `POST /api/auth/login` and returns the response's
 * `data`: `const { accessToken } = await loginAs(app, user)`.
 */
export async function loginAs(
  app: INestApplication<App>,
  user: Pick<User, 'email'>,
  password = TEST_PASSWORD,
): Promise<AuthResultDto> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ identifier: user.email, password })
    .expect(200);
  return (res.body as { data: AuthResultDto }).data;
}

export const bearer = (token: string) => ({
  Authorization: `Bearer ${token}`,
});
