# OW-P0-02 mutation contracts (recorded before transport implementation)

Source: read-only backend `api/routes/manager.py`, `routing_recovery.py`,
`routing_orchestration.py`, `routing_dispatch.py`, `routing_fleet.py`; services
`dispatch/service.py`, `operations/service.py`, and routing operations
`failure_commands.py`, `replacement_commands.py`, `replacement_reads.py`,
`replacement_options.py`, `authority.py`, `recovery.py`, `operational_commands.py`.
Tests inspected: `test_operational_api.py` assignment/reassignment authorization
and replay cases; `test_rider_failure_recovery.py` incident coverage, activation
replay, provider failure/retry, HTTP 202 transport and revision receipts. Backend
tests are inspected evidence, not tests run by this frontend increment.

All commands require a live MANAGER principal. V1 is mounted at `/v1/manager`.
V2 recovery/orchestration routes require orchestration, fleet **and** dispatch
enabled; dispatch alone exposes route activation/recovery, not incident recovery.
The frontend flags only control UI exposure and never replace backend authority.
Production browser authentication remains unavailable until the approved APIM POC.

| Command / exact POST URL                                                 | Exact body (UUID fields unless otherwise noted)                                                                                                                                                                                  | Preconditions and response                                                                                                                                                                                                                                                                                                                                                                         | Identity, replay, conflicts and follow-up                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1 manual assignment `/v1/manager/collection-groups/{group}/assign`      | `rider_id` only; no discriminator or client business identity                                                                                                                                                                    | Selected pending V1 group and backend-known rider. Server locks group, profile, availability and ownership; checks live role, ACTIVE/AVAILABLE/IDLE, failure holds and route admission. 200 assignment summary below.                                                                                                                                                                              | Natural group/rider replay returns established same-rider assignment; another rider conflicts. 404 missing group; 409 missing/ineligible rider, assigned/inconsistent/non-pending group. Never substitute a rider automatically. Refresh pending groups, riders and any mounted known-booking lineage.                                                                                                                                           |
| V1 reassignment `/v1/manager/assignments/{predecessor}/reassign`         | `client_reassignment_id`, `replacement_rider_id`, optional `incident_id` (V1 pickup incident only)                                                                                                                               | Actual predecessor reference, ACTIVE with transferable ASSIGNED pickups; replacement differs, live eligible rider. Cannot use routed V2 work as a V1 shortcut. 200 assignment summary.                                                                                                                                                                                                             | Browser owns stable reassignment UUID. Durable fingerprint binds predecessor, rider, manager and optional incident. Completed replay returns original successor before fresh eligibility checks. 409 identity/in-progress/state/eligibility/incident conflicts, 404 missing predecessor/incident, 503 idempotency retention absent. Replay identical body only after uncertainty. Refresh riders/groups/lineage/incidents.                       |
| V2 failure `/v2/manager/rider-failures`                                  | `operation: FAIL_RIDER`, `client_command_id`, `rider_id`, `reason: RIDER_UNAVAILABLE \| VEHICLE_UNAVAILABLE \| EXECUTION_EXCEPTION`, `expected_route_versions: {routeUUID: integer}`                                             | Exact full non-CLOSED root/version map from selected rider recovery-state. Server marks roots RECOVERY_REQUIRED, blocks vehicles and enqueues recommendation obligations. 202 `{resource_id}` is incident reference, possibly an existing OPEN incident.                                                                                                                                           | Actor-scoped `routing.failure:{actor}`, SHA256 model JSON, one-day retention, completed replay original resource. 409 COMMAND_IN_PROGRESS/COMMAND_CONFLICT/RETRYABLE_TRANSACTION_CONFLICT, FAILURE_ROUTES_CHANGED, SINGLE_REGIONAL_OWNER_REQUIRED, REPLACEMENT_OWNERSHIP_CHANGED, EXISTING_APPROVAL_REQUIRES_REVIEW. Read rider recovery-state then returned incident detail; never infer completion from acceptance.                            |
| V2 incident allocation same failure endpoint                             | `operation: APPROVE_RECOVERY`, `client_command_id`, `incident_id`, `expected_version >=1`, `selections: [{candidate_id,replacement_ids:[1..100 UUIDs]}]` (1..100 selections), uppercase/digit/underscore `reason` (1..100 chars) | Incident OPEN/version current; each candidate is an immutable backend evaluation. Exact affected-booking coverage, distinct resources, current source, expiry, shift, donor positions and proposal gate checked on server. 202 `{resource_id}` = incident. Creates PENDING recovery assignment(s), APPROVED obligations; enqueues activation, **does not release ownership or complete transfer**. | Same failure command replay scope/TTL. 409 FAILURE_INCIDENT_VERSION_CHANGED, REPLACEMENT_CANDIDATE_STALE, REPLACEMENT_COVERAGE_MISMATCH, INCIDENT_OBLIGATION_MISMATCH, RESOURCE_RECOVERY_PENDING, ACTIVE_SHIFT_REQUIRED, etc. Read incident, selected replacement and routes. UI offers a single backend candidate only when its complete affected-booking set maps to obligations in the current incident page; no guessed or partial coverage. |
| V2 retry same failure endpoint                                           | `operation: RETRY_RECOVERY`, `client_command_id`, `assignment_id`, `expected_version >=1`, `request_new_options: boolean`                                                                                                        | Recovery assignment ATTENTION or AWAITING_TRANSFER/version current. False requeues activation as PENDING. True releases recovery allocation items, resets recommendations and SUPERSEDES old allocation; unresolved physical transfer prevents new options. 202 `{resource_id}` = assignment, not incident.                                                                                        | Same failure identity semantics. 409 RECOVERY_ASSIGNMENT_CHANGED / RESOLVE_PHYSICAL_TRANSFER_FIRST. Preserve parent incident reference separately and reread it. No retry loop or silent replacement selection.                                                                                                                                                                                                                                  |
| V2 failed service resolution same failure endpoint                       | `operation: RESOLVE_FAILED_PICKUP`, `client_command_id`, `replacement_id`, `expected_version >=1`, `no_collection_confirmed: true`                                                                                               | Failure-linked obligation and matching version; pickup must not be COLLECTED. Deliberate manager attestation required. Server releases applicable pending/started route tasks and requeues recommendation. 202 `{resource_id}` = replacement. **Not collection completion or custody transfer.**                                                                                                   | Same failure identity semantics. 409 FAILURE_OBLIGATION_REQUIRED / FAILED_SERVICE_FACTS_CHANGED. Reread replacement, parent incident, rider state/routes. No browser inference of physical facts.                                                                                                                                                                                                                                                |
| V2 ordinary replacement selection `/v2/manager/replacements/{id}/select` | `client_command_id`, `selected_candidate_id`, `expected_version`, `expected_source_version`, `expected_region_version` (all integers >=1), `expected_route_versions`, uppercase reason                                           | Current selectable evaluation/candidate from replacement read; route map comes from candidate's `route_versions`, not unrelated routes. 200 fresh replacement-detail projection. Decision recorded and activation remain distinct.                                                                                                                                                                 | Operational actor-scoped durable fingerprint/replay using configured TTL; 409 version/source/region/route/expiry/ownership/custody conflicts; `USE_INCIDENT_RECOVERY_ALLOCATION` explicitly rejects failure obligations. The replacement read does not expose `failure_incident_id`: this error directs the manager to incident recovery; no fallback command. Refresh detail/history/known route/rider reads.                                   |

Assignment summary: `assignment_id`, nullable `collection_group_id`, `rider_id`,
`source`, `status`, `assigned_at`, nullable `started_at`, nullable `completed_at`.
No command accepts a frontend MANAGER role assertion or a fabricated version.
Known non-2xx conflicts show controlled messages; unknown bodies never reach UI.

## Route mapping and event ownership

`failure_commands.rider_routes` joins VehicleRoute to RiderAssignment by the
actual assignment relationship, filters the selected rider and non-CLOSED roots,
orders by route ID. Both GET recovery-state and FAIL_RIDER use that helper.
Failure processing additionally discovers unhanded-over owned pickups and current
transferred custody on the server, locks booking/resources, rereads roots and
compares the whole version map. The browser sends the returned map verbatim; it
does not discover affected requests or reconstruct regional ownership.

Recovery work/outbox delivery invokes finite backend workers. Activation and
RouteDelivery/RouteAcknowledgment persist revision-specific synchronization;
notifications target riders/devices. There is no verified manager event stream
to subscribe to. UI reconciliation is selected-resource only, user-started,
finite, cancelable and stops on errors, navigation, logout, hidden page or budget.
Manual refresh remains available. No planner, VROOM/OSM, timer-based command retry
or global fanout is introduced.

## State interpretation

Only persisted values are displayed: replacement REQUESTED (no evaluation yet),
RECOMMENDED (decision opportunity when evaluation current/selectable), APPROVED
(selection recorded, activation pending unless actual activation exists),
COMPLETED plus backend `authoritative` and activation reference. Recovery
assignments PENDING/RUNNING/AWAITING_TRANSFER/ACTIVATED/ATTENTION/SUPERSEDED are
displayed literally, with failure codes, actual activation/current revision IDs,
acknowledgment boolean/due/escalation and custody booleans. OPEN is not completed.
No synthetic RECOVERED or successful planner status is created. Partial pages
are never summarized as incident-wide completion.

## Deliberately unavailable commands

Direct `/v2/manager/routes/activate` consumes ActivationCommand and validated
planner run/source authority; `/routes/recover` consumes current route/revision
RecoveryCommand but is not incident allocation. Fleet policy and arbitrary
`/manager/operations` variants are outside these workflows. No generic write
escape hatch, direct activation, physical transfer approval or collection
completion button is implemented. Backend remains strictly read-only here.
