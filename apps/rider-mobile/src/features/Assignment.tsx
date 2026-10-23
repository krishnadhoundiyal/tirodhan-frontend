import { useRiderResource } from '../hooks';
import ExecutionPanel from './execution/ExecutionPanel';
import {
  Body,
  Button,
  Card,
  ErrorState,
  Loading,
  Muted,
  Page,
  dateLabel,
} from '../ui';
export default function AssignmentScreen() {
  const { query, operations } = useRiderResource('assignment');
  const { query: routeQuery } = useRiderResource('route');
  const assignment = query.data?.assignment;
  const route = routeQuery.data;
  return (
    <Page title="Active Assignment">
      <ExecutionPanel
        assignment={assignment ?? null}
        route={route ?? null}
        ready={
          query.isSuccess &&
          routeQuery.isSuccess &&
          !query.isFetching &&
          !routeQuery.isFetching
        }
      />
      {query.isPending && <Loading />}
      <ErrorState error={query.error} />
      {query.error && assignment && (
        <Muted>
          Previously loaded assignment data may be out of date. Refresh before
          relying on it.
        </Muted>
      )}
      {!query.isPending && !query.error && !assignment && (
        <Card>
          <Body>No active assignment</Body>
          <Muted>
            Accepted work and manager changes appear here after the service
            confirms them.
          </Muted>
        </Card>
      )}
      {assignment && (
        <>
          <Card>
            <Body>Assignment {assignment.assignment_id}</Body>
            <Body>Status: {assignment.status}</Body>
            <Muted>Source: {assignment.source}</Muted>
            <Muted>Assigned {dateLabel(assignment.assigned_at)}</Muted>
            <Muted>Started {dateLabel(assignment.started_at)}</Muted>
            <Muted>Completed {dateLabel(assignment.completed_at)}</Muted>
          </Card>
          <Body>Assigned pickup work</Body>
          {!assignment.pickups.length && (
            <Muted>
              No currently released-to-you pickup work is exposed by this
              assignment.
            </Muted>
          )}
          {assignment.pickups.map((pickup, index) => (
            <Card key={pickup.pickup_execution_id}>
              <Body>
                Pickup {index + 1} · {pickup.status}
              </Body>
              <Muted>Execution {pickup.pickup_execution_id}</Muted>
              <Muted>Collection {pickup.request_id}</Muted>
              <Body>{pickup.pickup_address}</Body>
              <Muted>
                Location {pickup.pickup_latitude}, {pickup.pickup_longitude}
              </Muted>
              <Body>
                {dateLabel(pickup.slot_start)} – {dateLabel(pickup.slot_end)}
              </Body>
              {pickup.declared_items.map((item, i) => (
                <Muted key={i}>
                  {item.item_category_code} · Quantity{' '}
                  {item.declared_quantity ?? 'not declared'} · Weight{' '}
                  {item.declared_weight_grams === null
                    ? 'not declared'
                    : `${item.declared_weight_grams} g`}
                </Muted>
              ))}
            </Card>
          ))}
        </>
      )}
      <Body>Server route</Body>
      {routeQuery.isPending && <Loading label="Loading route separately…" />}
      <ErrorState error={routeQuery.error} />
      {routeQuery.error && route && (
        <Muted>
          Previously loaded route data may be out of date. Refresh to check the
          current revision.
        </Muted>
      )}
      {!routeQuery.isPending && !routeQuery.error && !route && (
        <Muted>
          No V2 route is currently exposed. This does not mean there is no V1
          assignment.
        </Muted>
      )}
      {route && (
        <>
          <Card>
            <Body>
              Route {route.route_id} · {route.status}
            </Body>
            <Muted>Revision {route.revision_id}</Muted>
            <Muted>
              Vehicle {route.vehicle_id} · Assignment {route.assignment_id}
            </Muted>
            {assignment && route.assignment_id !== assignment.assignment_id && (
              <Body>
                Assignment and route identify different work. Refresh before
                proceeding; these are separate service reads.
              </Body>
            )}
          </Card>
          {!route.tasks.length && (
            <Muted>No tasks in this route revision.</Muted>
          )}
          {route.tasks.map((task, index) => (
            <Card key={task.task_id}>
              <Body>
                {index + 1}. {task.kind} · {task.state}
              </Body>
              <Muted>Task {task.task_id}</Muted>
              {task.pickup_execution_id && (
                <Muted>Pickup {task.pickup_execution_id}</Muted>
              )}
              {task.receiving_point_id && (
                <Muted>Receiving point {task.receiving_point_id}</Muted>
              )}
              <Body>
                Planned {dateLabel(task.planned_start)} –{' '}
                {dateLabel(task.planned_end)}
              </Body>
              <Muted>Committed {dateLabel(task.committed_at)}</Muted>
            </Card>
          ))}
        </>
      )}
      <Muted>
        Order is supplied by the service. Planned windows are not live arrival
        estimates. Use Evidence for private pickup capture, media upload and
        receiving-point handover.
      </Muted>
      <Button
        title="Refresh assignment and route"
        disabled={query.isFetching || routeQuery.isFetching}
        onPress={() => void operations.refresh().catch(() => {})}
      />
    </Page>
  );
}
