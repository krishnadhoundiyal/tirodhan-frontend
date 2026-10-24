// Hand-mapped to backend main b281e03; no client-asserted identity/role fields.
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
}
export interface LoginTokenResponse extends AccessTokenResponse {
  refresh_token: string;
}
export interface PrincipalResponse {
  user_id: string;
  roles: string[];
}
export interface Availability {
  rider_id: string;
  availability_intent: string;
  work_state: string;
  version: number;
  updated_at: string;
}
export type AvailabilityIntent = 'AVAILABLE' | 'OFFLINE';
export interface Offer {
  offer_id: string;
  collection_group_id: string;
  offer_round: number;
  status: string;
  offered_at: string;
  expires_at: string;
}
export interface AssignmentSummary {
  assignment_id: string;
  collection_group_id: string | null;
  rider_id: string;
  source: string;
  status: string;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
}
export interface Pickup {
  pickup_execution_id: string;
  request_id: string;
  status: string;
  slot_start: string;
  slot_end: string;
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  declared_items: {
    item_category_code: string;
    declared_quantity: number | null;
    declared_weight_grams: number | null;
  }[];
}
export interface Assignment extends Omit<AssignmentSummary, 'rider_id'> {
  pickups: Pickup[];
}
export interface AssignmentEnvelope {
  assignment: Assignment | null;
}
export interface RouteTask {
  task_id: string;
  pickup_execution_id: string | null;
  kind: string;
  state: string;
  committed_at: string | null;
  receiving_point_id: string | null;
  planned_start: string;
  planned_end: string;
}
export interface Route {
  route_id: string;
  vehicle_id: string;
  assignment_id: string;
  revision_id: string;
  status: string;
  tasks: RouteTask[];
}
