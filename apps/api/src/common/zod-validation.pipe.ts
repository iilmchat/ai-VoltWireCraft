// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Zod-пайп для валидации тела и параметров запроса на границе API (RULES § 1.12, 4.7). */

import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Пайп, проверяющий значение по переданной Zod-схеме. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  /**
   * @param schema — схема, которой должно соответствовать значение.
   */
  public constructor(private readonly schema: ZodType<T>) {}

  /**
   * Проверяет и возвращает значение либо выбрасывает `BadRequestException`.
   *
   * @param value — значение из HTTP-запроса.
   * @returns провалидированное значение.
   * @throws {BadRequestException} если значение не соответствует схеме.
   */
  public transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Некорректные данные запроса',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
