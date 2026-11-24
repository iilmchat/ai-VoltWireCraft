// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Модуль MCP-интеграций и светотехнического расчёта. */

import { Module } from '@nestjs/common';
import { CalcEngineModule } from '../calc-engine/calc-engine.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { HITL_REPLAY_STORE } from '../security/security.module.js';
import { HitlService } from '../security/hitl.service.js';
import { InMemoryReplayStore } from '../security/replay-store.js';
import { ErpMcpService } from './erp-mcp.service.js';
import { IntegrationService } from './integration.service.js';
import { IntegrationsController } from './integrations.controller.js';

/** Предоставляет интеграции и расчёт освещённости. */
@Module({
  imports: [CalcEngineModule, ProjectsModule],
  controllers: [IntegrationsController],
  providers: [
    ErpMcpService,
    IntegrationService,
    HitlService,
    { provide: HITL_REPLAY_STORE, useClass: InMemoryReplayStore },
  ],
  exports: [ErpMcpService, IntegrationService],
})
export class IntegrationsModule {}
