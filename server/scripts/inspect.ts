import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  const pm = await p.projectMember.findMany({ include: { user: true, project: true } });
  for (const m of pm) console.log(m.projectId, m.project.name, '| user', m.user.login);
  console.log('---projects---');
  (await p.project.findMany()).forEach((x) => console.log(x.id, x.name));
  console.log('---contractors---');
  (await p.contractor.findMany()).forEach((x) => console.log(x.id, x.name));
  await p.$disconnect();
})();
