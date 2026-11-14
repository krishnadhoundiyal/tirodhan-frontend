import { ContractError, integer, object, text, uuid } from './schema';
import {
  unavailableAdapter,
  NoRefreshSessionError,
  type WebSessionAdapter,
} from './session';

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
    options: { mode: 'exclusive'; signal?: AbortSignal },
    operation: () => Promise<T>,
  ): Promise<T>;
}
interface Dependencies {
  browserOrigin: string;
  locks: CookieOperationLock | undefined;
  fetcher: typeof fetch;
  timeoutMs?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

/** Not composed into main.tsx. Approval inputs alone never enable production login. */
export function createApimWebSessionAdapter(
  configuration: ApimSessionConfiguration | null,
  dependencies: Dependencies,
): WebSessionAdapter {
  let storage: NonNullable<Dependencies['storage']>;
  try {
    if (!configuration || !dependencies.locks) return unavailableAdapter;
    validateApimConfiguration(configuration, dependencies.browserOrigin);
    // eslint-disable-next-line no-restricted-properties -- Only the cookie recovery flag is stored here.
    storage = dependencies.storage ?? window.localStorage;
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
  const recoveryKey = `${lockName}:recovery`;
  const usedVerifications = new Set<string>();

  function requireCleanCookie() {
    try {
      if (storage.getItem(recoveryKey) === null) return;
    } catch {
      throw new WebSessionError('unavailable');
    }
    throw new WebSessionError('logoutRequired');
  }
  function writeRecoveryMarker(pending: boolean) {
    try {
      if (pending) storage.setItem(recoveryKey, '1');
      else storage.removeItem(recoveryKey);
    } catch {
      throw new WebSessionError('unavailable');
    }
  }
  const pending = new Map<string, Promise<unknown>>();

  function bounded<T>(
    operation: (requestSignal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(new WebSessionError('cancelled'));
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      const cancel = (kind: 'cancelled' | 'uncertain') => {
        cleanup();
        reject(new WebSessionError(kind));
        controller.abort();
      };
      const abort = () => cancel('cancelled');
      const timer = setTimeout(() => cancel('uncertain'), timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      void Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) throw new WebSessionError('cancelled');
          return operation(controller.signal);
        })
        .then(resolve, reject)
        .finally(cleanup);
    });
  }
  async function http(
    operation: keyof typeof config.routes,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(
        config.gatewayOrigin + config.routes[operation],
        {
          method: 'POST',
          signal,
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
    if (operation === 'refresh' && response.status === 401) {
      // Exact sanitized envelopes from the existing APIM admission/shape policy.
      // Unknown/HTML/truncated 401s are not proof of absent browser credentials.
      let absent = false;
      try {
        if (
          response.headers
            ?.get('Content-Type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase() === 'application/json'
        ) {
          const text = await response.text();
          if (text.length <= 20000) {
            const error: unknown = JSON.parse(text);
            exactKeys(error, ['error']);
            absent = [
              'AUTHENTICATION_REQUIRED',
              'AUTHENTICATION_UNAVAILABLE',
            ].includes((error as { error: string }).error);
          }
        }
      } catch {
        /* No raw error, credential or body retained. */
      }
      if (absent) throw new NoRefreshSessionError();
    }
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
  function cookie<T>(
    operation: 'verify' | 'refresh' | 'logout',
    run: (requestSignal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    loginId?: string,
  ) {
    return bounded(
      (requestSignal) =>
        locks.request(
          lockName,
          { mode: 'exclusive', signal: requestSignal },
          async () => {
            if (requestSignal.aborted) throw new WebSessionError('cancelled');
            if (operation !== 'logout') requireCleanCookie();
            if (loginId && usedVerifications.has(loginId))
              throw new WebSessionError('logoutRequired');
            // Persist only a recovery marker before sending any cookie request.
            // The Web Lock stays held until fetch and response processing settle.
            writeRecoveryMarker(true);
            let result: T;
            try {
              result = await run(requestSignal);
            } catch (error) {
              if (
                operation === 'refresh' &&
                error instanceof NoRefreshSessionError
              ) {
                if (requestSignal.aborted)
                  throw new WebSessionError('uncertain');
                writeRecoveryMarker(false);
              }
              throw error;
            }
            if (requestSignal.aborted) throw new WebSessionError('cancelled');
            writeRecoveryMarker(false);
            return result;
          },
        ),
      signal,
    );
  }
  return {
    available: true,
    async startOtp(body, signal) {
      exactKeys(body, ['client_request_id', 'phone']);
      uuid(body.client_request_id);
      if (!/^\+[1-9][0-9]{7,14}$/.test(body.phone))
        throw new WebSessionError('invalid');
      requireCleanCookie();
      // Same identity remains verbatim; provider uncertainty is never auto-retried.
      const request = Object.freeze({ ...body });
      return bounded(
        (requestSignal) => http('start', request, requestSignal),
        signal,
      );
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
      const attempt = cookie(
        'verify',
        async (requestSignal) => {
          // Confirm cleanup of any old cookie-backed session before replacing it.
          await http('logout', {}, requestSignal);
          if (requestSignal.aborted) throw new WebSessionError('cancelled');
          usedVerifications.add(request.client_login_id);
          return http('verify', request, requestSignal);
        },
        signal,
        request.client_login_id,
      );
      pending.set(key, attempt);
      try {
        return await attempt;
      } finally {
        pending.delete(key);
      }
    },
    refresh(signal) {
      return cookie(
        'refresh',
        (requestSignal) => http('refresh', {}, requestSignal),
        signal,
      );
    },
    async logout(signal) {
      await cookie(
        'logout',
        (requestSignal) => http('logout', {}, requestSignal),
        signal,
      );
    },
  };
}
