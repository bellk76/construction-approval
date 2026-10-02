import { chromium } from 'playwright';
import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'shots');
const URL = 'http://localhost:5173';

// Паузы для видео: before — перед действием, after — чтобы зритель успел прочитать
const SLOW = Number(process.env.SLOW ?? 1200);
const pause = (ms = SLOW) => new Promise((r) => setTimeout(r, ms));

async function login(page: Page, login: string, password: string) {
  console.log(`  вход: ${login}`);
  await pause();
  await page.fill('input:not([type=password])', login);
  await pause(400);
  await page.fill('input[type=password]', password);
  await pause(400);
  await page.click('button:has-text("Войти")');
  await page.waitForSelector('.topbar');
  await pause();
}

async function logout(page: Page) {
  console.log('  выход');
  await pause(600);
  await page.click('button:has-text("Выйти")');
  await page.waitForSelector('button:has-text("Войти")');
  await pause(500);
}

// Создаёт заявку в блоке «Новая заявка», открывает её и возвращает ID
async function createAndOpen(page: Page, amount: string): Promise<string> {
  console.log(`  создание заявки на ${amount} ₽`);
  await pause();
  await page.fill('[data-testid=amount]', amount);
  await pause(600);
  await page.click('[data-testid=create]');
  await page.waitForTimeout(600);
  const id = await page.inputValue('[data-testid=request-id]');
  if (!id) throw new Error('Не удалось определить ID созданной заявки');
  console.log(`  заявка №${id} создана`);
  await pause();
  await page.click('[data-testid=show]');
  await page.waitForSelector('.card:has-text("Заявка") table');
  await pause(SLOW * 1.5);
  return id;
}

// Открывает уже существующую заявку по ID
async function openById(page: Page, id: string) {
  console.log(`  открытие заявки №${id}`);
  await pause();
  await page.fill('[data-testid=request-id]', id);
  await pause(500);
  await page.click('[data-testid=show]');
  await page.waitForSelector('.card:has-text("Заявка") table');
  await pause(SLOW * 1.5);
}

async function submit(page: Page) {
  console.log('  отправка на согласование');
  await pause();
  await page.click('button:has-text("Отправить на согласование")');
  await page.waitForTimeout(600);
  await pause(SLOW * 1.5);
}

async function approve(page: Page) {
  console.log('  согласование текущего шага');
  await pause();
  await page.click('tr.current button:has-text("Согласовать")');
  await page.waitForTimeout(600);
  await pause(SLOW * 1.5);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log('  screenshot:', name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1440, height: 900 } },
  });

  await page.goto(URL);
  await page.waitForSelector('button:has-text("Войти")');
  await pause(SLOW * 2); // пауза на экране входа
  await shot(page, '01-login.png');

  // --- Прораб создаёт заявку на 700 000 ---
  console.log('Сценарий 1: маршрут из двух шагов (700 000 ₽)');
  await login(page, 'foreman', 'foreman123');
  const id700 = await createAndOpen(page, '700000');
  await submit(page);
  await shot(page, '02-foreman-request-submitted.png');

  // --- ПТО согласует шаг 1 ---
  await logout(page);
  await login(page, 'pto', 'pto123');
  await openById(page, id700);
  await approve(page);
  await shot(page, '03-pto-approved-step1.png');

  // --- Бухгалтерия согласует шаг 2 ---
  await logout(page);
  await login(page, 'accountant', 'accountant123');
  await openById(page, id700);
  await approve(page);
  await shot(page, '04-accountant-approved-final.png');

  // --- Снабжение: заявка на 250 000 (один шаг) ---
  console.log('Сценарий 2: маршрут из одного шага (250 000 ₽)');
  await logout(page);
  await login(page, 'foreman', 'foreman123');
  const id250 = await createAndOpen(page, '250000');
  await submit(page);
  await logout(page);
  await login(page, 'supply', 'supply123');
  await openById(page, id250);
  await approve(page);
  await shot(page, '05-supply-single-step.png');

  // --- Прораб: чужие шаги, кнопки неактивны ---
  console.log('Сценарий 3: чужие шаги — кнопки неактивны');
  await logout(page);
  await login(page, 'foreman', 'foreman123');
  await openById(page, id700);
  await pause(SLOW * 2);
  await shot(page, '06-foreman-readonly.png');

  const context = page.context();
  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  // Переименуем видео в понятное имя
  const videoDir = path.join(OUT, 'video');
  await new Promise((r) => setTimeout(r, 1500));
  const files = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
  if (files.length) {
    const src = path.join(videoDir, files[0]);
    const dst = path.join(OUT, 'demo-approval-flow.webm');
    try {
      fs.renameSync(src, dst);
      console.log('video:', dst);
    } catch {
      const saved = video ? await video.path() : null;
      console.log('video (не переименовано, доступно):', saved ?? src);
    }
  }
  console.log('\nГотово. Скриншоты в:', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
