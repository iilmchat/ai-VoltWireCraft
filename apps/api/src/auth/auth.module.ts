// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Модуль авторизации, глобальных guards и RBAC проекта. */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GraphEditGuard } from './graph-edit.guard.js';
import { JwtAuthGuard } from './auth.guard.js';
import { JwtService } from './jwt.service.js';
import { ProjectAccessController } from './project-access.controller.js';
import { ProjectAccessService } from './project-access.service.js';

/**
 * Порядок APP_GUARD детерминирован порядком регистрации в providers:
 * 1) JwtAuthGuard — аутентификация и @Public;
 * 2) GraphEditGuard — защита путей записи графа (мост этапа 0).
 *
 * В этапе 3 между ними встанет ProjectAccessGuard с @ProjectScoped.
 * Ни один контроллер не использует class-level @UseGuards.
 */
@Module({
  controllers: [AuthController, ProjectAccessController],
  providers: [
    drizzleProvider,
    JwtService,
    AuthService,
    ProjectAccessService,
    JwtAuthGuard,
    GraphEditGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: GraphEditGuard },
  ],
  exports: [
    JwtService,
    AuthService,
    ProjectAccessService,
    JwtAuthGuard,
    GraphEditGuard,
  ],
})
export class AuthModule {}
