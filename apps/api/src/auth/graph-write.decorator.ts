// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Временный мост этапа 0: перенос проверки GraphEditGuard с class-level
 * `@UseGuards` на глобальный APP_GUARD без окна беззащитности записи графа.
 *
 * В этапе 3 Backend Architect заменит его на `@ProjectScoped({ role: 'write' })`
 * единой политики доступа к проектам. Это не параллельная реализация guards —
 * используется тот же `GraphEditGuard` — изменён только способ его регистрации.
 */

import { SetMetadata } from '@nestjs/common';

/** Ключ метаданных записи графа. */
export const GRAPH_WRITE_KEY = 'graphWrite';

/** Помечает маршрут как изменяющий граф проекта. */
export const RequireGraphWrite = (): MethodDecorator => SetMetadata(GRAPH_WRITE_KEY, true);
