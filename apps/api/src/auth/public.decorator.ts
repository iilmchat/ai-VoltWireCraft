// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Явная пометка публичных маршрутов. Точный allowlist — PO-D01 (открыт). */

import { SetMetadata } from '@nestjs/common';

/** Ключ метаданных для `Reflector`. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает маршрут как публичный.
 *
 * ВАЖНО: PO-D01 не закрыт, поэтому в этой ветке декоратор определяется,
 * но ни на одном маршруте НЕ применяется. Глобальный guard работает
 * fail-closed: без токена отклоняются все запросы.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
