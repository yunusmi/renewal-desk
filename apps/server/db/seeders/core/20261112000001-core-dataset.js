'use strict';
/**
 * Core: 18 resources; DATASET=test retains the 3-resource acceptance fixture.
 * Idempotent: inserts missing stable rows only (ON CONFLICT DO NOTHING); never
 * resets a renewed expiry, never deletes history. Zero renewal requests.
 */
const { WORKSPACES, USERS, RESOURCES } = require('../../data/core');
const { EXTRA_RESOURCES } = require('../../data/core-extra');
const { assertFictionalSeedEnvironment, claimDataset, insertUsers } = require('../../data/seed-helpers');

module.exports = {
  async up(qi) {
    assertFictionalSeedEnvironment();
    const kind = process.env.DATASET === 'test' ? 'test' : 'core';
    await qi.sequelize.transaction(async (transaction) => {
      await claimDataset(qi, kind, transaction);
      await qi.bulkInsert('workspaces', WORKSPACES, { transaction, ignoreDuplicates: true });
      await insertUsers(qi, USERS, transaction);
      const resources = kind === 'test' ? RESOURCES : [...RESOURCES, ...EXTRA_RESOURCES];
      await qi.bulkInsert('resources', resources, { transaction, ignoreDuplicates: true });
    });
  },

  // Seed data is not removed automatically; resetting is an explicit, separate action.
  async down() {},
};
