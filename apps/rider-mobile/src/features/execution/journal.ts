import type { SecureCredential } from '../../session/store';
import { ApiError } from '../../api/errors';
import type { Command, RecordState } from './contracts';
import { incidentReasons, vehicleReasons } from './contracts';
const fail = (): never => {
  throw new ApiError(0, 'protocol');
};
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(v);
export function validateCommand(value: unknown): Command {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const c = value as Record<string, unknown>;
  if (!id(c.id) || !id(c.assignmentId) || typeof c.source !== 'string')
    return fail();
  const common = ['id', 'assignmentId', 'source', 'kind'];
  let fields: string[];
  if (c.kind === 'V1_START') fields = [];
  else if (
    c.kind === 'V1_ATTEMPT' &&
    id(c.pickupId) &&
    ['COLLECTED', 'NOT_COLLECTED'].includes(String(c.outcome))
  )
    fields = ['pickupId', 'outcome'];
  else if (
    c.kind === 'V1_INCIDENT' &&
    id(c.pickupId) &&
    incidentReasons.some((r) => r === c.reason)
  )
    fields = ['pickupId', 'reason'];
  else if (id(c.routeId) && id(c.revisionId)) {
    if (c.kind === 'V2_ACK') fields = ['routeId', 'revisionId'];
    else if (
      c.kind === 'V2_ISSUE' &&
      vehicleReasons.some((r) => r === c.reason)
    )
      fields = ['routeId', 'revisionId', 'reason'];
    else if (
      c.kind === 'V2_TASK' &&
      id(c.taskId) &&
      ['START', 'DEPART', 'PICKUP'].includes(String(c.operation)) &&
      (c.operation === 'PICKUP'
        ? c.outcome === 'COLLECTED'
        : c.outcome === undefined)
    )
      fields = [
        'routeId',
        'revisionId',
        'taskId',
        'operation',
        ...(c.operation === 'PICKUP' ? ['outcome'] : []),
      ];
    else return fail();
  } else return fail();
  if (Object.keys(c).some((key) => ![...common, ...fields].includes(key)))
    return fail();
  if (
    c.kind.startsWith('V1_')
      ? !['RIDER_OFFER_ACCEPTED', 'MANAGER_ASSIGNED'].includes(c.source)
      : c.source !== 'COMMITTED_DISPATCH'
  )
    return fail();
  return JSON.parse(JSON.stringify(c)) as Command;
}
function decode(raw: string): RecordState {
  let v: RecordState;
  try {
    v = JSON.parse(raw) as RecordState;
  } catch {
    return fail();
  }
  if (
    !v ||
    v.version !== 1 ||
    !id(v.owner) ||
    !['prepared', 'confirmed', 'rejected'].includes(v.status) ||
    Object.keys(v).some(
      (k) =>
        ![
          'version',
          'owner',
          'command',
          'status',
          'receipt',
          'rejection',
        ].includes(k),
    )
  )
    return fail();
  const command = validateCommand(v.command);
  if (
    v.status === 'confirmed'
      ? !v.receipt ||
        !id(v.receipt.resourceId) ||
        typeof v.receipt.message !== 'string' ||
        v.receipt.message.length > 300 ||
        Object.keys(v.receipt).some(
          (k) => !['resourceId', 'message'].includes(k),
        )
      : v.receipt !== null
  )
    return fail();
  if (
    v.status === 'rejected'
      ? ![404, 409, 422].includes(v.rejection!)
      : v.rejection !== null
  )
    return fail();
  return { ...v, command };
}
export function createJournal(storage: SecureCredential) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => {
    const result = queue.catch(() => {}).then(work);
    queue = result;
    return result;
  };
  const read = async () => {
    const raw = await storage.get();
    return raw ? decode(raw) : null;
  };
  const write = async (record: RecordState, current: () => void) => {
    const raw = JSON.stringify(record);
    if (raw.length > 1800) throw new ApiError(0, 'configuration');
    current();
    await storage.set(raw);
    current();
  };
  return {
    load: (owner: string, current: () => void) =>
      serial(async () => {
        current();
        const record = await read();
        current();
        if (record && record.owner !== owner) {
          await storage.remove();
          current();
          return null;
        }
        return record;
      }),
    prepare: (owner: string, command: Command, current: () => void) =>
      serial(async () => {
        current();
        if (!id(owner)) return fail();
        const record = await read();
        current();
        if (record?.owner === owner) throw new ApiError(409);
        const next: RecordState = {
          version: 1,
          owner,
          command: validateCommand(command),
          status: 'prepared',
          receipt: null,
          rejection: null,
        };
        await write(next, current);
        return next;
      }),
    update: (
      owner: string,
      command: Command,
      patch: Pick<RecordState, 'status' | 'receipt' | 'rejection'>,
      current: () => void,
    ) =>
      serial(async () => {
        current();
        const record = await read();
        current();
        if (
          !record ||
          record.owner !== owner ||
          JSON.stringify(record.command) !== JSON.stringify(command)
        )
          throw new ApiError(409);
        const next = { ...record, ...patch };
        await write(decode(JSON.stringify(next)), current);
        return next;
      }),
    dismiss: (owner: string, current: () => void) =>
      serial(async () => {
        current();
        const record = await read();
        current();
        if (record?.owner !== owner || record.status === 'prepared')
          throw new ApiError(409);
        await storage.remove();
        current();
      }),
    clear: () => serial(() => storage.remove()),
  };
}
export type ExecutionJournal = ReturnType<typeof createJournal>;
export function memoryJournal() {
  let value: string | null = null;
  return createJournal({
    get: async () => value,
    set: async (raw) => {
      value = raw;
    },
    remove: async () => {
      value = null;
    },
  });
}
