import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { createEvidenceApi, media } from '../api/evidence-client';
import type { Transport } from '../api/transport';
import {
  createBlobUploader,
  azureUploadUrl,
} from '../features/evidence/upload';
import { measuredLocation } from '../features/evidence/location';
import { nativeEvidenceStore } from '../session/evidence';
import type { Media } from '../features/evidence/contracts';
import { ApiError } from '../api/errors';
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
const asset: Media = {
  id: 'asset',
  clientId: 'client',
  captureId: 'capture',
  type: 'PHOTO',
  contentType: 'image/jpeg',
  objectKey: 'media/asset',
  status: 'PENDING_UPLOAD',
  size: null,
};
const expiresAt = () => new Date(Date.now() + 60000).toISOString();
const sas =
  'https://account.blob.core.windows.net/private/media/asset?sr=b&sp=cw&spr=https&sig=private-secret';
const wireMedia = (overrides = {}) => ({
  media_asset_id: 'asset',
  client_media_id: 'client',
  evidence_capture_id: 'capture',
  media_type: 'PHOTO',
  expected_content_type: 'image/jpeg',
  object_key: 'media/asset',
  upload_status: 'FINALIZED',
  size_bytes: 12,
  stored_content_type: 'image/jpeg',
  finalized_at: new Date().toISOString(),
  ...overrides,
});
afterEach(() => jest.restoreAllMocks());

test('authorization and finalize are bodyless and registration binds original capture, MIME and stable identity', async () => {
  const request = jest.fn(async (path: string) =>
    path.endsWith('upload-authorization')
      ? { authorization: sas, expires_at: expiresAt() }
      : wireMedia(),
  );
  const api = createEvidenceApi({ request } as unknown as Transport);
  await api.register('client', 'capture', 'PHOTO', 'image/jpeg');
  await api.authorize('asset');
  await api.finalize('asset');
  expect(request.mock.calls).toEqual([
    [
      '/v1/rider/media-assets',
      {
        method: 'POST',
        body: {
          client_media_id: 'client',
          evidence_capture_id: 'capture',
          media_type: 'PHOTO',
          expected_content_type: 'image/jpeg',
        },
      },
    ],
    ['/v1/rider/media-assets/asset/upload-authorization', { method: 'POST' }],
    ['/v1/rider/media-assets/asset/finalize', { method: 'POST' }],
  ]);
});

test('handover and capture DTOs use exact server event identity and preserve measured coordinates', async () => {
  const date = new Date().toISOString();
  const request = jest
    .fn()
    .mockResolvedValueOnce({
      handover_event_id: 'event',
      client_handover_id: 'command',
      receiving_point_id: 'point',
      status: 'REJECTED',
      validation_code: 'OUTSIDE_ALLOWED_RADIUS',
      occurred_at: date,
      evaluated_at: date,
      distance_m: 1000,
    })
    .mockResolvedValueOnce({
      evidence_capture_id: 'capture',
      client_capture_id: 'capture-client',
      target_kind: 'HANDOVER',
      target_id: 'event',
      captured_at: date,
    });
  const api = createEvidenceApi({ request } as unknown as Transport);
  expect(
    (
      await api.send({
        kind: 'HANDOVER',
        id: 'command',
        pickupId: 'pickup',
        pointId: 'point',
        location: { latitude: 12.3456, longitude: 77.1234 },
      })
    ).handover?.status,
  ).toBe('REJECTED');
  await api.send({
    kind: 'CAPTURE',
    id: 'capture-client',
    target: { kind: 'HANDOVER', id: 'event' },
    capturedAt: date,
  });
  expect(request.mock.calls).toEqual([
    [
      '/v1/rider/handovers',
      {
        method: 'POST',
        body: {
          client_handover_id: 'command',
          receiving_point_id: 'point',
          pickup_execution_ids: ['pickup'],
          observed_location: { latitude: 12.3456, longitude: 77.1234 },
        },
      },
    ],
    [
      '/v1/rider/evidence-captures',
      {
        method: 'POST',
        body: {
          client_capture_id: 'capture-client',
          target_kind: 'HANDOVER',
          target_id: 'event',
          captured_at: date,
        },
      },
    ],
  ]);
});

test('DISCHARGE DTO uses only V2 task command and does not invent a capture reference', async () => {
  const request = jest.fn().mockResolvedValue({
    resource_id: 'event',
    handover_status: 'VALIDATED',
    validation_code: 'WITHIN_ALLOWED_RADIUS',
  });
  const api = createEvidenceApi({ request } as unknown as Transport),
    date = new Date().toISOString();
  const result = await api.send({
    kind: 'DISCHARGE',
    id: 'command',
    context: {
      routeId: 'route',
      revisionId: 'revision',
      taskId: 'task',
      assignmentId: 'assignment',
      pickupId: 'pickup',
    },
    pointId: 'point',
    pickupScan: 'pickup',
    pointScan: 'physical-label',
    captureClientId: 'capture-client',
    capturedAt: date,
    location: { latitude: 12, longitude: 77 },
  });
  expect(result.captureId).toBeUndefined();
  expect(request).toHaveBeenCalledWith('/v2/rider/route-tasks', {
    method: 'POST',
    body: {
      client_command_id: 'command',
      task_id: 'task',
      revision_id: 'revision',
      operation: 'DISCHARGE',
      scanned_pickup_id: 'pickup',
      scanned_receiving_identifier: 'physical-label',
      client_capture_id: 'capture-client',
      captured_at: date,
      latitude: 12,
      longitude: 77,
    },
  });
});

test.each([
  { size_bytes: null },
  { stored_content_type: 'text/plain' },
  { object_key: 'arbitrary/path' },
  { upload_status: 'COMPLETED' },
  { size_bytes: -1 },
])(
  'malformed finalization cannot establish a finalized asset: %j',
  (fields) => {
    expect(() => media(wireMedia(fields))).toThrow(ApiError);
  },
);

test('Azure upload sends exact binary bytes, no app bearer, and rejects redirects', async () => {
  const fetcher = jest.fn().mockResolvedValue({ status: 201 }),
    bytes = new Uint8Array([1, 2, 3]);
  await createBlobUploader(fetcher)(
    asset,
    { authorization: sas, expiresAt: expiresAt() },
    bytes,
    () => {},
  );
  expect(fetcher).toHaveBeenCalledWith(
    sas,
    expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
      body: bytes,
      redirect: 'error',
      credentials: 'omit',
    }),
  );
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBeUndefined();
});

test.each([
  sas.replace('https:', 'http:'),
  sas.replace('account.blob.core.windows.net', 'evil.example'),
  sas.replace('/media/asset', '/media/other'),
  sas.replace('sp=cw', 'sp=rcwd'),
  sas.replace('spr=https', 'spr=http'),
  sas + '#private',
])('unsafe authorization is rejected without leaking URL: %s', (value) => {
  let error: unknown;
  try {
    azureUploadUrl(value, asset, expiresAt());
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect(String(error)).not.toContain('private-secret');
});

test('expired authorization requests bounded reauthorization rather than uploading expired SAS', async () => {
  const fetcher = jest.fn();
  await expect(
    createBlobUploader(fetcher)(
      asset,
      { authorization: sas, expiresAt: new Date(Date.now() - 1).toISOString() },
      new Uint8Array(1),
      () => {},
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(fetcher).not.toHaveBeenCalled();
});

test('upload errors and HTTP denials do not expose a signed URL', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error(sas))
    .mockResolvedValueOnce({ status: 403 });
  await expect(
    createBlobUploader(fetcher)(
      asset,
      { authorization: sas, expiresAt: expiresAt() },
      new Uint8Array(1),
      () => {},
    ),
  ).rejects.toMatchObject({
    kind: 'network',
    message: expect.not.stringContaining('private-secret'),
  });
  await expect(
    createBlobUploader(fetcher)(
      asset,
      { authorization: sas, expiresAt: expiresAt() },
      new Uint8Array(1),
      () => {},
    ),
  ).rejects.toMatchObject({ status: 403 });
});

test('upload deadline aborts a stalled transfer', async () => {
  const fetcher = jest.fn(
    (_url, options) =>
      new Promise<Response>((_, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      ),
  );
  await expect(
    createBlobUploader(fetcher as typeof fetch, 5)(
      asset,
      { authorization: sas, expiresAt: expiresAt() },
      new Uint8Array(1),
      () => {},
    ),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});

const position = (overrides = {}) => ({
  coords: {
    latitude: 12,
    longitude: 77,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
  mocked: false,
  ...overrides,
});
test('GPS comes from a fresh permissioned device measurement', async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue(position());
  expect(await measuredLocation(() => {})).toEqual({
    latitude: 12,
    longitude: 77,
  });
});
test.each([
  position({ mocked: true }),
  position({ timestamp: Date.now() - 60000 }),
  position({ coords: { latitude: 12, longitude: 77, accuracy: 1000 } }),
  position({ timestamp: Number.NaN }),
])('unusable GPS is never replaced with fixture coordinates: %j', (value) => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue(value);
  return expect(measuredLocation(() => {})).rejects.toBeInstanceOf(ApiError);
});

test('secure journal commits its pointer last and a failed next write preserves prior operation', async () => {
  const values = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
  await nativeEvidenceStore.clear();
  await nativeEvidenceStore.change(
    'rider',
    () => {},
    (s) => ({
      ...s,
      work: [
        {
          pickupId: 'pickup',
          assignmentId: 'assignment',
          mode: 'V1',
          pickupCapture: false,
          handover: null,
        },
      ],
    }),
  );
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('locked'));
  await expect(
    nativeEvidenceStore.change(
      'rider',
      () => {},
      (s) => ({ ...s, work: [] }),
    ),
  ).rejects.toThrow('locked');
  expect(
    (await nativeEvidenceStore.load('rider', () => {})).work[0]?.pickupId,
  ).toBe('pickup');
  await nativeEvidenceStore.clear();
  expect(values.size).toBe(0);
  const writes = jest.mocked(SecureStore.setItemAsync).mock.calls;
  expect(
    writes.every(
      ([, , options]) =>
        options?.keychainAccessible ===
        SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    ),
  ).toBe(true);
});

test('web cannot write private evidence to ordinary browser storage', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  try {
    await expect(
      nativeEvidenceStore.load('rider', () => {}),
    ).rejects.toMatchObject({ kind: 'configuration' });
  } finally {
    Object.defineProperty(Platform, 'OS', descriptor);
  }
});
