// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Модуль ИИ-агентов: инструменты, каталог, нормативы и провайдеры LLM. */

import { Module } from '@nestjs/common';
import { CalcEngineModule } from '../calc-engine/calc-engine.module.js';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { ErpMcpService } from '../integrations/erp-mcp.service.js';
import { IntegrationService } from '../integrations/integration.service.js';
import { HitlService } from '../security/hitl.service.js';
import { HITL_REPLAY_STORE } from '../security/security.module.js';
import { InMemoryReplayStore } from '../security/replay-store.js';
import { CatalogService } from './catalog.service.js';
import { CopilotChatAgent } from './copilot-chat.agent.js';
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
    ErpMcpService,
    IntegrationService,
    HitlService,
    { provide: HITL_REPLAY_STORE, useClass: InMemoryReplayStore },
    LlmClient,
    CatalogService,
    NormativeService,
    ToolRegistry,
    PanelArchitectAgent,
    PueAuditorAgent,
    CopilotChatAgent,
  ],
  exports: [PanelArchitectAgent, PueAuditorAgent, CopilotChatAgent, ToolRegistry],
})
export class AgentsModule {}
