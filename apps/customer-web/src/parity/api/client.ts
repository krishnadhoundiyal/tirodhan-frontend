import type {
  Address,
  AddressUpdate,
  AddressWrite,
  CollectionCreate,
  CollectionResponse,
  PaymentAttempt,
  ServiceabilityContext,
  ServiceabilityInput,
} from './contracts';
import type { Transport } from './transport';
import { parseHold, validateHoldInput, type HoldSlot } from './slot-contracts';
export function createApi(transport: Transport) {
  return {
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
    holdSlot: (body: HoldSlot) => {
      validateHoldInput(body);
      const id = body.client_command_id;
      const command = transport.command<unknown>('/v2/customer/slot-holds', {
        method: 'POST',
        body,
      });
      return {
        execute: async (signal?: AbortSignal) =>
          parseHold(await command.execute(signal), id),
      };
    },
    readHold: async (id: string, signal?: AbortSignal) =>
      parseHold(
        await transport.request<unknown>(
          `/v2/customer/slot-holds/${encodeURIComponent(id)}`,
          { signal },
        ),
        id,
      ),
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
