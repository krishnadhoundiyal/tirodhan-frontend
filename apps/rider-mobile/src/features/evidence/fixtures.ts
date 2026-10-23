import { ApiError } from '../../api/errors';
import type {
  Command,
  EvidenceApi,
  Media,
  MediaVault,
  Point,
} from './contracts';
import type { BlobUploader } from './upload';
export const fixturePoint: Point = {
  receiving_point_id: 'demo-receiving',
  official_name: 'Fixture receiving point',
  official_identifier: 'FIXTURE-POINT-01',
  latitude: 0,
  longitude: 0,
  allowed_radius_m: 100,
  version: 1,
};
export function createFieldFixtures(progress: (c: Command) => void) {
  let count = 0;
  const commands = new Map<
      string,
      { fingerprint: string; result: Awaited<ReturnType<EvidenceApi['send']>> }
    >(),
    assets = new Map<string, Media>(),
    stored = new Set<string>(),
    files = new Map<string, Uint8Array>();
  const api: EvidenceApi = {
    points: async () => [fixturePoint],
    send: async (c) => {
      const prior = commands.get(c.id),
        fingerprint = JSON.stringify(c);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ApiError(409);
        return prior.result;
      }
      const resourceId = 'fixture-resource-' + ++count;
      const result: Awaited<ReturnType<EvidenceApi['send']>> =
        c.kind === 'CAPTURE'
          ? { resourceId }
          : c.kind === 'ROUTE'
            ? { resourceId: c.context.taskId }
            : c.kind === 'UNSUCCESSFUL'
              ? { resourceId, captureId: 'fixture-capture-' + count }
              : {
                  resourceId,
                  handover: {
                    id: resourceId,
                    status: 'VALIDATED',
                    code: 'WITHIN_ALLOWED_RADIUS',
                  },
                };
      if (c.kind !== 'CAPTURE' && c.kind !== 'HANDOVER') progress(c);
      commands.set(c.id, { fingerprint, result });
      return result;
    },
    register: async (clientId, captureId, type, contentType) => {
      const old = assets.get(clientId);
      if (old) {
        if (
          old.captureId !== captureId ||
          old.type !== type ||
          old.contentType !== contentType
        )
          throw new ApiError(409);
        return old;
      }
      const asset: Media = {
        id: 'fixture-media-' + ++count,
        clientId,
        captureId,
        type,
        contentType,
        objectKey: 'media/fixture-media-' + count,
        status: 'PENDING_UPLOAD',
        size: null,
      };
      assets.set(clientId, asset);
      return asset;
    },
    authorize: async () => ({
      authorization: 'fixture-only',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
    finalize: async (id) => {
      const asset = [...assets.values()].find((a) => a.id === id);
      if (!asset) throw new ApiError(404);
      if (!stored.has(id)) throw new ApiError(409);
      const result = { ...asset, status: 'FINALIZED' as const, size: 8 };
      assets.set(asset.clientId, result);
      return result;
    },
  };
  const vault: MediaVault = {
    seal: async (_uri, type, capturedAt, current) => {
      current();
      const id = 'fixture-local-' + ++count;
      files.set(id, new Uint8Array(8));
      return {
        id,
        key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        capturedAt,
        createdAt: Date.now(),
        type,
        contentType: type === 'PHOTO' ? 'image/jpeg' : 'video/mp4',
        size: 8,
      };
    },
    read: async (local) => {
      const bytes = files.get(local.id);
      if (!bytes) throw new ApiError(0, 'configuration');
      return bytes;
    },
    remove: async (id) => {
      files.delete(id);
    },
    sweep: async (keep) => {
      for (const key of files.keys()) if (key !== keep) files.delete(key);
    },
  };
  const upload: BlobUploader = async (asset, _auth, _bytes, current) => {
    current();
    stored.add(asset.id);
  };
  return { api, vault, upload };
}
