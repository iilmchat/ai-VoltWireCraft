// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Глобальный модуль проектной политики доступа (SEC-02). */

import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { ProjectAccessGuard } from '../auth/project-access.guard.js';
import { ProjectPolicyService } from './project-policy.service.js';

/**
 * Предоставляет единую политику `ProjectPolicyService` и регистрирует
 * `ProjectAccessGuard` как глобальный guard #2.
 *
 * Интерфейс для Security Architect: `JwtAuthGuard` регистрируется отдельно
 * в `AuthModule` как APP_GUARD #1. `ProjectAccessGuard` не depends on
 * порядке регистрации: при отсутствии `request.user` он отвечает 401,
 * а при отсутствии `@ProjectScoped` metadata — пропускает запрос.
 */
@Global()
@Module({
  providers: [
    drizzleProvider,
    ProjectPolicyService,
    ProjectAccessGuard,
    { provide: APP_GUARD, useClass: ProjectAccessGuard },
  ],
  exports: [ProjectPolicyService, ProjectAccessGuard],
})
export class PolicyModule {}
