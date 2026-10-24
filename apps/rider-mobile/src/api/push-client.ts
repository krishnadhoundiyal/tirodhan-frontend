import type { PushApi } from '../notifications/contracts';
import type { Transport } from './transport';
import { ApiError } from './errors';
import { object } from './parse';
export function createPushApi(transport: Transport): PushApi {
  return {
    register: async (id, platform, token) => {
      if (
        !id ||
        id.length > 200 ||
        !token ||
        token.length > 4096 ||
        !['ANDROID', 'IOS'].includes(platform)
      )
        throw new ApiError(422);
      const result = object(
        await transport.request('/v1/rider/me/push-devices', {
          method: 'POST',
          body: { client_device_id: id, platform, registration_token: token },
        }),
      );
      if (
        result.client_device_id !== id ||
        result.provider !== 'FCM' ||
        result.platform !== platform ||
        typeof result.push_registration_id !== 'string' ||
        !result.push_registration_id
      )
        throw new ApiError(200, 'protocol');
    },
    revoke: async (id) => {
      if (!id || id.length > 200) throw new ApiError(422);
      await transport.request(
        `/v1/rider/me/push-devices/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
    },
  };
}
