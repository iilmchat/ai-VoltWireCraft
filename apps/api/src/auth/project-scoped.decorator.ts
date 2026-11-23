// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Декларативная разметка project-scoped маршрутов (SEC-02, решение D-02). */

import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Ключ metadata для `@ProjectScoped`. */
export const PROJECT_SCOPE_KEY = 'voltwirecraft:project-scope';

/** Требуемый уровень доступа. */
export type ProjectScopeRole = 'read' | 'write' | 'owner';

/** Параметры декоратора. */
export interface ProjectScopeOptions {
  /** Имя параметра маршрута, содержащего UUID проекта (обычно `id`). */
  readonly param: string;
  /** Минимально требуемый уровень доступа. */
  readonly role: ProjectScopeRole;
}

/**
 * Явно помечает маршрут как работающий с проектными данными.
 * Отсутствие metadata означает «не project-scoped» — guard не применяется.
 *
 * @param options — имя параметра и требуемая роль.
 */
export const ProjectScoped = (options: ProjectScopeOptions): CustomDecorator<string> =>
  SetMetadata(PROJECT_SCOPE_KEY, options);
