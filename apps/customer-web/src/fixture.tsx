import { CustomerSession, type WebSessionAdapter } from './auth/session';
import { productFixture } from './fixture-product';
import { createRuntime } from './runtime';
import type { Address, Context } from './api/contracts';

// This entire module must be absent from every production build, including NODE_ENV=development.
export const FIXTURE_SENTINEL = 'CUSTOMER_WEB_FIXTURE_ONLY_7f951c';
export const fixtureOwner = 'c0ffee00-0000-4000-8000-000000000001';
const fixtureAddress = 'c0ffee00-0000-4000-8000-000000000002';
const challenge = 'c0ffee00-0000-4000-8000-000000000003';
const g = () => ({
  access_token: 'customer-fixture-access-only',
  token_type: 'bearer',
  expires_in: 600,
  user_id: fixtureOwner,
});
export function fixtureRuntime() {
  const product = productFixture(fixtureOwner);
  let rows: Address[] = [
    {
      address_id: fixtureAddress,
      address: 'Example house, Demonstration Lane — fictional address',
      label: 'Sample home',
      location: null,
      is_default: true,
      status: 'ACTIVE',
      version: 1,
    },
  ];
  const contexts = new Map<string, Context>();
  const replay = new Map<string, { body: string; result: unknown }>();
  let scenario: Context['status'] | 'EXPIRED' | 'UNAVAILABLE' = 'SERVICEABLE';
  const adapter: WebSessionAdapter = {
    available: true,
    startOtp: async () => ({ challenge_reference: challenge }),
    verifyOtp: async () => g(),
    refresh: async () => g(),
    logout: async () => {},
  };
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) throw new Error('Cancelled fixture');
    const path = new URL(String(input)).pathname;
    const response = (value: unknown, status = 200) =>
      ({
        status,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(value),
      }) as Response;
    if (path === '/v1/auth/me')
      return response({ user_id: fixtureOwner, roles: ['CUSTOMER'] });
    const projected = await product.handle(input, init, contexts);
    if (projected) return projected;
    const method = init?.method;
    if (scenario === 'UNAVAILABLE' && path.includes('serviceability'))
      return response({}, 503);
    if (method === 'GET') {
      if (path === '/v1/addresses')
        return response(rows.filter((a) => a.status === 'ACTIVE'));
      const c = contexts.get(path.split('/').at(-1)!);
      if (c?.status === 'PENDING' && scenario !== 'PENDING') {
        c.status =
          scenario === 'EXPIRED' || scenario === 'UNAVAILABLE'
            ? 'SERVICEABLE'
            : scenario;
        c.cell_id = c.status === 'SERVICEABLE' ? 'fixture-cell' : null;
        c.failure_code =
          c.status === 'TECHNICAL_FAILURE' ? 'FIXTURE_FAILURE' : null;
        c.resolved_at = new Date().toISOString();
      }
      return c ? response(c) : response({}, 404);
    }
    const key = new Headers(init?.headers).get('Idempotency-Key')!;
    const fingerprint = JSON.stringify([path, method, init?.body]);
    const previous = replay.get(key);
    if (previous)
      return previous.body === fingerprint
        ? response(
            previous.result,
            path === '/v1/addresses' || path === '/v1/serviceability/contexts'
              ? 201
              : 200,
          )
        : response({}, 409);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    let result: unknown;
    if (path === '/v1/serviceability/contexts') {
      const a = rows.find(
        (a) => a.address_id === body.source_address_id && a.status === 'ACTIVE',
      );
      if (!a) return response({}, 404);
      const id = crypto.randomUUID();
      const status: Context['status'] =
        scenario === 'EXPIRED' || scenario === 'UNAVAILABLE'
          ? 'SERVICEABLE'
          : scenario;
      const c: Context = {
        serviceability_context_id: id,
        source_address_id: a.address_id,
        source_address_version: a.version,
        status,
        cell_id: status === 'SERVICEABLE' ? 'fixture-cell' : null,
        failure_code: status === 'TECHNICAL_FAILURE' ? 'FIXTURE_FAILURE' : null,
        expires_at: new Date(
          Date.now() + (scenario === 'EXPIRED' ? -1000 : 600000),
        ).toISOString(),
        resolved_at: status === 'PENDING' ? null : new Date().toISOString(),
      };
      contexts.set(id, c);
      result = c;
    } else if (path === '/v1/addresses') {
      const a: Address = {
        ...body,
        address_id: crypto.randomUUID(),
        status: 'ACTIVE',
        version: 1,
      };
      if (a.is_default)
        rows = rows.map((x) =>
          x.is_default
            ? { ...x, is_default: false, version: x.version + 1 }
            : x,
        );
      rows.push(a);
      result = a;
    } else {
      const id = path.split('/')[3];
      const a = rows.find((x) => x.address_id === id && x.status === 'ACTIVE');
      if (!a) return response({}, 404);
      if (path.endsWith('/archive')) {
        a.status = 'ARCHIVED';
        a.is_default = false;
        a.version++;
      } else {
        if (body.expected_version !== a.version) return response({}, 409);
        if (body.is_default)
          rows = rows.map((x) =>
            x.address_id !== id && x.is_default
              ? { ...x, is_default: false, version: x.version + 1 }
              : x,
          );
        Object.assign(a, {
          address: body.address,
          label: body.label,
          location: body.location,
          is_default: body.is_default,
          version: a.version + 1,
        });
      }
      result = a;
    }
    replay.set(key, { body: fingerprint, result: structuredClone(result) });
    return response(
      result,
      path === '/v1/addresses' || path === '/v1/serviceability/contexts'
        ? 201
        : 200,
    );
  };
  const session = new CustomerSession(
    adapter,
    'https://customer-fixture.invalid',
    fetcher,
  );
  const runtime = createRuntime(session, {
    memoryRecovery: true,
    checkout: product.sdk,
    mediaResolver: () => '/collection-placeholder.svg',
    capabilities: new Set([
      'principal',
      'catalogue',
      'slots',
      'weightPricing',
      'collections',
      'recommendations',
      'payment',
      'checkout',
      'refunds',
      'profile',
      'preferences',
      'favourites',
      'notifications',
      'paymentMethods',
      'feedback',
      'content',
      'cancellationCompensation',
    ]),
  });
  runtime.development = {
    financialControls: (
      <section className="fixture-controls">
        <h3>Development backend controls</h3>
        <label>
          <input
            type="checkbox"
            onChange={(e) => product.setCallbackOnly(e.target.checked)}
          />
          Provider callback without backend confirmation
        </label>
        <button onClick={() => product.settle()}>
          Confirm payment in fixture backend
        </button>
        <button onClick={() => product.handover()}>
          Validate fixture handover
        </button>
        <button onClick={() => product.completeRefund()}>
          Complete fixture refund
        </button>
        <button onClick={() => product.changePolicy()}>
          Change fixture pricing revision
        </button>
        <label>
          Command scenario
          <select onChange={(e) => product.setScenario(e.target.value)}>
            {[
              'NORMAL',
              'LOST_HOLD',
              'LOST_BOOKING',
              'LOST_ATTEMPT',
              'HOLD_CONFLICT',
              'PLANNING_RACE',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </section>
    ),
    banner: (
      <div className="fixture-banner" role="status">
        DEVELOPMENT FIXTURE · Simulated customer and addresses · No live
        services or cookies
      </div>
    ),
    signInLabel: 'Enter development customer',
    signIn: async () => {
      const c = await session.startOtp('+919999999999');
      await session.login(c, '123456');
    },
    controls: (
      <label className="fixture-control">
        Development check scenario
        <select
          defaultValue="SERVICEABLE"
          onChange={(e) => {
            scenario = e.target.value as typeof scenario;
          }}
        >
          {[
            'SERVICEABLE',
            'UNSERVICEABLE',
            'PENDING',
            'TECHNICAL_FAILURE',
            'EXPIRED',
            'UNAVAILABLE',
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
    ),
  };
  return Object.assign(runtime, { fixtureProduct: product });
}
