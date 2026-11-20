// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/** CopilotChatAgent: предложения патча графа через инструменты, без записи в БД. */

import { Inject, Injectable } from '@nestjs/common';
import {
    CopilotChatResponseSchema,
    type CopilotChatRequest,
    type CopilotChatResponse,
    type CopilotToolCall,
    type ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { LlmClient } from './llm.client.js';
import { ToolRegistry } from './tools.js';

/** Системная инструкция: модель не выполняет расчёты и не меняет БД. */
export const COPILOT_SYSTEM_PROMPT =
    'Ты — ИИ-копилот САПР VoltWireCraft. Опиши предложение на русском языке. ' +
    'Запрещено самостоятельно вычислять токи, сечения и падения напряжения: ' +
    'используй только факты и числа, полученные от инструментов. ' +
    'Ты не сохраняешь проект: пользователь применяет предложение через PUT /projects/:id/graph.';

/** Максимум вызовов инструментов на один запрос чата. */
const MAX_TOOL_CALLS = 3;

/**
 * Агент чата: распознаёт намерение, вызывает инструменты мутации графа
 * и возвращает валидируемый патч-предложение (RULES § 5.1, 5.2).
 */
@Injectable()
export class CopilotChatAgent {
  /**
   * @param tools — реестр инструментов.
   * @param llm — OpenAI-совместимый адаптер для пояснений.
   */
  public constructor(
    @Inject(ToolRegistry) private readonly tools: ToolRegistry,
    @Inject(LlmClient) private readonly llm: LlmClient,
  ) {}

  /**
   * Обрабатывает сообщение пользователя и предлагает изменение графа.
   *
   * @param graph — текущий граф проекта.
   * @param request — сообщение, история и предпочтения.
   * @returns предложение с `proposedGraph`, сводкой изменений и протоколом инструментов.
   */
  public async chatAsync(
    graph: ProjectGraph,
    request: CopilotChatRequest,
  ): Promise<CopilotChatResponse> {
    const message = request.message.toLowerCase();
    const toolCalls: CopilotToolCall[] = [];
    const diffSummary: string[] = [];
    let proposedGraph: ProjectGraph | undefined;
    const references = new Set<string>();

    let mutation:
      | { graph: ProjectGraph; references: readonly string[]; summary: string; tool: string }
      | undefined;

    if (/мастер|главн.*выключа|контактор/.test(message)) {
      const result = await this.tools.addMasterSwitchTool.invokeAsync({ graph });
      mutation = { ...result, tool: this.tools.addMasterSwitchTool.name };
    } else if (/бренд|перевед|иек|keaz|кэаз|ekf|еаф/.test(message)) {
      const brand = this.detectBrand(message) ?? request.preferredBrand ?? 'IEK';
      const result = await this.tools.rebrandPanelTool.invokeAsync({ graph, brand });
      mutation = { ...result, tool: this.tools.rebrandPanelTool.name };
    } else if (/выдел|отдельн|лини.*на/.test(message)) {
      const node = this.findConsumer(graph, request.message);
      if (node !== undefined) {
        const lengthM = this.extractLengthM(request.message);
        const result = await this.tools.splitApplianceLineTool.invokeAsync({
          graph,
          nodeId: node.id,
          ...(lengthM !== undefined ? { lengthM } : {}),
        });
        mutation = { ...result, tool: this.tools.splitApplianceLineTool.name };
      }
    }

    if (mutation !== undefined && toolCalls.length < MAX_TOOL_CALLS) {
      proposedGraph = mutation.graph;
      diffSummary.push(mutation.summary);
      toolCalls.push({ tool: mutation.tool, summary: mutation.summary });
      mutation.references.forEach((reference) => references.add(reference));
    }

    if (diffSummary.length === 0) {
      diffSummary.push('Изменения графа не предложены: запрос не распознан как известная команда.');
    }

    const explanation = await this.llm.generateExplanationAsync({
      system: COPILOT_SYSTEM_PROMPT,
      prompt: `Запрос пользователя: ${request.message}. Предложения: ${diffSummary.join('; ')}.`,
    });

    return CopilotChatResponseSchema.parse({
      reply: explanation,
      ...(proposedGraph !== undefined ? { proposedGraph } : {}),
      diffSummary,
      toolCalls,
      citations: [...references],
    });
  }

  /**
   * Извлекает бренд из сообщения пользователя.
   *
   * @param message — сообщение в нижнем регистре.
   * @returns бренд или `undefined`.
   */
  private detectBrand(message: string): 'IEK' | 'EKF' | 'КЭАЗ' | undefined {
    if (message.includes('кэаз') || message.includes('keaz')) {
      return 'КЭАЗ';
    }
    if (message.includes('iek') || message.includes('иек')) {
      return 'IEK';
    }
    if (message.includes('ekf') || message.includes('еаф')) {
      return 'EKF';
    }
    return undefined;
  }

  /**
   * Находит узел-потребитель по подстроке названия; иначе — самый мощный.
   *
   * @param graph — граф проекта.
   * @param message — исходное сообщение.
   * @returns найденный узел или `undefined`.
   */
  private findConsumer(
    graph: ProjectGraph,
    message: string,
  ): ProjectGraph['nodes'][number] | undefined {
    const lowered = message.toLowerCase();
    const matched = graph.nodes.find(
      (node) => node.label.length > 2 && lowered.includes(node.label.toLowerCase()),
    );
    if (matched !== undefined) {
      return matched;
    }
    return [...graph.nodes]
      .filter((node) => node.specs.ratedPower > 0)
      .sort((left, right) => right.specs.ratedPower - left.specs.ratedPower)[0];
  }

  /**
   * Извлекает длину линии из сообщения (например, «20 м»).
   *
   * @param message — исходное сообщение.
   * @returns длина в метрах или `undefined`.
   */
  private extractLengthM(message: string): number | undefined {
    const match = /(\d+(?:[.,]\d+)?)\s*м/.exec(message.toLowerCase());
    if (match === null) {
      return undefined;
    }
    const length = Number(match[1]!.replace(',', '.'));
    return Number.isFinite(length) && length > 0 ? length : undefined;
  }
}
