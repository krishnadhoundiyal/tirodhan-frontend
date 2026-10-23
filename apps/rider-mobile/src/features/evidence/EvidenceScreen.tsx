import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  preview,
  evidenceForSession,
  evidenceVault,
  session,
} from '../../runtime';
import { useRiderResource } from '../../hooks';
import { ApiError } from '../../api/errors';
import { Body, Button, Card, ErrorState, Loading, Muted, Page } from '../../ui';
import { nextTask } from '../execution/contracts';
import {
  routeContext,
  type Command,
  type Point,
  type SealedMedia,
  type Target,
} from './contracts';
import { measuredLocation } from './location';
import CaptureSheet from './CaptureSheet';
export function matchesScan(value: string, expected: string | null) {
  return !!expected && value === expected;
}
type Intent =
  | { kind: 'PICKUP'; target: Target; type: 'PHOTO' | 'VIDEO' }
  | { kind: 'HANDOVER'; pickupId: string }
  | { kind: 'DISCHARGE' }
  | {
      kind: 'UNSUCCESSFUL';
      reason: 'CUSTOMER_UNAVAILABLE' | 'UNCONTACTABLE' | 'ACCESS_BLOCKED';
    };
export default function EvidenceScreen() {
  if (!preview && (Platform.OS === 'web' || isRunningInExpoGo()))
    return (
      <Page title="Evidence and handover">
        <Muted>
          Use the Rider development build on a device for private evidence,
          location and scans. SCREEN_PREVIEW uses isolated fixtures.
        </Muted>
      </Page>
    );
  return <FieldScreen />;
}
function FieldScreen() {
  const service = evidenceForSession(),
    vault = evidenceVault(),
    client = useQueryClient();
  const { query: assignment, operations } = useRiderResource('assignment'),
    { query: route } = useRiderResource('route');
  const key = useMemo(
    () => [
      'rider-field-evidence',
      ...operations.key('assignment').slice(0, -1),
    ],
    [operations],
  );
  const record = useQuery({
    queryKey: key,
    queryFn: service.load,
    retry: false,
  });
  const destinations = useQuery({
    queryKey: [...key, 'points'],
    queryFn: () => service.points(),
    retry: false,
  });
  const [pointId, setPointId] = useState<string | null>(null),
    [pendingIntent, setIntent] = useState<{
      value: Intent;
      scope: string;
    } | null>(null),
    [sheet, setSheet] = useState<
      'PHOTO' | 'VIDEO' | 'PICKUP_SCAN' | 'POINT_SCAN' | null
    >(null),
    [scanRecord, setScan] = useState<{
      scope: string;
      pickup: boolean;
      point: boolean;
    } | null>(null),
    [error, setError] = useState<unknown>(null);
  const active = useRef(false),
    identity = session.requestIdentity(),
    routeValue = route.data ?? null,
    context = routeValue ? routeContext(routeValue) : null,
    task = routeValue ? nextTask(routeValue) : undefined;
  const scanKey = JSON.stringify([
    pointId,
    context?.revisionId,
    context?.taskId,
  ]);
  const scan =
    scanRecord?.scope === scanKey
      ? scanRecord
      : { pickup: false, point: false };
  const intent = pendingIntent?.scope === scanKey ? pendingIntent.value : null;
  const point =
    destinations.data?.find((p) => p.receiving_point_id === pointId) ?? null;
  const closeCamera = useCallback(() => setSheet(null), [setSheet]);
  const guard = () => {
    if (!active.current || (!preview && session.requestIdentity() !== identity))
      throw new ApiError(0, 'cancelled');
  };
  const mutation = useMutation({
    mutationFn: async (
      value:
        { command: Command; local: SealedMedia | null } | 'retry' | 'review',
    ) =>
      value === 'retry'
        ? service.retry()
        : value === 'review'
          ? service.review()
          : service.begin(value.command, value.local),
    onSuccess: () => {
      setIntent(null);
      setScan(null);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key, exact: true }),
  });
  useFocusEffect(
    useCallback(() => {
      active.current = AppState.currentState === 'active';
      service.resume();
      const sub = AppState.addEventListener('change', (state) => {
        active.current = state === 'active';
        if (active.current) service.resume();
        else {
          service.suspend();
          setSheet(null);
          setIntent(null);
          setScan(null);
        }
      });
      return () => {
        active.current = false;
        service.suspend();
        sub.remove();
      };
    }, [service, setSheet, setIntent, setScan]),
  );
  useEffect(() => {
    if (assignment.isSuccess && route.isSuccess)
      void service
        .observe({ assignment: assignment.data.assignment, route: route.data })
        .then(() => client.invalidateQueries({ queryKey: key, exact: true }))
        .catch(setError);
  }, [
    assignment.data,
    assignment.isSuccess,
    route.data,
    route.isSuccess,
    service,
    client,
    key,
  ]);
  const blocked =
    mutation.isPending ||
    !record.isSuccess ||
    !assignment.isSuccess ||
    !route.isSuccess ||
    assignment.isFetching ||
    route.isFetching ||
    !!record.data?.operation;
  const capture = async (uri: string, capturedAt: string) => {
    let local: SealedMedia | null = null;
    try {
      guard();
      if (!intent) throw new ApiError(409);
      local = await vault.seal(
        uri,
        intent.kind === 'PICKUP' ? intent.type : 'PHOTO',
        capturedAt,
        guard,
      );
      guard();
      let command: Command;
      if (intent.kind === 'PICKUP')
        command = {
          kind: 'CAPTURE',
          id: randomUUID(),
          target: intent.target,
          capturedAt,
        };
      else if (intent.kind === 'UNSUCCESSFUL') {
        if (!context) throw new ApiError(409);
        command = {
          kind: 'UNSUCCESSFUL',
          id: randomUUID(),
          context,
          reason: intent.reason,
          captureClientId: randomUUID(),
          capturedAt,
        };
      } else {
        if (!point) throw new ApiError(409);
        const location = preview
          ? { latitude: 0, longitude: 0 }
          : await measuredLocation(guard);
        guard();
        if (intent.kind === 'HANDOVER')
          command = {
            kind: 'HANDOVER',
            id: randomUUID(),
            pickupId: intent.pickupId,
            pointId: point.receiving_point_id,
            location,
          };
        else {
          if (
            !context ||
            !scan.pickup ||
            !scan.point ||
            !point.official_identifier
          )
            throw new ApiError(409);
          command = {
            kind: 'DISCHARGE',
            id: randomUUID(),
            context,
            pointId: point.receiving_point_id,
            pickupScan: context.pickupId,
            pointScan: point.official_identifier,
            captureClientId: randomUUID(),
            capturedAt,
            location,
          };
        }
      }
      const operation = mutation.mutateAsync({ command, local });
      setSheet(null);
      await operation;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'configuration'));
      if (local && (await service.load()).operation?.local?.id !== local.id)
        await vault.remove(local.id);
      throw e;
    }
  };
  const startCapture = (next: Intent) => {
    setError(null);
    mutation.reset();
    setIntent({ value: next, scope: scanKey });
  };
  const confirmCamera = () => {
    if (!intent) return;
    if (preview) {
      void capture('fixture://capture', new Date().toISOString()).catch(
        () => {},
      );
    } else setSheet(intent.kind === 'PICKUP' ? intent.type : 'PHOTO');
  };
  const scanned = (value: string) => {
    if (
      sheet === 'PICKUP_SCAN' &&
      matchesScan(value, context?.pickupId ?? null)
    )
      setScan({ ...scan, pickup: true, scope: scanKey });
    else if (
      sheet === 'POINT_SCAN' &&
      matchesScan(value, point?.official_identifier ?? null)
    )
      setScan({ ...scan, point: true, scope: scanKey });
    else setError(new ApiError(409));
  };
  const progress = (operation: 'START' | 'DEPART') => {
    if (context)
      mutation.mutate({
        command: { kind: 'ROUTE', id: randomUUID(), context, operation },
        local: null,
      });
  };
  const op = record.data?.operation;
  const terminal =
    op && ['FINALIZED', 'GAP', 'ACKNOWLEDGED', 'REJECTED'].includes(op.stage);
  return (
    <Page title="Evidence and handover">
      <Muted>
        Collection, handover validation and media finalization are separate
        server facts. This screen does not mark a collection COMPLETED.
      </Muted>
      {preview && (
        <Muted>
          Fixture photo, scan and location controls use no device hardware,
          private files or live upload service.
        </Muted>
      )}
      {record.isPending && <Loading label="Loading private recovery…" />}
      <ErrorState error={record.error} />
      <ErrorState error={destinations.error} />
      <ErrorState error={error ?? mutation.error} />
      {record.isError && (
        <Button
          title="Reload private recovery"
          onPress={() => void record.refetch()}
        />
      )}
      {op && (
        <Card>
          <Body>Saved field operation · {op.stage}</Body>
          {op.handover && (
            <>
              <Body>Backend handover: {op.handover.status}</Body>
              <Muted>
                {op.handover.code} · {op.handover.id}
              </Muted>
              {op.handover.status === 'REJECTED' && (
                <Body>
                  The service rejected this handover. Cargo has not been
                  discharged by this result.
                </Body>
              )}
            </>
          )}
          {op.captureId && (
            <Muted>
              Capture registered: {op.captureId}. Registration does not verify
              its contents.
            </Muted>
          )}
          {op.media && <Body>Backend media status: {op.media.status}</Body>}
          {op.stage === 'GAP' && (
            <Body>
              Media attachment is unavailable. The route response may omit its
              server-created capture reference, or the retained file has
              expired. No replacement capture is created automatically. Review
              this with Operations.
            </Body>
          )}
          {op.stage === 'ACKNOWLEDGED' && (
            <Muted>
              Route task acknowledged. This command did not record a handover.
            </Muted>
          )}
          {op.stage === 'REJECTED' && (
            <Muted>
              The service rejected the command. Refresh and review before a new
              physical action.
            </Muted>
          )}
          {!terminal && (
            <Button
              title="Resume exact saved operation"
              disabled={mutation.isPending}
              onPress={() => mutation.mutate('retry')}
            />
          )}
          {terminal && (
            <Button
              title="Review receipt and erase local media"
              disabled={mutation.isPending}
              onPress={() => mutation.mutate('review')}
            />
          )}
        </Card>
      )}
      <Body>Collected pickup history on this device</Body>
      {!record.data?.work.length && (
        <Muted>
          Collected pickups appear after an authoritative collection receipt or
          owned assignment read. A missing active assignment is not a history
          lookup.
        </Muted>
      )}
      {record.data?.work.map((work) => (
        <Card key={work.pickupId}>
          <Body>
            Pickup {work.pickupId} · {work.mode}
          </Body>
          <Muted>
            {work.pickupCapture
              ? 'Pickup capture registered'
              : 'Pickup evidence not registered on this device'}
          </Muted>
          {work.handover && (
            <Body>
              Recorded handover: {work.handover.status} · {work.handover.code}
            </Body>
          )}
          <Button
            title={`Capture pickup photo ${work.pickupId}`}
            disabled={blocked}
            onPress={() =>
              startCapture({
                kind: 'PICKUP',
                target: { kind: 'PICKUP', id: work.pickupId },
                type: 'PHOTO',
              })
            }
          />
          <Button
            title={`Capture pickup video ${work.pickupId}`}
            disabled={blocked}
            onPress={() =>
              startCapture({
                kind: 'PICKUP',
                target: { kind: 'PICKUP', id: work.pickupId },
                type: 'VIDEO',
              })
            }
          />
          {work.mode === 'V1' && work.handover?.status !== 'VALIDATED' && (
            <Button
              title={`Record V1 handover ${work.pickupId}`}
              disabled={blocked || !point}
              onPress={() =>
                startCapture({ kind: 'HANDOVER', pickupId: work.pickupId })
              }
            />
          )}
          {work.mode === 'V1' && work.handover && (
            <Button
              title={`Add handover evidence ${work.handover.id}`}
              disabled={blocked}
              onPress={() =>
                startCapture({
                  kind: 'PICKUP',
                  target: { kind: 'HANDOVER', id: work.handover!.id },
                  type: 'PHOTO',
                })
              }
            />
          )}
        </Card>
      ))}
      <Body>Authorized receiving points</Body>
      <Muted>
        Select only the actual destination. The server validates its current
        availability and measured geofence.
      </Muted>
      {destinations.isPending && <Loading />}
      {destinations.data?.map((p: Point) => (
        <Button
          key={p.receiving_point_id}
          title={`${pointId === p.receiving_point_id ? 'Selected: ' : ''}${p.official_name}`}
          disabled={blocked}
          onPress={() => setPointId(p.receiving_point_id)}
        />
      ))}
      {task?.kind === 'DISCHARGE' && context && (
        <Card>
          <Body>Next routed discharge</Body>
          <Muted>
            Only V2 route commands are used. A valid active shift and fresh
            vehicle position must already be established on the backend.
          </Muted>
          {task.committed_at === null && (
            <Button
              title="Depart for receiving point"
              disabled={blocked}
              onPress={() => progress('DEPART')}
            />
          )}
          {task.state === 'PENDING' && (
            <Button
              title="Start discharge at receiving point"
              disabled={blocked}
              onPress={() => progress('START')}
            />
          )}
          {task.state === 'STARTED' && (
            <>
              <Button
                title={
                  scan.pickup ? 'Pickup label scanned' : 'Scan pickup label'
                }
                disabled={blocked}
                onPress={() =>
                  preview
                    ? setScan({ ...scan, pickup: true, scope: scanKey })
                    : setSheet('PICKUP_SCAN')
                }
              />
              <Button
                title={
                  scan.point
                    ? 'Receiving label scanned'
                    : 'Scan receiving-point label'
                }
                disabled={
                  blocked ||
                  !point?.official_identifier ||
                  pointId !== task.receiving_point_id
                }
                onPress={() =>
                  preview
                    ? setScan({ ...scan, point: true, scope: scanKey })
                    : setSheet('POINT_SCAN')
                }
              />
              <Button
                title="Record V2 physical discharge"
                disabled={
                  blocked ||
                  !scan.pickup ||
                  !scan.point ||
                  pointId !== task.receiving_point_id
                }
                onPress={() => startCapture({ kind: 'DISCHARGE' })}
              />
              <Muted>
                Actual managed labels are required. No label is generated here.
                Discharge creates its own evidence capture; its reference is
                currently absent from the response, so discharge media
                attachment is blocked.
              </Muted>
            </>
          )}
        </Card>
      )}
      {task?.kind === 'PICKUP' &&
        task.state === 'STARTED' &&
        routeValue?.status === 'ACTIVE' && (
          <Card>
            <Body>Unsuccessful routed pickup</Body>
            <Muted>
              A new real photo accompanies the V2 outcome. The backend
              determines regional recovery and returns any evidence reference.
            </Muted>
            {(
              [
                'CUSTOMER_UNAVAILABLE',
                'UNCONTACTABLE',
                'ACCESS_BLOCKED',
              ] as const
            ).map((reason) => (
              <Button
                key={reason}
                title={`Record routed failure: ${reason}`}
                disabled={blocked}
                onPress={() => startCapture({ kind: 'UNSUCCESSFUL', reason })}
              />
            ))}
          </Card>
        )}
      {intent && !blocked && (
        <Card>
          <Body>Confirm field action</Body>
          <Muted>
            {intent.kind === 'PICKUP'
              ? 'Capture only the actual pickup or handover evidence selected above.'
              : intent.kind === 'UNSUCCESSFUL'
                ? 'Confirm that this pickup attempt actually failed for the selected reason.'
                : 'Confirm that this physical transfer has actually occurred at the selected receiving point. A new photo and current location measurement will be submitted.'}
          </Muted>
          <Button
            title={
              preview
                ? 'Confirm with isolated fixture media'
                : 'Confirm and open camera'
            }
            onPress={confirmCamera}
          />
          <Button title="Cancel field action" onPress={() => setIntent(null)} />
        </Card>
      )}
      <Button
        title="Refresh authoritative field state"
        disabled={mutation.isPending}
        onPress={() => {
          setError(null);
          void Promise.all([
            operations.refresh(),
            record.refetch(),
            destinations.refetch(),
          ]).catch(setError);
        }}
      />
      <Muted>
        Location is measured once per handover. Private pending media is
        encrypted and retained for recovery for at most 24 hours, cleaned on the
        next app use. Upload and finalization never imply collection completion.
      </Muted>
      {sheet && !preview && (
        <CaptureSheet
          kind={sheet.endsWith('SCAN') ? 'SCAN' : (sheet as 'PHOTO' | 'VIDEO')}
          onClose={closeCamera}
          onScan={scanned}
          onCapture={capture}
        />
      )}
    </Page>
  );
}
