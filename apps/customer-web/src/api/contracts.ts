export class CustomerError extends Error {
  constructor(
    public readonly kind:
      | 'invalid'
      | 'unavailable'
      | 'cancelled'
      | 'unauthorized'
      | 'forbidden'
      | 'notFound'
      | 'conflict'
      | 'input'
      | 'rateLimit',
  ) {
    super(
      {
        invalid:
          'The service response could not be verified. Please reload before continuing.',
        unavailable:
          'The service is unavailable. Please try again when you are ready.',
        cancelled: 'This request is no longer current.',
        unauthorized: 'Please sign in again.',
        forbidden: 'Customer access is unavailable for this action.',
        notFound: 'This address or check is no longer available.',
        conflict:
          'The saved information or command state changed. Reload and review before making a new change.',
        input: 'Please review the information you entered.',
        rateLimit: 'Please wait before trying again.',
      }[kind],
    );
  }
}
export function record(
  v: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw new CustomerError('invalid');
  return v as Record<string, unknown>;
}
export function text(v: unknown, max = 2000): string {
  if (typeof v !== 'string' || !v.length || v.length > max)
    throw new CustomerError('invalid');
  return v;
}
export function uuid(v: unknown): string {
  const s = text(v, 36);
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s))
    throw new CustomerError('invalid');
  return s;
}
export function positive(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1)
    throw new CustomerError('invalid');
  return v;
}
export function timestamp(v: unknown): string {
  const s = text(v, 80);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s)))
    throw new CustomerError('invalid');
  return s;
}
export interface Location {
  latitude: number;
  longitude: number;
}
export interface AddressWrite {
  address: string;
  label: string | null;
  location: Location | null;
  is_default: boolean;
}
export interface Address extends AddressWrite {
  address_id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}
export function addressWrite(v: unknown): AddressWrite {
  const r = record(v, ['address', 'label', 'location', 'is_default']);
  let location: Location | null = null;
  if (r.location !== null) {
    const l = record(r.location, ['latitude', 'longitude']);
    if (
      typeof l.latitude !== 'number' ||
      !Number.isFinite(l.latitude) ||
      Math.abs(l.latitude) > 90 ||
      typeof l.longitude !== 'number' ||
      !Number.isFinite(l.longitude) ||
      Math.abs(l.longitude) > 180
    )
      throw new CustomerError('invalid');
    location = { latitude: l.latitude, longitude: l.longitude };
  }
  if (typeof r.is_default !== 'boolean') throw new CustomerError('invalid');
  return {
    address: text(r.address),
    label: r.label === null ? null : text(r.label, 80),
    location,
    is_default: r.is_default,
  };
}
export function address(v: unknown): Address {
  const r = record(v, [
    'address_id',
    'address',
    'label',
    'location',
    'is_default',
    'status',
    'version',
  ]);
  if (r.status !== 'ACTIVE' && r.status !== 'ARCHIVED')
    throw new CustomerError('invalid');
  return {
    ...addressWrite({
      address: r.address,
      label: r.label,
      location: r.location,
      is_default: r.is_default,
    }),
    address_id: uuid(r.address_id),
    status: r.status,
    version: positive(r.version),
  };
}
export function addresses(v: unknown): Address[] {
  if (!Array.isArray(v) || v.length > 1000) throw new CustomerError('invalid');
  const result = v.map(address);
  if (
    new Set(result.map((a) => a.address_id)).size !== result.length ||
    result.some((a) => a.status !== 'ACTIVE')
  )
    throw new CustomerError('invalid');
  return result;
}
export interface Principal {
  user_id: string;
  roles: string[];
}
export function principal(v: unknown): Principal {
  const r = record(v, ['user_id', 'roles']);
  if (
    !Array.isArray(r.roles) ||
    r.roles.some(
      (x) =>
        typeof x !== 'string' || !['CUSTOMER', 'RIDER', 'MANAGER'].includes(x),
    ) ||
    new Set(r.roles).size !== r.roles.length
  )
    throw new CustomerError('invalid');
  return { user_id: uuid(r.user_id), roles: [...r.roles] };
}
export interface Grant {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}
export function grant(v: unknown): Grant {
  const r = record(v, ['access_token', 'token_type', 'expires_in', 'user_id']);
  const token = text(r.access_token, 16000);
  if (r.token_type !== 'bearer' || /\s/.test(token))
    throw new CustomerError('invalid');
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: positive(r.expires_in),
    user_id: uuid(r.user_id),
  };
}
export interface Context {
  serviceability_context_id: string;
  source_address_id: string | null;
  source_address_version: number | null;
  status: 'PENDING' | 'SERVICEABLE' | 'UNSERVICEABLE' | 'TECHNICAL_FAILURE';
  cell_id: string | null;
  failure_code: string | null;
  expires_at: string;
  resolved_at: string | null;
}
export function context(v: unknown): Context {
  const r = record(v, [
    'serviceability_context_id',
    'source_address_id',
    'source_address_version',
    'status',
    'cell_id',
    'failure_code',
    'expires_at',
    'resolved_at',
  ]);
  if (
    !['PENDING', 'SERVICEABLE', 'UNSERVICEABLE', 'TECHNICAL_FAILURE'].includes(
      r.status as string,
    )
  )
    throw new CustomerError('invalid');
  const c: Context = {
    serviceability_context_id: uuid(r.serviceability_context_id),
    source_address_id:
      r.source_address_id === null ? null : uuid(r.source_address_id),
    source_address_version:
      r.source_address_version === null
        ? null
        : positive(r.source_address_version),
    status: r.status as Context['status'],
    cell_id: r.cell_id === null ? null : text(r.cell_id, 200),
    failure_code: r.failure_code === null ? null : text(r.failure_code, 200),
    expires_at: timestamp(r.expires_at),
    resolved_at: r.resolved_at === null ? null : timestamp(r.resolved_at),
  };
  if (
    (c.source_address_id === null) !== (c.source_address_version === null) ||
    (c.status === 'PENDING' &&
      (c.resolved_at !== null ||
        c.cell_id !== null ||
        c.failure_code !== null)) ||
    (c.status !== 'PENDING' && c.resolved_at === null) ||
    (c.status === 'SERVICEABLE' && !c.cell_id) ||
    (c.status === 'TECHNICAL_FAILURE' && !c.failure_code)
  )
    throw new CustomerError('invalid');
  return c;
}
export function serviceState(
  c: Context | undefined,
  a: Address | undefined,
  now: number,
) {
  if (
    !c ||
    !a ||
    a.status !== 'ACTIVE' ||
    c.source_address_id !== a.address_id ||
    c.source_address_version !== a.version
  )
    return 'changed';
  return Date.parse(c.expires_at) <= now ? 'expired' : c.status;
}
export function safeMessage(error: unknown) {
  return error instanceof CustomerError
    ? error.message
    : new CustomerError('unavailable').message;
}
