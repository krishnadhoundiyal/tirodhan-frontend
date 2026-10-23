import { createCustomerApi } from '../api/customer-client';
import { Transport } from '../api/transport';
import { capabilityGate } from '../api/capabilities';
import { milliUnits, parsePolicy, parseQuote } from '../api/weight-contracts';
import { declarationItem } from '../features/collection/declarations';
import {
  developmentWeightPolicy as policy,
  developmentQuote,
} from '../features/collection/developmentWeightPricing';
import { developmentCatalogue } from '../features/collection/developmentCatalogue';
import { privateCommandStorage } from '../session/privateCommandStorage';
const category = developmentCatalogue.categories.find(
  (c) => c.code === 'flowers',
)!;
const base = {
  weightBand: 'BELOW_B' as const,
  volumeLitres: '2.5',
  quantity: 3,
  policyId: policy.policy_id,
  policyRevision: policy.policy_revision,
};
test.each([
  ['0.001', 1],
  ['2.5', 2500],
  ['0002.500', 2500],
  ['2147483.647', 2147483647],
])('exact unit conversion %s gives %s without rounding', (text, expected) => {
  expect(milliUnits(text as string)).toBe(expected);
});
test.each([
  '',
  '0',
  '-1',
  '+1',
  ' 1',
  '1 ',
  '1,5',
  '1e3',
  'Infinity',
  'NaN',
  '1.0001',
  '2147483.648',
  '.5',
  '1.',
])('%s is not an authorized precise declaration', (text) => {
  expect(milliUnits(text)).toBeNull();
});
test.each(['BELOW_B', 'B_TO_T'] as const)(
  '%s has no numerical kg input and volume covers the whole quantity',
  (weightBand) => {
    const item = declarationItem(
      category,
      { ...base, weightBand, weightKg: '999' },
      policy,
    )!;
    expect(item.weight_kg).toBeNull();
    expect(item.declared_volume_ml).toBe(2500);
    const quote = developmentQuote({
      policy_id: policy.policy_id,
      policy_revision: policy.policy_revision,
      items: [item],
    });
    expect(quote.total_weight_grams).toBe(
      weightBand === 'BELOW_B'
        ? policy.first_band_upper_grams
        : policy.numerical_threshold_grams,
    );
    expect(quote.total_volume_ml).toBe(2500); // Not multiplied by quantity.
  },
);
test.each(['9.999', '10', '10.000'])(
  'ABOVE_T rejects threshold or lower numerical value %s',
  (weightKg) => {
    expect(
      declarationItem(
        category,
        { ...base, weightBand: 'ABOVE_T', weightKg },
        policy,
      ),
    ).toBeNull();
  },
);
test('ABOVE_T accepts the first gram strictly above T and preserves the exact string', () => {
  expect(
    declarationItem(
      category,
      { ...base, weightBand: 'ABOVE_T', weightKg: '10.001' },
      policy,
    )?.weight_kg,
  ).toBe('10.001');
});
test('policy revision change invalidates a band instead of silently reinterpreting it', () => {
  expect(
    declarationItem(category, base, { ...policy, policy_revision: 2 }),
  ).toBeNull();
});
test('missing volume permits only a price preview, never readiness to hold', () => {
  const item = declarationItem(
    category,
    { ...base, volumeLitres: '' },
    policy,
  )!;
  const input = {
    policy_id: policy.policy_id,
    policy_revision: policy.policy_revision,
    items: [item],
  };
  const quote = parseQuote(developmentQuote(input), input);
  expect(quote.total_volume_ml).toBeNull();
  expect(quote.live_customer_holds_available).toBe(false);
  expect(quote.hold_blocker).toBe('ITEM_VOLUME_DECLARATIONS_REQUIRED');
});
test.each(['0', '1.0001', '2147483.648'])(
  'invalid entered volume %s prevents even a quote request',
  (volumeLitres) => {
    expect(
      declarationItem(category, { ...base, volumeLitres }, policy),
    ).toBeNull();
  },
);
test('aggregate volume sums distinct whole lines and a malformed server sum is rejected', () => {
  const items = [
    declarationItem(category, base, policy)!,
    {
      ...declarationItem(category, { ...base, volumeLitres: '1.125' }, policy)!,
      item_category_code: 'books',
    },
  ];
  const input = {
    policy_id: policy.policy_id,
    policy_revision: policy.policy_revision,
    items,
  };
  const quote = developmentQuote(input);
  expect(parseQuote(quote, input).total_volume_ml).toBe(3625);
  expect(() =>
    parseQuote({ ...quote, total_volume_ml: 3626 }, input),
  ).toThrow();
  expect(() =>
    parseQuote({ ...quote, total_weight_grams: 1 }, input),
  ).toThrow();
});
test('invalid policy and mismatched quote confirmation cannot become authoritative price', () => {
  expect(() => parsePolicy({ ...policy, active: false })).toThrow();
  expect(() =>
    parsePolicy({
      ...policy,
      numerical_threshold_grams: policy.first_band_upper_grams,
    }),
  ).toThrow();
  const input = {
    policy_id: policy.policy_id,
    policy_revision: 1,
    items: [declarationItem(category, base, policy)!],
  };
  const quote = developmentQuote(input);
  expect(() =>
    parseQuote(
      { ...quote, confirmation: { ...quote.confirmation, policy_revision: 2 } },
      input,
    ),
  ).toThrow();
  expect(() =>
    parseQuote({ ...quote, total_amount_minor: '35000' }, input),
  ).toThrow();
});
test('HTTP policy/quote adapters use exact endpoints and versioned declarations, with no client amount', async () => {
  const input = {
    policy_id: policy.policy_id,
    policy_revision: 1,
    items: [declarationItem(category, base, policy)!],
  };
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => policy })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => developmentQuote(input),
    });
  const transport = new Transport(
    'https://nonprod.example',
    {
      accessToken: () => 'token',
      refresh: async () => {},
      clear: async () => {},
    },
    () => 'unused',
    fetcher,
  );
  const api = createCustomerApi(
    transport,
    capabilityGate(new Set(['weightPricing'])),
  );
  await api.weightPolicy();
  await api.quote(input);
  expect(fetcher.mock.calls[0]![0]).toBe(
    'https://nonprod.example/v1/customer/weight-pricing-policy',
  );
  expect(fetcher.mock.calls[1]![0]).toBe(
    'https://nonprod.example/v1/customer/collection-quotes',
  );
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual(input);
  expect(fetcher.mock.calls[1]![1].headers['Idempotency-Key']).toBeUndefined();
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).not.toHaveProperty(
    'total_amount_minor',
  );
  const gated = createCustomerApi(transport, capabilityGate(new Set()));
  await expect(gated.weightPolicy()).rejects.toMatchObject({
    kind: 'backendPending',
  });
  await expect(gated.quote(input)).rejects.toMatchObject({
    kind: 'backendPending',
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test.each([409, 422, 503])(
  'quote HTTP %s remains an error without a fabricated price',
  async (status) => {
    const transport = new Transport(
      'https://nonprod.example',
      {
        accessToken: () => 'token',
        refresh: async () => {},
        clear: async () => {},
      },
      () => 'unused',
      jest.fn().mockResolvedValue({ ok: false, status }),
    );
    await expect(
      createCustomerApi(transport, () => {}).quote({
        policy_id: policy.policy_id,
        policy_revision: 1,
        items: [declarationItem(category, base, policy)!],
      }),
    ).rejects.toMatchObject({ status });
  },
);
function secure() {
  const values = new Map<string, string>();
  let sequence = 0;
  const port = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, v: string) => {
      values.set(key, v);
    }),
    remove: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  return {
    values,
    port,
    storage: privateCommandStorage(
      port,
      'pending',
      () => `version-${++sequence}`,
    ),
  };
}
test('large exact command bodies survive a new storage instance and every secure chunk is bounded', async () => {
  const s = secure(),
    body = JSON.stringify({
      items: [{ category: 'sacred', volume: 2500 }],
      payload: 'प'.repeat(4000),
    });
  await s.storage.set(body);
  const restarted = privateCommandStorage(
    s.port,
    'pending',
    () => 'new-version',
  );
  expect(await restarted.get()).toBe(body);
  expect(
    s.port.set.mock.calls.every(
      ([, v]) => new TextEncoder().encode(v).length < 2048,
    ),
  ).toBe(true);
  await restarted.remove();
  expect(s.values.size).toBe(0);
});
test('failed secure staging leaves the previous complete command readable and cannot publish a partial body', async () => {
  const s = secure();
  await s.storage.set('previous-exact-body');
  s.port.set.mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(s.storage.set('new-body'.repeat(300))).rejects.toThrow(
    'disk unavailable',
  );
  expect(await s.storage.get()).toBe('previous-exact-body');
});
test('incomplete committed secure storage fails closed instead of reconstructing another command', async () => {
  const s = secure();
  await s.storage.set('body'.repeat(300));
  const chunk = [...s.values.keys()].find((key) => key.endsWith('.1'))!;
  s.values.delete(chunk);
  await expect(s.storage.get()).rejects.toThrow('incomplete');
});
