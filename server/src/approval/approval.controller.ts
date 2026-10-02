import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalService, CreateRequestDto } from './approval.service';

@Controller('approval')
@UseGuards(SessionGuard, PermissionsGuard)
export class ApprovalController {
  constructor(
    private readonly approval: ApprovalService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('requests')
  @RequirePermissions('document.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequestDto) {
    return this.approval.create(user, dto);
  }

  @Post('requests/:id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.approval.submit(user, id);
  }

  @Post('steps/:id/approve')
  @RequirePermissions('document.approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.approval.approve(user, id);
  }

  @Post('steps/:id/reject')
  @RequirePermissions('document.approve')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    return this.approval.reject(user, id, body?.reason ?? '');
  }

  @Get('requests/:id')
  async one(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' }, include: { requiredRole: true } } },
    });
  }
}
