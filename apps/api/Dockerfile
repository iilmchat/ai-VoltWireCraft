# Сборка образа API VoltWireCraft: pnpm workspace → deploy → Node.js runtime.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @voltwirecraft/shared build && pnpm --filter api build
# self-contained node_modules, включая workspace-пакет @voltwirecraft/shared
RUN pnpm --filter api deploy --prod /deploy

FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app/apps/api
COPY --from=build /deploy ./
# Путь нужен сиду нормативов: из dist/database — ../../../../docs
COPY --from=build /repo/docs /app/docs
# SQL-миграции не копируются tsc — кладём их рядом со скомпилированным migrate.js
COPY --from=build /repo/apps/api/src/database/migrations /app/apps/api/dist/database/migrations

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

CMD ["node", "dist/main.js"]
