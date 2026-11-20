// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Модуль авторизации, RBAC и комментариев согласования. */

import { Module } from '@nestjs/common';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GraphEditGuard } from './graph-edit.guard.js';
import { JwtAuthGuard } from './auth.guard.js';
import { JwtService } from './jwt.service.js';
import { ProjectAccessController } from './project-access.controller.js';
import { ProjectAccessService } from './project-access.service.js';

/** Предоставляет аутентификацию и управление доступом к проектам. */
@Module({
  controllers: [AuthController, ProjectAccessController],
  providers: [
    drizzleProvider,
    JwtService,
    AuthService,
    ProjectAccessService,
    JwtAuthGuard,
    GraphEditGuard,
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
