import type {
  Command,
  EvidenceApi,
  Handover,
  Media,
  Point,
} from '../features/evidence/contracts';
import { ApiError } from './errors';
import { object } from './parse';
import type { Transport } from './transport';
export const bad = (): never => {
  throw new ApiError(200, 'protocol');
};
export const id = (v: unknown): string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : bad();
const text = (v: unknown): string =>
  typeof v === 'string' && v.length > 0 && v.length <= 255 ? v : bad();
const number = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : bad();
export function handover(v: unknown, routed = false): Handover {
  const x = object(v),
    status = routed ? x.handover_status : x.status;
  if (!['VALIDATED', 'REJECTED'].includes(String(status))) return bad();
  const code = x.validation_code;
  if (
    code !==
    (status === 'VALIDATED'
      ? 'WITHIN_ALLOWED_RADIUS'
      : 'OUTSIDE_ALLOWED_RADIUS')
  )
    return bad();
  if (
    !routed &&
    (typeof x.occurred_at !== 'string' ||
      !Number.isFinite(Date.parse(x.occurred_at)) ||
      typeof x.evaluated_at !== 'string' ||
      !Number.isFinite(Date.parse(x.evaluated_at)) ||
      number(x.distance_m) < 0)
  )
    return bad();
  return {
    id: id(routed ? x.resource_id : x.handover_event_id),
    status: status as Handover['status'],
    code: code as Handover['code'],
  };
}
export function media(v: unknown): Media {
  const x = object(v);
  if (
    !['PHOTO', 'VIDEO'].includes(String(x.media_type)) ||
    !['PENDING_UPLOAD', 'FINALIZED'].includes(String(x.upload_status))
  )
    return bad();
  const size = x.size_bytes === null ? null : number(x.size_bytes);
  if (size !== null && (!Number.isSafeInteger(size) || size <= 0)) return bad();
  if (
    x.upload_status === 'FINALIZED' &&
    (size === null ||
      typeof x.finalized_at !== 'string' ||
      !Number.isFinite(Date.parse(x.finalized_at)) ||
      x.stored_content_type !== x.expected_content_type)
  )
    return bad();
  const assetId = id(x.media_asset_id);
  if (x.object_key !== `media/${assetId}`) return bad();
  return {
    id: assetId,
    clientId: id(x.client_media_id),
    captureId: id(x.evidence_capture_id),
    objectKey: x.object_key as string,
    type: x.media_type as Media['type'],
    contentType: text(x.expected_content_type),
    status: x.upload_status as Media['status'],
    size,
  };
}
export function createEvidenceApi(t: Transport): EvidenceApi {
  const post = (path: string, body?: unknown) =>
    t.request(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body }),
    });
  return {
    points: async (signal) => {
      const value = await t.request('/v1/rider/receiving-points', { signal });
      if (!Array.isArray(value)) return bad();
      return value.map((v): Point => {
        const x = object(v),
          latitude = number(x.latitude),
          longitude = number(x.longitude),
          radius = number(x.allowed_radius_m),
          version = number(x.version);
        if (
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180 ||
          radius < 0 ||
          !Number.isSafeInteger(version) ||
          version < 1
        )
          return bad();
        return {
          receiving_point_id: id(x.receiving_point_id),
          official_name: text(x.official_name),
          official_identifier:
            x.official_identifier === null ? null : text(x.official_identifier),
          latitude,
          longitude,
          allowed_radius_m: radius,
          version,
        };
      });
    },
    send: async (c: Command) => {
      if (c.kind === 'CAPTURE') {
        const x = object(
          await post('/v1/rider/evidence-captures', {
            client_capture_id: c.id,
            target_kind: c.target.kind,
            target_id: c.target.id,
            captured_at: c.capturedAt,
          }),
        );
        if (
          x.client_capture_id !== c.id ||
          x.target_kind !== c.target.kind ||
          x.target_id !== c.target.id ||
          Date.parse(String(x.captured_at)) !== Date.parse(c.capturedAt)
        )
          return bad();
        return { resourceId: id(x.evidence_capture_id) };
      }
      if (c.kind === 'HANDOVER') {
        const x = object(
          await post('/v1/rider/handovers', {
            client_handover_id: c.id,
            receiving_point_id: c.pointId,
            pickup_execution_ids: [c.pickupId],
            observed_location: c.location,
          }),
        );
        if (x.client_handover_id !== c.id || x.receiving_point_id !== c.pointId)
          return bad();
        const result = handover(x);
        return { resourceId: result.id, handover: result };
      }
      const body = {
        client_command_id: c.id,
        task_id: c.context.taskId,
        revision_id: c.context.revisionId,
        operation:
          c.kind === 'ROUTE'
            ? c.operation
            : c.kind === 'DISCHARGE'
              ? 'DISCHARGE'
              : 'PICKUP',
        ...(c.kind === 'DISCHARGE'
          ? {
              scanned_pickup_id: c.pickupScan,
              scanned_receiving_identifier: c.pointScan,
              client_capture_id: c.captureClientId,
              captured_at: c.capturedAt,
              ...c.location,
            }
          : {}),
        ...(c.kind === 'UNSUCCESSFUL'
          ? {
              outcome: 'NOT_COLLECTED',
              failed_reason: c.reason,
              client_capture_id: c.captureClientId,
              captured_at: c.capturedAt,
            }
          : {}),
      };
      const x = object(await post('/v2/rider/route-tasks', body));
      const resourceId = id(x.resource_id);
      if (c.kind === 'ROUTE' && resourceId !== c.context.taskId) return bad();
      return {
        resourceId,
        ...(c.kind === 'DISCHARGE' ? { handover: handover(x, true) } : {}),
        ...(c.kind === 'UNSUCCESSFUL'
          ? {
              captureId:
                x.evidence_capture_id === null
                  ? null
                  : id(x.evidence_capture_id),
            }
          : {}),
      };
    },
    register: async (clientId, captureId, type, contentType) => {
      const asset = media(
        await post('/v1/rider/media-assets', {
          client_media_id: clientId,
          evidence_capture_id: captureId,
          media_type: type,
          expected_content_type: contentType,
        }),
      );
      if (
        asset.clientId !== clientId ||
        asset.captureId !== captureId ||
        asset.type !== type ||
        asset.contentType !== contentType
      )
        return bad();
      return asset;
    },
    authorize: async (mediaId) => {
      const x = object(
        await post(
          `/v1/rider/media-assets/${encodeURIComponent(mediaId)}/upload-authorization`,
        ),
      );
      if (
        typeof x.authorization !== 'string' ||
        x.authorization.length > 8192 ||
        !(
          x.expires_at === null ||
          (typeof x.expires_at === 'string' &&
            Number.isFinite(Date.parse(x.expires_at)))
        )
      )
        return bad();
      return {
        authorization: x.authorization,
        expiresAt: x.expires_at as string | null,
      };
    },
    finalize: async (mediaId) => {
      const asset = media(
        await post(
          `/v1/rider/media-assets/${encodeURIComponent(mediaId)}/finalize`,
        ),
      );
      if (asset.id !== mediaId || asset.status !== 'FINALIZED') return bad();
      return asset;
    },
  };
}
