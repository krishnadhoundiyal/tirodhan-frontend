import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import * as recovery from '../platform/recovery';
import { createRuntime } from '../runtime';
import { deferred, harness, owner } from './helpers';
Object.assign(globalThis, { TextEncoder, TextDecoder });
const cryptoPort = webcrypto as unknown as Crypto;
function vaultFixture() {
  const records = new Map<string, recovery.CipherRecord>();
  let held = false;
  const release = jest.fn(() => {
    held = false;
  });
  const lease = {
    acquire: jest.fn(async (id: string) => {
      void id;
      if (held) throw Error('Owner locked');
      held = true;
      return release;
    }),
  };
  const database = {
    get: jest.fn(async (id: string) => records.get(id)),
    put: jest.fn(async (id: string, value: recovery.CipherRecord) => {
      records.set(id, value);
    }),
    remove: jest.fn(async (id: string) => {
      records.delete(id);
    }),
  };
  const vault = new recovery.EncryptedRecovery(
    owner,
    () => true,
    database,
    cryptoPort,
    lease,
  );
  return { vault, records, lease, release, database, isHeld: () => held };
}
afterEach(() => jest.restoreAllMocks());
test.each(['throw', 'reject', 'stall'] as const)(
  'local cleanup %s cannot prevent an ordered gateway revocation attempt',
  async (failure) => {
    const h = harness({ timeout: 30 });
    await h.login();
    const remove = h.session.beforeLogout(() => {
      if (failure === 'throw') throw Error('Private cleanup detail');
      if (failure === 'reject')
        return Promise.reject(Error('Private cleanup detail'));
      return new Promise(() => {});
    });
    await expect(h.session.logout()).rejects.toThrow();
    expect(h.adapter.logout).toHaveBeenCalledTimes(1);
    expect(h.session.snapshot()).toMatchObject({
      phase: 'error',
      principal: null,
      logoutUnconfirmed: false,
      cleanupPending: true,
    });
    await expect(h.login()).rejects.toThrow();
    await expect(h.session.resume()).rejects.toThrow();
    await expect(h.session.startOtp('+919999999999')).rejects.toThrow();
    remove();
    await h.session.logout();
    expect(h.session.snapshot()).toMatchObject({
      phase: 'signedOut',
      logoutUnconfirmed: false,
      cleanupPending: false,
    });
    await h.login();
  },
);
test('gateway rejection stays unconfirmed even if all local cleanup completes', async () => {
  const h = harness();
  await h.login();
  const cleanup = jest.fn(async () => {});
  h.session.beforeLogout(cleanup);
  jest
    .mocked(h.adapter.logout)
    .mockRejectedValueOnce(Error('Lost gateway response'));
  await expect(h.session.logout()).rejects.toThrow();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(h.session.snapshot()).toMatchObject({
    logoutUnconfirmed: true,
    cleanupPending: false,
    principal: null,
  });
  await h.session.logout();
  expect(h.session.snapshot().logoutUnconfirmed).toBe(false);
});
test('concurrent logout observers share a flight and private state clears synchronously', async () => {
  const h = harness();
  await h.login();
  const gate = deferred<void>();
  jest.mocked(h.adapter.logout).mockReturnValue(gate.promise);
  let nested: Promise<void> | undefined;
  const unsubscribe = h.session.subscribe(() => {
    if (h.session.snapshot().invalidation === 'logout' && !nested)
      nested = h.session.logout();
  });
  const first = h.session.logout();
  expect(nested).toBe(first);
  expect(h.session.logout()).toBe(first);
  expect(h.session.snapshot().principal).toBeNull();
  unsubscribe();
  gate.resolve();
  await first;
  expect(h.adapter.logout).toHaveBeenCalledTimes(1);
});
test('runtime logout deletes under its existing lease, despite notification failure; retry is idempotent', async () => {
  const h = harness();
  await h.login();
  const v = vaultFixture();
  jest.spyOn(recovery, 'browserRecovery').mockReturnValue(v.vault);
  const runtime = createRuntime(h.session),
    model = runtime.customer();
  await model.storage('booking').set('address-free command');
  const deleting = deferred<void>(),
    entered = deferred<void>();
  v.database.remove.mockImplementation(async (id) => {
    entered.resolve();
    await deleting.promise;
    v.records.delete(id);
  });
  jest
    .spyOn(model.notifications, 'revoke')
    .mockRejectedValueOnce(Error('Auxiliary push failure'))
    .mockResolvedValue(undefined);
  runtime.client.setQueryData(['private'], ['private']);
  const pending = h.session.logout();
  const failed = expect(pending).rejects.toThrow();
  expect(model.current()).toBe(false);
  expect(runtime.client.getQueryCache().getAll()).toHaveLength(0);
  await entered.promise;
  expect(h.adapter.logout).toHaveBeenCalledTimes(1);
  expect(v.release).not.toHaveBeenCalled();
  await expect(v.lease.acquire(owner)).rejects.toThrow('Owner locked');
  deleting.resolve();
  await failed;
  expect(h.session.snapshot()).toMatchObject({
    logoutUnconfirmed: false,
    cleanupPending: true,
  });
  expect(v.records.has(owner)).toBe(false);
  expect(v.release).toHaveBeenCalledTimes(1);
  await h.session.logout();
  expect(v.database.remove).toHaveBeenCalledTimes(1);
  expect(v.release).toHaveBeenCalledTimes(1);
  expect(h.session.snapshot().cleanupPending).toBe(false);
});
test('failed durable deletion retains the exclusive lease until an explicit successful retry', async () => {
  const h = harness();
  await h.login();
  const v = vaultFixture();
  jest.spyOn(recovery, 'browserRecovery').mockReturnValue(v.vault);
  const runtime = createRuntime(h.session);
  await runtime.customer().storage('booking').set('sensitive command identity');
  v.database.remove.mockRejectedValueOnce(Error('Database unavailable'));
  await expect(h.session.logout()).rejects.toThrow();
  expect(h.adapter.logout).toHaveBeenCalledTimes(1);
  expect(v.records.has(owner)).toBe(true);
  expect(v.release).not.toHaveBeenCalled();
  await expect(v.lease.acquire(owner)).rejects.toThrow();
  await h.session.logout();
  expect(v.records.has(owner)).toBe(false);
  expect(v.release).toHaveBeenCalledTimes(1);
  expect(h.session.snapshot()).toMatchObject({
    logoutUnconfirmed: false,
    cleanupPending: false,
  });
});
test('concurrent passive and explicit disposal upgrade deletion before releasing the owner lock', async () => {
  const v = vaultFixture();
  await v.vault.storage('booking').set('command');
  const gate = deferred<void>(),
    entered = deferred<void>();
  v.database.remove.mockImplementation(async (id) => {
    entered.resolve();
    await gate.promise;
    v.records.delete(id);
  });
  const passive = v.vault.dispose(false),
    logout = v.vault.dispose(true),
    duplicate = v.vault.dispose(true);
  await entered.promise;
  expect(v.release).not.toHaveBeenCalled();
  await expect(v.lease.acquire(owner)).rejects.toThrow();
  gate.resolve();
  await Promise.all([passive, logout, duplicate]);
  expect(v.database.remove).toHaveBeenCalledTimes(1);
  expect(v.release).toHaveBeenCalledTimes(1);
  await v.vault.dispose(true);
  expect(v.database.remove).toHaveBeenCalledTimes(1);
});
test('a retired recovery instance must reacquire the owner lock before deleting', async () => {
  const v = vaultFixture();
  await v.vault.storage('booking').set('retained');
  await v.vault.dispose(false);
  const otherRelease = await v.lease.acquire(owner);
  await expect(v.vault.dispose(true)).rejects.toThrow();
  expect(v.database.remove).not.toHaveBeenCalled();
  expect(v.records.has(owner)).toBe(true);
  otherRelease();
  await v.vault.dispose(true);
  expect(v.records.has(owner)).toBe(false);
});
