import 'reflect-metadata';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectScopeService } from '../src/projects/project-scope.service';
import { ApprovalService } from '../src/approval/approval.service';

function section(t: string) {
  console.log('\n=== ' + t + ' ===');
}

async function expectError(name: string, fn: () => Promise<unknown>, contains?: string) {
  try {
    await fn();
    console.log(`FAIL  ${name}: ошибки не было, а ожидалась`);
    process.exitCode = 1;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const ok = !contains || msg.includes(contains);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} -> ${msg}`);
    if (!ok) process.exitCode = 1;
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const auth = new AuthService(prisma);
  const scope = new ProjectScopeService(prisma);
  const approval = new ApprovalService(prisma, scope);

  const login = async (l: string, p: string) => (await auth.login(l, p)).user;

  section('Аутентификация');
  const foreman = await login('foreman', 'foreman123');
  const supply = await login('supply', 'supply123');
  const pto = await login('pto', 'pto123');
  const accountant = await login('accountant', 'accountant123');
  console.log('foreman роли:', foreman.roleCodes.join(','), '| права:', foreman.permissions.join(','));
  console.log('accountant роли:', accountant.roleCodes.join(','), '| права:', accountant.permissions.join(','));
  await expectError('вход с неверным паролем', () => auth.login('foreman', 'wrong'), 'Неверный');

  const project = await prisma.project.findFirstOrThrow({ where: { name: { contains: 'Северный' } } });
  const contractor = await prisma.contractor.findFirstOrThrow();

  section('Маршрут A: 250 000 ₽ -> 1 шаг (снабжение)');
  let reqA: any = await approval.create(foreman, { projectId: project.id, contractorId: contractor.id, amount: 250000 });
  reqA = await approval.submit(foreman, reqA.id);
  console.log('шаги:', reqA.steps.map((s: any) => `${s.order}:${s.requiredRole.code}`).join(' -> '));
  await expectError(
    'прораб не может согласовать шаг снабжения',
    () => approval.approve(foreman, reqA.steps[0].id),
    'Согласовать может только роль',
  );
  const doneA: any = await approval.approve(supply, reqA.steps[0].id);
  console.log('статус после снабжения:', doneA.status);

  section('Маршрут B: 700 000 ₽ -> 2 шага (ПТО -> бухгалтерия)');
  let reqB: any = await approval.create(foreman, { projectId: project.id, contractorId: contractor.id, amount: 700000 });
  reqB = await approval.submit(foreman, reqB.id);
  console.log('шаги:', reqB.steps.map((s: any) => `${s.order}:${s.requiredRole.code}`).join(' -> '));
  await expectError(
    'нельзя согласовать не текущий шаг',
    () => approval.approve(accountant, reqB.steps[1].id),
    'предыдущий шаг',
  );
  await approval.approve(pto, reqB.steps[0].id);
  const doneB: any = await approval.approve(accountant, reqB.steps[1].id);
  console.log('статус после двух шагов:', doneB.status);

  section('Лимит полномочий: временно снижаем бухгалтерии до 400 000 ₽');
  const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: 'accountant' } });
  await prisma.role.update({ where: { id: accountantRole.id }, data: { maxAmount: 400000 } });
  let reqC: any = await approval.create(foreman, { projectId: project.id, contractorId: contractor.id, amount: 700000 });
  reqC = await approval.submit(foreman, reqC.id);
  await approval.approve(pto, reqC.steps[0].id);
  await expectError(
    'превышение лимита БЛОКИРУЕТ согласование',
    () => approval.approve(accountant, reqC.steps[1].id),
    'Превышен лимит',
  );
  await prisma.role.update({ where: { id: accountantRole.id }, data: { maxAmount: 1_000_000 } });

  section('Доступ к объектам (data scope)');
  const other = await prisma.project.create({ data: { name: 'Склад временного хранения' } });
  await expectError(
    'прораб без членства не имеет доступа к объекту',
    () => approval.create(foreman, { projectId: other.id, contractorId: contractor.id, amount: 100000 }),
    'Нет доступа',
  );

  section('Аудит (кто/что/когда)');
  const logs = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  console.log(`записей в журнале: ${logs.length}`);
  for (const l of logs.slice(-4)) console.log(` - ${l.action}: ${l.details ?? ''}`);

  section('Отчёт по заявкам');
  const all = await prisma.purchaseRequest.findMany({ include: { steps: true } });
  for (const r of all) {
    const approved = r.steps.filter((s) => s.status === 'APPROVED').length;
    console.log(`${r.number}  ${r.amount} ₽  ->  ${r.status}  (${approved}/${r.steps.length})`);
  }

  await prisma.$disconnect();
  console.log('\nГотово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
