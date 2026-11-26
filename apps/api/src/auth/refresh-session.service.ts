// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** SEC-02 Stage 2 (PO-D13-01): сессии, ротация refresh и replay-детекшн. */

import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { authRefreshTokens, authSessions } from '../database/schema.js';
import type { Env } from '../config/env.schema.js';
import { JwtService, type JwtPayload } from './jwt.service.js';

/** Пара токенов, выдаваемая клиенту. */
export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sid: string;
}

/** Результат специализированной проверки refresh-токена. */
export interface VerifiedRefresh {
  readonly payload: JwtPayload;
  readonly tokenHash: string;
  readonly sessionId: string;
  readonly tokenId: string;
}

/**
 * Хранилище refresh-сессий. Сырые refresh-токены NEVER не попадают в БД:
 * сохраняется только HMAC-SHA256 с отдельным pepper.
 */
@Injectable()
export class RefreshSessionService {
  /** Причины отзыва сессии. */
  public static readonly REVOKE_LOGOUT = 'logout';
  public static readonly REVOKE_LOGOUT_ALL = 'logout_all';
  public static readonly REVOKE_REPLAY = 'replay';

  /** Отдельный pepper для хеширования refresh-токенов (TEC-07). */
  private readonly pepper: string;

  public constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    const pepper = this.config.get('JWT_REFRESH_HASH_PEPPER', { infer: true });
    if (pepper === undefined || pepper.length < 32) {
      throw new Error('JWT_REFRESH_HASH_PEPPER обязателен и должен содержать не менее 32 символов');
    }
    this.pepper = pepper;
  }

  /**
   * Создаёт сессию и первую пару токенов в одной транзакции.
   *
   * @param userId — идентификатор пользователя.
   * @param executor — выполняющий запросы клиент; при регистрации передаётся
   *   транзакция, чтобы user + session + refresh были атомарны (S2-04).
   * @returns токены и идентификатор сессии.
   */
  public async issueAsync(
    userId: string,
    executor: Pick<Database, 'insert'> = this.db,
  ): Promise<IssuedTokens> {
    const sid = randomUUID();
    const jti = randomUUID();
    const refreshToken = this.jwt.signRefresh(userId, sid, jti);
    const refreshPayload = this.jwt.verify(refreshToken, 'refresh');
    const accessToken = this.jwt.signAccess(userId, sid);

    await executor.insert(authSessions).values({
      id: sid,
      userId,
      createdAt: new Date(refreshPayload.iat * 1000),
      lastUsedAt: new Date(refreshPayload.iat * 1000),
    });
    await executor.insert(authRefreshTokens).values({
      id: jti,
      sessionId: sid,
      tokenHash: this.hash(refreshToken),
      issuedAt: new Date(refreshPayload.iat * 1000),
      expiresAt: new Date(refreshPayload.exp * 1000),
    });

    return { accessToken, refreshToken, sid };
  }

  /**
   * Специализированная проверка refresh-токена для отдельной ветки guard'а.
   * Проверяет подпись/claims (через JwtService) и активную запись БД.
   */
  public async verifyRefreshAsync(token: string): Promise<VerifiedRefresh> {
    const payload = this.jwt.verify(token, 'refresh');
    const tokenHash = this.hash(token);

    const [row] = await this.db
      .select()
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.id, payload.jti))
      .limit(1);
    if (
      row === undefined ||
      !this.hashEquals(row.tokenHash, tokenHash) ||
      row.sessionId !== payload.sid ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    if (row.consumedAt !== null) {
      // TEC-03: повтор уже использованного (но подписанного) токена —
      // replay. Отзываем ВСЮ семью и только затем сообщаем 401.
      await this.db
        .update(authSessions)
        .set({ revokedAt: new Date(), revokeReason: RefreshSessionService.REVOKE_REPLAY })
        .where(eq(authSessions.id, payload.sid));
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, payload.sid))
      .limit(1);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Сессия недействительна');
    }
    return { payload, tokenHash, sessionId: payload.sid, tokenId: payload.jti };
  }

  /**
   * Атомарная ротация. При повторном предъявлении использованного токена
   * отзывает ВСЮ family и фиксирует отзыв ДО выброса ошибкиCaller-у.
   */
  public async rotateAsync(token: string): Promise<IssuedTokens> {
    // Подпись/claims проверяются до транзакции: при подделке нет идентификаторов
    // сессии, которую можно было бы безопасно отозвать.
    const payload = this.jwt.verify(token, 'refresh');
    const tokenHash = this.hash(token);
    let replay = false;
    let issued: IssuedTokens | undefined;

    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .select()
        .from(authRefreshTokens)
        .where(eq(authRefreshTokens.id, payload.jti))
        .for('update');
      if (
        row === undefined ||
        !this.hashEquals(row.tokenHash, tokenHash) ||
        row.sessionId !== payload.sid ||
        row.revokedAt !== null ||
        row.expiresAt.getTime() <= now.getTime()
      ) {
        // Повтор уже использованного токена или чужая сессия — отзыв family.
        await tx
          .update(authSessions)
          .set({ revokedAt: now, revokeReason: RefreshSessionService.REVOKE_REPLAY })
          .where(eq(authSessions.id, payload.sid));
        replay = true;
        return;
      }
      if (row.consumedAt !== null) {
        await tx
          .update(authSessions)
          .set({ revokedAt: now, revokeReason: RefreshSessionService.REVOKE_REPLAY })
          .where(eq(authSessions.id, payload.sid));
        replay = true;
        return;
      }

      const [session] = await tx
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, payload.sid))
        .for('update');
      if (session === undefined || session.revokedAt !== null || session.userId !== payload.sub) {
        replay = true;
        return;
      }

      const nextJti = randomUUID();
      const nextToken = this.jwt.signRefresh(payload.sub, payload.sid, nextJti);
      const nextPayload = this.jwt.verify(nextToken, 'refresh');
      const accessToken = this.jwt.signAccess(payload.sub, payload.sid);

      // Сначала снимаем метку «активный» со старой записи (иначе partial
      // unique index запретит вставку следующего токена), затем вставляем
      // новую запись и только после этого ставим FK replaced_by_token_id.
      await tx
        .update(authRefreshTokens)
        .set({ consumedAt: now })
        .where(eq(authRefreshTokens.id, row.id));
      await tx.insert(authRefreshTokens).values({
        id: nextJti,
        sessionId: payload.sid,
        tokenHash: this.hash(nextToken),
        issuedAt: new Date(nextPayload.iat * 1000),
        expiresAt: new Date(nextPayload.exp * 1000),
      });
      await tx
        .update(authRefreshTokens)
        .set({ replacedByTokenId: nextJti })
        .where(eq(authRefreshTokens.id, row.id));
      await tx
        .update(authSessions)
        .set({ lastUsedAt: now })
        .where(eq(authSessions.id, payload.sid));

      issued = { accessToken, refreshToken: nextToken, sid: payload.sid };
    });

    // Исключение выбрасывается ПОСЛЕ коммита транзакции — отзыв при replay
    // не откатывается (TEC-03).
    if (replay || issued === undefined) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    return issued;
  }

  /**
   * Проверка активности сессии для access-токена. Любая ошибка БД
   * пробрасывается вызывающему guard'у, который обязан ответить 401 (fail-closed).
   */
  public async assertSessionActiveAsync(sid: string): Promise<void> {
    const [session] = await this.db
      .select({ id: authSessions.id, revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.id, sid))
      .limit(1);
    if (session === undefined || session.revokedAt !== null) {
      throw new UnauthorizedException('Сессия отозвана');
    }
  }

  /** Отзыв одной сессии (текущей). */
  public async revokeAsync(sid: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date(), revokeReason: RefreshSessionService.REVOKE_LOGOUT })
      .where(and(eq(authSessions.id, sid), isNull(authSessions.revokedAt)));
  }

  /** Отзыв всех активных сессий пользователя. */
  public async revokeAllAsync(userId: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date(), revokeReason: RefreshSessionService.REVOKE_LOGOUT_ALL })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  /** HMAC-SHA256 с отдельным pepper; сырой токен в БД не пишется. */
  private hash(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  /** Сравнение хешей в константное время. */
  private hashEquals(stored: string, actual: string): boolean {
    const left = Buffer.from(stored, 'utf8');
    const right = Buffer.from(actual, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
