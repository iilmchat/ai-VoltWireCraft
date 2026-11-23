// © 2026 VoltWireCraft — Security Architect / TEC-05
/**
 * HITL-подтверждение внешних записей (ERP/CRM).
 *
 * PO-D14a (кто полномочен подтверждать) и PO-D05 (роли ERP) ОТКРЫТЫ:
 * сервис не принимает решения о полномочиях. Поле `confirmedBy`
 * передаётся вызывающей стороной и подлежит проверке политикой этапа 3/4.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { InMemoryReplayStore, type ReplayStore } from './replay-store.js';

/** Параметры выпуска HITL-токена. */
export interface HitlIssueInput {
  readonly sub: string;
  readonly confirmedBy: string;
  readonly projectId: string;
  readonly action: 'create_order' | 'send_estimate';
  readonly itemsHash: string;
  readonly dealId?: string;
  /** TTL по умолчанию — 5 минут (TEC-05). */
  readonly ttlSeconds?: number;
}

/** Payload HITL-токена. */
export interface HitlPayload {
  readonly typ: 'hitl';
  readonly sub: string;
  readonly confirmedBy: string;
  readonly projectId: string;
  readonly action: 'create_order' | 'send_estimate';
  readonly itemsHash: string;
  readonly dealId?: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

/** Ожидаемые параметры проверки. */
export interface HitlExpectation {
  readonly sub?: string;
  readonly projectId?: string;
  readonly action: 'create_order' | 'send_estimate';
  readonly itemsHash: string;
  readonly dealId?: string;
}

/** Допустимый дрейф часов. */
const CLOCK_SKEW_SECONDS = 30;
/** Максимальный TTL подтверждения. */
const MAX_TTL_SECONDS = 300;

@Injectable()
export class HitlService {
  private readonly key: string;

  public constructor(
    @Inject(ConfigService) config: ConfigService<Env, true>,
    @Inject('HITL_REPLAY_STORE') private readonly replayStore: ReplayStore = new InMemoryReplayStore(),
  ) {
    const key = config.get('HITL_SIGNING_KEY', { infer: true });
    if (key === undefined || key.length < 32) {
      throw new Error('HITL_SIGNING_KEY обязателен (TEC-05)');
    }
    this.key = key;
  }

  /** Выпускает короткоживущий токен подтверждения. */
  public issue(input: HitlIssueInput): string {
    const ttl = input.ttlSeconds ?? MAX_TTL_SECONDS;
    if (ttl <= 0 || ttl > MAX_TTL_SECONDS) {
      throw new Error('Недопустимый TTL HITL-токена');
    }
    const now = Math.floor(Date.now() / 1000);
    const payload: HitlPayload = {
      typ: 'hitl',
      sub: input.sub,
      confirmedBy: input.confirmedBy,
      projectId: input.projectId,
      action: input.action,
      itemsHash: input.itemsHash,
      ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
      iat: now,
      exp: now + ttl,
      jti: randomUUID(),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.signData(body)}`;
  }

  /**
   * Проверяет подпись, привязку к sub/projectId/action/itemsHash/dealId,
   * срок и одноразовость (replay).
   */
  public async verifyAsync(token: string, expected: HitlExpectation): Promise<HitlPayload> {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Некорректный HITL-токен');
    }
    const [body, signature] = parts as [string, string];
    const expectedSignature = this.signData(body);
    const actual = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expectedSignature, 'utf8');
    if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) {
      throw new UnauthorizedException('Недействительная подпись HITL-токена');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    } catch {
      throw new UnauthorizedException('Некорректный payload HITL-токена');
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = parsed as Partial<HitlPayload> | null;
    if (
      payload === null ||
      typeof payload !== 'object' ||
      payload.typ !== 'hitl' ||
      typeof payload.jti !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.confirmedBy !== 'string' ||
      payload.action !== expected.action ||
      payload.itemsHash !== expected.itemsHash ||
      (expected.sub !== undefined && payload.sub !== expected.sub) ||
      (expected.projectId !== undefined && payload.projectId !== expected.projectId) ||
      (expected.dealId !== undefined && payload.dealId !== expected.dealId) ||
      payload.exp + CLOCK_SKEW_SECONDS <= now ||
      payload.exp <= payload.iat
    ) {
      throw new UnauthorizedException('HITL-токен недействителен для операции');
    }

    const consumed = await this.replayStore.consumeAsync(payload.jti, payload.exp);
    if (!consumed) {
      throw new UnauthorizedException('HITL-токен уже использован');
    }
    return payload as HitlPayload;
  }

  /** HMAC подпись. */
  private signData(data: string): string {
    return createHmac('sha256', this.key).update(data).digest('base64url');
  }
}
