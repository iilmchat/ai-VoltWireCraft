// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Реестр инструментов агентов: только вызовы calc-engine и поиск нормативов. */

import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AutoPanelRequestSchema,
  LineSizingRequestSchema,
  ProjectGraphSchema,
  ShortCircuitRequestSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
  AutoPanelRequest,
  AutoPanelResponse,
  GraphNode,
  LineSizingRequest,
  LineSizingResponse,
  PueCitation,
  ProjectGraph,
  ShortCircuitRequest,
  ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../calc-engine/calc-engine.client.js';
import { CatalogService } from './catalog.service.js';
import { NormativeService } from './normative.service.js';

/** Описание инструмента с Zod-валидацией входа. */
export interface AgentTool<TInput, TResult> {
  /** Имя для Tool Calling. */
  readonly name: string;
  /** Описание для модели. */
  readonly description: string;
  /** Схема входных данных. */
  readonly inputSchema: z.ZodType<TInput>;
  /**
   * Выполняет инструмент.
   *
   * @param input — провалидированные входные данные.
   * @returns результат инструмента.
   */
  invokeAsync(input: TInput): Promise<TResult>;
}

/** Вход инструмента поиска правил ПУЭ. */
export const InspectPueRulesInputSchema = z.object({
  /** Поисковый запрос. */
  query: z.string().min(1),
  /** Максимум цитат. */
  limit: z.number().int().positive().max(20).optional(),
});
/** Вход поиска правил ПУЭ. */
export type InspectPueRulesInput = z.infer<typeof InspectPueRulesInputSchema>;

/** Вход инструмента добавления мастер-выключателя с контактором. */
export const AddMasterSwitchInputSchema = z.object({
  /** Текущий граф проекта. */
  graph: ProjectGraphSchema,
  /** Номинал вводного автомата, A. */
  incomingCurrentA: z.number().positive().optional(),
});
/** Вход добавления мастер-выключателя. */
export type AddMasterSwitchInput = z.infer<typeof AddMasterSwitchInputSchema>;

/** Вход инструмента выделения отдельной линии на прибор. */
export const SplitApplianceLineInputSchema = z.object({
  /** Текущий граф проекта. */
  graph: ProjectGraphSchema,
  /** Идентификатор узла-потребителя. */
  nodeId: z.string().min(1),
  /** Длина новой линии, m. */
  lengthM: z.number().positive().optional(),
});
/** Вход выделения линии. */
export type SplitApplianceLineInput = z.infer<typeof SplitApplianceLineInputSchema>;

/** Вход инструмента смены бренда оборудования щита. */
export const RebrandPanelInputSchema = z.object({
  /** Текущий граф проекта. */
  graph: ProjectGraphSchema,
  /** Целевой бренд. */
  brand: z.enum(['IEK', 'EKF', 'КЭАЗ']),
});
/** Вход смены бренда. */
export type RebrandPanelInput = z.infer<typeof RebrandPanelInputSchema>;

/** Результат инструмента, изменяющего граф. */
export interface GraphMutationResult {
  /** Предлагаемый граф. */
  readonly graph: ProjectGraph;
  /** Ссылки на пункты нормативов из протокола расчёта. */
  readonly references: readonly string[];
  /** Краткое описание изменения. */
  readonly summary: string;
}

/** Соответствие типов УГО щита типам каталога. */
const CATALOG_TYPE_BY_KIND: Readonly<Record<string, string>> = {
  panel: 'panel',
  circuit_breaker: 'circuit_breaker',
  rcd: 'rcd',
  rcbo: 'rcbo',
  contactor: 'contactor',
};

/** Реестр инструментов, доступных ИИ-агентам. */
@Injectable()
export class ToolRegistry {
  /** Расчёт потребительской линии (делегируется `calc-engine`). */
  public readonly calculateLineTool: AgentTool<LineSizingRequest, LineSizingResponse>;
  /** Автосборка щита НКУ (делегируется `calc-engine`). */
  public readonly autoAssemblePanelTool: AgentTool<AutoPanelRequest, AutoPanelResponse>;
  /** Поиск пунктов ПУЭ-7 (делегируется `normative_chunks`). */
  public readonly inspectPueRulesTool: AgentTool<InspectPueRulesInput, PueCitation[]>;
  /** Проверка тока КЗ «фаза-ноль» и селективности (делегируется `calc-engine`). */
  public readonly checkShortCircuitTool: AgentTool<ShortCircuitRequest, ShortCircuitResponse>;
  /** Добавление мастер-выключателя с контактором и пересчёт щита. */
  public readonly addMasterSwitchTool: AgentTool<AddMasterSwitchInput, GraphMutationResult>;
  /** Выделение отдельной линии на прибор с пересчётом линии. */
  public readonly splitApplianceLineTool: AgentTool<SplitApplianceLineInput, GraphMutationResult>;
  /** Смена бренда модулей щита с подбором артикулов и пересчётом. */
  public readonly rebrandPanelTool: AgentTool<RebrandPanelInput, GraphMutationResult>;

  /**
   * @param calcClient — клиент расчётного ядра.
   * @param normative — сервис поиска нормативов.
   * @param catalog — каталог модульного оборудования.
   */
  public constructor(
    @Inject(CalcEngineClient) private readonly calcClient: CalcEngineClient,
    @Inject(NormativeService) private readonly normative: NormativeService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {
    this.calculateLineTool = {
      name: 'calculate_line_tool',
      description: 'Рассчитывает ток, сечение кабеля, потерю напряжения и аппараты защиты линии.',
      inputSchema: LineSizingRequestSchema,
      invokeAsync: (input) => this.calcClient.calculateLineSizingAsync(input),
    };
    this.autoAssemblePanelTool = {
      name: 'auto_assemble_panel_tool',
      description: 'Детерминированно собирает щит НКУ из узлов и помещений графа.',
      inputSchema: AutoPanelRequestSchema,
      invokeAsync: (input) => this.calcClient.autoAssemblePanelAsync(input),
    };
    this.inspectPueRulesTool = {
      name: 'inspect_pue_rules_tool',
      description: 'Возвращает цитаты пунктов ПУЭ-7 по ключевым словам.',
      inputSchema: InspectPueRulesInputSchema,
      invokeAsync: (input) => this.normative.searchAsync(input.query, input.limit),
    };
    this.checkShortCircuitTool = {
      name: 'check_short_circuit_tool',
      description: 'Проверяет ток однофазного КЗ, кратность срабатывания и селективность автоматов.',
      inputSchema: ShortCircuitRequestSchema,
      invokeAsync: (input) => this.calcClient.checkShortCircuitAsync(input),
    };
    this.addMasterSwitchTool = {
      name: 'add_master_switch_tool',
      description: 'Добавляет мастер-выключатель и контактор, пересчитывая щит в calc-engine.',
      inputSchema: AddMasterSwitchInputSchema,
      invokeAsync: (input) => this.addMasterSwitchAsync(input),
    };
    this.splitApplianceLineTool = {
      name: 'split_appliance_line_tool',
      description: 'Выделяет отдельную линию на прибор и пересчитывает её и щит в calc-engine.',
      inputSchema: SplitApplianceLineInputSchema,
      invokeAsync: (input) => this.splitApplianceLineAsync(input),
    };
    this.rebrandPanelTool = {
      name: 'rebrand_panel_tool',
      description: 'Меняет бренд модулей щита, подбирая артикулы каталога и пересчитывая щит.',
      inputSchema: RebrandPanelInputSchema,
      invokeAsync: (input) => this.rebrandPanelAsync(input),
    };
  }

  /**
   * Определяет топологию ввода из `input_source` и `meta` графа (KI-007).
   *
   * @param graph — граф проекта.
   * @returns параметры ввода для `calc-engine`.
   */
  private supplyForGraph(graph: ProjectGraph): {
    voltageV: 230 | 400;
    phases: 1 | 3;
    supplyTopology: '1P_230V' | '3P_400V';
    panelPoles?: 2 | 3 | 4;
  } {
    const source = graph.nodes.find((node) => node.kind === 'input_source');
    const threePhase =
      graph.meta?.supplyTopology === '3P_400V' ||
      source?.specs.phase === '3P' ||
      source?.specs.voltageV === 400 ||
      (graph.meta?.panelPoles !== undefined && graph.meta.panelPoles >= 3);
    return threePhase
      ? { voltageV: 400, phases: 3, supplyTopology: '3P_400V', panelPoles: graph.meta?.panelPoles ?? 4 }
      : { voltageV: 230, phases: 1, supplyTopology: '1P_230V' };
  }

  /**
   * Добавляет мастер-выключатель и контактор с обязательным пересчётом щита.
   *
   * @param input — граф и номинал ввода.
   * @returns предложенный граф и протокол расчёта.
   */
  private async addMasterSwitchAsync(input: AddMasterSwitchInput): Promise<GraphMutationResult> {
    const maxSlot = input.graph.nodes.reduce((max, node) => Math.max(max, node.panelSlot ?? 0), 0);
    const incoming = input.incomingCurrentA ?? 63;
    const nodes: GraphNode[] = [
      {
        id: randomUUID(),
        kind: 'switch',
        label: 'Мастер-выключатель',
        planPosition: null,
        panelSlot: maxSlot + 1,
        roomId: null,
        specs: { ratedPower: 0, ratedCurrent: incoming, crossSection: 10, mountingHeight: 0 },
        catalogDeviceId: null,
      },
      {
        id: randomUUID(),
        kind: 'contactor',
        label: 'Контактор неотключаемых линий',
        planPosition: null,
        panelSlot: maxSlot + 2,
        roomId: null,
        specs: { ratedPower: 0, ratedCurrent: 25, crossSection: 6, mountingHeight: 0 },
        catalogDeviceId: null,
      },
    ];
    const graph: ProjectGraph = { ...input.graph, nodes: [...input.graph.nodes, ...nodes] };
    const panel = await this.calcClient.autoAssemblePanelAsync({
      nodes: graph.nodes,
      rooms: graph.rooms,
      supply: this.supplyForGraph(graph),
    });

    return {
      graph,
      references: panel.references,
      summary: `Добавлены мастер-выключатель и контактор на ввод ${incoming} А`,
    };
  }

  /**
   * Выделяет отдельную линию на прибор и обновляет параметры кабеля по расчёту ядра.
   *
   * @param input — граф, идентификатор прибора и длина линии.
   * @returns предложенный граф и протокол расчёта.
   */
  private async splitApplianceLineAsync(
    input: SplitApplianceLineInput,
  ): Promise<GraphMutationResult> {
    const node = input.graph.nodes.find((item) => item.id === input.nodeId);
    if (node === undefined) {
      throw new BadRequestException('Узел-потребитель не найден в графе');
    }
    const panel = input.graph.nodes.find((item) => item.kind === 'panel');
    const lengthM = input.lengthM ?? 12;
    const supply = this.supplyForGraph(input.graph);
    const powerfulThreePhase = supply.phases === 3 && node.specs.ratedPower > 2000;
    const sizing = await this.calcClient.calculateLineSizingAsync({
      powerW: node.specs.ratedPower > 0 ? node.specs.ratedPower : 1000,
      voltageV: powerfulThreePhase ? 400 : 230,
      phases: powerfulThreePhase ? 3 : 1,
      powerFactor: 0.95,
      lengthM,
      consumerKind: node.kind === 'socket' ? 'socket' : 'other',
    });
    const graph: ProjectGraph = {
      ...input.graph,
      edges: [
        ...input.graph.edges,
        {
          id: randomUUID(),
          from: panel?.id ?? node.id,
          to: node.id,
          cableSpecs: {
            crossSection: sizing.selectedCrossSectionMm2,
            conductorCount: 3,
            material: 'cu',
            length: lengthM,
            calculatedCurrentA: sizing.designCurrentA,
            voltageDropPercent: sizing.voltageDropPercent,
          },
          waypointsM: [
            panel?.planPosition ?? { x: 0, y: 0 },
            node.planPosition ?? { x: 1, y: 1 },
          ],
          edgeType: 'cable_line',
          cableBrand: sizing.cableType,
        },
      ],
    };
    await this.calcClient.autoAssemblePanelAsync({
      nodes: graph.nodes,
      rooms: graph.rooms,
      supply: this.supplyForGraph(graph),
    });

    return {
      graph,
      references: sizing.references,
      summary: `Выделена отдельная линия «${node.label}»: ${sizing.selectedCrossSectionMm2} мм², автомат ${sizing.breakerRatingA} А`,
    };
  }

  /**
   * Меняет бренд модулей щита с подбором артикулов и обязательным пересчётом.
   *
   * @param input — граф и целевой бренд.
   * @returns предложенный граф и протокол расчёта.
   */
  private async rebrandPanelAsync(input: RebrandPanelInput): Promise<GraphMutationResult> {
    const nodes: GraphNode[] = [];
    let replaced = 0;
    for (const node of input.graph.nodes) {
      const deviceType = CATALOG_TYPE_BY_KIND[node.kind];
      if (deviceType === undefined) {
        nodes.push(node);
        continue;
      }
      const selection = await this.catalog.findByTypeAsync(
        deviceType,
        input.brand,
        node.specs.ratedCurrent,
      );
      if (selection === null) {
        nodes.push(node);
        continue;
      }
      replaced += 1;
      nodes.push({ ...node, label: `${node.label.split(' (')[0]} (${selection.sku})` });
    }
    const graph: ProjectGraph = { ...input.graph, nodes };
    const panel = await this.calcClient.autoAssemblePanelAsync({
      nodes,
      rooms: graph.rooms,
      supply: this.supplyForGraph(graph),
      preferredBrand: input.brand,
    });

    return {
      graph,
      references: panel.references,
      summary: `Оборудование щита переведено на ${input.brand}: подобрано артикулов — ${replaced}`,
    };
  }
}
