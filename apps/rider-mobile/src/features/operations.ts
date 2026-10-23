import type { QueryClient } from '@tanstack/react-query';
import type { RiderRepository } from '../api/client';
import type {
  Availability,
  AvailabilityIntent,
  Offer,
  AssignmentEnvelope,
  Route,
} from '../api/contracts';
import { ApiError } from '../api/errors';
export type Resource = 'availability' | 'offers' | 'assignment' | 'route';
export type ResourceData = {
  availability: Availability;
  offers: Offer[];
  assignment: AssignmentEnvelope;
  route: Route | null;
};
export const resources: Resource[] = [
  'availability',
  'offers',
  'assignment',
  'route',
];
export const offerActionable = (offer: Offer, now = Date.now()) =>
  offer.status === 'OPEN' && Date.parse(offer.expires_at) > now;
export function createOperations(
  repository: RiderRepository,
  client: QueryClient,
  scope: {
    key: readonly unknown[];
    owner: string;
    current(): boolean;
    onForbidden(): Promise<void>;
  },
  now = () => Date.now(),
) {
  let availabilityFlight: Promise<Availability> | null = null;
  let acceptFlight: Promise<void> | null = null;
  const assertCurrent = () => {
    if (!scope.current()) throw new ApiError(0, 'cancelled');
  };
  const guarded = async <T>(read: () => Promise<T>): Promise<T> => {
    assertCurrent();
    try {
      const result = await read();
      assertCurrent();
      return result;
    } catch (error) {
      assertCurrent();
      if (error instanceof ApiError && error.status === 403)
        await scope.onForbidden();
      throw error;
    }
  };
  const key = (resource: Resource) => [...scope.key, resource];
  const query = <K extends Resource>(resource: K) => ({
    queryKey: key(resource),
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<ResourceData[K]> =>
      guarded<ResourceData[K]>(async () => {
        const result = await repository[resource](signal);
        if (
          resource === 'availability' &&
          (result as Availability).rider_id !== scope.owner
        )
          throw new ApiError(200, 'protocol');
        return result as ResourceData[K];
      }),
    staleTime: 0,
  });
  const refresh = async () => {
    assertCurrent();
    await client.cancelQueries({ queryKey: scope.key });
    assertCurrent();
    await Promise.allSettled(
      resources.map((resource) => client.fetchQuery(query(resource))),
    );
  };
  return {
    key,
    query,
    refresh,
    setAvailability(
      intent: AvailabilityIntent,
      expectedVersion: number,
    ): Promise<Availability> {
      if (availabilityFlight) return availabilityFlight;
      const operation = (async () => {
        assertCurrent();
        const current = client.getQueryData<Availability>(key('availability'));
        if (
          !current ||
          current.version !== expectedVersion ||
          !Number.isSafeInteger(expectedVersion) ||
          expectedVersion < 1 ||
          !['AVAILABLE', 'OFFLINE'].includes(intent)
        )
          throw new ApiError(409);
        try {
          const result = await guarded(() =>
            repository.setAvailability(intent, expectedVersion),
          );
          if (
            result.rider_id !== scope.owner ||
            result.version <= expectedVersion
          )
            throw new ApiError(200, 'protocol');
          return result;
        } finally {
          if (scope.current()) await refresh();
        }
      })();
      availabilityFlight = operation;
      void operation.then(
        () => {
          if (availabilityFlight === operation) availabilityFlight = null;
        },
        () => {
          if (availabilityFlight === operation) availabilityFlight = null;
        },
      );
      return operation;
    },
    accept(id: string): Promise<void> {
      if (acceptFlight) return acceptFlight;
      const operation = (async () => {
        assertCurrent();
        try {
          const offer = client
            .getQueryData<Offer[]>(key('offers'))
            ?.find((value) => value.offer_id === id);
          if (!offer || !offerActionable(offer, now())) throw new ApiError(409);
          const summary = await guarded(() => repository.accept(id));
          if (summary.rider_id !== scope.owner)
            throw new ApiError(200, 'protocol');
          // This acknowledgement may be historical. Only the subsequent assignment GET is displayed.
        } finally {
          if (scope.current()) await refresh();
        }
      })();
      acceptFlight = operation;
      void operation.then(
        () => {
          if (acceptFlight === operation) acceptFlight = null;
        },
        () => {
          if (acceptFlight === operation) acceptFlight = null;
        },
      );
      return operation;
    },
  };
}
export type Operations = ReturnType<typeof createOperations>;
