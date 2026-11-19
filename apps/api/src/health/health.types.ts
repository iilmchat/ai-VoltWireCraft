/** Имя проверяемого инфраструктурного сервиса. */
export type ServiceName = 'postgres' | 'redis' | 'calcEngine';

/** Состояние одного сервиса. */
export interface ServiceHealth {
  readonly name: ServiceName;
  readonly status: 'ok' | 'error';
  readonly detail?: string;
}

/** Сводный отчёт о готовности API. */
export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly services: readonly ServiceHealth[];
}
