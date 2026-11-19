// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Модуль ИИ-агентов: инструменты, каталог, нормативы и провайдеры LLM. */

import { Module } from '@nestjs/common';
import { CalcEngineModule } from '../calc-engine/calc-engine.module.js';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { CatalogService } from './catalog.service.js';
import { LlmClient } from './llm.client.js';
import { NormativeService } from './normative.service.js';
import { PanelArchitectAgent } from './panel-architect.agent.js';
import { PueAuditorAgent } from './pue-auditor.agent.js';
import { ToolRegistry } from './tools.js';

/** Предоставляет агентов REST-слою. */
@Module({
  imports: [CalcEngineModule],
  controllers: [],
  providers: [
    drizzleProvider,
    LlmClient,
    CatalogService,
    NormativeService,
    ToolRegistry,
    PanelArchitectAgent,
    PueAuditorAgent,
  ],
  exports: [PanelArchitectAgent, PueAuditorAgent, ToolRegistry],
})
export class AgentsModule {}
