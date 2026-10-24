import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Assignment, Route } from '../../api/contracts';
import { executionForSession } from '../../runtime';
import { useRiderResource } from '../../hooks';
import { Body, Button, Card, ErrorState, Loading, Muted } from '../../ui';
import {
  authority,
  incidentReasons,
  vehicleReasons,
  nextTask,
  type Action,
  type Context,
} from './contracts';
import { permitted } from './service';

export default function ExecutionPanel({
  assignment,
  route,
  ready,
}: {
  assignment: Assignment | null;
  route: Route | null;
  ready: boolean;
}) {
  const { query: availability } = useRiderResource('availability');
  const service = executionForSession();
  const record = useQuery({
    queryKey: service.key,
    queryFn: service.load,
    retry: false,
  });
  const [selection, setSelection] = useState<Action | null>(null);
  const mutation = useMutation({
    mutationFn: (action: Action | 'replay' | 'dismiss') =>
      action === 'replay'
        ? service.replay()
        : action === 'dismiss'
          ? service.dismiss()
          : service.run(action),
    onSuccess: () => setSelection(null),
  });
  const state = availability.data
    ? { assignment, route, availability: availability.data }
    : null;
  const mode = state ? authority(state) : 'UNAVAILABLE';
  const loaded =
    ready &&
    availability.isSuccess &&
    !availability.isFetching &&
    record.isSuccess;
  const blocked = !loaded || mutation.isPending || !!record.data;
  const context: Context | null = assignment
    ? {
        assignmentId: assignment.assignment_id,
        source: assignment.source,
        ...(route
          ? { routeId: route.route_id, revisionId: route.revision_id }
          : {}),
      }
    : null;
  const choose = (action: Action, label: string) =>
    state && permitted(action, state) ? (
      <Button
        key={label}
        title={label}
        disabled={blocked}
        onPress={() => setSelection(action)}
      />
    ) : null;
  const task = route ? nextTask(route) : undefined;
  return (
    <Card>
      <Body>Pickup execution</Body>
      {(record.isPending || availability.isPending) && (
        <Loading label="Checking recovery and current work…" />
      )}
      <ErrorState
        error={record.error || availability.error || mutation.error}
      />
      {record.isError && (
        <Button
          title="Retry recovery loading"
          disabled={record.isFetching || mutation.isPending}
          onPress={() => void record.refetch().catch(() => {})}
        />
      )}
      {record.data && (
        <Card>
          <Body>
            {record.data.status === 'prepared'
              ? 'Interrupted or unconfirmed command'
              : record.data.status === 'confirmed'
                ? 'Backend command receipt'
                : `Command rejected (${record.data.rejection})`}
          </Body>
          <Muted>
            Command {record.data.command.id} · {record.data.command.kind}
          </Muted>
          {record.data.receipt ? (
            <>
              <Body>{record.data.receipt.message}</Body>
              <Muted>Backend record {record.data.receipt.resourceId}</Muted>
            </>
          ) : (
            <Body>
              No confirmed pickup result is inferred. Do not repeat the physical
              action. Recover only the original command.
            </Body>
          )}
          {record.data.status !== 'confirmed' && (
            <Button
              title="Retry original command"
              disabled={
                !loaded ||
                mutation.isPending ||
                !state ||
                !permitted(record.data.command, state, true)
              }
              onPress={() => mutation.mutate('replay')}
            />
          )}
          {record.data.status !== 'prepared' && (
            <Button
              title="Review complete · continue"
              disabled={!loaded || mutation.isPending}
              onPress={() => mutation.mutate('dismiss')}
            />
          )}
          {record.data.status === 'prepared' &&
            state &&
            !permitted(record.data.command, state, true) && (
              <Body>
                Ownership or route has changed. The original command is
                retained; contact operations before further physical work. No
                command is retargeted to replacement work.
              </Body>
            )}
        </Card>
      )}
      {!ready && (
        <Muted>Refresh assignment and route before choosing an action.</Muted>
      )}
      {mode === 'UNAVAILABLE' && (
        <Muted>
          No executable path is established by the current assignment and route.
          Unknown sources, missing V2 routes and mismatching work are blocked.
        </Muted>
      )}
      {context && state && mode === 'V1' && (
        <>
          <Body>Assignment execution · V1</Body>
          {choose({ ...context, kind: 'V1_START' }, 'Start assignment')}
          {assignment!.pickups
            .filter((p) => p.status === 'ASSIGNED')
            .map((p) => (
              <Card key={p.pickup_execution_id}>
                <Body>Current pickup {p.pickup_execution_id}</Body>
                <Body>{p.pickup_address}</Body>
                {choose(
                  {
                    ...context,
                    kind: 'V1_ATTEMPT',
                    pickupId: p.pickup_execution_id,
                    outcome: 'COLLECTED',
                  },
                  'Record collected pickup',
                )}
                {choose(
                  {
                    ...context,
                    kind: 'V1_ATTEMPT',
                    pickupId: p.pickup_execution_id,
                    outcome: 'NOT_COLLECTED',
                  },
                  'Record unsuccessful attempt',
                )}
                {incidentReasons.map((reason) =>
                  choose(
                    {
                      ...context,
                      kind: 'V1_INCIDENT',
                      pickupId: p.pickup_execution_id,
                      reason,
                    },
                    `Report incident: ${reason}`,
                  ),
                )}
              </Card>
            ))}
          <Muted>
            An unsuccessful attempt leaves the pickup assigned. Recording an
            incident is separate from recording an outcome; only operations can
            manage reassignment.
          </Muted>
        </>
      )}
      {context && state && mode === 'V2' && route && (
        <>
          <Body>Ordered route execution · V2</Body>
          {choose(
            { ...context, kind: 'V2_ACK' },
            'Confirm receipt of this route',
          )}
          <Muted>
            Receipt is not acceptance. The backend checks active shift, fresh
            authenticated vehicle position, breaks, vehicle/cargo restrictions,
            booking state and route revision on execution. This build cannot
            refresh telemetry because Rider reads do not expose its required
            shift ID.
          </Muted>
          {route.status === 'RECOVERY_REQUIRED' && (
            <Body>
              Route recovery required. Pickup progression is paused for
              server-managed recovery.
            </Body>
          )}
          {task && (
            <>
              <Body>
                Next task: {task.kind} · {task.state}
              </Body>
              <Muted>Task {task.task_id}</Muted>
              {choose(
                {
                  ...context,
                  kind: 'V2_TASK',
                  taskId: task.task_id,
                  operation: 'DEPART',
                },
                'Depart for next pickup',
              )}
              {choose(
                {
                  ...context,
                  kind: 'V2_TASK',
                  taskId: task.task_id,
                  operation: 'START',
                },
                'Start next pickup at location',
              )}
              {choose(
                {
                  ...context,
                  kind: 'V2_TASK',
                  taskId: task.task_id,
                  operation: 'PICKUP',
                  outcome: 'COLLECTED',
                },
                'Confirm collected route pickup',
              )}
              {task.kind === 'DISCHARGE' ? (
                <Body>
                  Discharge requires cargo/receiving-point scans, real evidence
                  and location. This task cannot be skipped. Handover is
                  reserved for RM-P0-03.
                </Body>
              ) : (
                <Muted>
                  Unsuccessful V2 completion is unavailable until real evidence
                  capture is implemented and regional requirements are
                  established. No V1 fallback or fabricated capture is sent.
                </Muted>
              )}
            </>
          )}
          {vehicleReasons.map((reason) =>
            choose(
              { ...context, kind: 'V2_ISSUE', reason },
              `Report vehicle issue: ${reason}`,
            ),
          )}
          <Muted>
            Vehicle issue reporting freezes collection for server-managed
            recovery. It does not record a V1 pickup incident or choose a
            replacement rider.
          </Muted>
        </>
      )}
      {selection && (
        <Card>
          <Body>Confirm this physical action</Body>
          <Muted>
            {selection.kind}
            {'outcome' in selection ? ` · ${selection.outcome}` : ''}
            {'reason' in selection ? ` · ${selection.reason}` : ''}
            {'operation' in selection ? ` · ${selection.operation}` : ''}
          </Muted>
          <Muted>
            Assignment {selection.assignmentId}
            {'pickupId' in selection ? ` · Pickup ${selection.pickupId}` : ''}
            {'taskId' in selection ? ` · Task ${selection.taskId}` : ''}
          </Muted>
          <Body>
            {selection.kind === 'V2_TASK' && selection.operation === 'DEPART'
              ? 'Request departure before setting out. Wait for the service to acknowledge it; a timeout does not authorize departure.'
              : selection.kind === 'V1_START' ||
                  (selection.kind === 'V2_TASK' &&
                    selection.operation === 'START')
                ? 'Confirm that you are ready to begin this assigned work. Wait for the service acknowledgment before progressing or recording a pickup outcome.'
                : selection.kind === 'V2_ACK'
                  ? 'Confirm that you have reviewed this route. Receipt does not grant acceptance or override execution checks.'
                  : 'Confirm only the pickup actually performed or issue actually observed. A request timeout does not confirm the outcome.'}
          </Body>
          <Button
            title="Confirm and submit"
            disabled={blocked || !state || !permitted(selection, state)}
            onPress={() => mutation.mutate(selection)}
          />
          <Button
            title="Cancel selection"
            disabled={mutation.isPending}
            onPress={() => setSelection(null)}
          />
        </Card>
      )}
    </Card>
  );
}
