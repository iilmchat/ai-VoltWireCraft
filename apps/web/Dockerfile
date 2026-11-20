# Сборка статики Vite и раздача через nginx (SPA fallback включён).
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @voltwirecraft/shared build && pnpm --filter web build

FROM nginx:1.27-alpine AS production
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
