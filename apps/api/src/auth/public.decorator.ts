// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Явная пометка публичных маршрутов. Allowlist утверждён PO-D01 (4 маршрута). */

import { SetMetadata } from '@nestjs/common';

/** Ключ метаданных для `Reflector`. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Помечает маршрут как публичный.
 *
 * PO-D01 утверждён: декоратор применяется ровно к четырём маршрутам —
 * POST /auth/login, POST /auth/register, GET /health, GET /catalog/devices.
 * Все остальные маршруты остаются защищены глобальным SecurityGuard.
 * `/auth/refresh` НЕ является обычным публичным маршрутом.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
