import type { Route } from '../../api/contracts';
import { nextTask } from '../execution/contracts';
export type Point = {
  receiving_point_id: string;
  official_name: string;
  official_identifier: string | null;
  latitude: number;
  longitude: number;
  allowed_radius_m: number;
  version: number;
};
export type Location = { latitude: number; longitude: number };
export type Target = { kind: 'PICKUP' | 'HANDOVER'; id: string };
export type Handover = {
  id: string;
  status: 'VALIDATED' | 'REJECTED';
  code: 'WITHIN_ALLOWED_RADIUS' | 'OUTSIDE_ALLOWED_RADIUS';
};
export type Media = {
  id: string;
  captureId: string;
  clientId: string;
  type: 'PHOTO' | 'VIDEO';
  contentType: string;
  objectKey: string;
  status: 'PENDING_UPLOAD' | 'FINALIZED';
  size: number | null;
};
export type Work = {
  pickupId: string;
  assignmentId: string;
  mode: 'V1' | 'V2';
  pickupCapture: boolean;
  handover: Handover | null;
};
export type SealedMedia = {
  id: string;
  key: string;
  capturedAt: string;
  createdAt: number;
  size: number;
  type: 'PHOTO' | 'VIDEO';
  contentType: string;
};
export type RouteContext = {
  routeId: string;
  revisionId: string;
  taskId: string;
  assignmentId: string;
  pickupId: string;
};
export type Command =
  | { kind: 'CAPTURE'; id: string; target: Target; capturedAt: string }
  | {
      kind: 'HANDOVER';
      id: string;
      pickupId: string;
      pointId: string;
      location: Location;
    }
  | {
      kind: 'ROUTE';
      id: string;
      context: RouteContext;
      operation: 'START' | 'DEPART';
    }
  | {
      kind: 'DISCHARGE';
      id: string;
      context: RouteContext;
      pointId: string;
      pickupScan: string;
      pointScan: string;
      captureClientId: string;
      capturedAt: string;
      location: Location;
    }
  | {
      kind: 'UNSUCCESSFUL';
      id: string;
      context: RouteContext;
      reason: 'CUSTOMER_UNAVAILABLE' | 'UNCONTACTABLE' | 'ACCESS_BLOCKED';
      captureClientId: string;
      capturedAt: string;
    };
export type Operation = {
  command: Command;
  local: SealedMedia | null;
  captureClientId: string;
  mediaClientId: string;
  handover: Handover | null;
  captureId: string | null;
  media: Media | null;
  stage:
    | 'PREPARED'
    | 'CAPTURE'
    | 'MEDIA'
    | 'UPLOADING'
    | 'FINALIZE'
    | 'FINALIZED'
    | 'GAP'
    | 'ACKNOWLEDGED'
    | 'REJECTED';
};
export type EvidenceState = {
  version: 1;
  owner: string;
  work: Work[];
  operation: Operation | null;
};
export interface EvidenceApi {
  points(signal?: AbortSignal): Promise<Point[]>;
  send(command: Command): Promise<{
    resourceId: string;
    captureId?: string | null;
    handover?: Handover;
  }>;
  register(
    clientId: string,
    captureId: string,
    type: 'PHOTO' | 'VIDEO',
    contentType: string,
  ): Promise<Media>;
  authorize(
    mediaId: string,
  ): Promise<{ authorization: string; expiresAt: string | null }>;
  finalize(mediaId: string): Promise<Media>;
}
export interface MediaVault {
  seal(
    uri: string,
    type: 'PHOTO' | 'VIDEO',
    capturedAt: string,
    current: () => void,
  ): Promise<SealedMedia>;
  read(media: SealedMedia): Promise<Uint8Array>;
  remove(id: string): Promise<void>;
  sweep(keep: string | null): Promise<void>;
}
export function routeContext(route: Route): RouteContext | null {
  const task = nextTask(route);
  return task?.pickup_execution_id
    ? {
        routeId: route.route_id,
        revisionId: route.revision_id,
        assignmentId: route.assignment_id,
        taskId: task.task_id,
        pickupId: task.pickup_execution_id,
      }
    : null;
}
