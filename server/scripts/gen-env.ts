import { writeFileSync } from 'fs';

// Простой генератор .env, если его нет — чтобы клон проекта запускался сразу.
// В продакшене значения задаются окружением, файл не используется.

const env = `DATABASE_URL="file:./dev.db"
SESSION_TTL_HOURS=168
`;

writeFileSync(new URL('../.env', import.meta.url), env);
console.log('.env создан');
