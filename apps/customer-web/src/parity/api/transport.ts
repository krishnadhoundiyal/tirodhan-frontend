import { CustomerError } from '../../api/contracts';
import type { CustomerSession } from '../../auth/session';
import { ApiError, type SafeErrorCode } from './errors';
import { decodeProduct } from './validation';
export interface PreparedCommand<T> {
  execute(signal?: AbortSignal): Promise<T>;
}
export interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
  refreshOn401?: boolean;
  headers?: Record<string, string>;
}
export class Transport {
  constructor(readonly session: CustomerSession) {}
  owner = () => {
    const s = this.session.snapshot();
    return `${s.principal?.user_id ?? ''}:${s.epoch}`;
  };
  command<T>(
    path: string,
    options: Omit<Options, 'signal'>,
  ): PreparedCommand<T> {
    const owner = this.owner();
    const body =
        options.body === undefined ? undefined : structuredClone(options.body),
      headers = { ...options.headers };
    if (
      (options.method === 'POST' &&
        (/^\/v1\/(addresses|serviceability\/contexts)$/.test(path) ||
          /^\/v1\/addresses\/[^/]+\/archive$/.test(path) ||
          /^\/v1\/collection-requests\/[^/]+\/cancel$/.test(path) ||
          /^\/v1\/payments\/collection-requests\/[^/]+\/attempts$/.test(
            path,
          ))) ||
      (options.method === 'PUT' && /^\/v1\/addresses\/[^/]+$/.test(path))
    )
      headers['Idempotency-Key'] ??= crypto.randomUUID();
    let flight: Promise<T> | null = null;
    return {
      execute: (signal) => {
        if (owner !== this.owner()) return Promise.reject(new ApiError(401));
        if (!flight) {
          const task = this.request<T>(path, {
            ...options,
            body,
            headers,
            signal,
          });
          flight = task;
          void task
            .finally(() => {
              if (flight === task) flight = null;
            })
            .catch(() => {});
        }
        return flight;
      },
    };
  }
  async request<T>(path: string, options: Options = {}): Promise<T> {
    if (path.startsWith('/v1/auth/')) throw new ApiError(0, 'configuration');
    const method = options.method ?? 'GET';
    const success =
      method === 'GET' ||
      method === 'PUT' ||
      path.endsWith('/cancel') ||
      path.endsWith('/archive') ||
      path.endsWith('/collection-quotes')
        ? 200
        : method === 'DELETE'
          ? 204
          : 201;
    try {
      const value = decodeProduct(
        path,
        await this.session.request(
          path,
          {
            method,
            body:
              options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
            headers: {
              ...(options.body === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
              ...options.headers,
            },
          },
          success,
          options.signal,
        ),
      ) as T;
      if (
        path === '/v1/customer/me/profile' &&
        (value as { user_id?: string }).user_id !==
          this.session.snapshot().principal?.user_id
      )
        throw new ApiError(200, 'protocol');
      return value;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e instanceof CustomerError)
        throw new ApiError(
          e.status,
          e.kind === 'invalid'
            ? 'protocol'
            : e.kind === 'cancelled'
              ? 'cancelled'
              : e.status
                ? 'http'
                : 'network',
          e.code as SafeErrorCode | undefined,
        );
      throw new ApiError(0, 'network');
    }
  }
}
