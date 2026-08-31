import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Verify credentials and issue tokens. */
  async login(
    email: string,
    password: string,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    // Constant-ish work whether or not the user exists.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$invalidinvalidinvalid$invalidinvalidinvalidinvalidinvalidinvalid';
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    const authUser = await this.buildAuthUser(user.id);
    const tokens = await this.issueTokens(authUser, meta);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      action: 'user.logged_in',
      entityType: 'user',
      entityId: user.id,
      organizationId: user.organizationId,
      actorId: user.id,
    });

    return { user: authUser, tokens };
  }

  /** Load a user's full auth profile (roles → permission set). */
  async buildAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'active' },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found or inactive');

    const permissions = new Set<string>();
    const roleKeys = new Set<string>();
    for (const ur of user.userRoles) {
      roleKeys.add(ur.role.key);
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.key);
      }
    }

    return {
      userId: user.id,
      organizationId: user.organizationId,
      isSuperAdmin: user.isSuperAdmin,
      permissions: [...permissions],
      roleKeys: [...roleKeys],
    };
  }

  private async issueTokens(
    authUser: AuthUser,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<TokenPair> {
    const payload = { sub: authUser.userId, org: authUser.organizationId };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = this.parseDays(this.config.get<string>('JWT_REFRESH_TTL', '7d'));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: authUser.userId,
        tokenHash,
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    return { accessToken, refreshToken };
  }

  /** Rotate a refresh token: validate, revoke old, issue a new pair. */
  async refresh(
    refreshToken: string,
    meta: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) throw new UnauthorizedException('Invalid or expired session');

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const authUser = await this.buildAuthUser(record.userId);
    const tokens = await this.issueTokens(authUser, meta);
    return { user: authUser, tokens };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private parseDays(ttl: string): number {
    const match = /^(\d+)d$/.exec(ttl.trim());
    return match ? parseInt(match[1], 10) : 7;
  }
}
