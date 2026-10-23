import { ApiError } from './errors';

export interface SessionAccess {
  accessToken(): string | null;
  requestIdentity?(): unknown;
  refresh(): Promise<void>;
  clear(): Promise<void>;
}
export interface PreparedCommand<T> {
  execute(signal?: AbortSignal): Promise<T>;
}
type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
  refreshOn401?: boolean;
  headers?: Record<string, string>;
};
// Adapted from the established Customer transport; Rider commands use backend business keys.
export class Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly session: SessionAccess,
    _uuid: () => string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15000,
    private readonly allowAuthenticatedMutations: () => boolean = () => true,
  ) {
    void _uuid;
  }

  command<T>(
    path: string,
    options: Omit<Options, 'signal'>,
  ): PreparedCommand<T> {
    const body =
      options.body === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(options.body)) as unknown);
    const headers = { ...options.headers };
    return {
      execute: (signal) =>
        this.request<T>(path, { ...options, body, headers, signal }),
    };
  }

  async request<T>(path: string, options: Options = {}): Promise<T> {
    if (
      options.authenticated !== false &&
      (options.method ?? 'GET') !== 'GET' &&
      !this.allowAuthenticatedMutations()
    )
      throw new ApiError(0, 'preview');
    if (!this.baseUrl || !/^https?:\/\//.test(this.baseUrl))
      throw new ApiError(0, 'configuration');
    const authenticated = options.authenticated !== false;
    const identity = this.session.requestIdentity?.();
    const assertOwner = () => {
      if (authenticated && identity !== this.session.requestIdentity?.())
        throw new ApiError(0, 'cancelled');
    };
    let token = authenticated ? this.session.accessToken() : null;
    if (authenticated && !token) throw new ApiError(401);
    for (let attempt = 0; attempt < 2; attempt++) {
      assertOwner();
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
        assertOwner();
        // Read inside the timeout/cancellation scope; never retain raw backend error bodies.
        if (response.ok) {
          if (response.status === 204) return undefined as T;
          try {
            const result = (await response.json()) as T;
            assertOwner();
            return result;
          } catch (error) {
            if (error instanceof SyntaxError)
              throw new ApiError(response.status, 'protocol');
            throw error;
          }
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
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
      assertOwner();
      if (response.status === 401 && authenticated) {
        if (attempt === 1 || options.refreshOn401 === false) {
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
      throw new ApiError(response.status, 'http');
    }
    throw new ApiError(401);
  }
}
