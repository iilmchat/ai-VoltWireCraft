// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Подключение Drizzle ORM к существующему пулу `pg` (RULES § 1.3, 4.9). */

import { Inject } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { PG_POOL } from './database.module.js';
import { schema } from './schema.js';

/** Токен внедрения типизированного Drizzle-клиента. */
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

/** Тип Drizzle-клиента API. */
export type Database = NodePgDatabase<typeof schema>;

/** Параметр конструктора для внедрения Drizzle-клиента. */
export const InjectDatabase = (): ParameterDecorator => Inject(DRIZZLE_DB);

/** Провайдер Drizzle-клиента, переиспользующий пул PostgreSQL из DatabaseModule. */
export const drizzleProvider: Provider = {
  provide: DRIZZLE_DB,
  inject: [PG_POOL],
  useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
};
