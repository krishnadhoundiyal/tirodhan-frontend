import type { RiderRepository } from '../api/client';
import type { Assignment, Availability, Offer, Route } from '../api/contracts';
import { ApiError } from '../api/errors';
import type { Command } from './execution/contracts';
import { parseExecutionReceipt } from '../api/execution-client';
import type { Command as FieldCommand } from './evidence/contracts';
export const fixtureOwner = 'demo-rider';
export type FixtureScenario =
  | 'offers'
  | 'active'
  | 'empty'
  | 'expired'
  | 'conflict'
  | 'network'
  | 'execution-v1'
  | 'execution-v2'
  | 'execution-recovery';
export const fixtureScenarios: FixtureScenario[] = [
  'offers',
  'active',
  'empty',
  'expired',
  'conflict',
  'network',
  'execution-v1',
  'execution-v2',
  'execution-recovery',
];
export function createFixtureRepository(now = () => Date.now()) {
  let scenario: FixtureScenario = 'offers';
  let accepted = false;
  let started = false,
    collected = false,
    taskStarted = false,
    departed = false,
    recovery = false;
  let attempts = 0;
  let dischargeStarted = false,
    dischargeDeparted = false,
    discharged = false,
    failed = false;
  const receipts = new Map<string, { fingerprint: string; value: unknown }>();
  const isExecution = () => scenario.startsWith('execution-');
  const isV2 = () =>
    scenario === 'execution-v2' || scenario === 'execution-recovery';
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
    source: isV2() ? 'COMMITTED_DISPATCH' : 'RIDER_OFFER_ACCEPTED',
    status: 'ACTIVE',
    assigned_at: timestamp(-60000),
    started_at: started || isV2() ? timestamp(-1000) : null,
    completed_at: null,
    pickups: [
      {
        pickup_execution_id: 'demo-pickup',
        request_id: 'demo-request',
        status: collected ? 'COLLECTED' : 'ASSIGNED',
        slot_start: timestamp(isExecution() ? -600000 : 600000),
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
    status:
      recovery || scenario === 'execution-recovery'
        ? 'RECOVERY_REQUIRED'
        : 'ACTIVE',
    tasks: [
      {
        task_id: 'demo-task',
        pickup_execution_id: 'demo-pickup',
        kind: 'PICKUP',
        state: collected ? 'COMPLETED' : taskStarted ? 'STARTED' : 'PENDING',
        committed_at: departed || taskStarted ? timestamp(-1000) : null,
        receiving_point_id: null,
        planned_start: timestamp(600000),
        planned_end: timestamp(1200000),
      },
    ],
  });
  const check = () => {
    if (scenario === 'network') throw new ApiError(0, 'network');
  };
  const currentRoute = () => {
    const r = route();
    if (isV2())
      r.tasks.push({
        ...r.tasks[0]!,
        task_id: 'demo-discharge',
        kind: 'DISCHARGE',
        state: discharged
          ? 'COMPLETED'
          : dischargeStarted
            ? 'STARTED'
            : 'PENDING',
        committed_at:
          dischargeDeparted || dischargeStarted ? timestamp(-1000) : null,
        receiving_point_id: 'demo-receiving',
      });
    return r;
  };
  const repository: RiderRepository = {
    availability: async () => {
      check();
      return {
        ...availability,
        work_state: isExecution()
          ? discharged || failed || (!isV2() && collected)
            ? 'IDLE'
            : isV2() || started
              ? 'BUSY'
              : 'RESERVED'
          : accepted || scenario === 'active'
            ? 'BUSY'
            : availability.work_state,
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
        assignment:
          !discharged &&
          !failed &&
          (accepted || scenario === 'active' || isExecution()) &&
          !(scenario === 'execution-v1' && collected)
            ? assignment()
            : null,
      };
    },
    route: async () => {
      check();
      return scenario === 'execution-v1' || discharged || failed
        ? null
        : accepted || scenario === 'active' || isV2()
          ? currentRoute()
          : null;
    },
  };
  return {
    repository,
    fieldProgress(command: FieldCommand) {
      check();
      if (!isV2() || command.kind === 'HANDOVER' || command.kind === 'CAPTURE')
        throw new ApiError(409);
      if (command.kind === 'ROUTE') {
        if (command.operation === 'START') dischargeStarted = true;
        else dischargeDeparted = true;
      }
      if (command.kind === 'DISCHARGE') discharged = true;
      if (command.kind === 'UNSUCCESSFUL') failed = true;
    },
    setScenario(value: FixtureScenario) {
      scenario = value;
      accepted = false;
      started = false;
      collected = false;
      taskStarted = false;
      departed = false;
      recovery = false;
      attempts = 0;
      dischargeStarted = false;
      dischargeDeparted = false;
      discharged = false;
      failed = false;
      receipts.clear();
      availability = {
        rider_id: fixtureOwner,
        availability_intent: 'AVAILABLE',
        work_state: 'IDLE',
        version: 1,
        updated_at: timestamp(0),
      };
    },
    getScenario: () => scenario,
    execution: {
      send: async (command: Command, owner: string) => {
        check();
        if (owner !== fixtureOwner || !isExecution()) throw new ApiError(409);
        const prior = receipts.get(command.id),
          fingerprint = JSON.stringify(command);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ApiError(409);
          return parseExecutionReceipt(command, prior.value, owner);
        }
        let value: unknown;
        if (command.kind === 'V1_START' && !isV2()) {
          started = true;
          value = { ...assignment(), rider_id: owner };
        } else if (
          command.kind === 'V1_ATTEMPT' &&
          !isV2() &&
          started &&
          !collected
        ) {
          attempts++;
          collected = command.outcome === 'COLLECTED';
          value = {
            pickup_attempt_id: `demo-attempt-${attempts}`,
            pickup_execution_id: command.pickupId,
            rider_assignment_id: command.assignmentId,
            client_attempt_id: command.id,
            attempt_number: attempts,
            outcome: command.outcome,
            attempted_at: timestamp(0),
          };
        } else if (
          command.kind === 'V1_INCIDENT' &&
          !isV2() &&
          started &&
          !collected
        )
          value = {
            incident_id: 'demo-incident',
            client_incident_id: command.id,
            pickup_execution_id: command.pickupId,
            rider_assignment_id: command.assignmentId,
            reason_code: command.reason,
            status: 'OPEN',
            opened_at: timestamp(0),
          };
        else if (isV2() && command.kind === 'V2_ACK')
          value = { resource_id: command.revisionId };
        else if (isV2() && command.kind === 'V2_ISSUE') {
          recovery = true;
          value = { exception_id: 'demo-exception' };
        } else if (
          isV2() &&
          command.kind === 'V2_TASK' &&
          !recovery &&
          scenario !== 'execution-recovery' &&
          command.taskId === 'demo-task' &&
          command.revisionId === 'demo-revision' &&
          !collected
        ) {
          if (command.operation === 'START') taskStarted = true;
          if (command.operation === 'DEPART') departed = true;
          if (command.operation === 'PICKUP') {
            if (!taskStarted || command.outcome !== 'COLLECTED')
              throw new ApiError(409);
            collected = true;
          }
          value = {
            resource_id:
              command.operation === 'PICKUP' ? 'demo-attempt' : command.taskId,
          };
        } else throw new ApiError(409);
        receipts.set(command.id, { fingerprint, value });
        return parseExecutionReceipt(command, value, owner);
      },
    },
  };
}
