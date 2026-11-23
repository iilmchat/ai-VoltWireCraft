// © 2026 VoltWireCraft — Security Architect / TEC-05
/** Контракт одноразового хранилища nonce для HITL-токенов. */

/** Абстракция над хранилищем использованных jti. */
export interface ReplayStore {
  /** Возвращает true, если jti ещё не использован, и атомарно помечает его. */
  consumeAsync(jti: string, expiresAtSeconds: number): Promise<boolean>;
}

/**
 * In-memory реализация только для unit-тестов и однопроцессного dev.
 *
 * НЕ является production-реализацией: при нескольких инстансах API
 * nonce не разделён. Stage 4 подключает Redis/PostgreSQL реализацию
 * с тем же интерфейсом без изменения HITL-контракта.
 */
export class InMemoryReplayStore implements ReplayStore {
  private readonly used = new Map<string, number>();

  public async consumeAsync(jti: string, expiresAtSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, expiry] of this.used) {
      if (expiry <= now) {
        this.used.delete(key);
      }
    }
    if (this.used.has(jti)) {
      return false;
    }
    this.used.set(jti, expiresAtSeconds);
    return true;
  }
}
