// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Контракты ИИ-агента v0.2 (RULES § 5.1: агент не вычисляет физические величины). */
import { ProjectGraphSchema } from '@voltwirecraft/shared/graph.schema.js';
import { z } from 'zod';

/** Уровень серьёзности замечания аудита. */
export const AuditSeveritySchema = z.enum(['error', 'warning', 'info']);
/** Уровень серьёзности замечания. */
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

/** Замечание аудита ПУЭ-7. */
export const AiAuditIssueSchema = z.object({
    /** Идентификатор замечания. */
    id: z.string().min(1),
    /** Уровень серьёзности. */
    severity: AuditSeveritySchema,
    /** Текст замечания. */
    message: z.string().min(1),
    /** Идентификатор проблемного узла, если применимо. */
    nodeId: z.string().nullable().optional(),
    /** Идентификатор проблемной линии, если применимо. */
    edgeId: z.string().nullable().optional(),
    /** Ссылка на пункт норматива. */
    citation: z.string().nullable().optional(),
});
/** Замечание аудита ПУЭ-7. */
export type AiAuditIssue = z.infer<typeof AiAuditIssueSchema>;

/** Ответ автосборки щита. */
export const PanelAssemblyResultSchema = z.object({
    /** Обновлённый граф проекта. */
    graph: ProjectGraphSchema,
    /** Краткое пояснение агента. */
    summary: z.string(),
});
/** Результат автосборки щита. */
export type PanelAssemblyResult = z.infer<typeof PanelAssemblyResultSchema>;

/** Ответ аудита ПУЭ-7. */
export const PueAuditResultSchema = z.object({
    /** Список замечаний. */
    issues: z.array(AiAuditIssueSchema),
    /** Краткое пояснение агента. */
    summary: z.string(),
});
/** Результат аудита ПУЭ-7. */
export type PueAuditResult = z.infer<typeof PueAuditResultSchema>;
