import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiResponse } from './api-response.js';

interface HttpResponseLike {
  status(code: number): HttpResponseLike;
  json(body: unknown): HttpResponseLike;
}

interface ErrorPayload {
  readonly code: string;
  readonly details: unknown;
}

/** Маскирует токены и присваивания секретов в тексте исключения. */
export function sanitizeLogValue(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(
      /(JWT_SECRET|JWT_REFRESH_HASH_PEPPER|HITL_SIGNING_KEY|INTERNAL_SERVICE_TOKEN|password|token|secret)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    );
}

/** Глобальный фильтр исключений: все ошибки API имеют одинаковую форму. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * SEC-01: в лог попадают только тип, сообщение и stack неожиданного
   * исключения. Заголовки, тела запросов и значения конфигурации не
   * логируются ни при каких обстоятельствах.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = isHttpException ? exception.name : 'InternalServerError';
    const details: unknown = isHttpException ? exception.getResponse() : undefined;

    if (!isHttpException) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({
        event: 'unhandled_exception',
        name: error.name,
        message: sanitizeLogValue(error.message),
        stack: error.stack === undefined ? undefined : sanitizeLogValue(error.stack),
      });
    }

    const body: ApiResponse<ErrorPayload> = {
      success: false,
      data: { code, details },
      message: isHttpException ? exception.message : 'Внутренняя ошибка сервера',
    };

    host.switchToHttp().getResponse<HttpResponseLike>().status(status).json(body);
  }
}
