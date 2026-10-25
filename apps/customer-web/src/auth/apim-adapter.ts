import { ContractError, integer, object, text, uuid } from './schema';
import { unavailableAdapter, type WebSessionAdapter } from './session';

export interface ApimSessionConfiguration {
  approved: boolean;
  approvalReference: string;
  environment: 'nonprod';
  gatewayOrigin: string;
  browserOrigin: string;
  product: 'customer';
  routes: { start: string; verify: string; refresh: string; logout: string };
  csrf: { header: string; value: string };
}
export class WebSessionError extends Error {
  constructor(
    readonly kind:
      | 'unavailable'
      | 'cancelled'
      | 'invalid'
      | 'rejected'
      | 'uncertain'
      | 'logoutRequired',
    readonly status?: number,
  ) {
    super(
      {
        unavailable: 'The approved web session adapter is unavailable.',
        cancelled: 'The authentication wait was cancelled.',
        invalid: 'The authentication response could not be verified.',
        rejected:
          'Authentication was rejected. Use a fresh OTP after confirmed sign-out if verification may have completed.',
        uncertain:
          'Authentication completion is uncertain. Confirm sign-out before another login.',
        logoutRequired: 'Confirm gateway sign-out before another login.',
      }[kind],
    );
  }
}
const exactOrigin = (value: string) => {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw new ContractError();
  return value;
};
export function validateApimConfiguration(
  value: ApimSessionConfiguration,
  browserOrigin: string,
) {
  exactKeys(value, [
    'approved',
    'approvalReference',
    'environment',
    'gatewayOrigin',
    'browserOrigin',
    'product',
    'routes',
    'csrf',
  ]);
  exactKeys(value.csrf, ['header', 'value']);
  if (
    value.approved !== true ||
    value.environment !== 'nonprod' ||
    value.product !== 'customer' ||
    !value.approvalReference?.trim()
  )
    throw new ContractError();
  exactOrigin(value.gatewayOrigin);
  exactOrigin(value.browserOrigin);
  if (value.browserOrigin !== browserOrigin) throw new ContractError();
  if (
    Object.keys(value.routes).sort().join() !== 'logout,refresh,start,verify' ||
    new Set(Object.values(value.routes)).size !== 4
  )
    throw new ContractError();
  for (const route of Object.values(value.routes))
    if (
      !/^\/[a-zA-Z0-9/-]+$/.test(route) ||
      /[\r\n]/.test(route) ||
      route.includes('//') ||
      route.startsWith('/v1/auth') ||
      route.endsWith('/')
    )
      throw new ContractError();
  if (
    !/^X-[A-Za-z0-9-]{3,70}$/i.test(value.csrf.header) ||
    /[\r\n]/.test(value.csrf.header) ||
    /^(x-forwarded-|x-ms-|x-apim-|x-http-method)/i.test(value.csrf.header) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.csrf.value) ||
    /[\r\n]/.test(value.csrf.value)
  )
    throw new ContractError();
}
const parseGrant = object({
  access_token: (value) => {
    if (
      typeof value !== 'string' ||
      !/^[A-Za-z0-9._-]{1,16000}$/.test(value) ||
      /[\r\n]/.test(value)
    )
      throw new ContractError();
    return value;
  },
  token_type: text,
  expires_in: integer,
  user_id: uuid,
});
function exactKeys(raw: unknown, keys: string[]) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== keys.length ||
    Object.keys(raw).some((key) => !keys.includes(key))
  )
    throw new ContractError();
}
function grant(raw: unknown) {
  exactKeys(raw, ['access_token', 'token_type', 'expires_in', 'user_id']);
  const parsed = parseGrant(raw);
  if (parsed.token_type !== 'bearer' || parsed.expires_in < 1)
    throw new ContractError();
  return parsed;
}
export interface CookieOperationLock {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    operation: () => Promise<T>,
  ): Promise<T>;
}
interface Dependencies {
  browserOrigin: string;
  locks: CookieOperationLock | undefined;
  fetcher: typeof fetch;
  timeoutMs?: number;
}

/** Not composed into main.tsx. Approval inputs alone never enable production login. */
export function createApimWebSessionAdapter(
  configuration: ApimSessionConfiguration | null,
  dependencies: Dependencies,
): WebSessionAdapter {
  try {
    if (!configuration || !dependencies.locks) return unavailableAdapter;
    validateApimConfiguration(configuration, dependencies.browserOrigin);
  } catch {
    return unavailableAdapter;
  }
  const config = structuredClone(configuration);
  const fetcher = dependencies.fetcher,
    locks = dependencies.locks!;
  const lockName = `tirodhan:web-session:${config.gatewayOrigin}:${config.product}`;
  const timeoutMs = dependencies.timeoutMs ?? 15000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    return unavailableAdapter;
  let needsLogout = false;
  const usedVerifications = new Set<string>();
  const pending = new Map<string, Promise<unknown>>();

  // Cookie-changing HTTP is serialized across same-origin tabs using Web Locks.
  // Caller cancellation/deadline does not release the lock while an HTTP response
  // could still apply Set-Cookie. A stalled underlying fetch blocks later cookie
  // operations; the UI wait is finite and no parallel cleanup request races it.
  function bounded<T>(
    operation: (cancelled: () => boolean) => Promise<T>,
    signal: AbortSignal,
    sensitive: boolean,
  ): Promise<T> {
    let cancelled = signal.aborted;
    return new Promise<T>((resolve, reject) => {
      const cancel = (kind: 'cancelled' | 'uncertain') => {
        cancelled = true;
        if (sensitive) needsLogout = true;
        reject(new WebSessionError(kind));
      };
      const abort = () => cancel('cancelled');
      const timer = setTimeout(() => cancel('uncertain'), timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      if (cancelled) abort();
      void Promise.resolve()
        .then(() => {
          if (cancelled) throw new WebSessionError('cancelled');
          return operation(() => cancelled);
        })
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        })
        .catch(() => {});
    });
  }
  async function http(
    operation: keyof typeof config.routes,
    body: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(
        config.gatewayOrigin + config.routes[operation],
        {
          method: 'POST',
          mode: 'cors',
          credentials: operation === 'start' ? 'omit' : 'include',
          redirect: 'error',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            [config.csrf.header]: config.csrf.value,
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new WebSessionError('uncertain');
    }
    if (
      response.redirected ||
      response.type === 'opaqueredirect' ||
      (response.url &&
        response.url !== config.gatewayOrigin + config.routes[operation])
    )
      throw new WebSessionError('invalid');
    const expected =
      operation === 'start' ? 202 : operation === 'logout' ? 204 : 200;
    if (response.status !== expected)
      throw new WebSessionError(
        'rejected',
        [401, 403, 409, 422, 429, 500, 502, 503, 504].includes(response.status)
          ? response.status
          : undefined,
      );
    if (operation === 'logout') return;
    if (
      response.headers
        ?.get('Content-Type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      throw new WebSessionError('invalid');
    let raw: unknown;
    try {
      const body = await response.text();
      if (body.length > 20000) throw new ContractError();
      raw = JSON.parse(body) as unknown;
      if (operation === 'start') {
        exactKeys(raw, ['challenge_reference']);
        return object({ challenge_reference: uuid })(raw);
      }
      return grant(raw);
    } catch {
      throw new WebSessionError('invalid');
    }
  }
  async function cookie<T>(
    operation: (cancelled: () => boolean) => Promise<T>,
    signal: AbortSignal,
  ) {
    return bounded(
      (cancelled) =>
        locks.request(lockName, { mode: 'exclusive' }, async () => {
          if (cancelled()) throw new WebSessionError('cancelled');
          return operation(cancelled);
        }),
      signal,
      true,
    );
  }
  return {
    available: true,
    async startOtp(body, signal) {
      exactKeys(body, ['client_request_id', 'phone']);
      uuid(body.client_request_id);
      if (!/^\+[1-9][0-9]{7,14}$/.test(body.phone))
        throw new WebSessionError('invalid');
      if (needsLogout) throw new WebSessionError('logoutRequired');
      // Same identity remains verbatim; provider uncertainty is never auto-retried.
      const request = Object.freeze({ ...body });
      return bounded(async () => http('start', request), signal, false);
    },
    async verifyOtp(body, signal) {
      exactKeys(body, ['client_login_id', 'challenge_reference', 'code']);
      uuid(body.client_login_id);
      uuid(body.challenge_reference);
      if (
        typeof body.code !== 'string' ||
        !body.code.length ||
        body.code.length > 128
      )
        throw new WebSessionError('invalid');
      const request = Object.freeze({ ...body });
      const key = JSON.stringify(request);
      const duplicate = pending.get(key);
      if (duplicate) return duplicate;
      if (needsLogout || usedVerifications.has(request.client_login_id))
        throw new WebSessionError('logoutRequired');
      const attempt = cookie(async (cancelled) => {
        // Confirm old cookie-backed session revocation before a new verify can set
        // a cookie. No lost-verify recovery is attributed to an unknown principal.
        try {
          await http('logout', {});
          if (cancelled()) throw new WebSessionError('cancelled');
          usedVerifications.add(request.client_login_id);
          const result = await http('verify', request);
          if (cancelled()) throw new WebSessionError('cancelled');
          return result;
        } catch (error) {
          needsLogout = true;
          throw error;
        }
      }, signal);
      pending.set(key, attempt);
      try {
        return await attempt;
      } finally {
        pending.delete(key);
      }
    },
    async refresh(signal) {
      if (needsLogout) throw new WebSessionError('logoutRequired');
      return cookie(async (cancelled) => {
        if (needsLogout) throw new WebSessionError('logoutRequired');
        const result = await http('refresh', {});
        if (cancelled()) throw new WebSessionError('cancelled');
        return result;
      }, signal);
    },
    async logout(signal) {
      needsLogout = true;
      await cookie(async (cancelled) => {
        await http('logout', {});
        if (!cancelled()) needsLogout = false;
      }, signal);
    },
  };
}
