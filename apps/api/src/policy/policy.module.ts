// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Глобальный модуль проектной политики доступа (SEC-02). */

import { Global, Module } from '@nestjs/common';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { ProjectAccessGuard } from '../auth/project-access.guard.js';
import { ProjectPolicyService } from './project-policy.service.js';

/**
 * Предоставляет единую политику `ProjectPolicyService` и guard авторизации.
 *
 * `ProjectAccessGuard` НЕ регистрируется здесь как APP_GUARD: порядок
 * глобальных guards детерминирован в `SecurityGuard` (AuthModule),
 * который вызывает JwtAuthGuard → ProjectAccessGuard в фиксированном порядке.
 */
@Global()
@Module({
  providers: [drizzleProvider, ProjectPolicyService, ProjectAccessGuard],
  exports: [ProjectPolicyService, ProjectAccessGuard],
})
export class PolicyModule {}
