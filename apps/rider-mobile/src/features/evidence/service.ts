import { ApiError } from '../../api/errors';
import type { Assignment, Route } from '../../api/contracts';
import { nextTask } from '../execution/contracts';
import type { Command as PickupCommand, Receipt } from '../execution/contracts';
import type { EvidenceStore } from './store';
import { readCommand } from './store';
import type {
  Command,
  EvidenceApi,
  EvidenceState,
  Media,
  MediaVault,
  Operation,
  SealedMedia,
} from './contracts';
import type { BlobUploader } from './upload';
export type FieldReads = { assignment: Assignment | null; route: Route | null };
export function createEvidenceService(
  api: EvidenceApi,
  store: EvidenceStore,
  vault: MediaVault,
  upload: BlobUploader,
  scope: {
    owner: string;
    current(): boolean;
    uuid(): string;
    fresh(): Promise<FieldReads>;
    refresh(): Promise<unknown>;
    executionPending(): Promise<boolean>;
    ready?(): Promise<unknown>;
  },
) {
  let flight: Promise<EvidenceState> | null = null,
    flightKey: string | null = null,
    initialized = false,
    active = true,
    controller = new AbortController();
  const current = () => {
    if (!scope.current()) throw new ApiError(0, 'cancelled');
  };
  const foreground = () => {
    current();
    if (!active) throw new ApiError(0, 'cancelled');
  };
  const save = (update: (state: EvidenceState) => EvidenceState) =>
    store.change(scope.owner, current, update);
  const replace = (op: Operation) =>
    save((s) => {
      if (
        !s.operation ||
        JSON.stringify(s.operation.command) !== JSON.stringify(op.command)
      )
        throw new ApiError(409);
      return { ...s, operation: op };
    });
  const single = (key: string, work: () => Promise<EvidenceState>) => {
    if (flight)
      return flightKey === key ? flight : Promise.reject(new ApiError(409));
    const task = work()
      .catch((e) => {
        throw e instanceof ApiError ? e : new ApiError(0, 'configuration');
      })
      .finally(async () => {
        if (scope.current()) await scope.refresh().catch(() => {});
      });
    flight = task;
    flightKey = key;
    void task.then(
      () => {
        if (flight === task) flight = null;
      },
      () => {
        if (flight === task) flight = null;
      },
    );
    return task;
  };
  const load = async (preserveNew?: string) => {
    current();
    await scope.ready?.();
    current();
    let s = await store.load(scope.owner, current);
    if (!initialized) {
      await vault.sweep(s.operation?.local?.id ?? preserveNew ?? null);
      current();
      initialized = true;
    }
    if (
      s.operation?.local &&
      Date.now() - s.operation.local.createdAt > 86400000
    ) {
      await vault.remove(s.operation.local.id);
      s = await replace({
        ...s.operation,
        local: null,
        stage: ['PREPARED', 'UPLOADING', 'FINALIZE'].includes(s.operation.stage)
          ? s.operation.stage
          : 'GAP',
      });
    }
    return s;
  };
  const remember = async (
    pickupId: string,
    assignmentId: string,
    mode: 'V1' | 'V2',
  ) =>
    (async () => {
      await scope.ready?.();
      return save((s) => {
        const existing = s.work.find((w) => w.pickupId === pickupId);
        if (existing) {
          if (existing.mode !== mode || existing.assignmentId !== assignmentId)
            throw new ApiError(409);
          return s;
        }
        return {
          ...s,
          work: [
            ...s.work,
            {
              pickupId,
              assignmentId,
              mode,
              pickupCapture: false,
              handover: null,
            },
          ],
        };
      });
    })();
  const observe = async ({ assignment, route }: FieldReads) => {
    if (!assignment) return;
    const mode =
      assignment.source === 'COMMITTED_DISPATCH' &&
      route?.assignment_id === assignment.assignment_id
        ? 'V2'
        : !route &&
            ['RIDER_OFFER_ACCEPTED', 'MANAGER_ASSIGNED'].includes(
              assignment.source,
            )
          ? 'V1'
          : null;
    if (mode)
      for (const p of assignment.pickups.filter(
        (p) => p.status === 'COLLECTED',
      ))
        await remember(p.pickup_execution_id, assignment.assignment_id, mode);
  };
  const points = async () => {
    foreground();
    const value = await api.points();
    current();
    return value;
  };
  const validate = async (command: Command) => {
    const state = await load();
    if (state.operation || (await scope.executionPending()))
      throw new ApiError(409);
    const fresh = await scope.fresh();
    current();
    await observe(fresh);
    if (command.kind === 'CAPTURE') {
      if (command.target.kind === 'PICKUP') {
        if (!(await load()).work.some((w) => w.pickupId === command.target.id))
          throw new ApiError(403);
      } else if (
        !(await load()).work.some(
          (w) => w.mode === 'V1' && w.handover?.id === command.target.id,
        )
      )
        throw new ApiError(403);
      return;
    }
    if (command.kind === 'HANDOVER') {
      const work = (await load()).work.find(
        (w) => w.pickupId === command.pickupId,
      );
      if (
        !work ||
        work.mode !== 'V1' ||
        work.handover?.status === 'VALIDATED' ||
        fresh.route?.tasks.some((t) => t.pickup_execution_id === work.pickupId)
      )
        throw new ApiError(409);
      if (
        !(await points()).some((p) => p.receiving_point_id === command.pointId)
      )
        throw new ApiError(409);
      return;
    }
    const route = fresh.route,
      a = fresh.assignment,
      t = route ? nextTask(route) : undefined,
      c = command.context;
    if (
      !route ||
      !a ||
      a.source !== 'COMMITTED_DISPATCH' ||
      a.assignment_id !== c.assignmentId ||
      route.assignment_id !== a.assignment_id ||
      route.route_id !== c.routeId ||
      route.revision_id !== c.revisionId ||
      !t ||
      t.task_id !== c.taskId ||
      t.pickup_execution_id !== c.pickupId ||
      !['ACTIVE', 'RECOVERY_REQUIRED'].includes(route.status)
    )
      throw new ApiError(409);
    if (t.kind === 'PICKUP' && route.status !== 'ACTIVE')
      throw new ApiError(409);
    if (command.kind === 'ROUTE') {
      if (
        t.kind !== 'DISCHARGE' ||
        (command.operation === 'START'
          ? t.state !== 'PENDING'
          : t.committed_at !== null)
      )
        throw new ApiError(409);
      return;
    }
    if (command.kind === 'UNSUCCESSFUL') {
      if (
        t.kind !== 'PICKUP' ||
        t.state !== 'STARTED' ||
        !a.pickups.some(
          (p) =>
            p.pickup_execution_id === c.pickupId && p.status === 'ASSIGNED',
        )
      )
        throw new ApiError(409);
      return;
    }
    if (
      t.kind !== 'DISCHARGE' ||
      t.state !== 'STARTED' ||
      t.receiving_point_id !== command.pointId ||
      command.pickupScan !== c.pickupId
    )
      throw new ApiError(409);
    const point = (await points()).find(
      (p) => p.receiving_point_id === command.pointId,
    );
    if (
      !point?.official_identifier ||
      command.pointScan !== point.official_identifier
    )
      throw new ApiError(409);
  };
  const recordHandover = async (op: Operation) => {
    const c = op.command;
    if (!op.handover) return;
    const pickupId =
      c.kind === 'HANDOVER'
        ? c.pickupId
        : c.kind === 'DISCHARGE'
          ? c.context.pickupId
          : null;
    if (!pickupId) return;
    await save((s) => ({
      ...s,
      work: s.work.map((w) =>
        w.pickupId === pickupId ? { ...w, handover: op.handover } : w,
      ),
    }));
  };
  const bindAsset = (asset: Media, op: Operation) => {
    if (
      asset.clientId !== op.mediaClientId ||
      asset.captureId !== op.captureId ||
      (op.media &&
        (asset.id !== op.media.id ||
          asset.objectKey !== op.media.objectKey ||
          asset.contentType !== op.media.contentType ||
          asset.type !== op.media.type))
    )
      throw new ApiError(200, 'protocol');
    return asset;
  };
  const finalize = async (op: Operation) => {
    foreground();
    if (!op.media) throw new ApiError(409);
    const asset = bindAsset(await api.finalize(op.media.id), op);
    current();
    if (asset.status !== 'FINALIZED') throw new ApiError(200, 'protocol');
    op = { ...op, media: asset, stage: 'FINALIZED' };
    await replace(op);
    if (op.local) {
      await vault.remove(op.local.id);
      op = { ...op, local: null };
      await replace(op);
    }
    return op;
  };
  const advance = async () => {
    let op = (await load()).operation;
    if (!op) throw new ApiError(409);
    if (op.stage === 'PREPARED') {
      if (op.command.kind !== 'ROUTE' && !op.local)
        throw new ApiError(0, 'configuration');
      foreground();
      let result;
      try {
        result = await api.send(op.command);
        current();
      } catch (error) {
        current();
        if (
          error instanceof ApiError &&
          error.kind === 'http' &&
          [404, 409, 422].includes(error.status)
        )
          await replace({ ...op, stage: 'REJECTED' });
        throw error;
      }
      const c = op.command;
      op = {
        ...op,
        handover: result.handover ?? null,
        captureId:
          c.kind === 'CAPTURE'
            ? result.resourceId
            : c.kind === 'UNSUCCESSFUL'
              ? (result.captureId ?? null)
              : null,
        stage:
          c.kind === 'ROUTE'
            ? 'ACKNOWLEDGED'
            : c.kind === 'HANDOVER'
              ? 'CAPTURE'
              : c.kind === 'DISCHARGE' ||
                  (c.kind === 'UNSUCCESSFUL' && !result.captureId)
                ? 'GAP'
                : 'MEDIA',
      };
      await replace(op);
      await recordHandover(op);
      if (c.kind === 'CAPTURE' && c.target.kind === 'PICKUP')
        await save((s) => ({
          ...s,
          work: s.work.map((w) =>
            w.pickupId === c.target.id ? { ...w, pickupCapture: true } : w,
          ),
        }));
    }
    if (op.stage === 'CAPTURE') {
      foreground();
      if (!op.handover || !op.local) throw new ApiError(0, 'configuration');
      const result = await api.send({
        kind: 'CAPTURE',
        id: op.captureClientId,
        target: { kind: 'HANDOVER', id: op.handover.id },
        capturedAt: op.local.capturedAt,
      });
      current();
      op = { ...op, captureId: result.resourceId, stage: 'MEDIA' };
      await replace(op);
    }
    if (['MEDIA', 'UPLOADING', 'FINALIZE'].includes(op.stage)) {
      foreground();
      if (op.media && ['UPLOADING', 'FINALIZE'].includes(op.stage)) {
        try {
          op = await finalize(op);
          return await load();
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 409) throw e;
        }
      }
      if (!op.local || !op.captureId) throw new ApiError(0, 'configuration');
      // Registration replay is the existing authoritative read for this stable client_media_id.
      const asset = bindAsset(
        await api.register(
          op.mediaClientId,
          op.captureId,
          op.local.type,
          op.local.contentType,
        ),
        op,
      );
      current();
      op = {
        ...op,
        media: asset,
        stage: asset.status === 'FINALIZED' ? 'FINALIZED' : op.stage,
      };
      await replace(op);
      if (asset.status === 'FINALIZED') {
        await vault.remove(op.local!.id);
        await replace({ ...op, local: null });
        return load();
      }
      const bytes = await vault.read(op.local!);
      foreground();
      // Mark ambiguity before external I/O. On restart, finalize first, never blindly overwrite.
      op = { ...op, stage: 'UPLOADING' };
      await replace(op);
      controller = new AbortController();
      for (let attempt = 0; attempt < 2; attempt++) {
        foreground();
        const authorization = await api.authorize(asset.id);
        foreground();
        try {
          await upload(
            asset,
            authorization,
            bytes,
            foreground,
            controller.signal,
          );
          break;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 403 || attempt === 1)
            throw e;
        }
      }
      foreground();
      op = { ...op, stage: 'FINALIZE' };
      await replace(op);
      await finalize(op);
    }
    return load();
  };
  return {
    load: () => load(),
    points,
    observe,
    remember,
    rememberReceipt: async (command: PickupCommand, _receipt: Receipt) => {
      if (command.kind === 'V1_ATTEMPT' && command.outcome === 'COLLECTED')
        await remember(command.pickupId, command.assignmentId, 'V1');
      if (
        command.kind === 'V2_TASK' &&
        command.operation === 'PICKUP' &&
        command.outcome === 'COLLECTED'
      ) {
        const fresh = await scope.fresh(),
          t = fresh.route?.tasks.find((t) => t.task_id === command.taskId);
        if (t?.pickup_execution_id)
          await remember(t.pickup_execution_id, command.assignmentId, 'V2');
      }
    },
    begin: (command: Command, local: SealedMedia | null) =>
      single(JSON.stringify([command, local?.id]), async () => {
        foreground();
        const checked = readCommand(command);
        try {
          await load(local?.id);
          await validate(checked);
          if (checked.kind !== 'ROUTE' && !local)
            throw new ApiError(0, 'configuration');
          if (local && checked.kind !== 'CAPTURE' && local.type !== 'PHOTO')
            throw new ApiError(422);
          if (
            local &&
            'capturedAt' in checked &&
            local.capturedAt !== checked.capturedAt
          )
            throw new ApiError(409);
          await save((s) => {
            if (s.operation) throw new ApiError(409);
            return {
              ...s,
              operation: {
                command: checked,
                local,
                captureClientId:
                  checked.kind === 'CAPTURE'
                    ? checked.id
                    : 'captureClientId' in checked
                      ? checked.captureClientId
                      : scope.uuid(),
                mediaClientId: scope.uuid(),
                handover: null,
                captureId: null,
                media: null,
                stage: 'PREPARED',
              },
            };
          });
        } catch (error) {
          if (local) {
            let retained = true;
            try {
              retained =
                (await store.load(scope.owner, current)).operation?.local
                  ?.id === local.id;
            } catch {
              /* A failed durable write is ambiguous; retain encrypted bytes for reconciliation. */
            }
            if (!retained) await vault.remove(local.id);
          }
          throw error;
        }
        return advance();
      }),
    retry: () => single('retry', advance),
    review: () =>
      single('review', async () => {
        foreground();
        await scope.fresh();
        const state = await load(),
          op = state.operation;
        if (
          !op ||
          !['FINALIZED', 'GAP', 'ACKNOWLEDGED', 'REJECTED'].includes(op.stage)
        )
          throw new ApiError(409);
        if (op.handover) await recordHandover(op);
        if (
          op.captureId &&
          op.command.kind === 'CAPTURE' &&
          op.command.target.kind === 'PICKUP'
        ) {
          const pickupId = op.command.target.id;
          await save((s) => ({
            ...s,
            work: s.work.map((w) =>
              w.pickupId === pickupId ? { ...w, pickupCapture: true } : w,
            ),
          }));
        }
        if (op.local) await vault.remove(op.local.id);
        return save((s) => ({ ...s, operation: null }));
      }),
    resume: () => {
      active = true;
    },
    suspend: () => {
      active = false;
      controller.abort();
    },
  };
}
export type EvidenceService = ReturnType<typeof createEvidenceService>;
