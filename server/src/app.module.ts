import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { ProjectsModule } from './projects/projects.module';
import { ApprovalModule } from './approval/approval.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [PrismaModule, AuthModule, RbacModule, ProjectsModule, ApprovalModule, CatalogModule],
})
export class AppModule {}
