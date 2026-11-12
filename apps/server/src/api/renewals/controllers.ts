import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorDto } from '../auth/auth.dto';
import { ApiError } from '../common/errors';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import {
  AuditListDto,
  AuditListQuery,
  EmptyBodyDto,
  OverviewDto,
  RenewalDetailDto,
  RenewalDto,
  RenewalListDto,
  RenewalListQuery,
  ResourceDetailDto,
  ResourceListDto,
  ResourceListQuery,
} from './dto';
import { CommandsService } from './commands.service';
import { ReadModel } from './read-model';
import { IdPipe } from './id.pipe';

const E401 = ApiResponse({ status: 401, type: ErrorDto, description: 'unauthenticated' });
const E403 = (d: string) => ApiResponse({ status: 403, type: ErrorDto, description: d });
const E404 = (d: string) => ApiResponse({ status: 404, type: ErrorDto, description: d });
const E409 = (d: string) => ApiResponse({ status: 409, type: ErrorDto, description: d });
const CSRF = ApiHeader({
  name: 'X-CSRF-Token',
  required: true,
  description: 'From GET /auth/csrf',
});
const ORIGIN = ApiHeader({ name: 'Origin', required: true, description: 'Must equal APP_ORIGIN' });

@ApiTags('resources')
@ApiCookieAuth('session')
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly read: ReadModel,
    private readonly commands: CommandsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ресурсы своего пространства' })
  @ApiOkResponse({ type: ResourceListDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  @E401
  list(@CurrentPrincipal() p: Principal, @Query() q: ResourceListQuery): Promise<ResourceListDto> {
    return this.read.listResources(p, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: 'res-a-01' })
  @ApiOkResponse({ type: ResourceDetailDto })
  @E401
  @E403('workspace_forbidden')
  @E404('resource_not_found')
  async get(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
  ): Promise<ResourceDetailDto> {
    await this.read.assertResourceInWorkspace(p, id);
    const [resource, requests] = await Promise.all([
      this.read.resource(p, id),
      this.read.resourceRequests(p, id),
    ]);
    return { resource, requests };
  }

  @Post(':id/renewals')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Создать заявку на +30 дней',
    description:
      'Тело пустое: срок, сумма и автор фиксируются сервером из текущего ресурса и сессии.',
  })
  @ApiParam({ name: 'id', example: 'res-a-01' })
  @CSRF
  @ORIGIN
  @ApiCreatedResponse({ type: RenewalDto })
  @ApiResponse({ status: 400, type: ErrorDto, description: 'validation_error (any body field)' })
  @E401
  @E403('role_forbidden | workspace_forbidden | csrf_invalid | origin_forbidden')
  @E404('resource_not_found')
  @E409('active_renewal_exists')
  create(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<RenewalDto> {
    return this.commands.create(p, id);
  }
}

@ApiTags('renewals')
@ApiCookieAuth('session')
@Controller('renewals')
export class RenewalsController {
  constructor(
    private readonly read: ReadModel,
    private readonly commands: CommandsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: RenewalListDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  @E401
  list(@CurrentPrincipal() p: Principal, @Query() q: RenewalListQuery): Promise<RenewalListDto> {
    return this.read.listRenewals(p, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: 'RN-1001' })
  @ApiOkResponse({ type: RenewalDetailDto })
  @E401
  @E403('workspace_forbidden')
  @E404('request_not_found')
  async get(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
  ): Promise<RenewalDetailDto> {
    await this.read.assertRequestInWorkspace(p, id);
    const request = await this.read.renewal(p, id);
    const [resource, events] = await Promise.all([
      this.read.resource(p, request.resource_id),
      this.read.requestEvents(p, id),
    ]);
    return { request, resource, events };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Согласовать: processing + durable job + audit одной транзакцией' })
  @ApiParam({ name: 'id', example: 'RN-1001' })
  @CSRF
  @ORIGIN
  @ApiOkResponse({ type: RenewalDto })
  @E401
  @E403(
    'role_forbidden | workspace_forbidden | cannot_decide_own_request | csrf_invalid | origin_forbidden',
  )
  @E404('request_not_found')
  @E409('invalid_status_transition | resource_changed')
  approve(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<RenewalDto> {
    return this.commands.approve(p, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Отклонить: без провайдера и без изменения срока' })
  @ApiParam({ name: 'id', example: 'RN-1001' })
  @CSRF
  @ORIGIN
  @ApiOkResponse({ type: RenewalDto })
  @E401
  @E403(
    'role_forbidden | workspace_forbidden | cannot_decide_own_request | csrf_invalid | origin_forbidden',
  )
  @E404('request_not_found')
  @E409('invalid_status_transition')
  reject(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<RenewalDto> {
    return this.commands.reject(p, id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Повторить обработку requires_attention с тем же ключом (сначала GET)' })
  @ApiParam({ name: 'id', example: 'RN-1001' })
  @CSRF
  @ORIGIN
  @ApiOkResponse({ type: RenewalDto })
  @E401
  @E403('role_forbidden | workspace_forbidden | csrf_invalid | origin_forbidden')
  @E404('request_not_found')
  @E409('invalid_status_transition')
  retry(
    @CurrentPrincipal() p: Principal,
    @Param('id', IdPipe) id: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<RenewalDto> {
    return this.commands.retry(p, id);
  }
}

@ApiTags('audit')
@ApiCookieAuth('session')
@Controller('audit-events')
export class AuditController {
  constructor(private readonly read: ReadModel) {}

  @Get()
  @ApiOkResponse({ type: AuditListDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  @E401
  @E403('workspace_forbidden (foreign resource_id filter)')
  @E404('resource_not_found')
  list(@CurrentPrincipal() p: Principal, @Query() q: AuditListQuery): Promise<AuditListDto> {
    if (q.from && q.to && new Date(q.from) > new Date(q.to)) {
      throw new ApiError(400, 'validation_error', 'from должен быть не позже to');
    }
    return this.read.listAudit(p, q);
  }
}

@ApiTags('overview')
@ApiCookieAuth('session')
@Controller('overview')
export class OverviewController {
  constructor(private readonly read: ReadModel) {}

  @Get()
  @ApiOkResponse({ type: OverviewDto })
  @E401
  overview(@CurrentPrincipal() p: Principal): Promise<OverviewDto> {
    return this.read.overviewParts(p);
  }
}
