// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Конфигурация Drizzle Kit: генерация и применение миграций PostgreSQL. */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/voltwirecraft',
  },
  strict: true,
  verbose: true,
});
