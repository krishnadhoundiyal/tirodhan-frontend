import type { SecureCredential } from '../../session/store';
import { ApiError } from '../../api/errors';
import { id, bad } from '../../api/evidence-client';
import { object } from '../../api/parse';
import type {
  Command,
  EvidenceState,
  Handover,
  Media,
  Operation,
  SealedMedia,
  Work,
} from './contracts';
const only = (v: unknown, fields: string[]) => {
  const x = object(v);
  if (Object.keys(x).some((k) => !fields.includes(k))) bad();
  return x;
};
const choice = <T extends string>(v: unknown, values: readonly T[]): T =>
  values.includes(v as T) ? (v as T) : bad();
const date = (v: unknown): string =>
  typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
    ? v
    : bad();
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : bad());
const num = (v: unknown, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : bad();
function readHandover(v: unknown): Handover | null {
  if (v === null) return null;
  const x = only(v, ['id', 'status', 'code']);
  const status = choice(x.status, ['VALIDATED', 'REJECTED']);
  if (
    x.code !==
    (status === 'VALIDATED'
      ? 'WITHIN_ALLOWED_RADIUS'
      : 'OUTSIDE_ALLOWED_RADIUS')
  )
    return bad();
  return { id: id(x.id), status, code: x.code as Handover['code'] };
}
function readLocal(v: unknown): SealedMedia | null {
  if (v === null) return null;
  const x = only(v, [
    'id',
    'key',
    'capturedAt',
    'createdAt',
    'size',
    'type',
    'contentType',
  ]);
  if (typeof x.key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(x.key))
    return bad();
  const type = choice(x.type, ['PHOTO', 'VIDEO']);
  const contentType = choice(x.contentType, [
    'image/jpeg',
    'video/mp4',
    'video/quicktime',
  ]);
  if ((type === 'PHOTO') !== (contentType === 'image/jpeg')) return bad();
  const size = num(x.size, 20 * 1024 * 1024),
    createdAt = num(x.createdAt, Number.MAX_SAFE_INTEGER);
  if (size <= 0 || !Number.isSafeInteger(size) || createdAt <= 0) return bad();
  return {
    id: id(x.id),
    key: x.key,
    capturedAt: date(x.capturedAt),
    createdAt,
    size,
    type,
    contentType,
  };
}
function readMedia(v: unknown): Media | null {
  if (v === null) return null;
  const x = only(v, [
    'id',
    'captureId',
    'clientId',
    'type',
    'contentType',
    'objectKey',
    'status',
    'size',
  ]);
  const assetId = id(x.id);
  if (x.objectKey !== `media/${assetId}`) return bad();
  const contentType = choice(x.contentType, [
    'image/jpeg',
    'video/mp4',
    'video/quicktime',
  ]);
  const type = choice(x.type, ['PHOTO', 'VIDEO']);
  if ((type === 'PHOTO') !== (contentType === 'image/jpeg')) return bad();
  const status = choice(x.status, ['PENDING_UPLOAD', 'FINALIZED']);
  const size = x.size === null ? null : num(x.size, Number.MAX_SAFE_INTEGER);
  if (size !== null && (size <= 0 || !Number.isSafeInteger(size))) return bad();
  if (status === 'FINALIZED' && size === null) return bad();
  return {
    id: assetId,
    captureId: id(x.captureId),
    clientId: id(x.clientId),
    type,
    contentType,
    objectKey: x.objectKey as string,
    status,
    size,
  };
}
export function readCommand(v: unknown): Command {
  const x = object(v),
    kind = choice(x.kind, [
      'CAPTURE',
      'HANDOVER',
      'ROUTE',
      'DISCHARGE',
      'UNSUCCESSFUL',
    ]),
    commandId = id(x.id);
  if (kind === 'CAPTURE') {
    only(x, ['kind', 'id', 'target', 'capturedAt']);
    const t = only(x.target, ['kind', 'id']);
    return {
      kind,
      id: commandId,
      target: { kind: choice(t.kind, ['PICKUP', 'HANDOVER']), id: id(t.id) },
      capturedAt: date(x.capturedAt),
    };
  }
  const location = () => {
    const p = only(x.location, ['latitude', 'longitude']);
    return { latitude: num(p.latitude, 90), longitude: num(p.longitude, 180) };
  };
  if (kind === 'HANDOVER') {
    only(x, ['kind', 'id', 'pickupId', 'pointId', 'location']);
    return {
      kind,
      id: commandId,
      pickupId: id(x.pickupId),
      pointId: id(x.pointId),
      location: location(),
    };
  }
  const c = only(x.context, [
    'routeId',
    'revisionId',
    'taskId',
    'assignmentId',
    'pickupId',
  ]);
  const context = {
    routeId: id(c.routeId),
    revisionId: id(c.revisionId),
    taskId: id(c.taskId),
    assignmentId: id(c.assignmentId),
    pickupId: id(c.pickupId),
  };
  if (kind === 'ROUTE') {
    only(x, ['kind', 'id', 'context', 'operation']);
    return {
      kind,
      id: commandId,
      context,
      operation: choice(x.operation, ['START', 'DEPART']),
    };
  }
  if (kind === 'UNSUCCESSFUL') {
    only(x, [
      'kind',
      'id',
      'context',
      'reason',
      'captureClientId',
      'capturedAt',
    ]);
    return {
      kind,
      id: commandId,
      context,
      reason: choice(x.reason, [
        'CUSTOMER_UNAVAILABLE',
        'UNCONTACTABLE',
        'ACCESS_BLOCKED',
      ]),
      captureClientId: id(x.captureClientId),
      capturedAt: date(x.capturedAt),
    };
  }
  only(x, [
    'kind',
    'id',
    'context',
    'pointId',
    'pickupScan',
    'pointScan',
    'captureClientId',
    'capturedAt',
    'location',
  ]);
  if (
    x.pickupScan !== context.pickupId ||
    typeof x.pointScan !== 'string' ||
    !x.pointScan.trim() ||
    x.pointScan.length > 200
  )
    return bad();
  return {
    kind,
    id: commandId,
    context,
    pointId: id(x.pointId),
    pickupScan: context.pickupId,
    pointScan: x.pointScan,
    captureClientId: id(x.captureClientId),
    capturedAt: date(x.capturedAt),
    location: location(),
  };
}
export function readState(v: unknown): EvidenceState {
  const x = only(v, ['version', 'owner', 'work', 'operation']);
  if (x.version !== 1 || !Array.isArray(x.work) || x.work.length > 64)
    return bad();
  const work = x.work.map((v): Work => {
    const w = only(v, [
      'pickupId',
      'assignmentId',
      'mode',
      'pickupCapture',
      'handover',
    ]);
    return {
      pickupId: id(w.pickupId),
      assignmentId: id(w.assignmentId),
      mode: choice(w.mode, ['V1', 'V2']),
      pickupCapture: bool(w.pickupCapture),
      handover: readHandover(w.handover),
    };
  });
  if (new Set(work.map((w) => w.pickupId)).size !== work.length) return bad();
  let operation: Operation | null = null;
  if (x.operation !== null) {
    const p = only(x.operation, [
      'command',
      'local',
      'captureClientId',
      'mediaClientId',
      'handover',
      'captureId',
      'media',
      'stage',
    ]);
    operation = {
      command: readCommand(p.command),
      local: readLocal(p.local),
      captureClientId: id(p.captureClientId),
      mediaClientId: id(p.mediaClientId),
      handover: readHandover(p.handover),
      captureId: p.captureId === null ? null : id(p.captureId),
      media: readMedia(p.media),
      stage: choice(p.stage, [
        'PREPARED',
        'CAPTURE',
        'MEDIA',
        'UPLOADING',
        'FINALIZE',
        'FINALIZED',
        'GAP',
        'ACKNOWLEDGED',
        'REJECTED',
      ]),
    };
    if (
      operation.media &&
      (operation.media.captureId !== operation.captureId ||
        operation.media.clientId !== operation.mediaClientId)
    )
      return bad();
    if (
      operation.local &&
      operation.media &&
      (operation.local.type !== operation.media.type ||
        operation.local.contentType !== operation.media.contentType)
    )
      return bad();
    if (
      'capturedAt' in operation.command &&
      operation.local &&
      operation.command.capturedAt !== operation.local.capturedAt
    )
      return bad();
    const o = operation,
      c = o.command;
    if (c.kind === 'CAPTURE' && o.captureClientId !== c.id) return bad();
    if ('captureClientId' in c && o.captureClientId !== c.captureClientId)
      return bad();
    if (o.local && c.kind !== 'CAPTURE' && o.local.type !== 'PHOTO')
      return bad();
    if (o.handover && !['HANDOVER', 'DISCHARGE'].includes(c.kind)) return bad();
    if (o.stage === 'PREPARED' && (o.handover || o.captureId || o.media))
      return bad();
    if (
      o.stage === 'CAPTURE' &&
      (c.kind !== 'HANDOVER' || !o.handover || o.captureId || o.media)
    )
      return bad();
    if (
      ['MEDIA', 'UPLOADING', 'FINALIZE', 'FINALIZED'].includes(o.stage) &&
      !o.captureId
    )
      return bad();
    if (['UPLOADING', 'FINALIZE', 'FINALIZED'].includes(o.stage) && !o.media)
      return bad();
    if (o.stage === 'FINALIZED' && o.media?.status !== 'FINALIZED')
      return bad();
    if (o.stage === 'ACKNOWLEDGED' && c.kind !== 'ROUTE') return bad();
    if (c.kind === 'DISCHARGE' && (o.captureId || o.media)) return bad();
  }
  return { version: 1, owner: id(x.owner), work, operation };
}
export function createEvidenceStore(storage: SecureCredential) {
  let writes: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>) => {
    const task = writes.catch(() => {}).then(f);
    writes = task;
    return task;
  };
  const read = async (owner: string, current: () => void) => {
    current();
    const raw = await storage.get();
    current();
    let state: EvidenceState;
    try {
      state = raw
        ? readState(JSON.parse(raw))
        : { version: 1, owner, work: [], operation: null };
    } catch {
      throw new ApiError(0, 'configuration');
    }
    if (state.owner !== owner) {
      await storage.remove();
      current();
      return { version: 1 as const, owner, work: [], operation: null };
    }
    return state;
  };
  return {
    load: (owner: string, current: () => void) =>
      serial(() => read(owner, current)),
    change: (
      owner: string,
      current: () => void,
      update: (s: EvidenceState) => EvidenceState,
    ) =>
      serial(async () => {
        const state = readState(update(await read(owner, current)));
        if (state.owner !== owner) throw new ApiError(403);
        current();
        const raw = JSON.stringify(state).replace(
          /[\u007f-\uffff]/g,
          (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
        );
        if (raw.length > 24000) throw new ApiError(0, 'configuration');
        await storage.set(raw);
        current();
        return state;
      }),
    clear: () => serial(() => storage.remove()),
  };
}
export type EvidenceStore = ReturnType<typeof createEvidenceStore>;
export function memoryEvidenceStore() {
  let raw: string | null = null;
  return createEvidenceStore({
    get: async () => raw,
    set: async (v) => {
      raw = v;
    },
    remove: async () => {
      raw = null;
    },
  });
}
