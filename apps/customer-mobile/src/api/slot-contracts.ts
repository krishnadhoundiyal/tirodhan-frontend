import { ApiError } from './errors';

// Verified against backend main c1e2e7c: routing_orchestration/read_slots/HoldSlot.
export interface ProjectedSlot {
  slot_start: string;
  slot_end: string;
  status: 'AVAILABLE' | 'LIMITED' | 'FULL' | 'UNKNOWN';
  remaining_bookings: number;
  policy_version: number;
  generation: number;
  valid_until: string;
  admission_basis: 'PROJECTED_ALLOWANCE';
  source_version: number;
  computed_at: string;
  capacity_certified: false;
}
export interface ProjectedAvailability {
  region_id: string;
  capacity_certified: false;
  allowance_is_estimate: true;
  standard_pickup_seconds: number;
  standard_discharge_seconds: number;
  slots: ProjectedSlot[];
}
// Context is attached by the adapter, not claimed to be echoed by the server.
export interface ContextSlots extends ProjectedAvailability {
  serviceability_context_id: string;
}
export interface PhysicalLoad {
  mass_g: number;
  volume_ml: number;
}
export interface HoldSlot extends PhysicalLoad {
  client_command_id: string;
  context_id: string;
  reattempt_request_id?: string | null;
  expected_generation: number;
  slot_start: string;
  slot_end: string;
  pickup_seconds: number;
  discharge_seconds: number;
}
export interface SlotHold {
  reservation_id: string;
  admission_basis: 'PROJECTED_ALLOWANCE' | 'EXACT_CERTIFICATE';
  bookable: boolean;
  expires_at: string;
  book_by: string;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export function parseAvailability(value: unknown): ProjectedAvailability {
  if (
    !record(value) ||
    !uuid(value.region_id) ||
    value.capacity_certified !== false ||
    value.allowance_is_estimate !== true ||
    !integer(value.standard_pickup_seconds, 0, 86400) ||
    !integer(value.standard_discharge_seconds, 0, 86400) ||
    !Array.isArray(value.slots)
  )
    throw new ApiError(200, 'protocol');
  const starts = new Set<string>();
  for (const s of value.slots) {
    if (
      !record(s) ||
      !timestamp(s.slot_start) ||
      !timestamp(s.slot_end) ||
      Date.parse(s.slot_end) - Date.parse(s.slot_start) !== 1800000 ||
      (Date.parse(s.slot_start) + 19800000) % 1800000 !== 0 ||
      !['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'].includes(String(s.status)) ||
      !integer(s.remaining_bookings) ||
      !integer(s.policy_version, 0) ||
      !integer(s.generation, 1) ||
      !integer(s.source_version, 1) ||
      !timestamp(s.valid_until) ||
      !timestamp(s.computed_at) ||
      Date.parse(s.computed_at) > Date.parse(s.valid_until) ||
      s.admission_basis !== 'PROJECTED_ALLOWANCE' ||
      s.capacity_certified !== false ||
      starts.has(s.slot_start) ||
      (['AVAILABLE', 'LIMITED'].includes(String(s.status)) &&
        (s.remaining_bookings === 0 || s.policy_version === 0))
    )
      throw new ApiError(200, 'protocol');
    starts.add(s.slot_start);
  }
  return value as unknown as ProjectedAvailability;
}
export function parseHold(value: unknown, expectedId: string): SlotHold {
  if (
    !record(value) ||
    !uuid(value.reservation_id) ||
    value.reservation_id !== expectedId ||
    !['PROJECTED_ALLOWANCE', 'EXACT_CERTIFICATE'].includes(
      String(value.admission_basis),
    ) ||
    typeof value.bookable !== 'boolean' ||
    !timestamp(value.expires_at) ||
    !timestamp(value.book_by) ||
    Date.parse(value.book_by) >= Date.parse(value.expires_at)
  )
    throw new ApiError(200, 'protocol');
  return value as unknown as SlotHold;
}
export function validateHoldInput(body: HoldSlot) {
  if (
    !uuid(body.client_command_id) ||
    !uuid(body.context_id) ||
    (body.reattempt_request_id != null && !uuid(body.reattempt_request_id)) ||
    !integer(body.expected_generation, 1) ||
    !timestamp(body.slot_start) ||
    !timestamp(body.slot_end) ||
    Date.parse(body.slot_end) - Date.parse(body.slot_start) !== 1800000 ||
    !integer(body.mass_g, 1, 2147483647) ||
    !integer(body.volume_ml, 1, 2147483647) ||
    !integer(body.pickup_seconds, 0, 86400) ||
    !integer(body.discharge_seconds, 0, 86400)
  )
    throw new ApiError(422);
}
export function slotSelectable(slot: ProjectedSlot, now: number) {
  return (
    (slot.status === 'AVAILABLE' || slot.status === 'LIMITED') &&
    slot.remaining_bookings > 0 &&
    slot.generation >= 1 &&
    slot.policy_version >= 1 &&
    Date.parse(slot.computed_at) <= now &&
    Date.parse(slot.valid_until) > now &&
    Date.parse(slot.slot_start) > now
  );
}
export function holdBookable(hold: SlotHold, now: number) {
  return (
    hold.bookable &&
    Date.parse(hold.book_by) > now &&
    Date.parse(hold.expires_at) > now
  );
}
export function slotLabel(
  slot: Pick<ProjectedSlot, 'slot_start' | 'slot_end'>,
) {
  const time = (v: string) =>
    new Date(v).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
    });
  return `${new Date(slot.slot_start).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  })} · ${time(slot.slot_start)}–${time(slot.slot_end)} IST`;
}
