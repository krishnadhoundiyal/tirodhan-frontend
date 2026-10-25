import { fixtureRuntime } from '../fixture';
import { declarationItem } from '../parity/features/collection/declarations';
import { BookingFlow } from '../parity/features/collection/bookingFlow';
import { BookingRecoveryStore } from '../parity/features/collection/bookingRecovery';
import { CustomerApi } from '../api/customer';
import { address as parseAddress } from '../api/contracts';
import { addressValue, harness, response } from './helpers';
async function ready() {
  const r = fixtureRuntime();
  await r.development!.signIn();
  const m = r.customer();
  const a = (await r.api.addresses())[0]!;
  m.selectAddress(a);
  const c = await r.api.check(a).execute();
  m.checkContext(c);
  const cat = await m.repo.catalogue(),
    policy = await m.repo.weightPolicy();
  const item = declarationItem(
    cat.categories[0]!,
    {
      weightBand: 'BELOW_B',
      volumeLitres: '2.5',
      quantityText: '2',
      policyId: policy.policy_id,
      policyRevision: policy.policy_revision,
    },
    policy,
  )!;
  const q = await m.repo.quote({
    policy_id: policy.policy_id,
    policy_revision: policy.policy_revision,
    items: [item],
  });
  const slots = await m.repo.slots(c.serviceability_context_id);
  return {
    r,
    m,
    a,
    c,
    q,
    slots,
    intent: {
      context: c,
      availability: slots,
      slot: slots.slots[0]!,
      items: q.items,
      quote: q,
    },
  };
}
test('HTTP integration: declaration, quote, atomic hold, reservation booking, checkout, payment, cancellation and completed refund', async () => {
  const { r, m, intent } = await ready();
  const result = await m.booking.submit(intent);
  expect(result.status).toBe('PENDING_PAYMENT');
  expect(r.fixtureProduct.holds.size).toBe(1);
  const hold = [...r.fixtureProduct.holds.values()][0]!;
  expect(hold.hold.bound_request_id).toBe(result.request_id);
  expect(hold.body.mass_g).toBe(2000);
  expect(hold.body.volume_ml).toBe(2500);
  const payment = await m
    .payment(result.request_id)
    .start(new AbortController().signal);
  expect(payment.status).toBe('SUCCEEDED');
  const detail = await m.repo.detail(result.request_id);
  expect(detail.cancellation.allowed).toBe(true);
  await m.repo.cancel(result.request_id, detail.cancellation).execute();
  expect((await m.repo.refunds(result.request_id)).refunds[0]?.status).toBe(
    'INITIATED',
  );
  r.fixtureProduct.completeRefund();
  expect((await m.repo.refunds(result.request_id)).refunds[0]?.status).toBe(
    'COMPLETED',
  );
  expect((await m.repo.collections('history', null)).items[0]?.status).toBe(
    'CANCELLED',
  );
  expect(fetch).not.toHaveBeenCalled();
  await r.session.logout();
});
test('a provider callback without backend confirmation never establishes payment success', async () => {
  const { r, m, intent } = await ready();
  r.fixtureProduct.setCallbackOnly(true);
  const result = await m.booking.submit(intent);
  const payment = await m
    .payment(result.request_id)
    .start(new AbortController().signal);
  expect(payment.status).toBe('PENDING');
  expect(payment.action).toBe('WAIT');
  expect((await m.repo.detail(result.request_id)).status).toBe(
    'PENDING_PAYMENT',
  );
  r.fixtureProduct.settle();
  expect((await m.repo.payment(result.request_id)).status).toBe('SUCCEEDED');
  await r.session.logout();
});
test.each(['LOST_HOLD', 'LOST_BOOKING'])(
  'uncertain %s keeps one reservation and one booking through explicit retry',
  async (scenario) => {
    const { r, m, intent } = await ready();
    r.fixtureProduct.setScenario(scenario);
    await expect(m.booking.submit(intent)).rejects.toThrow();
    const result = await m.booking.submit();
    expect(result.request_id).toBeTruthy();
    expect(r.fixtureProduct.holds.size).toBe(1);
    expect(r.fixtureProduct.records.size).toBe(1);
    await r.session.logout();
  },
);
test('restart reads deterministic bound reservation before replay; no second booking', async () => {
  const { r, m, intent } = await ready();
  r.fixtureProduct.setScenario('LOST_BOOKING');
  await expect(m.booking.submit(intent)).rejects.toThrow();
  const restored = new BookingFlow(
    m.repo,
    new BookingRecoveryStore(m.storage('booking')),
    m.owner,
    () => `${m.owner}:${m.epoch}`,
    () => crypto.randomUUID(),
  );
  await restored.initialize();
  expect(restored.getSnapshot()).toBe('restart');
  const id = await restored.recoverRestart();
  expect(id).toBe([...r.fixtureProduct.records.keys()][0]);
  expect(r.fixtureProduct.records.size).toBe(1);
  await r.session.logout();
});
test('lost payment preparation is resolved from the owned current attempt without a second attempt', async () => {
  const { r, m, intent } = await ready();
  const result = await m.booking.submit(intent);
  r.fixtureProduct.setScenario('LOST_ATTEMPT');
  await expect(
    m.payment(result.request_id).start(new AbortController().signal),
  ).rejects.toThrow();
  const p = await m
    .payment(result.request_id)
    .start(new AbortController().signal);
  expect(p.status).toBe('SUCCEEDED');
  expect(r.fixtureProduct.attempts.size).toBe(1);
  await r.session.logout();
});
test('account options, notification history, recommendations and authoritative handover are real fixture endpoints', async () => {
  const { r, m, intent } = await ready();
  let profile = await m.repo.profile();
  await m.repo
    .updateProfile({
      client_request_id: crypto.randomUUID(),
      expected_version: profile.version,
      display_name: 'New name',
      email: null,
    })
    .execute();
  profile = await m.repo.profile();
  expect(profile.display_name).toBe('New name');
  const prefs = await m.repo.preferences();
  await m.repo
    .updatePreferences({
      client_request_id: crypto.randomUUID(),
      expected_version: prefs.version,
      language: 'hi-IN',
      collection_notifications: true,
    })
    .execute();
  expect((await m.repo.preferences()).language).toBe('hi-IN');
  const fav = await m.repo.favourites();
  await m.repo
    .updateFavourites({
      client_request_id: crypto.randomUUID(),
      expected_version: fav.version,
      category_codes: ['flowers'],
    })
    .execute();
  expect((await m.repo.favourites()).category_codes).toEqual(['flowers']);
  expect(
    (
      await m.repo
        .feedback({
          client_request_id: crypto.randomUUID(),
          message: 'Useful fixture feedback',
        })
        .execute()
    ).feedback_id,
  ).toBeTruthy();
  const result = await m.booking.submit(intent);
  await m.payment(result.request_id).start(new AbortController().signal);
  r.fixtureProduct.handover();
  const detail = await m.repo.detail(result.request_id);
  expect(detail.journey.handover.state).toBe('VALIDATED');
  expect((await m.repo.notifications(null)).items[0]?.request_id).toBe(
    result.request_id,
  );
  expect(
    (await m.repo.recommendations()).recommendations[0]?.category_code,
  ).toBe('flowers');
  expect((await m.repo.paymentMethods()).methods.length).toBe(1);
  expect((await m.repo.content('privacy')).slug).toBe('privacy');
  await r.session.logout();
});
test('changed saved address text clears old coordinates in the API preparation boundary; label-only edit preserves them', async () => {
  const h = harness();
  await h.login();
  const a = parseAddress({
      ...addressValue(),
      location: { latitude: 28, longitude: 77 },
    }),
    api = new CustomerApi(h.session);
  h.fetcher.mockResolvedValue(
    response({
      ...a,
      address: 'Changed household',
      location: null,
      version: 2,
    }),
  );
  const command = api.update(a, {
    address: 'Changed household',
    label: 'Home',
    location: a.location,
    is_default: false,
  });
  expect(JSON.parse(command.body!).location).toBeNull();
  await command.execute();
  const same = api.update(a, {
    address: a.address,
    label: 'New label',
    location: a.location,
    is_default: false,
  });
  expect(JSON.parse(same.body!).location).toEqual(a.location);
});
