import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import {
  EncryptedRecovery,
  memoryStorage,
  type CipherRecord,
} from '../platform/recovery';
import { BrowserNotifications, signalPayload } from '../platform/notifications';
import {
  browserGeocoder,
  currentLocation,
  approvedMap,
} from '../platform/location';
import { PaymentFlow, verifyPayment } from '../features/payment';
import {
  razorpayCheckout,
  type RazorpayConstructor,
} from '../platform/checkout';
import { customerPathAllowed } from '../api/paths';
import { milliUnits } from '../parity/api/weight-contracts';
import { declarationItem } from '../parity/features/collection/declarations';
import {
  approximateDistanceKm,
  addressIdentity,
  needsAddressConfirmation,
} from '../parity/features/addresses/distance';
import { safeMedia, refund, decodeProduct } from '../parity/api/validation';
import { fixtureRuntime } from '../fixture';
import { deferred, owner, other, response } from './helpers';
import { addressValue } from './helpers';
import type {
  PaymentRead,
  CheckoutParameters,
} from '../parity/api/customer-contracts';
Object.assign(globalThis, { TextEncoder, TextDecoder });
const cryptoPort = webcrypto as unknown as Crypto;
const attempt = '12345678-1234-4234-8234-123456789012';
const payment = (action: PaymentRead['action'] = 'START'): PaymentRead => ({
  payment_id: other,
  request_id: owner,
  amount_minor: 35000,
  currency: 'INR',
  status: 'PENDING',
  retry_allowed: true,
  expires_at: new Date(Date.now() + 60000).toISOString(),
  succeeded_at: null,
  current_attempt: null,
  action,
  action_reason: 'NEW_PAYMENT',
  verification_pending: false,
  checkout_ready_until: null,
});
const parameters = (): CheckoutParameters => ({
  request_id: owner,
  payment_attempt_id: attempt,
  provider: 'RAZORPAY',
  public_key_id: 'rzp_test_example',
  provider_order_id: 'order_example',
  merchant_display_name: 'Tirodhan',
  amount_minor: 35000,
  currency: 'INR',
  expires_at: new Date(Date.now() + 60000).toISOString(),
  checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
});
function finance(action: PaymentRead['action'] = 'START', available = true) {
  const repo = {
    payment: jest.fn(async () => payment(action)),
    checkout: jest.fn(async () => parameters()),
    prepare: jest.fn(() => ({
      execute: jest.fn(async () => ({
        payment_attempt_id: attempt,
        action: 'RESUME' as const,
        action_reason: 'CHECKOUT_READY' as const,
        checkout_ready_until: parameters().checkout_ready_until,
        status: 'PENDING' as const,
        provider: 'RAZORPAY',
        provider_order_id: 'order_example',
        provider_payment_id: null,
        failure_code: null,
      })),
    })),
  };
  const sdk = {
    available: () => available,
    prepare: jest.fn(async () => {}),
    launch: jest.fn(async () => {}),
    close: jest.fn(),
  };
  return {
    repo,
    sdk,
    flow: new PaymentFlow(owner, repo, sdk, memoryStorage(), () => true),
  };
}
test.each(['WAIT', 'UNAVAILABLE'] as const)(
  '%s never prepares or opens checkout',
  async (action) => {
    const { flow, repo, sdk } = finance(action);
    expect((await flow.start(new AbortController().signal)).action).toBe(
      action,
    );
    expect(repo.prepare).not.toHaveBeenCalled();
    expect(sdk.prepare).not.toHaveBeenCalled();
  },
);
test('unavailable browser adapter prevents even backend preparation', async () => {
  const { flow, repo } = finance('START', false);
  await expect(flow.start(new AbortController().signal)).rejects.toThrow();
  expect(repo.prepare).not.toHaveBeenCalled();
});
test('RESUME uses the current attempt; callback cannot settle money or launch again automatically', async () => {
  const { flow, repo, sdk } = finance('RESUME');
  repo.payment.mockImplementation(async () => ({
    ...payment('RESUME'),
    current_attempt: { payment_attempt_id: attempt, status: 'PENDING' },
  }));
  expect((await flow.start(new AbortController().signal)).status).toBe(
    'PENDING',
  );
  await flow.start(new AbortController().signal);
  expect(repo.prepare).not.toHaveBeenCalled();
  expect(sdk.launch).toHaveBeenCalledTimes(1);
  await flow.resumeExplicitly(new AbortController().signal);
  expect(sdk.launch).toHaveBeenCalledTimes(2);
});
test.each([
  'amount_minor',
  'request_id',
  'payment_attempt_id',
  'currency',
  'checkout_ready_until',
] as const)(
  'tampered checkout %s fails before provider launch',
  async (key) => {
    const { flow, repo, sdk } = finance();
    repo.checkout.mockResolvedValue({
      ...parameters(),
      [key]:
        key === 'amount_minor'
          ? 1
          : key === 'checkout_ready_until'
            ? '2000-01-01T00:00:00Z'
            : 'invalid',
    });
    await expect(flow.start(new AbortController().signal)).rejects.toThrow();
    expect(sdk.launch).not.toHaveBeenCalled();
  },
);
test('account loss during SDK availability check prevents attempt creation', async () => {
  let current = true;
  const { repo, sdk } = finance();
  sdk.prepare.mockImplementation(async () => {
    current = false;
  });
  const flow = new PaymentFlow(
    owner,
    repo,
    sdk,
    memoryStorage(),
    () => current,
  );
  await expect(flow.start(new AbortController().signal)).rejects.toThrow();
  expect(repo.prepare).not.toHaveBeenCalled();
});
test('verification stops on terminal state, hidden document, cancellation and its total deadline', async () => {
  jest.useFakeTimers();
  try {
    const c = new AbortController(),
      seen = jest.fn(),
      read = jest.fn(async () => ({
        ...payment(),
        status: 'SUCCEEDED' as const,
      }));
    await verifyPayment(read, c.signal, () => true, seen);
    expect(read).toHaveBeenCalledTimes(1);
    await verifyPayment(read, c.signal, () => false, seen);
    expect(read).toHaveBeenCalledTimes(1);
    const stalled = jest.fn(() => new Promise<PaymentRead>(() => {})),
      task = verifyPayment(stalled, c.signal, () => true, seen);
    await jest.advanceTimersByTimeAsync(30001);
    await task;
    expect(stalled).toHaveBeenCalledTimes(1);
    const task2 = verifyPayment(stalled, c.signal, () => true, seen);
    c.abort();
    await task2;
    expect(seen).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('encrypted recovery survives restart, binds owner, rejects tampering and wipes on explicit logout', async () => {
  const records = new Map<string, CipherRecord>();
  const database = {
    get: async (id: string) => records.get(id),
    put: async (id: string, v: CipherRecord) => {
      records.set(id, v);
    },
    remove: async (id: string) => {
      records.delete(id);
    },
  };
  const lease = { acquire: jest.fn(async () => jest.fn()) };
  let current = true;
  const first = new EncryptedRecovery(
    owner,
    () => current,
    database,
    cryptoPort,
    lease,
  );
  await first.storage('booking').set('address-free-command');
  const stored = records.get(owner)!;
  expect(stored.key.extractable).toBe(false);
  expect(new TextDecoder().decode(stored.ciphertext)).not.toContain(
    'address-free-command',
  );
  await first.dispose(false);
  const next = new EncryptedRecovery(
    owner,
    () => true,
    database,
    cryptoPort,
    lease,
  );
  expect(await next.storage('booking').get()).toBe('address-free-command');
  await next.dispose(false);
  records.set(other, stored);
  const wrong = new EncryptedRecovery(
    other,
    () => true,
    database,
    cryptoPort,
    lease,
  );
  await expect(wrong.storage('booking').get()).rejects.toThrow();
  await wrong.dispose(true);
  const bytes = new Uint8Array(stored.ciphertext.slice(0));
  bytes[0]! ^= 1;
  records.set(owner, { ...stored, ciphertext: bytes.buffer });
  const corrupted = new EncryptedRecovery(
    owner,
    () => true,
    database,
    cryptoPort,
    lease,
  );
  await expect(corrupted.storage('booking').get()).rejects.toThrow();
  await corrupted.dispose(true);
  expect(records.has(owner)).toBe(false);
  const stale = new EncryptedRecovery(
    owner,
    () => current,
    database,
    cryptoPort,
    lease,
  );
  current = false;
  await expect(stale.storage('booking').set('late')).rejects.toThrow();
  expect(records.size).toBe(0);
});
test('unavailable exclusive recovery lease fails closed before writes', async () => {
  const put = jest.fn();
  const r = new EncryptedRecovery(
    owner,
    () => true,
    { get: async () => undefined, put, remove: async () => {} },
    cryptoPort,
    {
      acquire: async () => {
        throw Error('another tab');
      },
    },
  );
  await expect(r.storage('booking').set('x')).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
});
test('late encryption completion after account loss cannot write', async () => {
  let current = true;
  const gate = deferred<void>();
  const put = jest.fn();
  const database = {
    get: async () => {
      await gate.promise;
      return undefined;
    },
    put,
    remove: async () => {},
  };
  const r = new EncryptedRecovery(owner, () => current, database, cryptoPort, {
    acquire: async () => () => {},
  });
  const pending = r.storage('booking').set('x');
  await Promise.resolve();
  current = false;
  gate.resolve();
  await expect(pending).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
});

test('provider loader is approved-origin gated and callbacks discard provider truth; close cancels pending modal', async () => {
  const ctor = jest.fn();
  const env = {
    origin: 'https://customer.example',
    secure: true,
    document,
    constructor: () => ctor as unknown as RazorpayConstructor,
  };
  const unapproved = razorpayCheckout(null, env);
  await expect(
    unapproved.prepare(new AbortController().signal),
  ).rejects.toThrow();
  expect(document.querySelector('script[src*="razorpay"]')).toBeNull();
  const port = razorpayCheckout(
    {
      approved: true,
      approvalReference: 'test-only',
      environment: 'nonprod',
      browserOrigin: env.origin,
    },
    env,
  );
  const load = port.prepare(new AbortController().signal);
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="razorpay"]',
  )!;
  expect(script.src).toBe('https://checkout.razorpay.com/v1/checkout.js');
  script.dispatchEvent(new Event('load'));
  await load;
  ctor.mockImplementation(() => ({
    open: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
  }));
  const launch = port.launch(parameters(), new AbortController().signal);
  const opts = ctor.mock.calls[0]![0];
  expect(opts.order_id).toBe('order_example');
  expect(opts).not.toHaveProperty('prefill');
  opts.handler({ razorpay_payment_id: 'untrusted' });
  await launch;
  const pending = port.launch(parameters(), new AbortController().signal);
  port.close();
  await expect(pending).rejects.toThrow();
  script.remove();
});
test('malformed checkout approval and mixed customer origins fail closed', () => {
  for (const browserOrigin of [
    'not-url',
    'https://other.example',
    'http://customer.example',
  ])
    expect(
      razorpayCheckout(
        {
          approved: true,
          approvalReference: 'x',
          environment: 'nonprod',
          browserOrigin,
        },
        {
          origin: 'https://customer.example',
          secure: true,
          document,
          constructor: () => undefined,
        },
      ).available(),
    ).toBe(false);
});

test('push requires explicit approval, minimal payload, bounded dedup and owned refetch on tap', async () => {
  const register = jest.fn(async () => {}),
    revoke = jest.fn(async () => {}),
    unsubscribe = jest.fn(async () => true);
  const subscription = {
    toJSON: () => ({ endpoint: 'https://push.example/subscription' }),
    unsubscribe,
  };
  const registration = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: jest.fn(),
    },
  } as unknown as ServiceWorkerRegistration;
  const notifications = {
    requestPermission: jest.fn(async () => 'granted' as const),
  } as unknown as typeof Notification;
  const disabled = new BrowserNotifications(null, null, () => true);
  await expect(
    disabled.enable(registration, notifications, new AbortController().signal),
  ).rejects.toThrow();
  expect(notifications.requestPermission).not.toHaveBeenCalled();
  let current = true;
  const enabled = new BrowserNotifications(
    { available: true, register, revoke },
    new Uint8Array([1]),
    () => current,
  );
  await enabled.enable(
    registration,
    notifications,
    new AbortController().signal,
  );
  expect(register).toHaveBeenCalledTimes(1);
  const refetch = jest.fn(),
    navigate = jest.fn(),
    raw = {
      schema_version: 1,
      target: 'COLLECTION',
      event_id: 'event1',
      request_id: owner,
      route: 'https://attacker.invalid',
      payment_status: 'SUCCEEDED',
    };
  enabled.signal(raw, true, refetch, navigate);
  enabled.signal(raw, true, refetch, navigate);
  expect(navigate.mock.calls).toEqual([[`/account/collections/${owner}`]]);
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(signalPayload({ ...raw, request_id: 'evil' })).toBeNull();
  current = false;
  enabled.signal(raw, true, refetch, navigate);
  expect(refetch).toHaveBeenCalledTimes(2);
  await enabled.revoke(new AbortController().signal);
  expect(unsubscribe).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalled();
});
test('late notification permission after logout cannot register for another owner', async () => {
  const wait = deferred<NotificationPermission>(),
    register = jest.fn(),
    unsubscribe = jest.fn();
  let current = true;
  const n = new BrowserNotifications(
    { available: true, register, revoke: async () => {} },
    new Uint8Array([1]),
    () => current,
  );
  const r = {
    pushManager: { getSubscription: async () => ({ unsubscribe }) },
  } as unknown as ServiceWorkerRegistration;
  const task = n.enable(
    r,
    { requestPermission: () => wait.promise } as unknown as typeof Notification,
    new AbortController().signal,
  );
  current = false;
  n.clear();
  wait.resolve('granted');
  await expect(task).rejects.toThrow();
  expect(register).not.toHaveBeenCalled();
});
test('geolocation is only called by explicit API action; abort rejects late results', async () => {
  const getCurrentPosition = jest.fn();
  const geo = { getCurrentPosition } as unknown as Geolocation;
  expect(getCurrentPosition).not.toHaveBeenCalled();
  const c = new AbortController(),
    p = currentLocation(geo, c.signal);
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  c.abort();
  await expect(p).rejects.toThrow();
  getCurrentPosition.mock.calls[0]![0]({
    coords: { latitude: 28, longitude: 77 },
  });
});
test('approved browser geocoder uses credential-free bounded queries and validates coordinates', async () => {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      response([{ lat: '28', lon: '77', display_name: 'A landmark' }]),
  );
  expect(browserGeocoder(null, fetcher)).toBeNull();
  const g = browserGeocoder(
    {
      approved: true,
      approvalReference: 'test',
      searchUrl: 'https://maps.example/search',
      reverseUrl: 'https://maps.example/reverse',
    },
    fetcher,
  )!;
  expect(
    (await g.search('Temple Road', new AbortController().signal))[0]?.location,
  ).toEqual({ latitude: 28, longitude: 77 });
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  fetcher.mockResolvedValue(
    response([{ lat: '999', lon: '77', display_name: 'bad' }]),
  );
  await expect(g.search('bad', new AbortController().signal)).rejects.toThrow();
  expect(
    approvedMap({
      approved: true,
      approvalReference: 'x',
      tileUrl: 'https://tiles.example/{z}/{x}/{y}.png',
      attribution: 'Provider',
    }),
  ).toBe(true);
});
test.each([
  'https://evil.example/v1/customer/collection-catalogue',
  '//evil/v1/addresses',
  '/v1/auth/refresh',
  '/v2/customer/slot-availability?serviceability_context_id=' +
    owner +
    '&serviceability_context_id=' +
    other,
  '/v1/customer/collection-requests?view=active&limit=20&secret=token',
])('path %s cannot escape customer allowlist', (path) =>
  expect(customerPathAllowed(path, 'GET')).toBe(false),
);
test('V2 slots query accepts exactly one validated context', () =>
  expect(
    customerPathAllowed(
      '/v2/customer/slot-availability?serviceability_context_id=' + owner,
      'GET',
    ),
  ).toBe(true));
test.each(['0', '-1', '1e3', '1.0001', '2147483.648', '.5', '1.', ' 1'])(
  'precise declaration rejects %s',
  (text) => expect(milliUnits(text)).toBeNull(),
);
test('volume applies to entire quantity; policy changes invalidate explicit weight band selection', async () => {
  const r = fixtureRuntime();
  await r.development!.signIn();
  const m = r.customer(),
    p = await m.repo.weightPolicy(),
    c = (await m.repo.catalogue()).categories[0]!;
  const d = {
    weightBand: 'BELOW_B' as const,
    quantityText: '3',
    volumeLitres: '2.5',
    policyId: p.policy_id,
    policyRevision: p.policy_revision,
  };
  expect(declarationItem(c, d, p)?.declared_volume_ml).toBe(2500);
  expect(declarationItem(c, d, { ...p, policy_revision: 2 })).toBeNull();
  expect(
    declarationItem(c, { ...d, weightBand: 'ABOVE_T', weightKg: '10' }, p),
  ).toBeNull();
  expect(
    declarationItem(c, { ...d, weightBand: 'ABOVE_T', weightKg: '10.001' }, p)
      ?.weight_kg,
  ).toBe('10.001');
  await r.session.logout();
});

test('distance confirmation is approximate, optional and bound to address version/coordinates', () => {
  const a = {
    ...addressValue(),
    status: 'ACTIVE' as const,
    location: { latitude: 28, longitude: 77 },
  };
  expect(approximateDistanceKm(a.location, a.location)).toBe(0);
  expect(
    needsAddressConfirmation(a, { latitude: 29, longitude: 77 }, null),
  ).toBeGreaterThan(5);
  expect(
    needsAddressConfirmation(
      a,
      { latitude: 29, longitude: 77 },
      addressIdentity(a),
    ),
  ).toBeNull();
  expect(
    needsAddressConfirmation(
      { ...a, version: 2 },
      { latitude: 29, longitude: 77 },
      addressIdentity(a),
    ),
  ).toBeGreaterThan(5);
  expect(
    needsAddressConfirmation(
      { ...a, location: null },
      { latitude: 29, longitude: 77 },
      null,
    ),
  ).toBeNull();
  expect(
    approximateDistanceKm({ latitude: NaN, longitude: 1 }, a.location),
  ).toBeNull();
});
test.each([
  'http://unsafe.example/image',
  'javascript:alert(1)',
  'https://user:password@media.example/image',
  'https://media.example/image?sp=rw',
])('unsafe media %s fails closed without a browser load', (url) => {
  expect(() =>
    safeMedia({
      url,
      thumbnail_url: null,
      width: 100,
      height: 100,
      alt_text: 'Illustration',
      blurhash: null,
      expires_at: null,
    }),
  ).toThrow();
});
test.each(['INITIATED', 'PROCESSING', 'COMPLETED', 'CONFIRMING', 'FAILED'])(
  'refund status %s remains separate from payment',
  (status) => {
    expect(
      refund({
        refund_id: owner,
        status,
        amount_minor: 35000,
        currency: 'INR',
        initiated_at: new Date().toISOString(),
        completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
        reason: 'CUSTOMER_CANCELLATION',
      }).status,
    ).toBe(status);
  },
);
test('owned detail rejects mismatched request IDs and query protocol does not accept arbitrary pages', () => {
  expect(() =>
    decodeProduct('/v1/customer/collection-requests/' + owner, {}),
  ).toThrow();
  expect(
    customerPathAllowed(
      '/v1/customer/collection-requests?view=active&view=history&limit=20',
      'GET',
    ),
  ).toBe(false);
  expect(
    customerPathAllowed(
      '/v1/customer/notifications?limit=20&cursor=bad%26token',
      'GET',
    ),
  ).toBe(false);
});
