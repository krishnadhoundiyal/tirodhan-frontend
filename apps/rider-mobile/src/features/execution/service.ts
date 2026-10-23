import type { QueryClient } from '@tanstack/react-query';
import type { Operations } from '../operations';
import { ApiError } from '../../api/errors';
import type { ExecutionApi } from '../../api/execution-client';
import type { ExecutionJournal } from './journal';
import { validateCommand } from './journal';
import {
  authority,
  nextTask,
  type Action,
  type Command,
  type ExecutionState,
  type RecordState,
} from './contracts';

export function permitted(
  action: Action,
  state: ExecutionState,
  replay = false,
) {
  const a = state.assignment,
    r = state.route;
  if (
    !a ||
    a.assignment_id !== action.assignmentId ||
    a.source !== action.source ||
    a.status !== 'ACTIVE'
  )
    return false;
  const mode = authority(state);
  if (action.kind.startsWith('V1_')) {
    if (mode !== 'V1') return false;
    if (replay)
      return (
        action.kind === 'V1_START' ||
        ('pickupId' in action &&
          a.pickups.some((p) => p.pickup_execution_id === action.pickupId))
      );
    if (action.kind === 'V1_START')
      return (
        a.started_at === null && state.availability.work_state === 'RESERVED'
      );
    return (
      !!a.started_at &&
      state.availability.work_state === 'BUSY' &&
      'pickupId' in action &&
      a.pickups.some(
        (p) =>
          p.pickup_execution_id === action.pickupId && p.status === 'ASSIGNED',
      )
    );
  }
  if (
    mode !== 'V2' ||
    !r ||
    r.route_id !== action.routeId ||
    r.status === 'CLOSED'
  )
    return false;
  if (replay)
    return (
      action.kind !== 'V2_TASK' ||
      r.tasks.some((t) => t.task_id === action.taskId)
    );
  if (r.revision_id !== action.revisionId) return false;
  if (action.kind === 'V2_ACK')
    return ['ACTIVE', 'RECOVERY_REQUIRED'].includes(r.status);
  if (action.kind === 'V2_ISSUE') return r.status === 'ACTIVE';
  if (
    action.kind !== 'V2_TASK' ||
    r.status !== 'ACTIVE' ||
    state.availability.work_state !== 'BUSY'
  )
    return false;
  const task = nextTask(r);
  if (
    !task ||
    task.kind !== 'PICKUP' ||
    task.task_id !== action.taskId ||
    !a.pickups.some(
      (p) =>
        p.pickup_execution_id === task.pickup_execution_id &&
        p.status === 'ASSIGNED',
    )
  )
    return false;
  return action.operation === 'PICKUP'
    ? task.state === 'STARTED' && action.outcome === 'COLLECTED'
    : action.operation === 'START'
      ? task.state === 'PENDING'
      : task.committed_at === null;
}
export function createExecutionService(
  api: ExecutionApi,
  journal: ExecutionJournal,
  client: QueryClient,
  operations: Operations,
  scope: { owner: string; current(): boolean; uuid(): string },
  onReceipt: (
    command: Command,
    receipt: import('./contracts').Receipt,
  ) => Promise<unknown> = async () => {},
) {
  let flight: Promise<RecordState | null> | null = null;
  const key = [
    'rider-execution-journal',
    ...operations.key('assignment').slice(0, -1),
  ];
  const current = () => {
    if (!scope.current()) throw new ApiError(0, 'cancelled');
  };
  const load = () => journal.load(scope.owner, current);
  const fresh = async (): Promise<ExecutionState> => {
    current();
    await Promise.all(
      (['assignment', 'route', 'availability'] as const).map((resource) =>
        client.cancelQueries({
          queryKey: operations.key(resource),
          exact: true,
        }),
      ),
    );
    const [a, route, availability] = await Promise.all([
      client.fetchQuery(operations.query('assignment')),
      client.fetchQuery(operations.query('route')),
      client.fetchQuery(operations.query('availability')),
    ]);
    current();
    return { assignment: a.assignment, route, availability };
  };
  const finish = async () => {
    if (scope.current()) {
      await operations.refresh().catch(() => {});
      if (scope.current())
        await client
          .invalidateQueries({ queryKey: key, exact: true })
          .catch(() => {});
    }
  };
  const single = (work: () => Promise<RecordState | null>) => {
    if (flight) return flight;
    const operation = work().finally(finish);
    flight = operation;
    const release = () => {
      if (flight === operation) flight = null;
    };
    void operation.then(release, release);
    return operation;
  };
  const submit = async (command: Command) => {
    let confirmed = false;
    try {
      current();
      const receipt = await api.send(command, scope.owner);
      current();
      const saved = await journal.update(
        scope.owner,
        command,
        { status: 'confirmed', receipt, rejection: null },
        current,
      );
      confirmed = true;
      await onReceipt(command, receipt);
      return saved;
    } catch (error) {
      current();
      if (
        !confirmed &&
        error instanceof ApiError &&
        error.kind === 'http' &&
        [404, 409, 422].includes(error.status)
      )
        await journal.update(
          scope.owner,
          command,
          { status: 'rejected', receipt: null, rejection: error.status },
          current,
        );
      throw error instanceof ApiError
        ? error
        : new ApiError(0, 'configuration');
    }
  };
  return {
    key,
    load: async () => {
      const record = await load();
      if (record?.status === 'confirmed' && record.receipt)
        await onReceipt(record.command, record.receipt);
      return record;
    },
    run: (action: Action) =>
      single(async () => {
        current();
        const state = await fresh();
        if (!permitted(action, state)) throw new ApiError(409);
        const command = validateCommand({ ...action, id: scope.uuid() });
        await journal.prepare(scope.owner, command, current);
        current();
        return submit(command);
      }),
    replay: () =>
      single(async () => {
        const record = await load();
        if (!record || record.status === 'confirmed') throw new ApiError(409);
        const state = await fresh();
        if (!permitted(record.command, state, true)) throw new ApiError(409);
        // Never substitute a new command ID, outcome, assignment or revision while recovering.
        return submit(record.command);
      }),
    dismiss: () =>
      single(async () => {
        await fresh();
        const record = await load();
        if (record?.status === 'confirmed' && record.receipt)
          await onReceipt(record.command, record.receipt);
        await journal.dismiss(scope.owner, current);
        return null;
      }),
  };
}
export type ExecutionService = ReturnType<typeof createExecutionService>;
