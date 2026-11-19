// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Модуль клиента расчётного ядра. */

import { Module } from '@nestjs/common';
import { CalcEngineClient } from './calc-engine.client.js';

/** Предоставляет `CalcEngineClient` остальным модулям API. */
@Module({
  providers: [CalcEngineClient],
  exports: [CalcEngineClient],
})
export class CalcEngineModule {}
