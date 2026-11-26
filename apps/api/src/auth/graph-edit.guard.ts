// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Legacy-guard этапа 0. Сейчас НЕ регистрируется как APP_GUARD:
 * защита записи графа выполняется ProjectAccessGuard через
 * `@ProjectScoped({ param: 'id', role: 'write' })` (PR #2).
 * Класс оставлен провайдером для совместимости, но в цепочке не участвует.
 */

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.guard.js';
import { GRAPH_WRITE_KEY } from './graph-write.decorator.js';
import { ProjectAccessService } from './project-access.service.js';

/** Проверяет право редактирования графа (owner/engineer). */
@Injectable()
export class GraphEditGuard implements CanActivate {
  public constructor(
    @Inject(ProjectAccessService) private readonly access: ProjectAccessService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(GRAPH_WRITE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & { params: { id: string } }
    >();
    if (request.user === undefined) {
      throw new UnauthorizedException('GraphEditGuard требует JwtAuthGuard');
    }
    await this.access.requireEditorAsync(request.params.id, request.user.id);
    return true;
  }
}
