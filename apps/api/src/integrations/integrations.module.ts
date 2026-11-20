// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Модуль MCP-интеграций и светотехнического расчёта. */

import { Module } from '@nestjs/common';
import { CalcEngineModule } from '../calc-engine/calc-engine.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ErpMcpService } from './erp-mcp.service.js';
import { IntegrationService } from './integration.service.js';
import { IntegrationsController } from './integrations.controller.js';

/** Предоставляет интеграции и расчёт освещённости. */
@Module({
  imports: [CalcEngineModule, ProjectsModule],
  controllers: [IntegrationsController],
  providers: [ErpMcpService, IntegrationService],
  exports: [ErpMcpService, IntegrationService],
})
export class IntegrationsModule {}
