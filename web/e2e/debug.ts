import { chromium } from 'playwright';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('console', (m) => console.log('[console]', m.type(), m.text()));
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  p.on('response', (r) => {
    if (r.url().includes('/approval') || r.url().includes('/catalog') || r.url().includes('/auth')) {
      console.log('[resp]', r.status(), r.url());
    }
  });

  await p.goto('http://localhost:5173');
  await p.waitForSelector('button:has-text("Войти")');
  await p.fill('input:not([type=password])', 'foreman');
  await p.fill('input[type=password]', 'foreman123');
  await p.click('button:has-text("Войти")');
  await p.waitForSelector('.topbar');

  await p.fill('.card:has-text("Новая заявка") input', '700000');
  await p.click('button:has-text("Создать")');
  await p.waitForTimeout(1000);
  const id = await p.inputValue('.card:has-text("Заявка") input');
  console.log('ID созданный:', id);
  await p.click('button:has-text("Показать")');
  await p.waitForSelector('.card:has-text("Заявка") table');
  await p.click('button:has-text("Отправить на согласование")');
  await p.waitForTimeout(800);
  console.log('после submit статус виден:', await p.textContent('.card:has-text("Заявка") p'));

  await p.click('button:has-text("Выйти")');
  await p.waitForSelector('button:has-text("Войти")');
  await p.fill('input:not([type=password])', 'pto');
  await p.fill('input[type=password]', 'pto123');
  await p.click('button:has-text("Войти")');
  await p.waitForSelector('.topbar');
  console.log('ПТО вошёл, ID заявки:', id);
  await p.fill('.card:has-text("Заявка") input', id);
  await p.click('button:has-text("Показать")');
  await p.waitForTimeout(2000);
  const html = await p.content();
  console.log('есть таблица:', html.includes('<table>'));
  console.log('notice:', await p.textContent('.notice').catch(() => '(нет)'));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
