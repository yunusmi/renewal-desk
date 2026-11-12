'use strict';
/**
 * Core dataset (DATASET=core, or DATASET=test for the isolated test DB).
 * Idempotent: inserts missing stable rows only (ON CONFLICT DO NOTHING); never
 * resets a renewed expiry, never deletes history. Zero renewal requests.
 */
const { WORKSPACES, USERS, RESOURCES } = require('../../data/core');
const { claimDataset, insertUsers } = require('../../data/seed-helpers');

module.exports = {
  async up(qi) {
    const kind = process.env.DATASET === 'test' ? 'test' : 'core';
    await qi.sequelize.transaction(async (transaction) => {
      await claimDataset(qi, kind, transaction);
      await qi.bulkInsert('workspaces', WORKSPACES, { transaction, ignoreDuplicates: true });
      await insertUsers(qi, USERS, transaction);
      await qi.bulkInsert('resources', RESOURCES, { transaction, ignoreDuplicates: true });
    });
  },

  // Seed data is not removed automatically; resetting is an explicit, separate action.
  async down() {},
};
