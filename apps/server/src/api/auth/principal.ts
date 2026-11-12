import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** Authenticated caller, resolved server-side from session + DB membership. */
export interface Principal {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  canInitiate: boolean;
  canApprove: boolean;
}

export type AuthedRequest = Request & { principal?: Principal };

export const IS_PUBLIC = 'renewaldesk:is_public';
/** Route requires no session (login only). Origin check still applies to unsafe methods. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw new Error('principal missing: route is not behind AuthGuard');
  return req.principal;
});

export function rolesOf(p: Principal): ('initiator' | 'approver')[] {
  const roles: ('initiator' | 'approver')[] = [];
  if (p.canInitiate) roles.push('initiator');
  if (p.canApprove) roles.push('approver');
  return roles;
}
