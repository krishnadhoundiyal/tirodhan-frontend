import { createPushLifecycle } from '../notifications/lifecycle';
import { createInstallationStore } from '../notifications/installation';
import { createSignalSync } from '../notifications/synchronization';
import { createPushApi } from '../api/push-client';
import type { NativePush, Permission } from '../notifications/contracts';
import type { SessionSnapshot } from '../session/store';
import type { Transport } from '../api/transport';
import { ApiError } from '../api/errors';
import { QueryClient } from '@tanstack/react-query';
import { createOperations } from '../features/operations';
import { createFixtureRepository, fixtureOwner } from '../features/fixtures';
jest.mock('expo-crypto', () => ({ randomUUID: () => 'installation-fixture' }));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const snapshot = (owner = 'rider-a', roles = ['RIDER']): SessionSnapshot => ({
  status: 'authenticated',
  userId: owner,
  principal: { userId: owner, roles },
  principalState: 'available',
  principalError: null,
  ownerVersion: 1,
});
function setup() {
  let raw: string | null = null,
    state = snapshot(),
    identity = 1,
    active = true,
    permission: Permission = 'granted',
    token = 'real-sdk-fcm-a';
  let rotation: (() => void) | null = null,
    received: ((data: unknown) => void) | null = null,
    opened: ((data: unknown) => void) | null = null;
  const secure = {
    get: jest.fn(async () => raw),
    set: jest.fn(async (value: string) => {
      raw = value;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
  const store = createInstallationStore(secure, () => 'stable-installation');
  const api = {
    register: jest.fn(
      async (_id: string, _platform: string, _token: string) => {},
    ),
    revoke: jest.fn(async (_id: string) => {}),
  };
  const port = {
    platform: 'ANDROID' as const,
    permission: jest.fn(async (_request: boolean) => permission),
    token: jest.fn(async () => token),
    reset: jest.fn(async () => {
      token = 'fresh-fcm-after-reset';
    }),
    tokenChanged: jest.fn((cb: () => void) => {
      rotation = cb;
      return () => {
        rotation = null;
      };
    }),
    received: jest.fn((cb: (data: unknown) => void) => {
      received = cb;
      return () => {
        received = null;
      };
    }),
    opened: jest.fn((cb: (data: unknown) => void) => {
      opened = cb;
      return () => {
        opened = null;
      };
    }),
    initial: jest.fn(async (): Promise<unknown> => null),
    background: jest.fn(),
  } satisfies NativePush;
  const native = jest.fn((): NativePush | null => port),
    refresh = jest.fn(async () => {});
  const deps = {
    context: () => ({ state, identity, api, refresh }),
    active: () => active,
    native,
    store,
  };
  const controller = createPushLifecycle(deps);
  return {
    controller,
    port,
    native,
    refresh,
    api,
    secure,
    store,
    deps,
    raw: () => raw!,
    state: (next: SessionSnapshot) => {
      state = next;
      identity++;
    },
    permission: (next: Permission) => {
      permission = next;
    },
    active: (next: boolean) => {
      active = next;
    },
    rotate: (next: string) => {
      token = next;
      rotation?.();
    },
    receive: (data: unknown) => received?.(data),
    open: (data: unknown) => opened?.(data),
  };
}
const offer = {
  type: 'ASSIGNMENT_OFFER',
  collection_group_id: 'group',
  offer_round: '2',
};
const route = { type: 'ROUTE_REVISION', revision_id: 'old-revision' };
test.each([{ roles: ['CUSTOMER'] }, { roles: ['MANAGER'] }, { roles: [] }])(
  'non-Rider roles %j cannot acquire or register a native token',
  async ({ roles }) => {
    const h = setup();
    h.state(snapshot('other', roles));
    await h.controller.reconcile(true);
    expect(h.native).not.toHaveBeenCalled();
    expect(h.api.register).not.toHaveBeenCalled();
  },
);
test('unavailable native configuration does not initialize an installation or fabricate a token', async () => {
  const h = setup();
  h.native.mockReturnValue(null);
  await h.controller.reconcile(true);
  expect(h.controller.getSnapshot()).toBe('unavailable');
  expect(h.secure.get).not.toHaveBeenCalled();
  expect(h.api.register).not.toHaveBeenCalled();
});
test.each(['denied', 'undetermined'] as const)(
  'permission %s leaves operational features independent and never gets a token',
  async (permission) => {
    const h = setup();
    h.permission(permission);
    await h.controller.reconcile();
    expect(h.port.permission).toHaveBeenCalledWith(false);
    expect(h.port.token).not.toHaveBeenCalled();
    expect(h.api.register).not.toHaveBeenCalled();
    await h.controller.foreground();
    expect(h.refresh).toHaveBeenCalled();
  },
);
test('granted permission registers actual SDK FCM token with stable installation and only private identity is persisted', async () => {
  const h = setup();
  await h.controller.reconcile(true);
  expect(h.port.permission).toHaveBeenCalledWith(true);
  expect(h.api.register).toHaveBeenCalledWith(
    'stable-installation',
    'ANDROID',
    'real-sdk-fcm-a',
  );
  expect(h.raw()).not.toMatch(
    /fcm|registration_token|access_token|refresh_token/,
  );
  expect(h.controller.getSnapshot()).toBe('registered');
  const restarted = createPushLifecycle(h.deps);
  await restarted.reconcile();
  expect(h.api.register.mock.calls[1]?.[0]).toBe('stable-installation');
});
test('token rotation updates registration; duplicate rotation events do not POST the same token again', async () => {
  const h = setup();
  await h.controller.reconcile();
  h.rotate('fcm-rotated');
  await h.controller.reconcile();
  expect(h.api.register).toHaveBeenCalledTimes(2);
  h.rotate('fcm-rotated');
  h.rotate('fcm-rotated');
  await h.controller.reconcile();
  expect(h.api.register).toHaveBeenCalledTimes(2);
});
test.each([409, 503, 401])(
  'registration error %i is sanitized and explicitly retryable with the same installation',
  async (status) => {
    const h = setup();
    h.api.register.mockRejectedValueOnce(new ApiError(status));
    await h.controller.reconcile();
    expect(h.controller.getSnapshot()).toBe('retry');
    await h.controller.reconcile();
    expect(h.controller.getSnapshot()).toBe('registered');
    expect(h.api.register.mock.calls[0]?.[0]).toBe(
      h.api.register.mock.calls[1]?.[0],
    );
  },
);
test('storage failure precedes native token creation and prevents registration', async () => {
  const h = setup();
  h.secure.set.mockRejectedValue(new Error('Keychain unavailable'));
  await h.controller.reconcile();
  expect(h.controller.getSnapshot()).toBe('retry');
  expect(h.port.token).not.toHaveBeenCalled();
  expect(h.api.register).not.toHaveBeenCalled();
});

test('partial native listener setup is disposed before retry and never acquires a token on failure', async () => {
  const h = setup(),
    unsubscribe = jest.fn();
  h.port.received.mockReturnValueOnce(unsubscribe);
  h.port.opened.mockImplementationOnce(() => {
    throw new Error('native setup failed');
  });
  await h.controller.reconcile();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(h.port.token).not.toHaveBeenCalled();
  await h.controller.reconcile();
  expect(h.controller.getSnapshot()).toBe('registered');
});
test('logout revokes using old identity and deletes the native FCM token while preserving installation ID', async () => {
  const h = setup();
  await h.controller.reconcile();
  await h.controller.logout();
  expect(h.api.revoke).toHaveBeenCalledWith('stable-installation');
  expect(h.port.reset).toHaveBeenCalledTimes(1);
  expect(JSON.parse(h.raw())).toMatchObject({
    id: 'stable-installation',
    owner: null,
    reset: false,
  });
  h.receive(offer);
  expect(h.refresh).not.toHaveBeenCalled();
});
test('offline logout keeps a durable reset obligation and gates another account until native invalidation succeeds', async () => {
  const h = setup();
  await h.controller.reconcile();
  h.api.revoke.mockRejectedValue(new ApiError(0, 'network'));
  h.port.reset.mockRejectedValueOnce(new Error('offline'));
  await h.controller.logout();
  expect(JSON.parse(h.raw())).toMatchObject({ owner: 'rider-a', reset: true });
  h.state(snapshot('rider-b'));
  h.port.reset.mockRejectedValueOnce(new Error('still offline'));
  await h.controller.reconcile();
  expect(h.api.register).toHaveBeenCalledTimes(1);
  await h.controller.reconcile();
  expect(h.api.register).toHaveBeenLastCalledWith(
    'stable-installation',
    'ANDROID',
    'fresh-fcm-after-reset',
  );
});
test('account switch waits for an uncertain old POST before invalidating its token and registering new owner', async () => {
  const h = setup(),
    gate = deferred<void>();
  h.api.register.mockReturnValueOnce(gate.promise);
  const first = h.controller.reconcile();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.api.register).toHaveBeenCalledTimes(1);
  h.state(snapshot('rider-b'));
  const next = h.controller.reconcile();
  gate.resolve();
  await Promise.all([first, next]);
  expect(h.port.reset).toHaveBeenCalledTimes(1);
  expect(h.api.register.mock.calls.map((c) => c[2])).toEqual([
    'real-sdk-fcm-a',
    'fresh-fcm-after-reset',
  ]);
  expect(JSON.parse(h.raw()).owner).toBe('rider-b');
});
test('owner switching during native getToken still records an invalidation obligation before SDK side effects', async () => {
  const h = setup(),
    gate = deferred<string>();
  h.port.token.mockReturnValueOnce(gate.promise);
  const first = h.controller.reconcile();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(JSON.parse(h.raw()).owner).toBe('rider-a');
  h.state(snapshot('rider-b'));
  const next = h.controller.reconcile();
  gate.resolve('old-fcm');
  await Promise.all([first, next]);
  expect(h.port.reset).toHaveBeenCalledTimes(1);
  expect(h.api.register).toHaveBeenCalledTimes(1);
  expect(h.api.register.mock.calls[0]?.[2]).toBe('fresh-fcm-after-reset');
});
test('late old-owner callbacks cannot refresh newly logged-in Rider', async () => {
  const h = setup();
  await h.controller.reconcile();
  const callback = h.port.received.mock.calls[0]![0];
  h.state(snapshot('rider-b'));
  callback(offer);
  await Promise.resolve();
  expect(h.refresh).not.toHaveBeenCalled();
});
test('permission withdrawal invalidates existing token; foreground still reads current operational state', async () => {
  const h = setup();
  await h.controller.reconcile();
  h.permission('denied');
  await h.controller.foreground();
  expect(h.port.reset).toHaveBeenCalledTimes(1);
  expect(h.refresh).toHaveBeenCalled();
  expect(h.controller.getSnapshot()).toBe('denied');
});
test('foreground and opened notification are only read hints; duplicates and out-of-order revisions do not set a route', async () => {
  const h = setup();
  await h.controller.reconcile();
  h.receive(route);
  await new Promise((resolve) => setTimeout(resolve, 0));
  h.receive(route);
  h.open(route);
  h.receive({ type: 'UNTRUSTED', route_id: 'bad' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.refresh).toHaveBeenCalledTimes(1);
  h.receive({ type: 'ROUTE_REVISION', revision_id: 'even-older' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.refresh).toHaveBeenCalledTimes(2);
  expect(h.api.register).toHaveBeenCalledTimes(1);
  expect(h.api.revoke).not.toHaveBeenCalled();
});
test('terminated notification opened after assignment replacement refreshes owned reads, never its payload resource', async () => {
  const h = setup();
  h.port.initial.mockResolvedValue(offer);
  await h.controller.reconcile();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.refresh).toHaveBeenCalledTimes(1);
  expect(h.refresh.mock.calls[0]).toEqual([]);
  expect(h.api.register).toHaveBeenCalledTimes(1);
});
test('background reception does not run operational reads and foreground return recovers all missed hints', async () => {
  const h = setup();
  await h.controller.reconcile();
  h.active(false);
  h.receive(offer);
  expect(h.refresh).not.toHaveBeenCalled();
  h.controller.suspend();
  h.active(true);
  await h.controller.foreground();
  expect(h.refresh).toHaveBeenCalledTimes(1);
  expect(h.api.register).toHaveBeenCalledTimes(2); // Force startup/foreground reconciliation even if unchanged.
});
test('installation state rejects corruption/embedded tokens rather than generating a replacement identity', async () => {
  const secure = {
    get: async () =>
      JSON.stringify({
        version: 1,
        id: 'id',
        owner: null,
        reset: false,
        registration_token: 'private',
      }),
    set: jest.fn(),
    remove: jest.fn(),
  };
  await expect(
    createInstallationStore(secure, () => 'new').load(),
  ).rejects.toBeInstanceOf(ApiError);
  expect(secure.set).not.toHaveBeenCalled();
});
test('notification bursts coalesce reads without losing a newer revision received during a refresh', async () => {
  const gate = deferred<void>(),
    refresh = jest
      .fn()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue(undefined);
  const sync = createSignalSync(refresh, () => true),
    first = sync.signal(offer);
  await sync.signal({ type: 'UNKNOWN' });
  sync.signal(offer);
  sync.signal(route);
  gate.resolve();
  await first;
  expect(refresh).toHaveBeenCalledTimes(2);
});
test('register/revoke use exact actor-scoped backend DTO and no token can appear in response validation errors', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce({
      push_registration_id: 'registration',
      client_device_id: 'install',
      platform: 'IOS',
      provider: 'FCM',
    })
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({
      provider: 'APNS',
      registration_token: 'private-native-fcm',
    });
  const api = createPushApi({ request } as unknown as Transport);
  await api.register('install', 'IOS', 'private-native-fcm');
  await api.revoke('install');
  expect(request.mock.calls.slice(0, 2)).toEqual([
    [
      '/v1/rider/me/push-devices',
      {
        method: 'POST',
        body: {
          client_device_id: 'install',
          platform: 'IOS',
          registration_token: 'private-native-fcm',
        },
      },
    ],
    ['/v1/rider/me/push-devices/install', { method: 'DELETE' }],
  ]);
  await expect(
    api.register('install', 'IOS', 'private-native-fcm'),
  ).rejects.toMatchObject({
    kind: 'protocol',
    message: expect.not.stringContaining('private-native-fcm'),
  });
});

test('a late offer/revision hint reads the current backend and cannot make an expired offer actionable', async () => {
  const fixture = createFixtureRepository();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const ops = createOperations(
    fixture.repository,
    client,
    {
      key: ['push-sync'],
      owner: fixtureOwner,
      current: () => true,
      onForbidden: async () => {},
    },
    () => Date.now() + 3600000,
  );
  const sync = createSignalSync(ops.refresh, () => true);
  try {
    await sync.signal(offer);
    await expect(ops.accept('demo-offer')).rejects.toMatchObject({
      status: 409,
    });
    expect((await fixture.repository.assignment()).assignment).toBeNull();
    fixture.setScenario('active');
    await sync.signal(route);
    expect(client.getQueryData(ops.key('route'))).toMatchObject({
      revision_id: 'demo-revision',
    });
    expect(client.getQueryData(ops.key('route'))).not.toMatchObject({
      revision_id: 'old-revision',
    });
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});
