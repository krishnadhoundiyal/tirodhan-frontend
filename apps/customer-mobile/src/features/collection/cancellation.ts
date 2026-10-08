import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CancellationCapability } from '../../api/customer-contracts';
import type { CollectionResponse } from '../../api/contracts';
import type { PreparedCommand } from '../../api/transport';
import { ApiError } from '../../api/errors';
import { repositories } from '../../lib/repositories';
import { useCustomerOwner } from './queries';
export function cancellationMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return error.code === 'PLANNING_STARTED' ||
      error.code === 'PLANNING_CUTOFF_REACHED'
      ? 'This pickup can no longer be cancelled because planning has already started.'
      : 'This pickup changed before cancellation could finish. Refresh its details to see whether cancellation is still available.';
  if (
    error instanceof ApiError &&
    ['network', 'timeout', 'protocol'].includes(error.kind)
  )
    return 'We couldn’t confirm cancellation. The request may have completed. Retry this cancellation or refresh the pickup before making another request.';
  return null;
}
export function ambiguousCancellation(error: unknown) {
  return (
    error instanceof ApiError &&
    ['network', 'timeout', 'protocol'].includes(error.kind)
  );
}
export async function invalidateCollection(
  queryClient: ReturnType<typeof useQueryClient>,
  owner: string,
  id: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['collection', owner, id] }),
    queryClient.invalidateQueries({ queryKey: ['collections', owner] }),
    queryClient.invalidateQueries({ queryKey: ['recommendations', owner] }),
    queryClient.invalidateQueries({ queryKey: ['payment', owner, id] }),
    queryClient.invalidateQueries({ queryKey: ['refunds', owner, id] }),
  ]);
}
export function useCancellation(
  id: string,
  capability: CancellationCapability,
) {
  const owner = useCustomerOwner(),
    queryClient = useQueryClient();
  const prepared = useRef<PreparedCommand<CollectionResponse> | null>(null);
  return useMutation({
    mutationKey: ['cancelCollection', owner, id],
    mutationFn: async () => {
      // Called only from the destructive confirmation. One user intent, one command, no refund call.
      prepared.current ??= repositories.cancel(id, capability);
      const result = await prepared.current.execute();
      if (result.status !== 'CANCELLED') throw new ApiError(200, 'protocol');
      return result;
    },
    onSuccess: () => invalidateCollection(queryClient, owner, id),
    onError: (error) => {
      if (error instanceof ApiError && [403, 404, 409].includes(error.status))
        void invalidateCollection(queryClient, owner, id);
    },
    retry: false,
  });
}
