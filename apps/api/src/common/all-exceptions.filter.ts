import type { ArgumentsHost, ExceptionFilter} from '@nestjs/common';
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

/** Глобальный фильтр исключений: все ошибки API имеют одинаковую форму. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Обрабатывает исключение и формирует ответ.
   *
   * @param exception — выброшенное исключение (неизвестный тип).
   * @param host — контекст выполнения запроса.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = isHttpException ? exception.name : 'InternalServerError';
    const details: unknown = isHttpException ? exception.getResponse() : undefined;

    if (!isHttpException) {
      this.logger.error('Необработанное исключение', exception);
    }

    const body: ApiResponse<ErrorPayload> = {
      success: false,
      data: { code, details },
      message: isHttpException ? exception.message : 'Внутренняя ошибка сервера',
    };

    host.switchToHttp().getResponse<HttpResponseLike>().status(status).json(body);
  }
}
