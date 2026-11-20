// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** PanelArchitectAgent: сборка щита через инструменты + подбор артикулов каталога. */

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AutoPanelRequest,
  GraphNode,
  NodeSpecs,
  ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { AssemblePanelResultSchema } from './agents.schemas.js';
import type { AssemblePanelRequest, AssemblePanelResult } from './agents.schemas.js';
import { CatalogService } from './catalog.service.js';
import { LlmClient } from './llm.client.js';
import { ToolRegistry } from './tools.js';

/** Системная инструкция: языковая модель не выполняет расчёты. */
const SYSTEM_PROMPT =
  'Ты — архитектор щитов НКУ. Опиши решение на русском языке. ' +
  'Запрещено самостоятельно вычислять токи, сечения и падения напряжения: ' +
  'используй только числа, полученные от инструментов. Не придумывай артикулы.';

/**
 * Агент сборки щита: вызывает детерминированный `calc-engine`, затем
 * обогащает граф артикулами из каталога и генерирует пояснение через LLM.
 */
@Injectable()
export class PanelArchitectAgent {
  /**
   * @param tools — реестр инструментов.
   * @param catalog — каталог оборудования.
   * @param llm — OpenAI-совместимый адаптер.
   */
  public constructor(
    @Inject(ToolRegistry) private readonly tools: ToolRegistry,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(LlmClient) private readonly llm: LlmClient,
  ) {}

  /**
   * Собирает щит для текущего графа проекта.
   *
   * @param graph — граф проекта.
   * @param request — предпочтительный бренд.
   * @returns обновлённый граф, пояснение и протокол вызовов.
   */
  public async assembleAsync(
    graph: ProjectGraph,
    request: AssemblePanelRequest,
  ): Promise<AssemblePanelResult> {
    // Топология ввода берётся из графа: input_source.specs или meta (KI-007).
    const source = graph.nodes.find((node) => node.kind === 'input_source');
    const topology = graph.meta?.supplyTopology;
    const threePhase =
      topology === '3P_400V' ||
      source?.specs.phase === '3P' ||
      source?.specs.voltageV === 400 ||
      (graph.meta?.panelPoles !== undefined && graph.meta.panelPoles >= 3) ||
      (source === undefined &&
        ['tn-s', 'tn-c-s', 'tn-c', 'it'].includes(graph.meta?.networkSystem ?? '') &&
        topology === undefined);
    const panelPoles = graph.meta?.panelPoles ?? (threePhase ? 4 : 2);
    const autoPanelRequest: AutoPanelRequest = {
      nodes: graph.nodes,
      rooms: graph.rooms,
      supply: threePhase
        ? { voltageV: 400, phases: 3, supplyTopology: '3P_400V', panelPoles }
        : { voltageV: 230, phases: 1, supplyTopology: '1P_230V' },
      ...(request.preferredBrand !== undefined ? { preferredBrand: request.preferredBrand } : {}),
    };
    const panel = await this.tools.autoAssemblePanelTool.invokeAsync(autoPanelRequest);

    const newNodes: GraphNode[] = [];
    for (const module of panel.modules) {
      const group = panel.groups.find((item) => item.id === module.groupId);
      const nodeKind =
        module.kind === 'rcd'
          ? 'rcd'
          : module.kind === 'panel'
            ? 'panel'
            : module.kind === 'relay_voltage'
              ? 'relay_voltage'
              : group !== undefined && group.rcdCurrentMa > 0
                ? 'rcbo'
                : 'circuit_breaker';

      const minCurrentA = group?.breakerRatingA ?? (threePhase ? 63 : undefined);
      const isIncoming = group === undefined && threePhase;
      const lookupOptions = isIncoming
        ? nodeKind === 'rcd'
          ? { poles: '4P', leakageMa: 100, sType: true }
          : nodeKind === 'circuit_breaker'
            ? { poles: panelPoles === 3 ? '3P' : '4P' }
            : nodeKind === 'relay_voltage'
              ? { poles: '3P' }
              : {}
        : {};
      const selection = await this.catalog.findByTypeAsync(
        nodeKind,
        request.preferredBrand,
        minCurrentA,
        lookupOptions,
      );
      const specs: NodeSpecs = {
        ratedPower: group?.totalPowerW ?? 0,
        ratedCurrent: group?.breakerRatingA ?? 16,
        crossSection: group?.crossSectionMm2 ?? 2.5,
        mountingHeight: 0,
        ...(threePhase && isIncoming
          ? ({ phase: '3P', voltageV: 400 } as const)
          : ({} as const)),
      };
      newNodes.push({
        id: randomUUID(),
        kind: nodeKind,
        label: `${module.label}${selection !== null ? ` (${selection.sku})` : ''}`,
        planPosition: null,
        panelSlot: module.panelSlot,
        roomId: group?.roomId ?? null,
        specs,
      });
    }

    const updatedGraph: ProjectGraph = {
      ...graph,
      nodes: [...graph.nodes, ...newNodes],
    };

    const facts =
      `Групп: ${panel.groups.length}. Модулей: ${panel.usedDinModules}. ` +
      `Корпус: ${panel.enclosureModules} модулей. Перекос: ${panel.imbalancePercent} %. ` +
      `Предупреждений: ${panel.warnings.length}.`;
    const explanation = await this.llm.generateExplanationAsync({
      system: SYSTEM_PROMPT,
      prompt: `Опиши собранный щит НКУ по фактам: ${facts}`,
    });

    return AssemblePanelResultSchema.parse({
      graph: updatedGraph,
      explanation,
      toolCalls: [
        {
          tool: this.tools.autoAssemblePanelTool.name,
          summary: `Собрано групп: ${panel.groups.length}, модулей: ${panel.usedDinModules}`,
        },
      ],
      panel,
    });
  }
}

export { SYSTEM_PROMPT as PANEL_ARCHITECT_SYSTEM_PROMPT };
