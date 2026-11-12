/** Integration tests: real PostgreSQL, real HTTP API, real/stub provider. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  testTimeout: 120000,
};
