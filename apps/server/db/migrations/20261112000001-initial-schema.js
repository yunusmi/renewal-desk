'use strict';

/**
 * Initial schema via queryInterface. Business invariants are enforced by
 * PostgreSQL itself (CHECK, composite FK, partial unique index, triggers).
 * Raw SQL is used only where Sequelize has no API: sequence and triggers.
 */

const ACTIVE = ['pending_approval', 'processing', 'requires_attention'];
const STATUSES = ['pending_approval', 'processing', 'completed', 'rejected', 'requires_attention'];
const AUDIT_TYPES = [
  'request_created', 'request_approved', 'request_rejected', 'job_enqueued', 'provider_post',
  'provider_check', 'provider_confirmed', 'term_updated', 'requires_attention', 'retry_requested',
  'attempt_reserved', 'job_recovered',
];
const SLUG = '^[a-z0-9-]{1,64}$';

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes, Op, fn, col, literal, where } = Sequelize;
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: fn('now') };

    await qi.sequelize.transaction(async (transaction) => {
      const t = { transaction };
      // `fields` is required by queryInterface even though the name is explicit.
      const check = (table, name, condition, fields = ['id']) =>
        qi.addConstraint(table, { type: 'check', name, fields, where: condition, ...t });

      await qi.createTable('dataset_meta', {
        key: { type: DataTypes.TEXT, primaryKey: true },
        value: { type: DataTypes.TEXT, allowNull: false },
      }, t);

      await qi.createTable('workspaces', {
        id: { type: DataTypes.TEXT, primaryKey: true },
        name: { type: DataTypes.TEXT, allowNull: false },
        created_at: now,
      }, t);
      await check('workspaces', 'ck_workspaces_id', { id: { [Op.regexp]: SLUG } });

      await qi.createTable('users', {
        id: { type: DataTypes.TEXT, primaryKey: true },
        email: { type: DataTypes.TEXT, allowNull: false, unique: true },
        name: { type: DataTypes.TEXT, allowNull: false },
        password_hash: { type: DataTypes.TEXT, allowNull: false },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: now,
      }, t);
      await check('users', 'ck_users_id', { id: { [Op.regexp]: SLUG } });
      await check('users', 'ck_users_email_normalized', where(col('email'), Op.eq, fn('lower', fn('btrim', col('email')))));

      await qi.createTable('workspace_members', {
        workspace_id: {
          type: DataTypes.TEXT, allowNull: false, primaryKey: true,
          references: { model: 'workspaces', key: 'id' }, onDelete: 'RESTRICT',
        },
        user_id: {
          type: DataTypes.TEXT, allowNull: false, primaryKey: true,
          references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
        },
        can_initiate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        can_approve: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      }, t);
      // v1: one workspace per user.
      await qi.addConstraint('workspace_members', { type: 'unique', fields: ['user_id'], name: 'uq_member_single_workspace', ...t });
      await check('workspace_members', 'ck_member_has_role', { [Op.or]: [{ can_initiate: true }, { can_approve: true }] }, ['can_initiate']);

      await qi.createTable('auth_sessions', {
        id: { type: DataTypes.UUID, primaryKey: true },
        user_id: {
          type: DataTypes.TEXT, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT',
        },
        created_at: now,
        expires_at: { type: DataTypes.DATE, allowNull: false },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
      }, t);
      await qi.addIndex('auth_sessions', ['user_id', 'expires_at'], { name: 'ix_auth_sessions_user', ...t });

      await qi.createTable('resources', {
        id: { type: DataTypes.TEXT, primaryKey: true },
        workspace_id: {
          type: DataTypes.TEXT, allowNull: false,
          references: { model: 'workspaces', key: 'id' }, onDelete: 'RESTRICT',
        },
        name: { type: DataTypes.TEXT, allowNull: false },
        category: { type: DataTypes.TEXT, allowNull: false },
        expires_on: { type: DataTypes.DATEONLY, allowNull: false },
        amount_minor: { type: DataTypes.INTEGER, allowNull: false },
        currency: { type: DataTypes.TEXT, allowNull: false },
        created_at: now,
        updated_at: now,
      }, t);
      await check('resources', 'ck_resources_id', { id: { [Op.regexp]: SLUG } });
      await check('resources', 'ck_resources_amount', { amount_minor: { [Op.gte]: 0 } });
      await check('resources', 'ck_resources_currency', { currency: 'RUB' });
      await qi.addConstraint('resources', { type: 'unique', fields: ['workspace_id', 'id'], name: 'uq_resources_workspace_id', ...t });
      await qi.addIndex('resources', ['workspace_id', 'expires_on', 'id'], { name: 'ix_resources_workspace_expiry', ...t });

      // Public request IDs RN-<n>; demo fixtures use numbers below 1001. No queryInterface API for sequences.
      await qi.sequelize.query('CREATE SEQUENCE renewal_request_seq START WITH 1001 MINVALUE 1001', t);

      await qi.createTable('renewal_requests', {
        id: { type: DataTypes.TEXT, primaryKey: true },
        workspace_id: { type: DataTypes.TEXT, allowNull: false },
        resource_id: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.TEXT, allowNull: false },
        previous_expires_on: { type: DataTypes.DATEONLY, allowNull: false },
        new_expires_on: { type: DataTypes.DATEONLY, allowNull: false },
        amount_minor: { type: DataTypes.INTEGER, allowNull: false },
        currency: { type: DataTypes.TEXT, allowNull: false },
        idempotency_key: { type: DataTypes.TEXT, allowNull: false, unique: true },
        created_by: { type: DataTypes.TEXT, allowNull: false },
        created_at: now,
        decided_by: { type: DataTypes.TEXT, allowNull: true },
        decided_at: { type: DataTypes.DATE, allowNull: true },
        provider_confirmation: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
        operation_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
        attention_reason: { type: DataTypes.TEXT, allowNull: true },
        fixture_origin: { type: DataTypes.TEXT, allowNull: true },
        updated_at: now,
      }, t);
      const rr = 'renewal_requests';
      await check(rr, 'ck_requests_id', { id: { [Op.regexp]: '^RN-[0-9]{4,}$' } });
      await check(rr, 'ck_requests_status', { status: { [Op.in]: STATUSES } });
      await check(rr, 'ck_requests_amount', { amount_minor: { [Op.gte]: 0 } });
      await check(rr, 'ck_requests_currency', { currency: 'RUB' });
      await check(rr, 'ck_requests_key_length', where(fn('length', col('idempotency_key')), Op.between, [1, 255]));
      await check(rr, 'ck_requests_confirmation', {
        provider_confirmation: { [Op.in]: ['pending', 'uncertain', 'confirmed', 'not_confirmed'] },
      });
      await check(rr, 'ck_requests_fixture', { fixture_origin: { [Op.or]: [null, 'demo_history'] } });
      await check(rr, 'ck_requests_term_30_days', where(col('new_expires_on'), Op.eq, literal('previous_expires_on + 30')));
      await check(rr, 'ck_requests_not_own_decision', {
        [Op.or]: [{ decided_by: null }, { decided_by: { [Op.ne]: col('created_by') } }],
      });
      await check(rr, 'ck_requests_decision_pairing', {
        [Op.or]: [
          { status: 'pending_approval', decided_by: null, decided_at: null },
          { status: { [Op.ne]: 'pending_approval' }, decided_by: { [Op.ne]: null }, decided_at: { [Op.ne]: null } },
        ],
      });
      await check(rr, 'ck_requests_completed_confirmed', {
        [Op.or]: [
          { status: { [Op.ne]: 'completed' } },
          { provider_confirmation: 'confirmed', operation_id: { [Op.ne]: null } },
        ],
      });
      await check(rr, 'ck_requests_rejected_no_provider', {
        [Op.or]: [{ status: { [Op.ne]: 'rejected' } }, { provider_confirmation: 'pending', operation_id: null }],
      });
      await qi.addConstraint(rr, { type: 'unique', fields: ['workspace_id', 'id', 'resource_id'], name: 'uq_requests_tenant_tuple', ...t });
      await qi.addConstraint(rr, {
        type: 'foreign key', name: 'fk_requests_resource', fields: ['workspace_id', 'resource_id'],
        references: { table: 'resources', fields: ['workspace_id', 'id'] }, onDelete: 'RESTRICT', ...t,
      });
      await qi.addConstraint(rr, {
        type: 'foreign key', name: 'fk_requests_creator', fields: ['workspace_id', 'created_by'],
        references: { table: 'workspace_members', fields: ['workspace_id', 'user_id'] }, onDelete: 'RESTRICT', ...t,
      });
      await qi.addConstraint(rr, {
        type: 'foreign key', name: 'fk_requests_decider', fields: ['workspace_id', 'decided_by'],
        references: { table: 'workspace_members', fields: ['workspace_id', 'user_id'] }, onDelete: 'RESTRICT', ...t,
      });
      // Final race defense: at most one active request per resource.
      await qi.addIndex(rr, ['resource_id'], {
        name: 'uq_renewal_active_resource', unique: true, where: { status: { [Op.in]: ACTIVE } }, ...t,
      });
      await qi.addIndex(rr, [{ name: 'workspace_id' }, { name: 'created_at', order: 'DESC' }, { name: 'id' }], { name: 'ix_requests_workspace_created', ...t });
      await qi.addIndex(rr, ['workspace_id', 'status', 'created_at'], { name: 'ix_requests_workspace_status', ...t });
      await qi.addIndex(rr, [{ name: 'resource_id' }, { name: 'created_at', order: 'DESC' }], { name: 'ix_requests_resource', ...t });

      await qi.createTable('renewal_jobs', {
        id: { type: DataTypes.UUID, primaryKey: true },
        request_id: {
          type: DataTypes.TEXT, allowNull: false, unique: true,
          references: { model: 'renewal_requests', key: 'id' }, onDelete: 'RESTRICT',
        },
        payload_resource_id: { type: DataTypes.TEXT, allowNull: false },
        payload_period_months: { type: DataTypes.INTEGER, allowNull: false },
        payload_amount_minor: { type: DataTypes.INTEGER, allowNull: false },
        payload_currency: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.TEXT, allowNull: false },
        phase: { type: DataTypes.TEXT, allowNull: false },
        next_run_at: now,
        lease_until: { type: DataTypes.DATE, allowNull: true },
        lease_token: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
        post_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        post_attempts_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        check_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        last_attempt_at: { type: DataTypes.DATE, allowNull: true },
        last_error_code: { type: DataTypes.TEXT, allowNull: true },
        created_at: now,
        updated_at: now,
      }, t);
      const rj = 'renewal_jobs';
      await check(rj, 'ck_jobs_period', { payload_period_months: 1 });
      await check(rj, 'ck_jobs_amount', { payload_amount_minor: { [Op.gte]: 0 } });
      await check(rj, 'ck_jobs_currency', { payload_currency: 'RUB' });
      await check(rj, 'ck_jobs_status', { status: { [Op.in]: ['queued', 'leased', 'done', 'attention'] } });
      await check(rj, 'ck_jobs_phase', { phase: { [Op.in]: ['post', 'check'] } });
      await check(rj, 'ck_jobs_post_attempts', { post_attempts: { [Op.between]: [0, 3] } });
      await check(rj, 'ck_jobs_check_attempts', { check_attempts: { [Op.gte]: 0 } });
      await check(rj, 'ck_jobs_total', { post_attempts_total: { [Op.gte]: col('post_attempts') } });
      await check(rj, 'ck_jobs_lease', {
        [Op.or]: [
          { status: 'leased', lease_until: { [Op.ne]: null } },
          { status: { [Op.ne]: 'leased' }, lease_until: null },
        ],
      });
      await qi.addIndex(rj, ['status', 'next_run_at'], { name: 'ix_jobs_ready', ...t });
      await qi.addIndex(rj, ['status', 'lease_until'], { name: 'ix_jobs_lease', ...t });

      await qi.createTable('audit_events', {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        workspace_id: { type: DataTypes.TEXT, allowNull: false },
        request_id: { type: DataTypes.TEXT, allowNull: false },
        resource_id: { type: DataTypes.TEXT, allowNull: false },
        actor_id: { type: DataTypes.TEXT, allowNull: true },
        occurred_at: now,
        type: { type: DataTypes.TEXT, allowNull: false },
        from_status: { type: DataTypes.TEXT, allowNull: true },
        to_status: { type: DataTypes.TEXT, allowNull: true },
        result: { type: DataTypes.TEXT, allowNull: true },
        detail: { type: DataTypes.TEXT, allowNull: false },
        fixture_origin: { type: DataTypes.TEXT, allowNull: true },
      }, t);
      const ae = 'audit_events';
      await check(ae, 'ck_audit_type', { type: { [Op.in]: AUDIT_TYPES } });
      await check(ae, 'ck_audit_fixture', { fixture_origin: { [Op.or]: [null, 'demo_history'] } });
      await qi.addConstraint(ae, {
        type: 'foreign key', name: 'fk_audit_request', fields: ['workspace_id', 'request_id', 'resource_id'],
        references: { table: 'renewal_requests', fields: ['workspace_id', 'id', 'resource_id'] }, onDelete: 'RESTRICT', ...t,
      });
      // System events have actor_id NULL; MATCH SIMPLE skips the check for them.
      await qi.addConstraint(ae, {
        type: 'foreign key', name: 'fk_audit_actor', fields: ['workspace_id', 'actor_id'],
        references: { table: 'workspace_members', fields: ['workspace_id', 'user_id'] }, onDelete: 'RESTRICT', ...t,
      });
      await qi.addIndex(ae, [{ name: 'workspace_id' }, { name: 'occurred_at', order: 'DESC' }, { name: 'id', order: 'DESC' }], { name: 'ix_audit_workspace_time', ...t });
      await qi.addIndex(ae, ['request_id', 'occurred_at', 'id'], { name: 'ix_audit_request_time', ...t });

      // Triggers have no queryInterface API: immutable snapshot/key, immutable job payload, append-only audit.
      await qi.sequelize.query(`
        CREATE FUNCTION trg_requests_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
             OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
             OR NEW.previous_expires_on IS DISTINCT FROM OLD.previous_expires_on
             OR NEW.new_expires_on IS DISTINCT FROM OLD.new_expires_on
             OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
             OR NEW.currency IS DISTINCT FROM OLD.currency
             OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
             OR NEW.created_by IS DISTINCT FROM OLD.created_by
             OR NEW.created_at IS DISTINCT FROM OLD.created_at
             OR (OLD.operation_id IS NOT NULL AND NEW.operation_id IS DISTINCT FROM OLD.operation_id) THEN
            RAISE EXCEPTION 'renewal request snapshot is immutable'
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_requests_immutable';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER requests_immutable BEFORE UPDATE ON renewal_requests
          FOR EACH ROW EXECUTE FUNCTION trg_requests_immutable();

        CREATE FUNCTION trg_jobs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.request_id IS DISTINCT FROM OLD.request_id
             OR NEW.payload_resource_id IS DISTINCT FROM OLD.payload_resource_id
             OR NEW.payload_period_months IS DISTINCT FROM OLD.payload_period_months
             OR NEW.payload_amount_minor IS DISTINCT FROM OLD.payload_amount_minor
             OR NEW.payload_currency IS DISTINCT FROM OLD.payload_currency
             OR NEW.lease_token < OLD.lease_token THEN
            RAISE EXCEPTION 'renewal job payload is immutable'
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_jobs_immutable';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER jobs_immutable BEFORE UPDATE ON renewal_jobs
          FOR EACH ROW EXECUTE FUNCTION trg_jobs_immutable();

        CREATE FUNCTION trg_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'audit_events is append-only'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_audit_append_only';
        END $$;
        CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
          FOR EACH ROW EXECUTE FUNCTION trg_audit_append_only();
      `, t);
    });
  },

  async down(qi) {
    await qi.sequelize.transaction(async (transaction) => {
      for (const table of ['audit_events', 'renewal_jobs', 'renewal_requests', 'resources', 'auth_sessions',
        'workspace_members', 'users', 'workspaces', 'dataset_meta']) {
        await qi.dropTable(table, { transaction });
      }
      await qi.sequelize.query(
        'DROP SEQUENCE IF EXISTS renewal_request_seq; DROP FUNCTION IF EXISTS trg_requests_immutable, trg_jobs_immutable, trg_audit_append_only;',
        { transaction },
      );
    });
  },
};
