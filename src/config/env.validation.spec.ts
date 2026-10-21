import validationSchema from './env.validation';

/** The smallest environment the app accepts. */
const minimalEnv = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal',
  DB_USER: 'app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'simplefood',
  CORS_ORIGINS: 'https://simplefood.kozyr.info',
};

// Same options @nestjs/config uses by default.
const validate = (env: Record<string, unknown>) =>
  validationSchema.validate(env, { allowUnknown: true, abortEarly: false });

const errorKeys = (env: Record<string, unknown>) =>
  validate(env).error?.details.map((detail) => detail.context?.key) ?? [];

describe('env validation schema', () => {
  it('accepts the minimal environment and fills in the defaults', () => {
    const { error, value } = validate(minimalEnv);

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      PORT: 1339,
      DB_PORT: 5432,
      SWAGGER_ENABLED: false,
    });
    expect(value.LOG_LEVEL).toBeUndefined(); // logger.config picks per NODE_ENV
  });

  it.each([
    'NODE_ENV',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'CORS_ORIGINS',
  ])('requires %s', (key) => {
    const env: Record<string, unknown> = { ...minimalEnv };
    delete env[key];

    expect(errorKeys(env)).toEqual([key]);
  });

  it('reports every problem at once, not just the first', () => {
    expect(errorKeys({ NODE_ENV: 'staging' })).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'DB_HOST',
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'CORS_ORIGINS',
      ]),
    );
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['DB_PORT', '0'],
    ['DB_HOST', 'not a host!'],
    ['LOG_LEVEL', 'verbose'],
    ['LOG_LEVEL', 'INFO'],
    ['SWAGGER_ENABLED', 'maybe'],
  ])('rejects %s=%s', (key, value) => {
    expect(errorKeys({ ...minimalEnv, [key]: value })).toEqual([key]);
  });

  it('converts numbers and booleans from their string form', () => {
    const { value } = validate({
      ...minimalEnv,
      PORT: '8080',
      DB_PORT: '5433',
      SWAGGER_ENABLED: 'true',
    });

    expect(value).toMatchObject({
      PORT: 8080,
      DB_PORT: 5433,
      SWAGGER_ENABLED: true,
    });
  });

  it('ignores variables it does not know (e.g. POSTGRES_* for Docker Compose)', () => {
    expect(
      validate({ ...minimalEnv, POSTGRES_PORT: '5433' }).error,
    ).toBeUndefined();
  });
});
