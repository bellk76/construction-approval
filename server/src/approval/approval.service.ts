import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectScopeService } from '../projects/project-scope.service';
import { AuthenticatedUser } from '../auth/auth.service';

export interface CreateRequestDto {
  projectId: number;
  contractorId: number;
  amount: number;
  docType?: string;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ProjectScopeService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateRequestDto) {
    await this.scope.assertAccess(user, dto.projectId);

    const number = `ЗК-${Date.now()}`;
    const request = await this.prisma.purchaseRequest.create({
      data: {
        number,
        docType: dto.docType ?? 'PURCHASE',
        projectId: dto.projectId,
        contractorId: dto.contractorId,
        amount: dto.amount,
        authorId: user.id,
      },
    });
    await this.audit(user.id, 'document.create', request.id, `создана заявка ${number} на ${dto.amount} ₽`);
    return request;
  }

  // Строит маршрут из правил по сумме и запускает согласование
  async submit(user: AuthenticatedUser, requestId: number) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.authorId !== user.id && !user.permissions.includes('document.approve')) {
        throw new ForbiddenException('Только автор может отправить заявку');
      }
      if (request.status !== 'DRAFT') {
        throw new ConflictException(`Заявка в статусе ${request.status}`);
      }

      const rules = await tx.approvalRule.findMany({
        where: {
          docType: request.docType,
          minAmount: { lt: request.amount },
          OR: [{ maxAmount: null }, { maxAmount: { gte: request.amount } }],
        },
        orderBy: { step: 'asc' },
      });
      if (rules.length === 0) {
        throw new ConflictException(`Нет маршрута для ${request.docType} на сумму ${request.amount}`);
      }

      const now = Date.now();
      await tx.approvalStep.createMany({
        data: rules.map((r) => ({
          requestId: request.id,
          order: r.step,
          requiredRoleId: r.requiredRoleId,
          dueAt: new Date(now + r.dueDays * 86_400_000),
        })),
      });

      const updated = await tx.purchaseRequest.update({
        where: { id: request.id },
        data: { status: 'ON_APPROVAL', version: { increment: 1 } },
        include: { steps: { orderBy: { order: 'asc' }, include: { requiredRole: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'document.submit',
          entity: 'PurchaseRequest',
          entityId: request.id,
          requestId: request.id,
          details: `маршрут из ${rules.length} шагов`,
        },
      });
      return updated;
    });
  }

  async approve(user: AuthenticatedUser, stepId: number) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: { request: true, requiredRole: true },
    });
    if (!step) throw new NotFoundException('Шаг не найден');

    // 1) роль из маршрута
    if (!user.roleCodes.includes(step.requiredRole.code)) {
      throw new ForbiddenException(`Согласовать может только роль «${step.requiredRole.name}»`);
    }
    // 2) лимит полномочий (защита в глубину)
    const limit = step.requiredRole.maxAmount;
    if (limit !== null && Number(step.request.amount) > Number(limit)) {
      throw new ForbiddenException(
        `Превышен лимит полномочий: ${user.fullName} до ${limit} ₽, заявка на ${step.request.amount} ₽`,
      );
    }
    // 3) доступ к объекту
    await this.scope.assertAccess(user, step.request.projectId);

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.approvalStep.findUniqueOrThrow({
        where: { id: stepId },
        include: { request: true },
      });
      if (fresh.status !== 'PENDING') {
        throw new ConflictException(`Шаг уже ${fresh.status}`);
      }
      // 4) последовательность: согласуется только текущий (минимальный) шаг
      const pending = await tx.approvalStep.findMany({
        where: { requestId: fresh.requestId, status: 'PENDING' },
        orderBy: { order: 'asc' },
      });
      if (pending[0].id !== fresh.id) {
        throw new ConflictException('Сначала должен согласовать предыдущий шаг маршрута');
      }

      await tx.approvalStep.update({
        where: { id: stepId },
        data: { status: 'APPROVED', approverId: user.id, decidedAt: new Date() },
      });

      // 5) оптимистичная блокировка на документе
      const rest = pending.filter((p) => p.id !== fresh.id);
      const updated = await tx.purchaseRequest.updateMany({
        where: { id: fresh.requestId, version: fresh.request.version },
        data: { status: rest.length === 0 ? 'APPROVED' : 'ON_APPROVAL', version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ConflictException('Документ изменён другим пользователем, обновите и повторите');
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'document.approve',
          entity: 'PurchaseRequest',
          entityId: fresh.requestId,
          requestId: fresh.requestId,
          details: `шаг ${fresh.order} роль ${step.requiredRole.code}`,
        },
      });

      return tx.purchaseRequest.findUnique({
        where: { id: fresh.requestId },
        include: { steps: { orderBy: { order: 'asc' }, include: { requiredRole: true } } },
      });
    });
  }

  async reject(user: AuthenticatedUser, stepId: number, reason: string) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: { request: true, requiredRole: true },
    });
    if (!step) throw new NotFoundException('Шаг не найден');
    if (!user.roleCodes.includes(step.requiredRole.code)) {
      throw new ForbiddenException('Не ваша роль для этого шага');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: stepId },
        data: { status: 'REJECTED', approverId: user.id, decidedAt: new Date() },
      });
      await tx.purchaseRequest.update({
        where: { id: step.requestId },
        data: { status: 'REJECTED', version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'document.reject',
          entity: 'PurchaseRequest',
          entityId: step.requestId,
          requestId: step.requestId,
          details: reason,
        },
      });
      return tx.purchaseRequest.findUnique({ where: { id: step.requestId } });
    });
  }

  private audit(actorId: number, action: string, entityId: number, details: string) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'PurchaseRequest', entityId, requestId: entityId, details },
    });
  }
}
