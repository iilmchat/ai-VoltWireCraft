// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Реестр инструментов агентов: только вызовы calc-engine и поиск нормативов. */

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AutoPanelRequestSchema,
  LineSizingRequestSchema,
  ShortCircuitRequestSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
  AutoPanelRequest,
  AutoPanelResponse,
  LineSizingRequest,
  LineSizingResponse,
  PueCitation,
  ShortCircuitRequest,
  ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../calc-engine/calc-engine.client.js';
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

  /**
   * @param calcClient — клиент расчётного ядра.
   * @param normative — сервис поиска нормативов.
   */
  public constructor(
    @Inject(CalcEngineClient) private readonly calcClient: CalcEngineClient,
    @Inject(NormativeService) private readonly normative: NormativeService,
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
  }
}
