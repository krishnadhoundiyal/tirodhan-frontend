import type {
  Address,
  AddressUpdate,
  AddressWrite,
  CollectionCreate,
  CollectionResponse,
  LoginTokenResponse,
  PaymentAttempt,
  ServiceabilityContext,
  ServiceabilityInput,
} from './contracts';
import type { Transport } from './transport';
export function createApi(transport: Transport) {
  return {
    startOtp: (body: { client_request_id: string; phone: string }) =>
      transport.request<{ challenge_reference: string }>('/v1/auth/otp/start', {
        method: 'POST',
        body,
        authenticated: false,
      }),
    verifyOtp: (body: {
      client_login_id: string;
      challenge_reference: string;
      code: string;
    }) =>
      transport.request<LoginTokenResponse>('/v1/auth/otp/verify', {
        method: 'POST',
        body,
        authenticated: false,
      }),
    addresses: (signal?: AbortSignal) =>
      transport.request<Address[]>('/v1/addresses', { signal }),
    createAddress: (body: AddressWrite) =>
      transport.command<Address>('/v1/addresses', { method: 'POST', body }),
    updateAddress: (id: string, body: AddressUpdate) =>
      transport.command<Address>(`/v1/addresses/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body,
      }),
    archiveAddress: (id: string) =>
      transport.command<Address>(
        `/v1/addresses/${encodeURIComponent(id)}/archive`,
        { method: 'POST' },
      ),
    serviceability: (body: ServiceabilityInput) =>
      transport.command<ServiceabilityContext>('/v1/serviceability/contexts', {
        method: 'POST',
        body,
      }),
    readServiceability: (id: string, signal?: AbortSignal) =>
      transport.request<ServiceabilityContext>(
        `/v1/serviceability/contexts/${encodeURIComponent(id)}`,
        { signal },
      ),
    createCollection: (body: CollectionCreate) =>
      transport.command<CollectionResponse>('/v1/collection-requests', {
        method: 'POST',
        body,
      }),
    cancelCollection: (id: string) =>
      transport.command<CollectionResponse>(
        `/v1/collection-requests/${encodeURIComponent(id)}/cancel`,
        { method: 'POST' },
      ),
    paymentAttempt: (id: string) =>
      transport.command<PaymentAttempt>(
        `/v1/payments/collection-requests/${encodeURIComponent(id)}/attempts`,
        { method: 'POST' },
      ),
  };
}
