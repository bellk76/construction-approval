import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SessionGuard } from './session.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { login: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(body.login, body.password);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3_600_000 });
    return { user };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: unknown) {
    return { user };
  }
}
