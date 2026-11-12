'use strict';
const bcrypt = require('bcryptjs');
const { DEMO_PASSWORD, BCRYPT_COST } = require('./core');

/** Known fictional passwords are allowed only in explicitly local/test deployments.
 * NODE_ENV=production is normal for local runtime images; APP_ENV controls deployment mode.
 */
function assertFictionalSeedEnvironment(env = process.env) {
  if (!['development', 'test'].includes(env.APP_ENV)) {
    throw new Error('Fictional Core/Demo seed requires explicit APP_ENV=development or test; production seeding is forbidden');
  }
}

/**
 * Claims the database for one dataset kind; refuses to load a different
 * dataset over existing data (core/demo/test never mix).
 */
async function claimDataset(qi, kind, transaction) {
  await qi.bulkInsert('dataset_meta', [{ key: 'dataset_kind', value: kind }], { transaction, ignoreDuplicates: true });
  const current = await qi.rawSelect('dataset_meta', { where: { key: 'dataset_kind' }, transaction }, 'value');
  if (current !== kind) {
    throw new Error(`Database already holds dataset "${current}", refusing to seed "${kind}"`);
  }
}

/** Inserts missing users with a fresh bcrypt hash; existing users are never rehashed or changed. */
async function insertUsers(qi, users, transaction) {
  const existing = await qi.select(null, 'users', {
    where: { id: users.map((u) => u.id) }, attributes: ['id'], transaction,
  });
  const known = new Set(existing.map((r) => r.id));
  const missing = users.filter((u) => !known.has(u.id));
  if (missing.length === 0) return;
  const rows = [];
  for (const u of missing) {
    rows.push({ id: u.id, email: u.email, name: u.name, password_hash: await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST) });
  }
  await qi.bulkInsert('users', rows, { transaction, ignoreDuplicates: true });
  await qi.bulkInsert(
    'workspace_members',
    missing.map((u) => ({ workspace_id: u.workspace_id, user_id: u.id, can_initiate: u.can_initiate, can_approve: u.can_approve })),
    { transaction, ignoreDuplicates: true },
  );
}

module.exports = { assertFictionalSeedEnvironment, claimDataset, insertUsers };
