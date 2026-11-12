import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

export const ACTIVE_STATUS_LIST = ['pending_approval', 'processing', 'requires_attention'];

/*
 * ORM models mirror the migrated schema. Schema changes happen only through
 * migrations; models are never synced. Timestamps are DB defaults.
 */

const opts = { underscored: true, timestamps: false } as const;

export type RenewalStatus =
  'pending_approval' | 'processing' | 'completed' | 'rejected' | 'requires_attention';
export type ProviderConfirmation = 'pending' | 'uncertain' | 'confirmed' | 'not_confirmed';
export type JobStatus = 'queued' | 'leased' | 'done' | 'attention';
export type JobPhase = 'post' | 'check';

@Table({ ...opts, tableName: 'workspaces' })
export class Workspace extends Model {
  @PrimaryKey @Column(DataType.TEXT) declare id: string;
  @Column(DataType.TEXT) declare name: string;
  @Column(DataType.DATE) declare createdAt: Date;
}

@Table({ ...opts, tableName: 'users' })
export class User extends Model {
  @PrimaryKey @Column(DataType.TEXT) declare id: string;
  @Column(DataType.TEXT) declare email: string;
  @Column(DataType.TEXT) declare name: string;
  @Column(DataType.TEXT) declare passwordHash: string;
  @Column(DataType.BOOLEAN) declare isActive: boolean;
  @Column(DataType.DATE) declare createdAt: Date;
  @HasOne(() => WorkspaceMember, 'userId') declare membership?: WorkspaceMember | null;
}

@Table({ ...opts, tableName: 'workspace_members' })
export class WorkspaceMember extends Model {
  @PrimaryKey @ForeignKey(() => Workspace) @Column(DataType.TEXT) declare workspaceId: string;
  @PrimaryKey @ForeignKey(() => User) @Column(DataType.TEXT) declare userId: string;
  @Column(DataType.BOOLEAN) declare canInitiate: boolean;
  @Column(DataType.BOOLEAN) declare canApprove: boolean;
  @BelongsTo(() => Workspace) declare workspace?: Workspace;
  @BelongsTo(() => User) declare user?: User;
}

@Table({ ...opts, tableName: 'auth_sessions' })
export class AuthSession extends Model {
  @PrimaryKey @Column(DataType.UUID) declare id: string;
  @ForeignKey(() => User) @Column(DataType.TEXT) declare userId: string;
  @Column(DataType.DATE) declare createdAt: Date;
  @Column(DataType.DATE) declare expiresAt: Date;
  @Column(DataType.DATE) declare revokedAt: Date | null;
  @BelongsTo(() => User, 'userId') declare user?: User;
}

@Table({ ...opts, tableName: 'resources' })
export class Resource extends Model {
  @PrimaryKey @Column(DataType.TEXT) declare id: string;
  @ForeignKey(() => Workspace) @Column(DataType.TEXT) declare workspaceId: string;
  @Column(DataType.TEXT) declare name: string;
  @Column(DataType.TEXT) declare category: string;
  @Column(DataType.DATEONLY) declare expiresOn: string;
  @Column(DataType.INTEGER) declare amountMinor: number;
  @Column(DataType.TEXT) declare currency: string;
  @Column(DataType.DATE) declare createdAt: Date;
  @Column(DataType.DATE) declare updatedAt: Date;
  /** At most one by the partial unique index uq_renewal_active_resource. */
  @HasOne(() => RenewalRequest, {
    foreignKey: 'resourceId',
    as: 'activeRequest',
    scope: { status: ACTIVE_STATUS_LIST },
  })
  declare activeRequest?: RenewalRequest | null;
  @HasMany(() => RenewalRequest, { foreignKey: 'resourceId', as: 'requests' })
  declare requests?: RenewalRequest[];
}

@Table({ ...opts, tableName: 'renewal_requests' })
export class RenewalRequest extends Model {
  @PrimaryKey @Column(DataType.TEXT) declare id: string;
  @Column(DataType.TEXT) declare workspaceId: string;
  @Column(DataType.TEXT) declare resourceId: string;
  @Column(DataType.TEXT) declare status: RenewalStatus;
  @Column(DataType.DATEONLY) declare previousExpiresOn: string;
  @Column(DataType.DATEONLY) declare newExpiresOn: string;
  @Column(DataType.INTEGER) declare amountMinor: number;
  @Column(DataType.TEXT) declare currency: string;
  @Column(DataType.TEXT) declare idempotencyKey: string;
  @Column(DataType.TEXT) declare createdBy: string;
  @Column(DataType.DATE) declare createdAt: Date;
  @Column(DataType.TEXT) declare decidedBy: string | null;
  @Column(DataType.DATE) declare decidedAt: Date | null;
  @Column(DataType.TEXT) declare providerConfirmation: ProviderConfirmation;
  @Column(DataType.TEXT) declare operationId: string | null;
  @Column(DataType.TEXT) declare attentionReason: string | null;
  @Column(DataType.TEXT) declare fixtureOrigin: 'demo_history' | null;
  @Column(DataType.DATE) declare updatedAt: Date;
  @BelongsTo(() => Resource, { foreignKey: 'resourceId', as: 'resource' })
  declare resource?: Resource;
  @BelongsTo(() => User, { foreignKey: 'createdBy', as: 'creator' }) declare creator?: User;
  @BelongsTo(() => User, { foreignKey: 'decidedBy', as: 'decider' }) declare decider?: User | null;
  @HasOne(() => RenewalJob, { foreignKey: 'requestId', as: 'job' }) declare job?: RenewalJob | null;
}

@Table({ ...opts, tableName: 'renewal_jobs' })
export class RenewalJob extends Model {
  @PrimaryKey @Column(DataType.UUID) declare id: string;
  @Column(DataType.TEXT) declare requestId: string;
  @Column(DataType.TEXT) declare payloadResourceId: string;
  @Column(DataType.INTEGER) declare payloadPeriodMonths: number;
  @Column(DataType.INTEGER) declare payloadAmountMinor: number;
  @Column(DataType.TEXT) declare payloadCurrency: string;
  @Column(DataType.TEXT) declare status: JobStatus;
  @Column(DataType.TEXT) declare phase: JobPhase;
  @Column(DataType.DATE) declare nextRunAt: Date;
  @Column(DataType.DATE) declare leaseUntil: Date | null;
  @Column(DataType.BIGINT) declare leaseToken: string;
  @Column(DataType.INTEGER) declare postAttempts: number;
  @Column(DataType.INTEGER) declare postAttemptsTotal: number;
  @Column(DataType.INTEGER) declare checkAttempts: number;
  @Column(DataType.DATE) declare lastAttemptAt: Date | null;
  @Column(DataType.TEXT) declare lastErrorCode: string | null;
  @Column(DataType.DATE) declare createdAt: Date;
  @Column(DataType.DATE) declare updatedAt: Date;
}

@Table({ ...opts, tableName: 'audit_events' })
export class AuditEvent extends Model {
  @PrimaryKey @Column({ type: DataType.BIGINT, autoIncrement: true }) declare id: string;
  @Column(DataType.TEXT) declare workspaceId: string;
  @Column(DataType.TEXT) declare requestId: string;
  @Column(DataType.TEXT) declare resourceId: string;
  @Column(DataType.TEXT) declare actorId: string | null;
  @Column(DataType.DATE) declare occurredAt: Date;
  @Column(DataType.TEXT) declare type: string;
  @Column(DataType.TEXT) declare fromStatus: RenewalStatus | null;
  @Column(DataType.TEXT) declare toStatus: RenewalStatus | null;
  @Column(DataType.TEXT) declare result: string | null;
  @Column(DataType.TEXT) declare detail: string;
  @Column(DataType.TEXT) declare fixtureOrigin: 'demo_history' | null;
  @BelongsTo(() => User, { foreignKey: 'actorId', as: 'actor' }) declare actor?: User | null;
  @BelongsTo(() => Resource, { foreignKey: 'resourceId', as: 'resource' })
  declare resource?: Resource;
}

/** sequelize-cli migration ledger (read-only for readiness checks). */
@Table({ timestamps: false, tableName: 'schema_migrations' })
export class SchemaMigration extends Model {
  @PrimaryKey @Column(DataType.STRING) declare name: string;
}

@Table({ ...opts, tableName: 'dataset_meta' })
export class DatasetMeta extends Model {
  @PrimaryKey @Column(DataType.TEXT) declare key: string;
  @Column(DataType.TEXT) declare value: string;
}

export const ALL_MODELS = [
  Workspace,
  User,
  WorkspaceMember,
  AuthSession,
  Resource,
  RenewalRequest,
  RenewalJob,
  AuditEvent,
  SchemaMigration,
  DatasetMeta,
];
