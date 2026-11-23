// © 2026 VoltWireCraft — Security Architect / TEC-05, TEC-06
/**
 * Модуль криптографических примитивов для внутренних сервисов и HITL.
 *
 * НЕ импортируется в AppModule в этой ветке: этап 4 подключит его вместе
 * с сетевой изоляцией и входящей проверкой в FastAPI. Это исключает
 * промежуточное состояние, в котором токены выпускаются, но не проверяются.
 */

import { Module } from '@nestjs/common';
import { HitlService } from './hitl.service.js';
import { InternalTokenService } from './internal-token.service.js';
import { InMemoryReplayStore } from './replay-store.js';

/** Production заменяет InMemoryReplayStore на Redis/DB реализацию с тем же контрактом. */
export const HITL_REPLAY_STORE = 'HITL_REPLAY_STORE';

@Module({
  providers: [
    InternalTokenService,
    HitlService,
    { provide: HITL_REPLAY_STORE, useClass: InMemoryReplayStore },
  ],
  exports: [InternalTokenService, HitlService, HITL_REPLAY_STORE],
})
export class SecurityModule {}
