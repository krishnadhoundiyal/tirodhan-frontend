import { ManagerSession, type WebSessionAdapter } from '../auth/session';
import { fixtureId, fixturePayload } from '../preview/fixtures';

export const user = fixtureId(99);
export const access = (
  token = 'private-access-one',
  owner = user,
  expires = 3600,
) => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: expires,
  user_id: owner,
});
export const response = (body: unknown, status = 200): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function harness(roles = ['MANAGER'], timeout = 1000) {
  const adapter = {
    available: true,
    startOtp: jest.fn<
      ReturnType<WebSessionAdapter['startOtp']>,
      Parameters<WebSessionAdapter['startOtp']>
    >(async () => ({ challenge_reference: fixtureId(90) })),
    verifyOtp: jest.fn<
      ReturnType<WebSessionAdapter['verifyOtp']>,
      Parameters<WebSessionAdapter['verifyOtp']>
    >(async () => access()),
    refresh: jest.fn<
      ReturnType<WebSessionAdapter['refresh']>,
      Parameters<WebSessionAdapter['refresh']>
    >(async () => access()),
    logout: jest.fn(async () => {}),
  } satisfies WebSessionAdapter;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (input) => {
      const path = new URL(String(input)).pathname;
      return response(
        path === '/v1/auth/me'
          ? { user_id: user, roles }
          : fixturePayload(path, 'Normal workload'),
      );
    },
  );
  const session = new ManagerSession(
    adapter,
    'https://gateway.example',
    fetcher,
    timeout,
  );
  return { session, adapter, fetcher };
}
