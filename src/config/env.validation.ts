import * as Joi from 'joi';

const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  // 1339, not 1338: the legacy Strapi API uses 1338 and both run side by side during migration.
  PORT: Joi.number().port().default(1339),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  // Comma-separated list, e.g. "http://localhost:3000,https://simplefood.kozyr.info".
  // Required on purpose: no permissive fallback if it is forgotten in production.
  CORS_ORIGINS: Joi.string().required(),
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().port().required(),
});

export default validationSchema;
