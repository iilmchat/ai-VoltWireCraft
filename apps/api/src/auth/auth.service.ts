// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Регистрация, вход и выдача JWT (пароли — солевой scrypt). */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
    AuthResponseSchema,
    type AuthResponse,
    type LoginDto,
    type RegisterDto,
} from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { users } from '../database/schema.js';
import { JwtService } from './jwt.service.js';

/** Данные пользователя, необходимые остальным сервисам. */
export interface AuthUser {
  /** Идентификатор. */
  readonly id: string;
  /** Email. */
  readonly email: string;
  /** Имя. */
  readonly displayName: string;
  /** Глобальная роль. */
  readonly role: 'user' | 'admin';
}

/**
 * Аутентификация пользователей. Открытые пароли не хранятся и не логируются.
 */
@Injectable()
export class AuthService {
  /**
   * @param db — типизированный Drizzle-клиент.
   * @param jwt — сервис подписи JWT.
   */
  public constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  /**
   * Регистрирует пользователя и выдаёт токены.
   *
   * @param dto — email, пароль и имя.
   * @returns access/refresh токены и данные пользователя.
   * @throws {ConflictException} если email уже занят.
   */
  public async registerAsync(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();
    const existing = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const [row] = await this.db
      .insert(users)
      .values({
        email,
        passwordHash: this.hashPassword(dto.password),
        fullName: dto.displayName,
      })
      .returning();
    if (row === undefined) {
      throw new Error('Не удалось создать пользователя');
    }
    return this.issueAsync({
      id: row.id,
      email: row.email,
      displayName: row.fullName,
      role: row.globalRole,
    });
  }

  /**
   * Проверяет учётные данные и выдаёт токены.
   *
   * @param dto — email и пароль.
   * @returns токены и данные пользователя.
   * @throws {UnauthorizedException} при неверных учётных данных.
   */
  public async loginAsync(dto: LoginDto): Promise<AuthResponse> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email.toLowerCase()))
      .limit(1);
    if (row === undefined || !this.verifyPassword(dto.password, row.passwordHash)) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.issueAsync({
      id: row.id,
      email: row.email,
      displayName: row.fullName,
      role: row.globalRole,
    });
  }

  /**
   * Возвращает пользователя по идентификатору из токена.
   *
   * @param id — идентификатор пользователя.
   * @returns данные пользователя.
   * @throws {UnauthorizedException} если пользователь не найден.
   */
  public async meAsync(id: string): Promise<AuthUser> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (row === undefined) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    return {
      id: row.id,
      email: row.email,
      displayName: row.fullName,
      role: row.globalRole,
    };
  }

  /**
   * Находит пользователя по email (для приглашения в проект).
   *
   * @param email — email пользователя.
   * @returns данные пользователя или `undefined`.
   */
  public async findByEmailAsync(email: string): Promise<AuthUser | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row === undefined
      ? undefined
      : { id: row.id, email: row.email, displayName: row.fullName, role: row.globalRole };
  }

  /**
   * Формирует ответ авторизации.
   *
   * @param user — данные пользователя.
   * @returns провалидированный ответ.
   */
  private async issueAsync(user: AuthUser): Promise<AuthResponse> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return AuthResponseSchema.parse({
      accessToken: this.jwt.sign(payload),
      refreshToken: this.jwt.sign(payload, '30d'),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  }

  /**
   * Хэширует пароль через scrypt со случайной солью.
   *
   * @param password — открытый пароль.
   * @returns строка `salt:hash` в hex.
   */
  private hashPassword(password: string): string {
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, 64);
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  /**
   * Проверяет пароль в константное время.
   *
   * @param password — открытый пароль.
   * @param stored — сохранённый хэш.
   * @returns true если пароль совпадает.
   */
  private verifyPassword(password: string, stored: string): boolean {
    const [saltHex, hashHex] = stored.split(':');
    if (saltHex === undefined || hashHex === undefined) {
      return false;
    }
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
