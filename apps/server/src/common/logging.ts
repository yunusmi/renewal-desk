import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

/** Paths never written to logs: credentials, tokens, cookies, idempotency header. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'csrf_token',
  'idempotency_key',
  '*.idempotency_key',
];

export function pinoParams(level: string): Params {
  return {
    pinoHttp: {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      genReqId: (req) =>
        (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
      // Only allowlisted request metadata; bodies are never logged.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
    },
  };
}
