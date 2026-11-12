import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Error codes exposed by the API (snake_case). */
export type ErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'role_forbidden'
  | 'workspace_forbidden'
  | 'cannot_decide_own_request'
  | 'csrf_invalid'
  | 'origin_forbidden'
  | 'resource_not_found'
  | 'request_not_found'
  | 'not_found'
  | 'active_renewal_exists'
  | 'invalid_status_transition'
  | 'resource_changed'
  | 'payload_too_large'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable';

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  validation_error: 'Некорректный запрос',
  unauthenticated: 'Требуется вход в систему',
  invalid_credentials: 'Неверный email или пароль',
  role_forbidden: 'Недостаточно прав для действия',
  workspace_forbidden: 'Нет доступа к рабочему пространству',
  cannot_decide_own_request: 'Нельзя согласовать или отклонить собственную заявку',
  csrf_invalid: 'Недействительный CSRF-токен',
  origin_forbidden: 'Запрос с недопустимого источника',
  resource_not_found: 'Ресурс не найден',
  request_not_found: 'Заявка не найдена',
  not_found: 'Не найдено',
  active_renewal_exists: 'У ресурса уже есть активная заявка',
  invalid_status_transition: 'Недопустимый переход состояния заявки',
  resource_changed: 'Срок или стоимость ресурса изменились после создания заявки',
  payload_too_large: 'Слишком большой запрос',
  rate_limited: 'Слишком много попыток, повторите позже',
  internal_error: 'Внутренняя ошибка сервера',
  service_unavailable: 'Сервис временно недоступен',
};

export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly errorCode: ErrorCode,
    message?: string,
  ) {
    super(message ?? DEFAULT_MESSAGES[errorCode], status);
  }
}

export const unauthenticated = () => new ApiError(401, 'unauthenticated');
export const forbidden = (code: ErrorCode, msg?: string) => new ApiError(403, code, msg);
export const notFound = (code: ErrorCode) => new ApiError(404, code);
export const conflict = (code: ErrorCode, msg?: string) => new ApiError(409, code, msg);

export interface ErrorBody {
  status_code: number;
  error_code: string;
  message: string;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'validation_error',
  401: 'unauthenticated',
  403: 'role_forbidden',
  404: 'not_found',
  409: 'invalid_status_transition',
  413: 'payload_too_large',
  429: 'rate_limited',
  503: 'service_unavailable',
};

/** Normalizes every error into {status_code, error_code, message}; never leaks stacks or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    let body: ErrorBody;

    if (exception instanceof ApiError) {
      body = { status_code: exception.getStatus(), error_code: exception.errorCode, message: exception.message };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'internal_error' : 'validation_error');
      body = { status_code: status, error_code: code, message: DEFAULT_MESSAGES[code] };
      if (status === 400) {
        const details = (exception.getResponse() as { message?: unknown }).message;
        if (Array.isArray(details) && details.length > 0) {
          body.message = `${DEFAULT_MESSAGES.validation_error}: ${details.slice(0, 5).join('; ')}`;
        }
      }
    } else if (isBodyParserError(exception)) {
      const status = exception.status ?? 400;
      const code: ErrorCode = status === 413 ? 'payload_too_large' : 'validation_error';
      body = { status_code: status, error_code: code, message: DEFAULT_MESSAGES[code] };
    } else {
      body = { status_code: 500, error_code: 'internal_error', message: DEFAULT_MESSAGES.internal_error };
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({ err: { name: err.name, message: err.message }, path: req.path }, 'unhandled error');
    }
    res.status(body.status_code).json(body);
  }
}

function isBodyParserError(e: unknown): e is { status?: number; type: string } {
  return typeof e === 'object' && e !== null && 'type' in e && typeof (e as { type: unknown }).type === 'string'
    && ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported'].includes(
      (e as { type: string }).type,
    );
}

/** PostgreSQL error introspection for mapping known constraint violations. */
export function pgConstraint(err: unknown): string | undefined {
  const anyErr = err as { parent?: { constraint?: string }; original?: { constraint?: string } };
  return anyErr?.parent?.constraint ?? anyErr?.original?.constraint;
}
