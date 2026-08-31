import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  org: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Runs per request for protected routes; returns the value set on req.user. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const authUser = await this.authService.buildAuthUser(payload.sub);
    if (authUser.organizationId !== payload.org) {
      throw new UnauthorizedException('Token/organization mismatch');
    }
    return authUser;
  }
}
