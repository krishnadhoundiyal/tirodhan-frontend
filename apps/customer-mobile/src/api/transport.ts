import { ApiError } from './errors';

export interface SessionAccess {
  accessToken(): string | null;
  refresh(): Promise<void>;
  clear(): Promise<void>;
}
export interface PreparedCommand<T> {
  execute(signal?: AbortSignal): Promise<T>;
}
type Options = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
  headers?: Record<string, string>;
};
// Temporary header adaptation only for verified backend routes. No persistence/queue/replay engine.
function requiresLegacyHeader(method: string, path: string) {
  return (
    (method === 'POST' &&
      (path === '/v1/addresses' ||
        /^\/v1\/addresses\/[^/]+\/archive$/.test(path) ||
        path === '/v1/serviceability/contexts' ||
        /^\/v1\/collection-requests\/[^/]+\/cancel$/.test(path) ||
        /^\/v1\/payments\/collection-requests\/[^/]+\/attempts$/.test(path))) ||
    (method === 'PUT' && /^\/v1\/addresses\/[^/]+$/.test(path))
  );
}
export class Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly session: SessionAccess,
    private readonly uuid: () => string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15000,
  ) {}

  command<T>(
    path: string,
    options: Omit<Options, 'signal'>,
  ): PreparedCommand<T> {
    const body =
      options.body === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(options.body)) as unknown);
    const headers = { ...options.headers };
    if (requiresLegacyHeader(options.method ?? 'GET', path))
      headers['Idempotency-Key'] = this.uuid();
    return {
      execute: (signal) =>
        this.request<T>(path, { ...options, body, headers, signal }),
    };
  }

  async request<T>(path: string, options: Options = {}): Promise<T> {
    if (!this.baseUrl || !/^https?:\/\//.test(this.baseUrl))
      throw new ApiError(0, 'configuration');
    const authenticated = options.authenticated !== false;
    let token = authenticated ? this.session.accessToken() : null;
    if (authenticated && !token) throw new ApiError(401);
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetcher(
          `${this.baseUrl.replace(/\/$/, '')}${path}`,
          {
            method: options.method ?? 'GET',
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              ...(options.body === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
              ...options.headers,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body:
              options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
          },
        );
        // Read inside the timeout/cancellation scope; never retain raw backend error bodies.
        if (response.ok)
          return (
            response.status === 204 ? undefined : await response.json()
          ) as T;
      } catch {
        throw new ApiError(
          0,
          options.signal?.aborted
            ? 'cancelled'
            : timedOut
              ? 'timeout'
              : 'network',
        );
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', cancel);
      }
      if (response.status === 401 && authenticated) {
        if (attempt === 1) {
          await this.session.clear();
          throw new ApiError(401);
        }
        if (options.signal?.aborted) throw new ApiError(0, 'cancelled');
        // A delayed 401 for an old token must not start a second refresh.
        if (token === this.session.accessToken()) {
          try {
            await this.session.refresh();
          } catch {
            throw new ApiError(401);
          }
        }
        token = this.session.accessToken();
        if (!token) throw new ApiError(401);
        continue;
      }
      throw new ApiError(response.status);
    }
    throw new ApiError(401);
  }
}
