import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

export const SESSION_COOKIE = 'sid';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[SESSION_COOKIE];
    const user = await this.auth.validate(token);
    if (!user) throw new UnauthorizedException('Требуется вход');
    req.user = user;
    return true;
  }
}
