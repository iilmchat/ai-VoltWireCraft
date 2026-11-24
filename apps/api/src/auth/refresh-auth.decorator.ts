// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Специализированная метка `/auth/refresh` (SEC-02 Stage 2).
 *
 * Это НЕ `@Public()`: маршрут не входит в allowlist PO-D01 и не проходит
 * обычную access-JWT проверку. `SecurityGuard` направляет запросы с этой
 * меткой в `RefreshGuard`, который проверяет refresh-токен.
 */

import { SetMetadata } from '@nestjs/common';

/** Ключ metadata для refresh-ветки аутентификации. */
export const REFRESH_AUTH_KEY = 'vwc:refresh-auth';

/** Помечает маршрут как требующий специализированной refresh-проверки. */
export const RefreshAuth = (): MethodDecorator => SetMetadata(REFRESH_AUTH_KEY, true);
