import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RENEWAL_STATUSES, type RenewalStatusValue } from '../../domain/renewal-rules';

/* ---------- response DTOs (explicit snake_case, never ORM instances) ---------- */

export class ActiveRequestRefDto {
  @ApiProperty({ example: 'RN-1001' }) id!: string;
  @ApiProperty({ enum: RENEWAL_STATUSES }) status!: RenewalStatusValue;
}

export class ResourceDto {
  @ApiProperty({ example: 'res-a-01' }) id!: string;
  @ApiProperty({ example: 'alpha' }) workspace_id!: string;
  @ApiProperty({ example: 'Хранилище A' }) name!: string;
  @ApiProperty({ example: 'Облачные хранилища' }) category!: string;
  @ApiProperty({ example: '2027-03-01', format: 'date' }) expires_on!: string;
  @ApiProperty({ example: 128000, description: 'Integer minor units (kopecks)' })
  amount_minor!: number;
  @ApiProperty({ enum: ['RUB'] }) currency!: 'RUB';
  @ApiProperty({ type: ActiveRequestRefDto, nullable: true })
  active_request!: ActiveRequestRefDto | null;
}

export class RenewalDto {
  @ApiProperty({ example: 'RN-1001' }) id!: string;
  @ApiProperty({ example: 'res-a-01' }) resource_id!: string;
  @ApiProperty({ example: 'Хранилище A' }) resource_name!: string;
  @ApiProperty({ example: 'alpha' }) workspace_id!: string;
  @ApiProperty({ example: 'Облачные хранилища' }) category!: string;
  @ApiProperty({ example: '2027-03-01', format: 'date' }) previous_expires_on!: string;
  @ApiProperty({ example: '2027-03-31', format: 'date' }) new_expires_on!: string;
  @ApiProperty({ example: 128000 }) amount_minor!: number;
  @ApiProperty({ enum: ['RUB'] }) currency!: 'RUB';
  @ApiProperty({ enum: RENEWAL_STATUSES }) status!: RenewalStatusValue;
  @ApiProperty({ example: 'renewal:00000000-0000-4000-8000-000000000000' })
  idempotency_key!: string;
  @ApiProperty({ example: 'u-ini-a' }) created_by!: string;
  @ApiProperty({ example: 'Инициатор Alpha' }) created_by_name!: string;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ nullable: true, type: String }) decided_by!: string | null;
  @ApiProperty({ nullable: true, type: String }) decided_by_name!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) decided_at!: string | null;
  @ApiProperty({
    description: 'POST slots reserved in the current automatic cycle (possibly sent)',
  })
  post_attempts!: number;
  @ApiProperty({ description: 'POST slots reserved across all cycles' })
  post_attempts_total!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) last_attempt_at!:
    string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) next_check_at!: string | null;
  @ApiProperty({ enum: ['pending', 'uncertain', 'confirmed', 'not_confirmed'] })
  provider_confirmation!: 'pending' | 'uncertain' | 'confirmed' | 'not_confirmed';
  @ApiProperty({ nullable: true, type: String }) operation_id!: string | null;
  @ApiProperty({ nullable: true, type: String }) attention_reason!: string | null;
  @ApiProperty({ nullable: true, enum: ['demo_history'] }) fixture_origin!: 'demo_history' | null;
}

export class AuditEventDto {
  @ApiProperty({ example: 'ev-42' }) id!: string;
  @ApiProperty() workspace_id!: string;
  @ApiProperty() request_id!: string;
  @ApiProperty() resource_id!: string;
  @ApiProperty({ nullable: true, type: String }) resource_name!: string | null;
  @ApiProperty({ format: 'date-time' }) occurred_at!: string;
  @ApiProperty({ example: 'provider_post' }) type!: string;
  @ApiProperty({ nullable: true, type: String }) actor_id!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'null = system' }) actor_name!:
    string | null;
  @ApiProperty({ nullable: true, enum: RENEWAL_STATUSES }) from_status!: RenewalStatusValue | null;
  @ApiProperty({ nullable: true, enum: RENEWAL_STATUSES }) to_status!: RenewalStatusValue | null;
  @ApiProperty({ nullable: true, type: String }) result!: string | null;
  @ApiProperty() detail!: string;
  @ApiProperty({ nullable: true, enum: ['demo_history'] }) fixture_origin!: 'demo_history' | null;
}

class ListMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class ResourceListDto extends ListMetaDto {
  @ApiProperty({ type: [ResourceDto] }) items!: ResourceDto[];
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty() workspace_total!: number;
}

export class StatusCountsDto {
  @ApiProperty() pending_approval!: number;
  @ApiProperty() processing!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() requires_attention!: number;
}

export class RenewalListDto extends ListMetaDto {
  @ApiProperty({ type: [RenewalDto] }) items!: RenewalDto[];
  @ApiProperty({ type: StatusCountsDto }) counts!: StatusCountsDto;
  @ApiProperty() workspace_total!: number;
}

export class AuditListDto extends ListMetaDto {
  @ApiProperty({ type: [AuditEventDto] }) items!: AuditEventDto[];
}

export class ResourceDetailDto {
  @ApiProperty({ type: ResourceDto }) resource!: ResourceDto;
  @ApiProperty({ type: [RenewalDto] }) requests!: RenewalDto[];
}

export class RenewalDetailDto {
  @ApiProperty({ type: RenewalDto }) request!: RenewalDto;
  @ApiProperty({
    type: ResourceDto,
    description: 'Current resource state (expires_on is live, not snapshot)',
  })
  resource!: ResourceDto;
  @ApiProperty({ type: [AuditEventDto] }) events!: AuditEventDto[];
}

export class OverviewCountsDto {
  @ApiProperty() resources_total!: number;
  @ApiProperty() pending_approval!: number;
  @ApiProperty() processing!: number;
  @ApiProperty() requires_attention!: number;
}

export class OverviewDto {
  @ApiProperty() workspace_id!: string;
  @ApiProperty({ type: OverviewCountsDto }) counts!: OverviewCountsDto;
  @ApiProperty({ type: [RenewalDto] }) awaiting_my_decision!: RenewalDto[];
  @ApiProperty({ type: [RenewalDto] }) my_active_requests!: RenewalDto[];
  @ApiProperty({ type: [RenewalDto] }) recent_requests!: RenewalDto[];
  @ApiProperty({ type: [ResourceDto] }) expiring_resources!: ResourceDto[];
  @ApiProperty({ type: [AuditEventDto] }) recent_events!: AuditEventDto[];
}

/** Commands take no input: everything is derived server-side. Any field → 400 (forbidNonWhitelisted). */
export class EmptyBodyDto {}

/* ---------- query DTOs ---------- */

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class PageQuery {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset?: number;
}

export const RESOURCE_SORTS = [
  'expires_on',
  '-expires_on',
  'amount_minor',
  '-amount_minor',
] as const;

export class ResourceListQuery extends PageQuery {
  @ApiPropertyOptional({ maxLength: 200, description: 'Name or ID, case-insensitive contains' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  has_active?: 'true' | 'false';

  @ApiPropertyOptional({ enum: RESOURCE_SORTS, default: 'expires_on' })
  @IsOptional()
  @IsIn(RESOURCE_SORTS)
  sort?: (typeof RESOURCE_SORTS)[number];
}

export class RenewalListQuery extends PageQuery {
  @ApiPropertyOptional({ maxLength: 200, description: 'Request ID, resource name or creator name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: RENEWAL_STATUSES })
  @IsOptional()
  @IsIn(RENEWAL_STATUSES)
  status?: RenewalStatusValue;

  @ApiPropertyOptional({ enum: ['-created_at', 'created_at'], default: '-created_at' })
  @IsOptional()
  @IsIn(['-created_at', 'created_at'])
  sort?: '-created_at' | 'created_at';
}

export const AUDIT_TYPES = [
  'request_created',
  'request_approved',
  'request_rejected',
  'job_enqueued',
  'provider_post',
  'provider_check',
  'provider_confirmed',
  'term_updated',
  'requires_attention',
  'retry_requested',
  'attempt_reserved',
  'job_recovered',
] as const;

export class AuditListQuery extends PageQuery {
  @ApiPropertyOptional({ example: 'res-a-01' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,64}$/)
  resource_id?: string;

  @ApiPropertyOptional({ enum: AUDIT_TYPES })
  @IsOptional()
  @IsIn(AUDIT_TYPES)
  type?: (typeof AUDIT_TYPES)[number];

  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusive, ISO 8601 UTC' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Exclusive, ISO 8601 UTC' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
