// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** PueAuditorAgent: структурированный аудит ПУЭ-7 через инструменты и правила. */

import { Inject, Injectable } from '@nestjs/common';
import {
  PueAuditReportSchema,
  type PueAuditReport,
  type PueCitation,
  type PueFinding,
  type ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { LlmClient } from './llm.client.js';
import { ToolRegistry } from './tools.js';

/** Системная инструкция аудитора. */
const SYSTEM_PROMPT =
  'Ты — аудитор по ПУЭ-7. Опиши найденные нарушения на русском языке. ' +
  'Запрещено вычислять токи, сечения и потери напряжения: используй только ' +
  'результаты инструментов и цитаты норматива.';

/** Предельный номинал автомата по сечению жилы (ПУЭ-7, справочник v0.1). */
const BREAKER_LIMITS: Readonly<Record<number, number>> = {
  1.5: 10,
  2.5: 16,
  4: 25,
  6: 32,
  10: 50,
  16: 66,
};

/** Типы помещений, требующие УЗО 30 мА. */
const WET_ROOM_TYPES: ReadonlySet<string> = new Set(['wet', 'kitchen', 'outdoor']);

/**
 * Агент аудита: детерминированные проверки графа + цитаты из `normative_chunks`
 * + расчёт representative-линии в `calc-engine`. Математика не выполняется в LLM.
 */
@Injectable()
export class PueAuditorAgent {
  /**
   * @param tools — реестр инструментов.
   * @param llm — OpenAI-совместимый адаптер.
   */
  public constructor(
    @Inject(ToolRegistry) private readonly tools: ToolRegistry,
    @Inject(LlmClient) private readonly llm: LlmClient,
  ) {}

  /**
   * Проводит аудит проекта.
   *
   * @param projectId — идентификатор проекта.
   * @param graph — граф проекта.
   * @returns провалидированный отчёт с цитатами пунктов ПУЭ.
   */
  public async auditAsync(projectId: string, graph: ProjectGraph): Promise<PueAuditReport> {
    const findings: PueFinding[] = [];
    const toolCalls: string[] = [];

    const citations = await this.tools.inspectPueRulesTool.invokeAsync({
      query: 'УЗО влажные помещения розетки автоматический выключатель сечение',
      limit: 5,
    });
    toolCalls.push(this.tools.inspectPueRulesTool.name);

    const roomTypes = new Map(graph.rooms.map((room) => [room.id, room.type]));
    const breakerNodes = graph.nodes.filter((node) =>
      ['circuit_breaker', 'rcbo'].includes(node.kind),
    );
    const rcdNodes = graph.nodes.filter((node) => ['rcd', 'rcbo'].includes(node.kind));

    for (const [index, edge] of graph.edges.entries()) {
      const limit = BREAKER_LIMITS[edge.cableSpecs.crossSection];
      if (limit !== undefined && breakerNodes.some((node) => node.specs.ratedCurrent > limit)) {
        findings.push({
          id: `F-BREAKER-${index + 1}`,
          severity: 'error',
          ruleId: `PUE-BREAKER-S${String(edge.cableSpecs.crossSection)}`,
          section: '2. Соответствие сечения и автомата',
          message: `Номинал автомата превышает предел для сечения ${edge.cableSpecs.crossSection} мм².`,
          nodeIds: breakerNodes.map((node) => node.id),
          recommendation: 'Уменьшите номинал автомата или увеличьте сечение кабеля.',
        });
      }
    }

    const wetConsumers = graph.nodes.filter((node) => {
      const roomType = node.roomId == null ? undefined : roomTypes.get(node.roomId);
      return (
        roomType !== undefined &&
        WET_ROOM_TYPES.has(roomType) &&
        ['socket', 'appliance'].includes(node.kind)
      );
    });
    if (wetConsumers.length > 0 && rcdNodes.length === 0) {
      findings.push({
        id: 'F-RCD-WET',
        severity: 'error',
        ruleId: 'PUE-RCD-WET-30',
        section: '3. УЗО и АВДТ',
        message: 'В мокрой зоне или на розеточной линии отсутствует УЗО 30 мА.',
        nodeIds: wetConsumers.map((node) => node.id),
        recommendation: 'Установите УЗО/АВДТ 30 мА без задержки срабатывания.',
      });
    }
    if (rcdNodes.length > 0 && !graph.nodes.some((node) => node.kind === 'panel')) {
      findings.push({
        id: 'F-RCD-SELECTIVITY',
        severity: 'warning',
        ruleId: 'PUE-RCD-FIRE-100',
        section: '3. УЗО и АВДТ',
        message: 'Не найдено вводное противопожарное УЗО с выдержкой времени.',
        nodeIds: rcdNodes.map((node) => node.id),
        recommendation: 'Добавьте противопожарное УЗО 100/300 мА с селективной выдержкой.',
      });
    }

    const representative = [...graph.nodes]
      .filter((node) => node.specs.ratedPower > 0)
      .sort((left, right) => right.specs.ratedPower - left.specs.ratedPower)[0];
    let rulesVersion = '0.1';
    if (representative !== undefined) {
      const roomType =
        representative.roomId == null ? undefined : roomTypes.get(representative.roomId);
      const sizing = await this.tools.calculateLineTool.invokeAsync({
        powerW: representative.specs.ratedPower,
        voltageV: 230,
        phases: 1,
        powerFactor: 0.95,
        lengthM: graph.edges[0]?.cableSpecs.length ?? 10,
        consumerKind: representative.kind === 'socket' ? 'socket' : 'other',
        ...(roomType !== undefined ? { roomType } : {}),
      });
      toolCalls.push(this.tools.calculateLineTool.name);
      rulesVersion = sizing.rulesVersion;
      findings.push({
        id: 'F-LINE-SIZING',
        severity: 'info',
        ruleId: 'PUE-1.3.4',
        section: '1. Допустимые длительные токи',
        message: `Для потребителя «${representative.label}» ядром подобрано сечение ${sizing.selectedCrossSectionMm2} мм² и автомат ${sizing.breakerRatingA} А.`,
        nodeIds: [representative.id],
        recommendation: sizing.recommendations[0] ?? 'Сверьте решение с проектом.',
      });
      for (const reference of sizing.references) {
        if (!citations.some((citation) => citation.ruleId === reference)) {
          citations.push({
            ruleId: reference,
            excerpt: `Пункт справочника ПУЭ v${rulesVersion}: ${reference}`,
            document: 'PUE-7',
          });
        }
      }
    }

    // Проверка петли «фаза-ноль» выполняется только инструментом calc-engine.
    const upstream = graph.nodes.find((node) => node.kind === 'panel');
    for (const [index, edge] of graph.edges.slice(0, 3).entries()) {
      const breaker = breakerNodes.find((node) => node.specs.ratedCurrent > 0);
      if (breaker === undefined) {
        continue;
      }
      const request = this.tools.checkShortCircuitTool.inputSchema.parse({
        transformerPowerKva: 100,
        cableLengthM: edge.cableSpecs.length > 0 ? edge.cableSpecs.length : 10,
        crossSectionMm2: edge.cableSpecs.crossSection,
        breakerRatingA: breaker.specs.ratedCurrent,
        tripCurve: 'C',
        ...(upstream !== undefined ? { upstreamBreakerRatingA: upstream.specs.ratedCurrent } : {}),
      });
      const shortCircuit = await this.tools.checkShortCircuitTool.invokeAsync(request);
      toolCalls.push(this.tools.checkShortCircuitTool.name);

      findings.push({
        id: `F-SHORT-CIRCUIT-${index + 1}`,
        severity: shortCircuit.disconnectComplies ? 'info' : 'error',
        ruleId: 'PUE-SC-1.7-TIME-04',
        section: '1.7. Защита от сверхтоков',
        message: `I_кз^(1) = ${shortCircuit.shortCircuitCurrentA} А, кратность ${shortCircuit.actualMultiplicity}× при требуемой ${shortCircuit.requiredMultiplicity}×.`,
        nodeIds: [breaker.id, edge.to],
        recommendation:
          shortCircuit.warnings[0] ?? 'Мгновенное отключение обеспечено; проверьте селективность.',
      });
    }

    // ВТХ-селективность и отключающая способность — только через инструмент ядра.
    if (breakerNodes.length > 0) {
      const feeder = graph.edges.find((edge) => edge.edgeType === 'feeder_line');
      const faultCurrent = graph.edges[0]?.cableSpecs.shortCircuitCurrentA ?? 2000;
      const devices = [
        ...(upstream !== undefined
          ? [{
              id: upstream.id,
              ratedCurrentA: upstream.specs.ratedCurrent,
              tripCurve: 'C' as const,
              parentId: null,
              shortCircuitCurrentA: faultCurrent,
            }]
          : []),
        ...breakerNodes.map((node) => ({
          id: node.id,
          ratedCurrentA: node.specs.ratedCurrent,
          tripCurve: 'C' as const,
          ...(node.specs.breakingCapacityKa !== undefined
            ? { breakingCapacityKa: node.specs.breakingCapacityKa }
            : node.breakingCapacityKa !== undefined
              ? { breakingCapacityKa: node.breakingCapacityKa }
              : {}),
          parentId: upstream?.id ?? null,
          shortCircuitCurrentA: faultCurrent,
        })),
      ];
      const tccRequest = this.tools.checkTccSelectivityTool.inputSchema.parse({
        devices,
        upstreamVoltageDropPercent: feeder?.upstreamVoltageDropPercent ?? 0,
        groupVoltageDropPercent: Math.max(
          0,
          ...graph.edges.map((edge) => edge.cableSpecs.voltageDropPercent ?? 0),
        ),
      });
      const tcc = await this.tools.checkTccSelectivityTool.invokeAsync(tccRequest);
      toolCalls.push(this.tools.checkTccSelectivityTool.name);

      findings.push({
        id: 'F-TCC-SELECTIVITY',
        severity: tcc.breakingCapacityOk && tcc.status !== 'none' ? 'info' : 'warning',
        ruleId: 'PUE-SELECT-TCC',
        section: '1.7. Селективность по ВТХ',
        message: `ВТХ: статус ${tcc.status}, предел Is = ${tcc.selectivityLimitA} А, ΔUсумм = ${tcc.totalVoltageDropPercent} %, I_cn достаточно: ${tcc.breakingCapacityOk}.`,
        nodeIds: breakerNodes.map((node) => node.id),
        recommendation:
          tcc.warnings[0] ?? 'Проверьте пересечение ВТХ и отключающую способность вводного аппарата.',
      });
      for (const reference of tcc.references) {
        citations.push({ ruleId: reference, excerpt: `Пункт справочника: ${reference}`, document: 'TCC-7' });
      }
    }

    // v0.9: 3-фазное КЗ и заземление/молниезащита — только инструменты ядра.
    if (breakerNodes.length > 0) {
      const breaker = breakerNodes[0]!;
      const threePhase = await this.tools.checkThreePhaseScTool.invokeAsync(
        this.tools.checkThreePhaseScTool.inputSchema.parse({
          voltageV: 400,
          resistanceOhm: 0.03,
          reactanceOhm: 0.07,
          breakingCapacityKa: 10,
        }),
      );
      toolCalls.push(this.tools.checkThreePhaseScTool.name);
      findings.push({
        id: 'F-THREE-PHASE-SC',
        severity: threePhase.breakingCapacityOk ? 'info' : 'error',
        ruleId: 'PUE-SC-BREAKING-CAPACITY',
        section: '1.7. Трёхфазное КЗ',
        message: `Iкз^(3) = ${threePhase.shortCircuitCurrentA} А, ударный ток ${threePhase.peakShortCircuitA} А, I_cn достаточно: ${threePhase.breakingCapacityOk}.`,
        nodeIds: breakerNodes.map((node) => node.id),
        recommendation:
          threePhase.warnings[0] ?? 'Проверьте отключающую способность вводного автомата.',
      });

      const grounding = await this.tools.checkGroundingTool.invokeAsync(
        this.tools.checkGroundingTool.inputSchema.parse({
          soilType: 'loam',
          burialDepthM: 1,
          verticalElectrodesCount: 3,
          verticalElectrodeLengthM: 3,
          verticalElectrodeDiameterM: 0.016,
          horizontalStripLengthM: 10,
          buildingHeightM: 9,
          lightningRodHeightM: 4,
          protectionHeightM: 0,
        }),
      );
      toolCalls.push(this.tools.checkGroundingTool.name);
      findings.push({
        id: 'F-GROUNDING',
        severity: grounding.groundingCompliant && grounding.lightningCompliant ? 'info' : 'warning',
        ruleId: 'PUE-GR-4',
        section: '1.7. Заземление и молниезащита',
        message: `R_ЗУ = ${grounding.groundingResistanceOhm} Ом (норма ${grounding.requiredResistanceOhm} Ом), радиус зоны ${grounding.protectionRadiusM} м.`,
        nodeIds: [breaker.id],
        recommendation:
          grounding.warnings[0] ?? 'Контур заземления и молниезащита соответствуют нормативам.',
      });
      for (const reference of [...threePhase.references, ...grounding.references]) {
        citations.push({ ruleId: reference, excerpt: `Пункт справочника: ${reference}`, document: 'ПУЭ-7' });
      }
    }

    const summary = {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
      info: findings.filter((finding) => finding.severity === 'info').length,
    };
    const explanation = await this.llm.generateExplanationAsync({
      system: SYSTEM_PROMPT,
      prompt: `Аудит ПУЭ-7: ошибок ${summary.errors}, предупреждений ${summary.warnings}, информационных записей ${summary.info}. Инструменты: ${toolCalls.join(', ')}.`,
    });

    return PueAuditReportSchema.parse({
      projectId,
      findings,
      summary,
      citations: (citations as PueCitation[]).slice(0, 10),
      rulesVersion,
      explanation,
    });
  }
}

export { SYSTEM_PROMPT as PUE_AUDITOR_SYSTEM_PROMPT };
