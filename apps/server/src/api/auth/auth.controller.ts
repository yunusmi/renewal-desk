import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ApiConfig } from '../../config/env';
import { API_CONFIG } from '../common/tokens';
import { CsrfDto, ErrorDto, LoginDto, LoginResponseDto, UserDto } from './auth.dto';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { CurrentPrincipal, Public, rolesOf, type Principal } from './principal';

export function toUserDto(p: Principal): UserDto {
  return {
    id: p.userId,
    name: p.name,
    email: p.email,
    workspace_id: p.workspaceId,
    workspace_name: p.workspaceName,
    roles: rolesOf(p),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly cfg: ApiConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Вход по email и паролю; ставит HttpOnly cookie renewaldesk_session' })
  @ApiHeader({ name: 'Origin', required: true, description: 'Должен совпадать с APP_ORIGIN' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiResponse({ status: 401, type: ErrorDto, description: 'invalid_credentials' })
  @ApiResponse({ status: 403, type: ErrorDto, description: 'origin_forbidden' })
  @ApiResponse({ status: 429, type: ErrorDto, description: 'rate_limited' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    this.auth.checkRateLimit(req.ip ?? 'unknown', dto.email.trim().toLowerCase());
    const { token, principal } = await this.auth.login(dto.email, dto.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.cfg.cookieSecure,
      path: '/',
      maxAge: this.cfg.jwtTtlSeconds * 1000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { user: toUserDto(principal) };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiNoContentResponse({ description: 'Сессия отозвана, cookie очищена' })
  @ApiResponse({ status: 401, type: ErrorDto })
  @ApiResponse({ status: 403, type: ErrorDto, description: 'csrf_invalid | origin_forbidden' })
  async logout(@CurrentPrincipal() p: Principal, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(p.sessionId);
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: this.cfg.cookieSecure, path: '/' });
  }

  @Get('me')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: UserDto })
  @ApiResponse({ status: 401, type: ErrorDto })
  me(@CurrentPrincipal() p: Principal, @Res({ passthrough: true }) res: Response): UserDto {
    res.setHeader('Cache-Control', 'no-store');
    return toUserDto(p);
  }

  @Get('csrf')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: CsrfDto })
  @ApiResponse({ status: 401, type: ErrorDto })
  csrf(@CurrentPrincipal() p: Principal, @Res({ passthrough: true }) res: Response): CsrfDto {
    res.setHeader('Cache-Control', 'no-store');
    return { csrf_token: this.auth.csrfToken(p.sessionId) };
  }
}
