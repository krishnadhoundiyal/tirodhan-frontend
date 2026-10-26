import { CustomerSession, type WebSessionAdapter } from '../auth/session';
export const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const addressId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const challenge = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const grantValue = () => ({
  access_token: 'synthetic-access',
  token_type: 'bearer',
  expires_in: 600,
  user_id: owner,
});
export const addressValue = () => ({
  address_id: addressId,
  address: 'Synthetic household',
  label: 'Home',
  location: null,
  is_default: false,
  status: 'ACTIVE',
  version: 1,
});
export const contextValue = () => ({
  serviceability_context_id: challenge,
  source_address_id: addressId,
  source_address_version: 1,
  status: 'PENDING',
  cell_id: null,
  failure_code: null,
  expires_at: new Date(Date.now() + 60000).toISOString(),
  resolved_at: null,
});
export const response = (data: unknown, status = 200) =>
  ({
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(data),
  }) as unknown as Response;
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (v?: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export function harness(options: { roles?: string[]; timeout?: number } = {}) {
  const adapter: WebSessionAdapter = {
    available: true,
    startOtp: jest.fn(async () => ({ challenge_reference: challenge })),
    verifyOtp: jest.fn(async () => grantValue()),
    refresh: jest.fn(async () => grantValue()),
    logout: jest.fn(async () => {}),
  };
  const fetcher = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return String(input).endsWith('/v1/auth/me')
        ? response({ user_id: owner, roles: options.roles ?? ['CUSTOMER'] })
        : response([]);
    },
  );
  const session = new CustomerSession(
    adapter,
    'https://gateway.example',
    fetcher,
    options.timeout ?? 1000,
  );
  const login = () => session.login(challenge, '123456');
  return { adapter, fetcher, session, login };
}
