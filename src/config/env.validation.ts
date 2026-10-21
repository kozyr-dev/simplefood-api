import * as Joi from 'joi';

const validationSchema = Joi.object({
  // Required, no default: a production deploy that forgets it must fail here,
  // not run with development settings (pretty logs need the dev-only pino-pretty).
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  // 1339, not 1338: the legacy Strapi API uses 1338 and both run side by side during migration.
  PORT: Joi.number().port().default(1339),
  // Pino log level. Optional: when unset, config/logger.config.ts picks one per
  // NODE_ENV (test: silent, development: debug, production: info).
  LOG_LEVEL: Joi.string().valid(
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ),
  // Read by the `database` namespace in config/database.config.ts.
  DB_HOST: Joi.string().hostname().required(),
  // min(1): port() allows 0 ("any free port"), valid to listen on, not to connect to.
  DB_PORT: Joi.number().port().min(1).default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  // Comma-separated list, e.g. "http://localhost:3000,https://simplefood.kozyr.info".
  // Required on purpose: no permissive fallback if it is forgotten in production.
  CORS_ORIGINS: Joi.string().required(),
  // Swagger UI at /api/docs. Off by default: the docs list the whole API surface.
  SWAGGER_ENABLED: Joi.boolean().default(false),
});

export default validationSchema;
