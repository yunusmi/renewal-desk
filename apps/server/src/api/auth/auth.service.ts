import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuthSession, User, Workspace, WorkspaceMember } from '../../database/models';
import type { ApiConfig } from '../../config/env';
import { ApiError, unauthenticated } from '../common/errors';
import { API_CONFIG } from '../common/tokens';
import type { Principal } from './principal';

export const SESSION_COOKIE = 'renewaldesk_session';
const JWT_ISSUER = 'renewaldesk';
const JWT_AUDIENCE = 'renewaldesk-web';
// Real hash of a random value, compared when the account does not exist so that
// unknown and known emails take similar time.
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 12);

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(Sequelize) private readonly sequelize: Sequelize,
    @Inject(API_CONFIG) private readonly cfg: ApiConfig,
  ) {}

  /**
   * In-process fixed-window limiter keyed by IP and by normalized account.
   * Single API instance in this assignment; a shared store is needed for scale-out.
   */
  checkRateLimit(ip: string, email: string): void {
    const now = Date.now();
    for (const key of [`ip:${ip}`, `acct:${email}`]) {
      const entry = this.attempts.get(key);
      if (!entry || entry.resetAt <= now) {
        this.attempts.set(key, { count: 1, resetAt: now + this.cfg.loginRateWindowMs });
      } else if (++entry.count > this.cfg.loginRateLimit) {
        throw new ApiError(429, 'rate_limited');
      }
    }
    if (this.attempts.size > 10000) {
      for (const [k, v] of this.attempts) if (v.resetAt <= now) this.attempts.delete(k);
    }
  }

  async login(emailRaw: string, password: string): Promise<{ token: string; principal: Principal }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await User.findOne({ where: { email }, attributes: ['id', 'passwordHash', 'isActive'] });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) throw new ApiError(401, 'invalid_credentials');

    const session = await AuthSession.create({
      id: randomUUID(),
      userId: user.id,
      // DB clock; TTL is a validated integer from config.
      expiresAt: this.sequelize.literal(`now() + make_interval(secs => ${Number(this.cfg.jwtTtlSeconds)})`),
    });
    const token = jwt.sign({ sid: session.id }, this.cfg.jwtSecret, {
      algorithm: 'HS256',
      subject: user.id,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: this.cfg.jwtTtlSeconds,
    });
    const principal = await this.loadPrincipal(user.id, session.id);
    if (!principal) throw new ApiError(401, 'invalid_credentials');
    return { token, principal };
  }

  /** Verifies JWT, then server-side session, active user and membership. Roles come from DB only. */
  async authenticate(token: string | undefined): Promise<Principal> {
    if (!token) throw unauthenticated();
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, this.cfg.jwtSecret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as jwt.JwtPayload;
    } catch {
      throw unauthenticated();
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw unauthenticated();
    const principal = await this.loadPrincipal(claims.sub, claims.sid);
    if (!principal) throw unauthenticated();
    return principal;
  }

  private async loadPrincipal(userId: string, sessionId: string): Promise<Principal | null> {
    const session = await AuthSession.findOne({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { [Op.gt]: this.sequelize.fn('now') } },
      include: [
        {
          model: User,
          as: 'user',
          where: { isActive: true },
          include: [{ model: WorkspaceMember, as: 'membership', required: true, include: [Workspace] }],
        },
      ],
    });
    const user = session?.user;
    const m = user?.membership;
    if (!session || !user || !m?.workspace) return null;
    return {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      name: user.name,
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      canInitiate: m.canInitiate,
      canApprove: m.canApprove,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await AuthSession.update({ revokedAt: this.sequelize.fn('now') as unknown as Date }, {
      where: { id: sessionId, revokedAt: null },
    });
  }

  csrfToken(sessionId: string): string {
    return createHmac('sha256', this.cfg.csrfSecret).update(`csrf:${sessionId}`).digest('base64url');
  }

  verifyCsrf(sessionId: string, provided: string | undefined): boolean {
    if (!provided) return false;
    const expected = Buffer.from(this.csrfToken(sessionId));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
