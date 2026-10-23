import type { RiderRepository } from '../api/client';
import type { Assignment, Availability, Offer, Route } from '../api/contracts';
import { ApiError } from '../api/errors';
export const fixtureOwner = 'demo-rider';
export type FixtureScenario =
  'offers' | 'active' | 'empty' | 'expired' | 'conflict' | 'network';
export const fixtureScenarios: FixtureScenario[] = [
  'offers',
  'active',
  'empty',
  'expired',
  'conflict',
  'network',
];
export function createFixtureRepository(now = () => Date.now()) {
  let scenario: FixtureScenario = 'offers';
  let accepted = false;
  let availability: Availability = {
    rider_id: fixtureOwner,
    availability_intent: 'AVAILABLE',
    work_state: 'IDLE',
    version: 1,
    updated_at: new Date(now()).toISOString(),
  };
  const timestamp = (offset: number) => new Date(now() + offset).toISOString();
  const offer = (): Offer => ({
    offer_id: 'demo-offer',
    collection_group_id: 'demo-group',
    offer_round: 1,
    status: 'OPEN',
    offered_at: timestamp(-60000),
    expires_at: timestamp(scenario === 'expired' ? -1000 : 300000),
  });
  const assignment = (): Assignment => ({
    assignment_id: 'demo-assignment',
    collection_group_id: 'demo-group',
    source: 'RIDER_OFFER_ACCEPTED',
    status: 'ACTIVE',
    assigned_at: timestamp(-60000),
    started_at: null,
    completed_at: null,
    pickups: [
      {
        pickup_execution_id: 'demo-pickup',
        request_id: 'demo-request',
        status: 'ASSIGNED',
        slot_start: timestamp(600000),
        slot_end: timestamp(2400000),
        pickup_address: 'Development fixture pickup, example location',
        pickup_latitude: 28.6,
        pickup_longitude: 77.2,
        declared_items: [
          {
            item_category_code: 'DEMO_MATERIAL',
            declared_quantity: 2,
            declared_weight_grams: 1000,
          },
        ],
      },
    ],
  });
  const route = (): Route => ({
    route_id: 'demo-route',
    vehicle_id: 'demo-vehicle',
    assignment_id: 'demo-assignment',
    revision_id: 'demo-revision',
    status: 'ACTIVE',
    tasks: [
      {
        task_id: 'demo-task',
        pickup_execution_id: 'demo-pickup',
        kind: 'PICKUP',
        state: 'PENDING',
        committed_at: null,
        receiving_point_id: null,
        planned_start: timestamp(600000),
        planned_end: timestamp(1200000),
      },
    ],
  });
  const check = () => {
    if (scenario === 'network') throw new ApiError(0, 'network');
  };
  const repository: RiderRepository = {
    availability: async () => {
      check();
      return {
        ...availability,
        work_state:
          accepted || scenario === 'active' ? 'BUSY' : availability.work_state,
      };
    },
    setAvailability: async (intent, expected_version) => {
      check();
      if (
        scenario === 'conflict' ||
        expected_version !== availability.version
      ) {
        availability = { ...availability, version: availability.version + 1 };
        throw new ApiError(409);
      }
      availability = {
        ...availability,
        availability_intent: intent,
        version: availability.version + 1,
        updated_at: timestamp(0),
      };
      return availability;
    },
    offers: async () => {
      check();
      return accepted || ['empty', 'active'].includes(scenario)
        ? []
        : [offer()];
    },
    accept: async (id) => {
      check();
      if (id !== 'demo-offer') throw new ApiError(404);
      if (scenario === 'expired' || scenario === 'conflict')
        throw new ApiError(409);
      if (!accepted && availability.availability_intent !== 'AVAILABLE')
        throw new ApiError(409);
      accepted = true;
      return { ...assignment(), rider_id: fixtureOwner };
    },
    assignment: async () => {
      check();
      return {
        assignment: accepted || scenario === 'active' ? assignment() : null,
      };
    },
    route: async () => {
      check();
      return accepted || scenario === 'active' ? route() : null;
    },
  };
  return {
    repository,
    setScenario(value: FixtureScenario) {
      scenario = value;
      accepted = false;
      availability = {
        rider_id: fixtureOwner,
        availability_intent: 'AVAILABLE',
        work_state: 'IDLE',
        version: 1,
        updated_at: timestamp(0),
      };
    },
    getScenario: () => scenario,
  };
}
