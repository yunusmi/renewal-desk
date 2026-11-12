// sequelize-cli connection config. DATABASE_URL is required; no secrets in this file.
const base = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  logging: false,
  timezone: '+00:00',
  migrationStorageTableName: 'schema_migrations',
  // Seeders are idempotent and re-runnable; their execution is not recorded.
  seederStorage: 'none',
};

module.exports = { development: base, test: base, production: base };
