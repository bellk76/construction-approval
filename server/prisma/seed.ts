import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function reset() {
  await prisma.auditLog.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalRule.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.contractor.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.positionRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
}

async function main() {
  await reset();

  // --- Права (RBAC) ---
  const permCodes = [
    ['document.create', 'Создавать документы'],
    ['document.approve', 'Согласовывать документы'],
    ['project.edit', 'Редактировать объекты'],
    ['project.view.all', 'Видеть все объекты'],
    ['register.view', 'Смотреть учёт'],
    ['admin.users', 'Управлять пользователями'],
  ];
  const permissions: Record<string, number> = {};
  for (const [code, name] of permCodes) {
    const p = await prisma.permission.create({ data: { code, name } });
    permissions[code] = p.id;
  }

  // --- Роли + лимиты полномочий (AuthorityLimit) ---
  const roleDefs = [
    { code: 'admin', name: 'Администратор', maxAmount: null as number | null, perms: permCodes.map(([c]) => c) },
    { code: 'director', name: 'Директор', maxAmount: 100_000_000, perms: ['document.approve', 'project.edit', 'project.view.all', 'register.view'] },
    { code: 'pto', name: 'ПТО / инженер', maxAmount: 1_000_000, perms: ['document.create', 'document.approve', 'project.edit', 'project.view.all', 'register.view'] },
    { code: 'accountant', name: 'Бухгалтерия', maxAmount: 1_000_000, perms: ['document.approve', 'project.view.all', 'register.view'] },
    { code: 'supply', name: 'Снабжение', maxAmount: 300_000, perms: ['document.create', 'document.approve', 'register.view'] },
    { code: 'foreman', name: 'Прораб', maxAmount: 100_000, perms: ['document.create'] },
  ];
  const roles: Record<string, number> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.create({ data: { code: r.code, name: r.name, maxAmount: r.maxAmount } });
    roles[r.code] = role.id;
    for (const pc of r.perms) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permissions[pc] } });
    }
  }

  // --- Оргструктура: подразделения и должности ---
  const deptDefs: Array<[string, string]> = [
    ['admin', 'Администрирование'],
    ['management', 'Руководство'],
    ['pto', 'ПТО'],
    ['supply', 'Снабжение'],
    ['accounting', 'Бухгалтерия'],
    ['site', 'Строительный участок'],
  ];
  const departments: Record<string, number> = {};
  for (const [code, name] of deptDefs) {
    const d = await prisma.department.create({ data: { code, name } });
    departments[code] = d.id;
  }

  const posDefs: Array<[string, string, number, string]> = [
    ['admin', 'Администратор системы', departments.admin, 'admin'],
    ['director', 'Директор', departments.management, 'director'],
    ['pto_engineer', 'Инженер ПТО', departments.pto, 'pto'],
    ['accountant', 'Бухгалтер', departments.accounting, 'accountant'],
    ['supply_manager', 'Специалист по снабжению', departments.supply, 'supply'],
    ['foreman', 'Прораб', departments.site, 'foreman'],
  ];
  const positions: Record<string, number> = {};
  for (const [code, name, , roleCode] of posDefs) {
    const p = await prisma.position.create({ data: { code, name } });
    positions[code] = p.id;
    // роль привязывается к должности (аналог DepartmentPositionGroup)
    await prisma.positionRole.create({
      data: { positionId: p.id, roleId: roles[roleCode] },
    });
  }

  // --- Пользователи ---
  const userDefs: Array<[string, string, string, string, string]> = [
    ['admin', 'Администратор', 'admin123', 'admin', 'admin'],
    ['director', 'Петров И.И. (директор)', 'director123', 'management', 'director'],
    ['pto', 'Сидоров П.П. (ПТО)', 'pto123', 'pto', 'pto_engineer'],
    ['accountant', 'Кузнецова А.А. (бухгалтерия)', 'accountant123', 'accounting', 'accountant'],
    ['supply', 'Иванов С.С. (снабжение)', 'supply123', 'supply', 'supply_manager'],
    ['foreman', 'Смирнов В.В. (прораб)', 'foreman123', 'site', 'foreman'],
  ];
  const users: Record<string, number> = {};
  for (const [login, fullName, pw, deptCode, posCode] of userDefs) {
    const u = await prisma.user.create({
      data: {
        login,
        fullName,
        passwordHash: bcrypt.hashSync(pw, 10),
        departmentId: departments[deptCode],
        positionId: positions[posCode],
      },
    });
    users[login] = u.id;
    // роли НЕ выдаём вручную — они приходят от должности
  }

  // --- Объекты и подрядчики ---
  const site1 = await prisma.project.create({ data: { name: 'ЖК «Северный», корпус 3' } });
  const site2 = await prisma.project.create({ data: { name: 'Школа на 1200 мест' } });
  await prisma.contractor.createMany({
    data: [{ name: 'ООО «Бетон-Строй»' }, { name: 'ООО «МеталлПрофиль»' }],
  });

  // --- Доступ по объектам (data scope) ---
  await prisma.projectMember.createMany({
    data: [
      { userId: users.foreman, projectId: site1.id, role: 'foreman' },
      { userId: users.foreman, projectId: site2.id, role: 'foreman' },
      { userId: users.pto, projectId: site1.id, role: 'engineer' },
      { userId: users.supply, projectId: site1.id, role: 'supply' },
    ],
  });

  // --- Правила маршрута (диапазоны сумм, ₽) ---
  // (0; 300k]  -> снабжение
  // (300k; 1M] -> ПТО, бухгалтерия
  // (1M; —  ]  -> ПТО, бухгалтерия, директор
  const rules: Array<[number, number | null, number, string, number]> = [
    [0, 300_000, 1, 'supply', 2],
    [300_000, 1_000_000, 1, 'pto', 2],
    [300_000, 1_000_000, 2, 'accountant', 2],
    [1_000_000, null, 1, 'pto', 2],
    [1_000_000, null, 2, 'accountant', 2],
    [1_000_000, null, 3, 'director', 5],
  ];
  for (const [min, max, step, roleCode, dueDays] of rules) {
    await prisma.approvalRule.create({
      data: { docType: 'PURCHASE', minAmount: min, maxAmount: max, step, requiredRoleId: roles[roleCode], dueDays },
    });
  }

  console.log('Seed OK: 6 ролей, 6 прав, 6 подразделений, 6 должностей, 6 пользователей, 2 объекта, 6 правил');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
