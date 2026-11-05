import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { RegisterDto } from './register.dto';

/** The properties that failed, as ValidationPipe would report them. */
async function invalid(cls: new () => object, body: object) {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('RegisterDto', () => {
  const valid = {
    username: 'Ivan Petrenko',
    email: 'ivan@example.com',
    password: 'correct horse',
  };

  it('accepts a valid body, with or without a phone', async () => {
    expect(await invalid(RegisterDto, valid)).toEqual([]);
    expect(
      await invalid(RegisterDto, { ...valid, phone: '+380 (67) 123-45-67' }),
    ).toEqual([]);
  });

  it.each([
    ['Cyrillic and spaces', 'Іван Петренко'],
    ['2 characters', 'Ів'],
    ['50 characters', 'x'.repeat(50)],
    ['digits and punctuation', "O'Brien-2"],
  ])('accepts a username with %s', async (_, username) => {
    expect(await invalid(RegisterDto, { ...valid, username })).toEqual([]);
  });

  it.each([
    ['1 character', 'x'],
    ['51 characters', 'x'.repeat(51)],
    ['an @ (would look like an email at login)', 'ivan@home'],
    ['a control character', 'Ivan\u0000'],
    ['a newline', 'Ivan\nPetrenko'],
    ['a number instead of a string', 42],
  ])('refuses a username with %s', async (_, username) => {
    expect(await invalid(RegisterDto, { ...valid, username })).toEqual([
      'username',
    ]);
  });

  it.each([
    ['no @', 'ivan.example.com'],
    ['no domain', 'ivan@'],
    ['255 characters', `${'x'.repeat(243)}@example.com`],
  ])('refuses an email with %s', async (_, email) => {
    expect(await invalid(RegisterDto, { ...valid, email })).toEqual(['email']);
  });

  it.each([
    ['8 characters', '12345678'],
    ['72 bytes', 'x'.repeat(72)],
    ['36 Cyrillic letters (72 bytes)', 'ж'.repeat(36)],
    ['spaces around it (kept, not trimmed)', '  secret word  '],
  ])('accepts a password of %s', async (_, password) => {
    expect(await invalid(RegisterDto, { ...valid, password })).toEqual([]);
  });

  it.each([
    ['7 characters', '1234567'],
    ['73 bytes', 'x'.repeat(73)],
    ['37 Cyrillic letters (74 bytes)', 'ж'.repeat(37)],
    ['19 emoji (76 bytes)', '🔑'.repeat(19)],
  ])('refuses a password of %s', async (_, password) => {
    expect(await invalid(RegisterDto, { ...valid, password })).toEqual([
      'password',
    ]);
  });

  it.each([
    ['letters', 'call me'],
    ['too short', '12345'],
    ['too long', '1'.repeat(21)],
    ['a + in the middle', '380+671234567'],
  ])('refuses a phone with %s', async (_, phone) => {
    expect(await invalid(RegisterDto, { ...valid, phone })).toEqual(['phone']);
  });

  it('refuses a role: registration can only create customers', async () => {
    expect(await invalid(RegisterDto, { ...valid, role: 'admin' })).toEqual([
      'role',
    ]);
  });
});

describe('LoginDto', () => {
  it('accepts any non-empty password: no length rules for old accounts', async () => {
    expect(
      await invalid(LoginDto, { identifier: 'ivan', password: 'short' }),
    ).toEqual([]);
  });

  it.each([
    ['an empty identifier', { identifier: '', password: 'secret' }],
    ['an empty password', { identifier: 'ivan', password: '' }],
    [
      'a 257-character password',
      { identifier: 'ivan', password: 'x'.repeat(257) },
    ],
    ['no password', { identifier: 'ivan' }],
  ])('refuses %s', async (_, body) => {
    expect(await invalid(LoginDto, body)).toHaveLength(1);
  });
});

describe('ChangePasswordDto', () => {
  it('checks the new password like registration, the current one like login', async () => {
    expect(
      await invalid(ChangePasswordDto, {
        currentPassword: 'short',
        newPassword: 'long enough',
      }),
    ).toEqual([]);
    expect(
      await invalid(ChangePasswordDto, {
        currentPassword: 'long enough',
        newPassword: 'short',
      }),
    ).toEqual(['newPassword']);
    expect(
      await invalid(ChangePasswordDto, {
        currentPassword: 'long enough',
        newPassword: 'ж'.repeat(37),
      }),
    ).toEqual(['newPassword']);
  });
});

describe('RefreshTokenDto', () => {
  it('accepts any non-empty string: a malformed token gets the 401, not a 400', async () => {
    expect(await invalid(RefreshTokenDto, { refreshToken: 'x' })).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['empty', { refreshToken: '' }],
    ['not a string', { refreshToken: 42 }],
  ])('refuses a token that is %s', async (_, body) => {
    expect(await invalid(RefreshTokenDto, body)).toEqual(['refreshToken']);
  });
});
