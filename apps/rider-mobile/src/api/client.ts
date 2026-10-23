import type { Transport } from './transport';
import type { AvailabilityIntent } from './contracts';
import {
  parseAccess,
  parseLogin,
  parsePrincipal,
  parseChallenge,
  parseAvailability,
  parseOffers,
  parseAssignment,
  parseSummary,
  parseRoute,
} from './parse';

export function createAuthApi(t: Transport) {
  return {
    startOtp: async (body: { client_request_id: string; phone: string }) =>
      parseChallenge(
        await t.request('/v1/auth/otp/start', {
          method: 'POST',
          body,
          authenticated: false,
        }),
      ),
    verifyOtp: async (body: {
      client_login_id: string;
      challenge_reference: string;
      code: string;
    }) =>
      parseLogin(
        await t.request('/v1/auth/otp/verify', {
          method: 'POST',
          body,
          authenticated: false,
        }),
      ),
    refresh: async (refresh_token: string) =>
      parseAccess(
        await t.request('/v1/auth/refresh', {
          method: 'POST',
          body: { refresh_token },
          authenticated: false,
        }),
      ),
    logout: (refresh_token: string) =>
      t.request<void>('/v1/auth/logout', {
        method: 'POST',
        body: { refresh_token },
        authenticated: false,
      }),
  };
}
export function createRiderApi(t: Transport) {
  return {
    principal: async (signal?: AbortSignal) =>
      parsePrincipal(
        await t.request('/v1/auth/me', { signal, refreshOn401: false }),
      ),
    availability: async (signal?: AbortSignal) =>
      parseAvailability(
        await t.request('/v1/rider/me/availability', { signal }),
      ),
    setAvailability: async (
      intent: AvailabilityIntent,
      expected_version: number,
    ) =>
      parseAvailability(
        await t.request('/v1/rider/me/availability', {
          method: 'PUT',
          body: { intent, expected_version },
        }),
      ),
    offers: async (signal?: AbortSignal) =>
      parseOffers(await t.request('/v1/rider/me/offers', { signal })),
    accept: async (id: string) =>
      parseSummary(
        await t.request(`/v1/rider/offers/${encodeURIComponent(id)}/accept`, {
          method: 'POST',
        }),
      ),
    assignment: async (signal?: AbortSignal) =>
      parseAssignment(await t.request('/v1/rider/me/assignment', { signal })),
    route: async (signal?: AbortSignal) =>
      parseRoute(await t.request('/v2/rider/route', { signal })),
  };
}
export type RiderRepository = Omit<
  ReturnType<typeof createRiderApi>,
  'principal'
>;
