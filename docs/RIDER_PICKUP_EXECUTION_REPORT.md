# RM-P0-02 — Pickup execution, route progress and incidents

Branch: `codex/rider-pickup-execution`. Date: 23 October 2026.
Created directly from `codex/rider-mobile-foundation` at
`afdcb3032f371173db8802673068996c79949a5d`, retained in ancestry. No main/Customer/
Razorpay branch was used as the base or merged. Backend main inspected read-only:
`b281e03a47d202fd8b5c3d895075aa358062c5fa`.

## Implemented experience

Active Assignment retains the foundation navigation/design and adds an execution
panel with assignment start, current pickup details, confirmation of physical
outcomes, unsuccessful attempts, incident reasons, ordered V2 next-task actions,
route receipt and vehicle issue reporting. Each action requires explicit selection
and confirmation. Query data is refreshed after accepted, rejected and ambiguous
submissions; current assignment/task statuses are never updated optimistically.

The panel also loads durable interrupted-command recovery, shows saved backend
receipts separately from current work, supports exact explicit replay and requires
review before clearing confirmed or definitively rejected commands. Recovery-load
errors have an explicit retry. An ambiguous command cannot be silently discarded,
changed into a different outcome or redirected to replacement work.

Development fixtures add coherent V1 execution, V2 execution and recovery scenarios.
They preserve earlier fixture screens and use a separate memory journal. Changing
scenarios invalidates old fixture generations and clears only the fixture journal.
Live requests never fill gaps with fixture data. Existing OTP, availability/offers,
RIDER admission and native FCM gates remain intact.

## Execution-authority matrix

The mode is determined from explicit backend assignment `source` plus successful
owned assignment/availability/route reads. A missing or failed route read alone is
never interpreted as permission to use V1. Unknown/inconsistent sources or work
identities block execution. All listed frontend checks are advisory prerequisites;
the backend performs current authorization and transaction guards.

| Backend context                                                                                                         | Command/path                         | Frontend behavior and server transition                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACTIVE `RIDER_OFFER_ACCEPTED` or `MANAGER_ASSIGNED`, route GET succeeds with null, not started, work state RESERVED     | V1 assignment start                  | Bodyless POST to the same assignment; server starts once, changes RESERVED to BUSY; repeated start is business-idempotent                                                     |
| Same V1 assignment, started, BUSY, current unreleased ASSIGNED pickup                                                   | V1 attempt COLLECTED                 | Stable `client_attempt_id`; server changes pickup to COLLECTED and completes assignment/sets IDLE only when all owned pickups are collected                                   |
| Same V1 context                                                                                                         | V1 attempt NOT_COLLECTED             | Stable separate attempt; server records failure but leaves pickup ASSIGNED and assignment active; no automatic incident/reassignment/completion                               |
| Same V1 context                                                                                                         | V1 incident                          | Stable `client_incident_id` and one of six supported reasons; returns OPEN or historical RESOLVED incident; no client assignment/route mutation                               |
| `COMMITTED_DISPATCH` with matching owned V2 route                                                                       | V1 start/attempt/incident            | Never exposed or invoked: backend explicitly rejects these paths for vehicle-bound work                                                                                       |
| Matching V2 route, current revision, next live PICKUP task                                                              | DEPART                               | Stable `client_command_id`, `task_id`, `revision_id`; backend commits departure for PENDING/STARTED task without marking it completed                                         |
| Matching ACTIVE V2 route, BUSY, next PICKUP task PENDING                                                                | START                                | Starts the task within the actual booking/appointment window and commits it; no V1 assignment-start composition                                                               |
| Matching ACTIVE V2 route, BUSY, next PICKUP task STARTED, current pickup ASSIGNED                                       | PICKUP/COLLECTED                     | One V2 command records attempt/collection/cargo observation and completes pickup task; route may still require DISCHARGE and stays active/BUSY                                |
| Matching V2 route                                                                                                       | ACKNOWLEDGE through Rider operations | Records receipt of a revision. Receipt is not acceptance, shift confirmation or execution authority                                                                           |
| Matching ACTIVE V2 route                                                                                                | Vehicle issue                        | Explicit supported reason; backend blocks vehicle collection, sets RECOVERY_REQUIRED and records FleetException/outbox. Client does not run planner/reassign/close assignment |
| V2 RECOVERY_REQUIRED                                                                                                    | Fresh pickup progression             | Blocked. Backend permits some DISCHARGE work, but discharge is outside this increment                                                                                         |
| V2 unsuccessful outcome                                                                                                 | PICKUP/NOT_COLLECTED                 | Gated: regional execution requires real evidence; regional/nonregional mode is not exposed by current reads, so no evidence-free fallback is attempted                        |
| Next V2 task DISCHARGE                                                                                                  | DEPART/START/DISCHARGE               | Read-only here. Scans, real capture, receiving-point identity, location and custody requirements belong to RM-P0-03; later tasks are never skipped                            |
| Missing matching V2 route, legacy source with a route, unknown source/kind/state, inconsistent identity or failed reads | Any fresh pickup action              | Unavailable until authoritative refresh establishes a supported path                                                                                                          |

V2 START can itself establish commitment; the backend does not require the client
to compose DEPART+START or invoke a V1 mutation for the same physical action. The
UI offers separate departure and at-location start actions. Task order is the
server's revision-stop order, skipping only known terminal COMPLETED/CANCELLED
states. Unknown states/kinds do not permit skipping to a later familiar task.

Exact replay never substitutes the latest revision into an old command. The backend
returns a completed command result before fresh state guards; a committed task may
also use a historical revision under its explicit membership/commitment checks.
The frontend preserves the original fields and leaves this decision to the backend.

## Verified endpoint/schema mapping

Source paths below are relative to backend `src/tirodhan` at the inspected main SHA.
Operational requests remain authenticated RIDER calls. No role, claimed rider ID,
manager assignment, routing proposal, GPS placeholder or evidence placeholder is sent.

| Endpoint                                                 | Exact request                                                                                                                   | Response and source                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/v1/rider/assignments/{assignment_id}/start`       | No body; no invented client ID header                                                                                           | AssignmentSummaryResponse; `api/routes/rider.py:580`, `modules/pickups/service.py:start_assignment`                                                              |
| POST `/v1/rider/pickups/{pickup_execution_id}/attempts`  | `{client_attempt_id, outcome: COLLECTED / NOT_COLLECTED}`                                                                       | attempt ID, execution/assignment/client IDs, attempt_number, outcome, attempted_at; `rider.py:607`, `pickups/service.py:record_pickup_attempt`                   |
| POST `/v1/rider/pickups/{pickup_execution_id}/incidents` | `{client_incident_id, reason_code}`                                                                                             | incident/client/execution/assignment IDs, reason_code, status, opened_at; `rider.py:646`, `modules/operations/service.py:open_pickup_incident`                   |
| GET `/v1/rider/me/assignment`                            | No body                                                                                                                         | `{assignment: null or ...}` with source/status/start/completion/current pickups; `rider.py:557`, `modules/dispatch/queries.py:get_active_assignment`             |
| GET `/v1/rider/me/availability`                          | No body                                                                                                                         | Rider identity, intent, independent work state, version and timestamp; `rider.py:481`                                                                            |
| GET `/v2/rider/route`                                    | No body                                                                                                                         | null or route/vehicle/assignment/revision/status plus server-ordered tasks; `api/routes/routing_dispatch.py:143,_route_view`                                     |
| POST `/v2/rider/route-tasks`                             | `{client_command_id, task_id, revision_id, operation: START / DEPART}` or same fields with `operation:PICKUP,outcome:COLLECTED` | `{resource_id}`; `routing_dispatch.py:112`, `modules/routing_operations/execution.py:TaskCommand,StartTask,DepartTask,PickupTask,execute_task`                   |
| POST `/v2/rider/operations`                              | `{client_command_id,operation:ACKNOWLEDGE,revision_id}`                                                                         | `{resource_id}` equal to revision; `api/routes/routing_orchestration.py:_command,rider_operation`, `routing_operations/operational_commands.py:AcknowledgeRoute` |
| POST `/v2/rider/vehicle-issue`                           | `{client_command_id,route_id,reason}`                                                                                           | `{exception_id}`; `api/routes/routing_fleet.py:173`, `routing_operations/telemetry.py:VehicleIssueCommand,report_vehicle_issue`                                  |

V1 incident reasons: CUSTOMER_UNAVAILABLE, ADDRESS_NOT_FOUND, ACCESS_BLOCKED,
RIDER_UNABLE_TO_REACH, RIDER_UNABLE_TO_CONTINUE, OTHER. No free-text reason body is
invented. V2 vehicle reasons are separately BREAKDOWN, LOAD_UNCERTAIN,
DISCHARGE_DELAY, SAFETY; these are not mapped from V1 incident codes.

V1 attempt/incident receipts validate the original command and pickup/assignment IDs,
outcome/reason and server timestamps. Start validates assignment, rider, lifecycle
and started_at. V2 responses are smaller: START/DEPART must return the task ID and
ACK the revision ID; collection/issue returns the server resource ID. Saved receipts
are historical command acknowledgements, not fabricated current route projections.

V1 start replay is keyed by assignment business identity; the journal's local ID is
not sent because this endpoint accepts no client command body. V1 attempts use the
existing execution/client-attempt unique history and reject conflicting outcomes.
V1 incidents retain client-incident uniqueness and reject changed target/reason.
V2 uses actor-scoped client UUID plus exact backend fingerprint in the existing
idempotency record, with domain mutations/outbox/result committed together.

Reviewed backend tests include `tests/integration/test_pickup_lifecycle.py`,
`test_pickup_incident_reassignment.py`, and `test_routing_dispatch.py` (legacy path
rejection, collected cargo, stale revisions, unsuccessful attempt and recovery).
They were inspected, not run or modified in the read-only backend repository.

## Operational input guards and confirmed limitations

`routing_operations/execution.py:execute_task` enforces live RIDER authorization,
route ownership, Payment/booking and resource locks, nonclosed/recovery state,
current or explicitly grandfathered revision, next live task, active shift,
fresh vehicle position, operating break, cancelled booking, pending cargo transfer,
vehicle block, regional receipt, current pickup ownership and physical capacity.
START additionally checks appointment window/booking state. The client neither
manufactures these permissions nor changes backend flags.

- Shift creation/attestation remains manager-controlled. Existing Rider operation
  SHIFT_CONFIRM takes `{client_command_id,operation,shift_id}` and is distinct from
  ACKNOWLEDGE. It is not automatically inferred or sent by this increment.
- Position ingestion exists at POST `/v2/rider/vehicle-position`, with exact
  `{client_command_id,shift_id,longitude,latitude,observed_at,accuracy_m}`. The backend
  checks the authenticated live session, owned active shift, telemetry age/accuracy,
  monotonic observations and plausible movement under configured FleetControl policy.
  **Current Rider assignment/route/dispatch-sync reads do not return shift_id.**
  No Rider-owned shift discovery endpoint was found. The app therefore cannot
  establish fresh telemetry from these reads, does not guess a shift or use a manager
  read, and sends no fake/manual coordinates. V2 progress remains conditional on
  operationally supplied valid backend inputs; FRESH_POSITION_REQUIRED is displayed
  explicitly when rejected. Complete phone-to-backend telemetry integration is blocked.
- GET `/v2/rider/dispatch-sync` exposes revision receipt state, not shift identity or
  regional execution policy. ACKNOWLEDGE is implementable from the owned route revision
  and is included. It does not authorize a shift or remove a break/recovery/transfer.
- Regional NOT_COLLECTED needs one of CUSTOMER_UNAVAILABLE/UNCONTACTABLE/ACCESS_BLOCKED,
  a real client_capture_id and captured_at within task start/server time. It creates
  failed-attempt evidence/reattempt state and releases/wakes existing recovery. The
  client does not pretend that generating a UUID/timestamp constitutes real evidence.
  Nonregional NOT_COLLECTED retains its started task until recovery, but current reads
  do not disclose that policy mode; all fresh V2 unsuccessful completion is gated.
- COLLECTED has no mandatory capture in the inspected V1/V2 command path. It can be
  recorded without inventing evidence; media/evidence follow the existing separate
  backend workflow in RM-P0-03.
- DISCHARGE requires scanned pickup and receiving identifier, real capture/time,
  coordinates, correct cargo custodian, receiving availability/window and server
  validation. No discharge command or full handover/media workflow is implemented.
- V1 pickup incidents reject COMMITTED_DISPATCH. V2 exposes vehicle issue/recovery,
  not an equivalent six-reason V1 pickup incident. The app does not invent a mapping
  or attempt manager-only rider failure/replacement operations.
- If unconfirmed work has disappeared or been replaced, current-only GETs cannot prove
  the historical client-command result. Automatic retargeting/discard is forbidden;
  the command stays retained and needs operations review. Exact replay is offered only
  while the original assignment/target still matches current owned work. V1 pickup
  bodies cannot carry an expected assignment ID; fresh reads and returned identity
  validation cannot replace the backend's transactional race arbitration.
- V2 replay relies on configured backend command-ID retention. No retention TTL is
  advertised to the app; long-offline ambiguity needs operations review rather than
  allocating new IDs or assuming success. Native FCM delivery remains the foundation's
  separate configuration gap; manual/focus refresh is not claimed equivalent to push.

These are integration/contract limitations, not relaxed client permissions. Real V1
execution is implemented; full operational V2/device acceptance is not claimed.

## Durable command and session recovery

One outstanding command per Rider is saved before POST under
`tirodhan.rider.execution.v1`, using OS SecureStore
WHEN_UNLOCKED_THIS_DEVICE_ONLY. A strict versioned record is bounded to 1800
characters (IDs/enums/controlled receipt text), avoiding native value-size overflow.
It stores owner, exact command fields/ID and prepared/confirmed/rejected state; it
never stores addresses, coordinates, OTP, access/refresh tokens, pictures or provider
exception text. There is no ordinary/browser storage or live memory fallback.

One coordinated flight prevents duplicate submissions; serialized storage orders
prepare/update/clear. A crash after prepare or a timeout after commit leaves the
original command for explicit identical recovery. A lost confirmation write also
leaves it uncertain; no second command is persisted or submitted to hide uncertainty. Edited payloads,
unknown fields and corrupt records fail closed. Confirmed receipts and definitive
404/409/422 rejections can be cleared only after a fresh authoritative read and
explicit review. Other errors/ambiguity cannot be silently cleared.

Every fresh action cancels stale execution reads and fetches assignment, route and
availability successfully before sealing. Stale UI selection is rejected before POST.
After any submission outcome the existing operations refresh reads current work.
Query keys keep local recovery separate from operational refresh and assignment focus cancellation. Unknown
task states cannot be skipped. Generation guards prevent stale async results from
publishing into another owner/scenario's cache.

Involuntary authentication loss retains sealed owner-scoped recovery for the same
Rider's later OTP admission. Explicit logout clears it; account switch removes old
owner data without exposing it. Delayed writes/HTTP responses cannot resurrect it.
Local sign-out occurs before network revocation; server logout is attempted even if
execution-journal deletion fails. Foundation coordinated 401 refresh remains intact;
403 does not refresh and triggers principal revalidation. Caller aborts cannot apply
late response data or clear a renewed session.

Only allowlisted backend guard codes are retained for useful UI errors. Raw backend
details are discarded; HTTP 401/403/404/409/422 and network ambiguity never become
pickup success. No frontend planner/manager API, automatic recovery worker, polling
loop, deployment or native background job was introduced.

## Validation

| Validation                                          | Result                                                  |
| --------------------------------------------------- | ------------------------------------------------------- |
| Rider TypeScript (`pnpm typecheck:rider`)           | Passed                                                  |
| Rider ESLint (`pnpm lint:rider`)                    | Passed, zero warnings                                   |
| Formatting                                          | Passed with Windows line-ending adaptation              |
| Rider Jest                                          | 98 tests across 8 suites passed; no skips or force-exit |
| Android/iOS Hermes and web exports                  | Passed                                                  |
| Dependencies / shared tooling / Customer source     | Unchanged; no new packages or SDK versions              |
| Native compilation / real device / deployed backend | Not performed                                           |

The full suite includes foundation regressions, execution authority, V1 start/outcomes/
incidents, V2 ordering/revisions/recovery, conflicting replay, storage failure before
POST, timeout-after-commit/restart, cancellation rejection, 401/403/404/409/422,
logout/account races, secure recovery reload, actual live/fixture composition and
strict evidence/discharge boundaries. Actual runtime composition tests use mocked
OS storage and HTTP, not native hardware or a real backend. Local diagnostic runs
were followed by the complete passing suite; no test exclusion or CI weakening was
introduced. Logs/output are retained under ignored `.local/rm-p0-02-*` paths.

No shared tooling, package manifests, lockfile or Customer code changed, so the
conditional Customer regression requirement was not triggered. Expo Doctor was not
required for this dependency-free increment; the prior foundation report retains its
remote schema TLS limitation rather than claiming it resolved here. No Rider cloud
build, paid service, production credential, deployment, push or merge was initiated.
Mocked tests do not prove native SecureStore, actual GPS/OTP, real database races or
deployed backend/device correctness. Native compilation/device execution were not run.

## RM-P0-03 scope

Add genuine evidence capture, safe private media retention/upload/finalization,
receiving-point scans and location, whole-lot custody validation and handover outcome
display. Resolve Rider shift discovery/telemetry and notification prerequisites through
approved existing-service integration first. Preserve stable command identity across
capture/upload failures, server route/recovery authority, and completed pickup history.
Do not roll back physical collection because media upload fails or infer handover
completion before the backend validates it.

## Complete changed-file inventory

- `apps/rider-mobile/README.md`
- `apps/rider-mobile/src/api/errors.ts`
- `apps/rider-mobile/src/api/execution-client.ts`
- `apps/rider-mobile/src/api/transport.ts`
- `apps/rider-mobile/src/features/Account.tsx`
- `apps/rider-mobile/src/features/Assignment.tsx`
- `apps/rider-mobile/src/features/execution/contracts.ts`
- `apps/rider-mobile/src/features/execution/ExecutionPanel.tsx`
- `apps/rider-mobile/src/features/execution/journal.ts`
- `apps/rider-mobile/src/features/execution/service.ts`
- `apps/rider-mobile/src/features/fixtures.ts`
- `apps/rider-mobile/src/runtime.ts`
- `apps/rider-mobile/src/session/execution.ts`
- `apps/rider-mobile/src/test/execution-runtime.test.ts`
- `apps/rider-mobile/src/test/execution.test.ts`
- `apps/rider-mobile/src/test/screens.test.tsx`
- `docs/RIDER_PICKUP_EXECUTION_REPORT.md`
