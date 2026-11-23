// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Защита путей записи графа. Зарегистрирован как второй APP_GUARD
 * (этап 0). Работает только на маршрутах с `@RequireGraphWrite()`,
 * поэтому не мешает публичным/непроектным endpoint'ам.
 *
 * В этапе 3 заменяется единым ProjectAccessGuard с @ProjectScoped({ role: 'write' }).
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
