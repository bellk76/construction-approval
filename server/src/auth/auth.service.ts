import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedUser {
  id: number;
  login: string;
  fullName: string;
  roleCodes: string[];
  permissions: string[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildUser(userId: number): Promise<AuthenticatedUser> {
    const roleWithPerms = { include: { permissions: { include: { permission: true } } } } as const;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        // роли, выданные вручную
        roles: { include: { role: roleWithPerms } },
        // роли, привязанные к должности
        position: { include: { positionRoles: { include: { role: roleWithPerms } } } },
      },
    });

    const roles = [
      ...user.roles.map((r) => r.role),
      ...(user.position?.positionRoles.map((pr) => pr.role) ?? []),
    ];

    const roleCodes = Array.from(new Set(roles.map((r) => r.code)));
    const permissions = Array.from(
      new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code))),
    );
    return { id: user.id, login: user.login, fullName: user.fullName, roleCodes, permissions };
  }

  async login(login: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUnique({ where: { login } });
    if (!user || !user.active || !bcrypt.compareSync(password, user.passwordHash)) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const token = randomBytes(32).toString('hex');
    const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 168);
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      },
    });

    return { token, user: await this.buildUser(user.id) };
  }

  async validate(token: string): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }
    return this.buildUser(session.userId);
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
