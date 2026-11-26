// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Модуль авторизации, глобального guards и RBAC проекта. */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GraphEditGuard } from './graph-edit.guard.js';
import { JwtAuthGuard } from './auth.guard.js';
import { JwtService } from './jwt.service.js';
import { ProjectAccessController } from './project-access.controller.js';
import { ProjectAccessService } from './project-access.service.js';
import { RefreshGuard } from './refresh.guard.js';
import { RefreshSessionService } from './refresh-session.service.js';
import { SecurityGuard } from './security.guard.js';

/**
 * Единственный APP_GUARD — `SecurityGuard`, внутри него жёсткий порядок:
 * JwtAuthGuard → ProjectAccessGuard. Это устраняет зависимость от порядка
 * регистрации guards в разных модулях (PolicyModule импортируется раньше).
 *
 * `GraphEditGuard` сохранён как провайдер для совместимости этапа 0, но
 * больше не регистрируется глобально: его заменил `@ProjectScoped({role:'write'})`
 * из PR #2 на всех трёх путях записи графа.
 */
@Module({
  controllers: [AuthController, ProjectAccessController],
  providers: [
    drizzleProvider,
    JwtService,
    RefreshSessionService,
    AuthService,
    ProjectAccessService,
    JwtAuthGuard,
    GraphEditGuard,
    RefreshGuard,
    SecurityGuard,
    AuthRateLimitService,
    { provide: APP_GUARD, useClass: SecurityGuard },
  ],
  exports: [
    JwtService,
    RefreshSessionService,
    AuthService,
    ProjectAccessService,
    JwtAuthGuard,
    GraphEditGuard,
    RefreshGuard,
    SecurityGuard,
    AuthRateLimitService,
  ],
})
export class AuthModule {}
