import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.service';

@Injectable()
export class ProjectScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccess(user: AuthenticatedUser, projectId: number): Promise<boolean> {
    if (user.permissions.includes('project.view.all') || user.roleCodes.includes('admin')) {
      return true;
    }
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId } },
    });
    return !!membership;
  }

  async assertAccess(user: AuthenticatedUser, projectId: number): Promise<void> {
    if (!(await this.canAccess(user, projectId))) {
      throw new ForbiddenException(`Нет доступа к объекту ${projectId}`);
    }
  }
}
