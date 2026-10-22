import { createApi } from '../api/client';
import { createCustomerApi } from '../api/customer-client';
import { Transport } from '../api/transport';
import { ApiError } from '../api/errors';
import {
  parseAvailability,
  slotLabel,
  slotSelectable,
  type ContextSlots,
  type SlotHold,
  type HoldSlot,
} from '../api/slot-contracts';
import type { CollectionCreate, CollectionResponse } from '../api/contracts';
import {
  BookingFlow,
  PhysicalLoadRequired,
  RecoveryRequired,
  type BookingIntent,
} from '../features/collection/bookingFlow';
import { BookingRecoveryStore } from '../features/collection/bookingRecovery';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-22T02:00:00Z');
const iso = (minutes: number) => new Date(now + minutes * 60000).toISOString();
const availability = (): ContextSlots => ({
  serviceability_context_id: id(1),
  region_id: id(2),
  capacity_certified: false,
  allowance_is_estimate: true,
  standard_pickup_seconds: 300,
  standard_discharge_seconds: 120,
  slots: [
    {
      slot_start: iso(60),
      slot_end: iso(90),
      status: 'AVAILABLE',
      remaining_bookings: 1,
      policy_version: 2,
      generation: 3,
      valid_until: iso(1),
      source_version: 4,
      computed_at: iso(0),
      admission_basis: 'PROJECTED_ALLOWANCE',
      capacity_certified: false,
    },
  ],
});
function intent(): BookingIntent {
  const slots = availability();
  const items = [
    {
      item_category_code: 'flowers',
      declared_quantity: 2,
      declared_weight_grams: 1000,
      weight_band: 'BELOW_B' as const,
      weight_kg: null,
      declared_volume_ml: 2500,
    },
  ];
  return {
    context: {
      serviceability_context_id: id(1),
      source_address_id: id(9),
      source_address_version: 1,
      status: 'SERVICEABLE',
      cell_id: null,
      failure_code: null,
      expires_at: iso(20),
      resolved_at: iso(0),
    },
    availability: slots,
    slot: slots.slots[0]!,
    items,
    quote: {
      items,
      total_weight_grams: 1000,
      total_volume_ml: 2500,
      total_amount_minor: 35000,
      minimum_amount_minor: 35000,
      maximum_amount_minor: 35000,
      currency: 'INR',
      confirmation: {
        policy_id: id(30),
        policy_revision: 1,
        quote_fingerprint: 'a'.repeat(64),
      },
      confirmation_freshness: 'CURRENT_POLICY_REVISION',
      rounding: 'HALF_UP_MINOR_UNIT',
      live_customer_holds_available: true,
      hold_blocker: null,
    },
  };
}
const held = (): SlotHold => ({
  reservation_id: id(10),
  admission_basis: 'PROJECTED_ALLOWANCE',
  bound_request_id: null,
  bookable: true,
  book_by: iso(5),
  expires_at: iso(10),
});
const booked = (body: CollectionCreate): CollectionResponse => ({
  request_id: id(20),
  client_request_id: body.client_request_id,
  status: 'PENDING_PAYMENT',
  quoted_amount_minor: 35000,
  currency: 'INR',
  payment_id: id(21),
  payment_expires_at: iso(10),
  items: body.items.map((item) => ({
    request_item_id: id(22),
    item_category_code: item.item_category_code,
    declared_quantity: item.declared_quantity ?? null,
    declared_weight_grams: item.declared_weight_grams ?? null,
    quoted_line_amount_minor: 35000,
    currency: 'INR',
    pricing_rule_version: 'server-rule',
    weight_band: item.weight_band,
    weight_kg: item.weight_kg,
    declared_volume_ml: item.declared_volume_ml,
  })),
});
function setup() {
  let raw: string | null = null;
  let owner = 'customer:1';
  let clock = now;
  const storage = {
    get: jest.fn(async () => raw),
    set: jest.fn(async (value: string) => {
      raw = value;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
  const recovery = new BookingRecoveryStore(storage);
  const holdExecute = jest.fn(async () => held());
  let bookingBody!: CollectionCreate;
  const bookingExecute = jest.fn(async () => booked(bookingBody));
  const repo = {
    holdSlot: jest.fn((_body: HoldSlot) => ({ execute: holdExecute })),
    readHold: jest.fn(async () => held()),
    createCollection: jest.fn((body: CollectionCreate) => {
      bookingBody = body;
      return { execute: bookingExecute };
    }),
  };
  const makeFlow = () => {
    let sequence = 9;
    return new BookingFlow(
      repo,
      recovery,
      owner.split(':')[0]!,
      () => owner,
      () => id(++sequence),
      () => clock,
    );
  };
  const flow = makeFlow();
  return {
    flow,
    repo,
    recovery,
    storage,
    holdExecute,
    bookingExecute,
    makeFlow,
    switchOwner: () => {
      owner = 'other:2';
    },
    changeAddress: () => {
      flow.setAddressBinding('address:2');
    },
    advance: (minutes: number) => {
      clock = now + minutes * 60000;
    },
  };
}
test.each(['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'] as const)(
  '%s retains its distinct status and only authorized states select',
  (status) => {
    const data = availability();
    data.slots[0]!.status = status;
    if (status === 'FULL' || status === 'UNKNOWN')
      data.slots[0]!.remaining_bookings = 0;
    const parsed = parseAvailability(data);
    expect(parsed.slots[0]!.status).toBe(status);
    expect(slotSelectable(parsed.slots[0]!, now)).toBe(
      status === 'AVAILABLE' || status === 'LIMITED',
    );
  },
);
test('slot presentation uses a half-hour Asia/Kolkata interval regardless of host timezone', () => {
  expect(slotLabel(availability().slots[0]!)).toMatch(/8:30.*9:00.*IST/);
});
test.each(['FULL', 'UNKNOWN'] as const)(
  '%s never submits a hold',
  async (status) => {
    const s = setup(),
      input = intent();
    input.slot.status = status;
    await expect(s.flow.submit(input)).rejects.toMatchObject({ status: 409 });
    expect(s.repo.holdSlot).not.toHaveBeenCalled();
  },
);
test('missing approved physical inputs blocks before preparing or writing any command', async () => {
  const s = setup();
  await expect(
    s.flow.submit({ ...intent(), quote: null }),
  ).rejects.toBeInstanceOf(PhysicalLoadRequired);
  expect(s.repo.holdSlot).not.toHaveBeenCalled();
  expect(s.storage.set).not.toHaveBeenCalled();
});
test.each(['context', 'expiry', 'generation'] as const)(
  'incompatible %s cannot submit',
  async (change) => {
    const s = setup(),
      input = intent();
    if (change === 'context')
      input.availability.serviceability_context_id = id(8);
    if (change === 'expiry') input.slot.valid_until = iso(-1);
    if (change === 'generation') input.slot.generation = 0;
    await expect(s.flow.submit(input)).rejects.toMatchObject({ status: 409 });
    expect(s.repo.holdSlot).not.toHaveBeenCalled();
  },
);
test('duplicate taps share one hold and booking; server durations, generation and reservation bind unchanged', async () => {
  const s = setup(),
    input = intent();
  const first = s.flow.submit(input),
    second = s.flow.submit(input);
  expect(second).toBe(first);
  const result = await first;
  expect(s.holdExecute).toHaveBeenCalledTimes(1);
  expect(s.bookingExecute).toHaveBeenCalledTimes(1);
  expect(s.repo.holdSlot).toHaveBeenCalledWith({
    client_command_id: id(10),
    context_id: id(1),
    expected_generation: 3,
    slot_start: iso(60),
    slot_end: iso(90),
    mass_g: 1000,
    volume_ml: 2500,
    pickup_seconds: 300,
    discharge_seconds: 120,
    items: input.items,
    confirmed_quote: input.quote!.confirmation,
  });
  expect(s.repo.createCollection).toHaveBeenCalledWith(
    expect.objectContaining({
      capacity_reservation_id: id(10),
      serviceability_context_id: id(1),
      slot_start: iso(60),
      slot_end: iso(90),
      items: input.items,
    }),
  );
  expect(result.status).toBe('PENDING_PAYMENT');
  expect(s.flow.getSnapshot()).toBe('complete');
  expect(await s.recovery.read('customer')).toBeNull();
});
test('lost hold response is recovered by deterministic reservation read without a second command', async () => {
  const s = setup();
  s.holdExecute.mockRejectedValueOnce(new ApiError(0, 'timeout'));
  await expect(s.flow.submit(intent())).rejects.toMatchObject({
    kind: 'timeout',
  });
  expect(s.flow.getSnapshot()).toBe('uncertainHold');
  await s.flow.submit(intent());
  expect(s.repo.readHold).toHaveBeenCalledWith(id(10));
  expect(s.repo.holdSlot).toHaveBeenCalledTimes(1);
  expect(s.holdExecute).toHaveBeenCalledTimes(1);
});
test('an acquired hold can continue after projection expiry using authoritative hold permission', async () => {
  const s = setup(),
    input = intent();
  s.repo.readHold.mockRejectedValueOnce(new ApiError(409));
  await expect(s.flow.submit(input)).rejects.toMatchObject({ status: 409 });
  expect(s.flow.getSnapshot()).toBe('held');
  input.slot.status = 'UNKNOWN';
  input.slot.valid_until = iso(-1);
  await expect(s.flow.submit(input)).resolves.toMatchObject({
    status: 'PENDING_PAYMENT',
  });
  expect(s.holdExecute).toHaveBeenCalledTimes(1);
  expect(s.repo.createCollection).toHaveBeenCalledTimes(1);
});
test('hold read 404 after ambiguity replays the original immutable command', async () => {
  const s = setup(),
    input = intent();
  s.holdExecute.mockRejectedValueOnce(new ApiError(0, 'network'));
  await expect(s.flow.submit(input)).rejects.toBeInstanceOf(ApiError);
  input.slot.generation = 99;
  input.context.serviceability_context_id = id(55);
  input.items[0]!.declared_quantity = 99;
  s.repo.readHold.mockRejectedValueOnce(new ApiError(404));
  await s.flow.submit(input);
  expect(s.repo.holdSlot).toHaveBeenCalledTimes(1);
  expect(s.holdExecute).toHaveBeenCalledTimes(2);
  expect(
    s.repo.createCollection.mock.calls[0]![0].items[0]!.declared_quantity,
  ).toBe(2);
  expect(
    s.repo.createCollection.mock.calls[0]![0].serviceability_context_id,
  ).toBe(id(1));
});
test.each([409, 422, 503])(
  'hold HTTP %s cannot fabricate a booking',
  async (status) => {
    const s = setup();
    s.holdExecute.mockRejectedValueOnce(new ApiError(status));
    await expect(s.flow.submit(intent())).rejects.toMatchObject({ status });
    expect(s.repo.createCollection).not.toHaveBeenCalled();
    expect(s.flow.getSnapshot()).toBe(status >= 500 ? 'uncertainHold' : 'idle');
  },
);
test('two clients targeting final allowance respect the authoritative loser conflict', async () => {
  const winner = setup(),
    loser = setup();
  loser.holdExecute.mockRejectedValue(new ApiError(409));
  const results = await Promise.allSettled([
    winner.flow.submit(intent()),
    loser.flow.submit(intent()),
  ]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  expect(loser.repo.createCollection).not.toHaveBeenCalled();
  // This mock proves client behavior only; PostgreSQL atomicity belongs to backend tests.
});
test.each([false, true])(
  'unbookable or expired hold blocks NEW booking (expired=%s)',
  async (expired) => {
    const s = setup();
    if (expired) s.advance(6);
    else s.repo.readHold.mockResolvedValue({ ...held(), bookable: false });
    const input = intent();
    if (expired) input.slot.valid_until = iso(20);
    await expect(s.flow.submit(input)).rejects.toMatchObject({ status: 409 });
    expect(s.repo.createCollection).not.toHaveBeenCalled();
  },
);
test.each([new ApiError(0, 'timeout'), new ApiError(500), new ApiError(503)])(
  'lost/5xx booking response retains exact replay even after hold cutoff',
  async (error) => {
    const s = setup(),
      input = intent();
    s.bookingExecute.mockRejectedValueOnce(error);
    await expect(s.flow.submit(input)).rejects.toBe(error);
    const before = JSON.stringify(s.repo.createCollection.mock.calls[0]![0]);
    s.advance(30);
    input.items[0]!.declared_quantity = 99;
    const result = await s.flow.submit(input);
    expect(result.status).toBe('PENDING_PAYMENT');
    expect(s.repo.createCollection).toHaveBeenCalledTimes(1);
    expect(s.bookingExecute).toHaveBeenCalledTimes(2);
    expect(s.repo.readHold).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s.repo.createCollection.mock.calls[0]![0])).toBe(
      before,
    );
  },
);
test('a later conflict does not discard an earlier ambiguous booking identity', async () => {
  const s = setup();
  s.bookingExecute
    .mockRejectedValueOnce(new ApiError(500))
    .mockRejectedValueOnce(new ApiError(409));
  await expect(s.flow.submit(intent())).rejects.toMatchObject({ status: 500 });
  await expect(s.flow.submit(intent())).rejects.toMatchObject({ status: 409 });
  expect(s.flow.getSnapshot()).toBe('uncertainBooking');
  await s.flow.submit(intent());
  expect(s.repo.createCollection).toHaveBeenCalledTimes(1);
});
test('malformed booking success stays ambiguous, never paid or complete', async () => {
  const s = setup();
  s.bookingExecute.mockResolvedValueOnce({
    status: 'ACCEPTED',
  } as CollectionResponse);
  await expect(s.flow.submit(intent())).rejects.toMatchObject({
    kind: 'protocol',
  });
  expect(s.flow.getSnapshot()).toBe('uncertainBooking');
});
test('restart restores exact commands and replays an uncertain booking with its original identity', async () => {
  const s = setup();
  s.bookingExecute.mockRejectedValueOnce(new ApiError(0, 'timeout'));
  await expect(s.flow.submit(intent())).rejects.toBeInstanceOf(ApiError);
  const stored = await s.recovery.read('customer');
  expect(stored).toEqual(
    expect.objectContaining({
      owner: 'customer',
      holdCommandId: id(10),
      reservationId: id(10),
      bookingCommandId: id(11),
    }),
  );
  expect(
    s.storage.set.mock.calls.every(
      ([v]) => !/address|token|latitude|longitude/.test(v),
    ),
  ).toBe(true);
  const restarted = s.makeFlow();
  await restarted.initialize();
  expect(restarted.getSnapshot()).toBe('restart');
  await expect(restarted.submit(intent())).rejects.toBeInstanceOf(
    RecoveryRequired,
  );
  await expect(restarted.recoverRestart()).resolves.toBe(id(20));
  expect(s.repo.createCollection).toHaveBeenCalledTimes(2);
  expect(s.repo.createCollection.mock.calls[0]![0]).toEqual(
    s.repo.createCollection.mock.calls[1]![0],
  );
});
test('restart may resolve a never-booked expired hold, but cannot call an unbookable hold a failed booking', async () => {
  const s = setup();
  await s.recovery.write({ owner: 'customer', holdCommandId: id(10) });
  s.advance(6);
  const restarted = s.makeFlow();
  await expect(restarted.recoverRestart()).resolves.toBeNull();
  expect(restarted.getSnapshot()).toBe('idle');
  await s.recovery.write({
    owner: 'customer',
    holdCommandId: id(10),
    bookingCommandId: id(11),
  });
  await expect(s.makeFlow().recoverRestart()).rejects.toBeInstanceOf(
    RecoveryRequired,
  );
});
test('account change prevents replay and storage from another owner is discarded', async () => {
  const s = setup();
  s.holdExecute.mockRejectedValueOnce(new ApiError(0, 'timeout'));
  await expect(s.flow.submit(intent())).rejects.toBeInstanceOf(ApiError);
  s.switchOwner();
  expect(() => s.flow.submit(intent())).toThrow(ApiError);
  await expect(s.recovery.read('other')).resolves.toBeNull();
  expect(s.holdExecute).toHaveBeenCalledTimes(1);
});
test('an account change during a hold prevents subsequent booking and late UI success', async () => {
  const s = setup();
  s.holdExecute.mockImplementationOnce(async () => {
    s.switchOwner();
    return held();
  });
  await expect(s.flow.submit(intent())).rejects.toMatchObject({ status: 401 });
  expect(s.repo.createCollection).not.toHaveBeenCalled();
});
test('address change during hold acquisition invalidates binding and preserves recovery identity', async () => {
  const s = setup();
  s.holdExecute.mockImplementationOnce(async () => {
    s.changeAddress();
    return held();
  });
  await expect(s.flow.submit(intent())).rejects.toBeInstanceOf(
    RecoveryRequired,
  );
  expect(s.repo.createCollection).not.toHaveBeenCalled();
  expect(s.flow.getSnapshot()).toBe('restart');
  expect(await s.recovery.read('customer')).toEqual(
    expect.objectContaining({
      owner: 'customer',
      holdCommandId: id(10),
      reservationId: id(10),
    }),
  );
  s.advance(6);
  await expect(s.flow.recoverRestart()).resolves.toBeNull();
  expect(s.flow.getSnapshot()).toBe('idle');
});

const ok = (body: unknown) =>
  ({ ok: true, status: 201, json: async () => body }) as Response;
function transportSetup() {
  let owner = 'a:1';
  const fetcher = jest.fn().mockResolvedValue(ok({}));
  const transport = new Transport(
    'https://nonprod.example',
    {
      accessToken: () => 'token',
      refresh: async () => {},
      clear: async () => {},
      commandOwner: () => owner,
    },
    () => id(99),
    fetcher,
  );
  return {
    fetcher,
    transport,
    api: createApi(transport),
    switchOwner: () => {
      owner = 'b:2';
    },
  };
}
test('availability adapter uses V2, attaches requested context and validates malformed successful JSON', async () => {
  const s = transportSetup();
  s.fetcher
    .mockResolvedValueOnce(ok(availability()))
    .mockResolvedValueOnce(ok({ slots: [] }));
  const api = createCustomerApi(s.transport, () => {});
  expect((await api.slots(id(1))).serviceability_context_id).toBe(id(1));
  expect(s.fetcher.mock.calls[0]![0]).toBe(
    `https://nonprod.example/v2/customer/slot-availability?serviceability_context_id=${id(1)}`,
  );
  await expect(api.slots(id(1))).rejects.toMatchObject({ kind: 'protocol' });
});
test('HTTP hold exact replay freezes the body and uses no legacy idempotency header', async () => {
  const s = transportSetup(),
    i = intent();
  s.fetcher.mockResolvedValue(ok(held()));
  const body = {
    client_command_id: id(10),
    context_id: id(1),
    expected_generation: 3,
    slot_start: i.slot.slot_start,
    slot_end: i.slot.slot_end,
    mass_g: i.quote!.total_weight_grams,
    volume_ml: i.quote!.total_volume_ml!,
    pickup_seconds: 300,
    discharge_seconds: 120,
  };
  const command = s.api.holdSlot(body);
  body.mass_g = 99;
  await command.execute();
  await command.execute();
  await s.api.readHold(id(10));
  expect(s.fetcher.mock.calls[0]![1].body).toBe(
    s.fetcher.mock.calls[1]![1].body,
  );
  expect(JSON.parse(s.fetcher.mock.calls[0]![1].body).mass_g).toBe(1000);
  expect(
    s.fetcher.mock.calls[0]![1].headers['Idempotency-Key'],
  ).toBeUndefined();
  expect(s.fetcher.mock.calls[2]![0]).toContain(
    `/v2/customer/slot-holds/${id(10)}`,
  );
});
test.each([
  {},
  { ...held(), book_by: 'bad' },
  { ...held(), reservation_id: id(77) },
])('malformed hold response is never success', async (body) => {
  const s = transportSetup();
  s.fetcher.mockResolvedValue(ok(body));
  await expect(s.api.readHold(id(10))).rejects.toMatchObject({
    kind: 'protocol',
  });
});
test('a prepared transport command cannot run under another owner', async () => {
  const s = transportSetup(),
    command = s.api.createCollection({
      client_request_id: id(1),
      serviceability_context_id: id(2),
      capacity_reservation_id: id(3),
      slot_start: iso(60),
      slot_end: iso(90),
      items: [],
    });
  s.switchOwner();
  await expect(command.execute()).rejects.toMatchObject({ status: 401 });
  expect(s.fetcher).not.toHaveBeenCalled();
});
test('401 refresh that changes owner cannot replay a command with the new customer token', async () => {
  let owner = 'a:1';
  const fetcher = jest
    .fn()
    .mockResolvedValue({ ok: false, status: 401 } as Response);
  const transport = new Transport(
    'https://nonprod.example',
    {
      accessToken: () => 'token',
      commandOwner: () => owner,
      refresh: async () => {
        owner = 'b:2';
      },
      clear: async () => {},
    },
    () => id(9),
    fetcher,
  );
  await expect(
    transport
      .command('/v1/collection-requests', { method: 'POST', body: {} })
      .execute(),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('a late response after account change cannot become a successful command result', async () => {
  const s = transportSetup();
  s.fetcher.mockImplementationOnce(async () => {
    s.switchOwner();
    return ok({});
  });
  await expect(
    s.transport
      .command('/v1/collection-requests', { method: 'POST', body: {} })
      .execute(),
  ).rejects.toMatchObject({ status: 401 });
});
test('a failed recovery-store write prevents a new hold request', async () => {
  const s = setup();
  s.storage.set.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(s.flow.submit(intent())).rejects.toThrow('storage unavailable');
  expect(s.holdExecute).not.toHaveBeenCalled();
});
test('both exact confirmed commands are durable before the first hold POST', async () => {
  const s = setup();
  s.holdExecute.mockImplementationOnce(async () => {
    const record = await s.recovery.read('customer');
    expect(record?.holdBody?.items).toEqual(intent().quote!.items);
    expect(record?.holdBody?.mass_g).toBe(1000);
    expect(record?.holdBody?.volume_ml).toBe(2500);
    expect(record?.bookingBody?.confirmed_quote).toEqual(
      record?.holdBody?.confirmed_quote,
    );
    expect(record?.bookingSubmitted).toBe(false);
    return held();
  });
  await s.flow.submit(intent());
});
test.each([false, true])(
  'restart follows a bound request without a new booking even after expiry=%s',
  async (expired) => {
    const s = setup();
    s.holdExecute.mockRejectedValueOnce(new ApiError(0, 'timeout'));
    await expect(s.flow.submit(intent())).rejects.toBeInstanceOf(ApiError);
    if (expired) s.advance(60);
    s.repo.readHold.mockResolvedValue({
      ...held(),
      bookable: false,
      bound_request_id: id(20),
    });
    const restarted = s.makeFlow();
    const first = restarted.recoverRestart(),
      duplicate = restarted.recoverRestart();
    expect(duplicate).toBe(first);
    await expect(first).resolves.toBe(id(20));
    expect(s.repo.createCollection).not.toHaveBeenCalled();
    expect((await s.recovery.read('customer'))?.requestId).toBe(id(20));
    await s.recovery.resolve('other', id(20));
    expect(await s.recovery.read('customer')).not.toBeNull();
    await s.recovery.resolve('customer', id(20));
    expect(await s.recovery.read('customer')).toBeNull();
  },
);
test('restart after lost hold plus 404 replays the original body and generation', async () => {
  const s = setup();
  s.holdExecute.mockRejectedValueOnce(new ApiError(0, 'timeout'));
  await expect(s.flow.submit(intent())).rejects.toBeInstanceOf(ApiError);
  const original = (await s.recovery.read('customer'))!.holdBody;
  s.repo.readHold.mockRejectedValueOnce(new ApiError(404));
  await expect(s.makeFlow().recoverRestart()).resolves.toBe(id(20));
  expect(s.repo.holdSlot.mock.calls[1]![0]).toEqual(original);
  expect(s.holdExecute).toHaveBeenCalledTimes(2);
});
test('restart null binding after uncertain booking retains the same identity through further 5xx and expired hold', async () => {
  const s = setup();
  s.bookingExecute
    .mockRejectedValueOnce(new ApiError(503))
    .mockRejectedValueOnce(new ApiError(500));
  await expect(s.flow.submit(intent())).rejects.toMatchObject({ status: 503 });
  const original = (await s.recovery.read('customer'))!.bookingBody;
  s.advance(60);
  s.repo.readHold.mockResolvedValue({
    ...held(),
    bookable: false,
    bound_request_id: null,
  });
  const restarted = s.makeFlow();
  await expect(restarted.recoverRestart()).rejects.toMatchObject({
    status: 500,
  });
  expect((await s.recovery.read('customer'))!.bookingBody).toEqual(original);
  await expect(restarted.recoverRestart()).resolves.toBe(id(20));
  expect(
    s.repo.createCollection.mock.calls.every(
      ([body]) => JSON.stringify(body) === JSON.stringify(original),
    ),
  ).toBe(true);
});
test('a server amount different from the reviewed confirmed quote cannot be displayed as successful booking', async () => {
  const s = setup();
  s.bookingExecute.mockResolvedValueOnce({
    ...booked({
      client_request_id: id(11),
      serviceability_context_id: id(1),
      slot_start: iso(60),
      slot_end: iso(90),
      items: intent().items,
    }),
    quoted_amount_minor: 35001,
  });
  await expect(s.flow.submit(intent())).rejects.toMatchObject({
    kind: 'protocol',
  });
  expect(s.flow.getSnapshot()).toBe('uncertainBooking');
});
test('editing after authoritative success permits an explicit next intent but never unlocks ambiguity', async () => {
  const s = setup();
  s.holdExecute.mockRejectedValueOnce(new ApiError(503));
  await expect(s.flow.submit(intent())).rejects.toMatchObject({ status: 503 });
  s.flow.startNext();
  expect(s.flow.getSnapshot()).toBe('uncertainHold');
  await s.flow.submit();
  expect(s.flow.getSnapshot()).toBe('complete');
  s.flow.startNext();
  expect(s.flow.getSnapshot()).toBe('idle');
});
