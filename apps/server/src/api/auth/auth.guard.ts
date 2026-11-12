import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiConfig } from '../../config/env';
import { forbidden } from '../common/errors';
import { API_CONFIG } from '../common/tokens';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { IS_PUBLIC, type AuthedRequest } from './principal';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard, order: 401 (no valid session) → 403 origin_forbidden → 403 csrf_invalid.
 * Unsafe requests must carry the exact allowed Origin; authenticated unsafe requests
 * additionally carry X-CSRF-Token bound to the session.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly cfg: ApiConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const unsafe = !SAFE_METHODS.has(req.method);

    if (isPublic) {
      if (unsafe) this.checkOrigin(req);
      return true;
    }
    req.principal = await this.auth.authenticate(req.cookies?.[SESSION_COOKIE]);
    if (unsafe) {
      this.checkOrigin(req);
      const token = req.header('x-csrf-token');
      if (!this.auth.verifyCsrf(req.principal.sessionId, token)) throw forbidden('csrf_invalid');
    }
    return true;
  }

  private checkOrigin(req: AuthedRequest): void {
    if (req.header('origin') !== this.cfg.appOrigin) throw forbidden('origin_forbidden');
  }
}
