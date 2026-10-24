# RM-P0-01 — Rider Mobile foundation

Date: 23 October 2026. Branch: `codex/rider-mobile-foundation`.

## Provenance and isolation

Created directly from fetched frontend `origin/main` at
`103d181eae4ebc539f8253cb009ac1b42c953e12`. The branch did not previously exist.
Neither unfinished Customer branch was merged or used as the base. Backend main
was inspected locally, read-only, at `b281e03a47d202fd8b5c3d895075aa358062c5fa`.
Both repositories were clean at initial inspection. No backend files were changed.

Read frontend architecture, Customer OTP/session/secure storage/transport/query and
tooling patterns, backend project/architecture/assignment ADR and relevant privacy,
idempotency, route, dispatch and identity implementation. FastAPI/PostgreSQL remain
the role, ownership and operational-state authorities.

Rider has independent slug `tirodhan-rider`, scheme `tirodhan-rider`, package name
`@tirodhan/rider-mobile` and native application identifiers `com.tirodhan.rider`.
These are local configuration only, with no bundle/cloud registration performed.
It has separate entry routes, environment flags, scripts, dependencies, test config,
quality/export workflow and unlinked development/preview build profiles.

No direct imports from Customer Mobile exist. The established app-local SessionStore,
Transport, SecureStore and design-token patterns were adapted with source provenance;
no speculative shared package or Customer business changes were introduced. Rider adds
generation checks to suppress stale responses, prevents a refresh from changing its
owner and keeps refresh flights isolated across account changes. React Query owns
server state; mutations are not automatically retried and no operational data is
persisted in a local database or browser storage.

## Delivered screens and behavior

- Splash/bootstrap and OTP sign-in/verification. OTP intents and retry IDs live in
  memory, never URL params, storage or logs. Duplicate requests share one flight;
  ambiguous retries retain the original command identity. Changing the phone or
  leaving authentication clears transient challenge/code data.
- Live principal admission for RIDER, with loading/retry/forbidden states and logout.
  A valid token without a matching live principal is insufficient. CUSTOMER or
  MANAGER alone is denied. No client-asserted role/identity header or body is sent.
- Home shows availability intent, separate backend work state, version and update
  timestamp. AVAILABLE/OFFLINE commands use the displayed version. Conflicts refresh
  authoritative state, never silently retry a write using a newer version.
- Offers displays server-returned IDs, group, round, lifecycle and expiry. Only OPEN,
  locally unexpired offers may be submitted. A single local expiry timer updates
  eligibility; it performs no polling. The backend is the final expiry/race authority.
- Acceptance is single-flight, uses only the owned Rider operation, and refreshes
  availability, offers, assignment and route after both success and uncertain failure.
  Historical replay acknowledgements never fabricate current assigned work.
- Active Assignment presents actual assignment/source/status/timestamps, current
  unreleased pickups, booking windows, address/location and declared items. No pickup
  execution, evidence, incident, handover, manager assignment or replanning action
  is exposed in this increment.
- Route is a separate read with route/vehicle/assignment/revision/status and ordered
  tasks, state, receiving-point IDs, planned windows and commitment time. Server
  ordering is retained. There is no fabricated geometry, location, ETA or optimization.
  Null route and null assignment have separate states; mismatching identities are
  displayed explicitly and require refresh. Stale cached work after errors is labelled.
- Account/logout clears owner-scoped queries, operations and local credential state
  immediately, then attempts server revocation of the captured old refresh credential.
  In-flight work cannot repopulate another account. Failed revocation still leaves
  the device signed out; server expiry/revocation needs network connectivity.
- SCREEN_PREVIEW is development-only and selects a wholly separate in-memory
  repository. Labelled offers/active/empty/expired/conflict/network scenarios are
  available from Account. No fixture fills gaps in live responses. Live web auth is
  unavailable; OS secure credential storage is required.

## Exact backend mapping

All paths below were verified against backend main, not inferred from frontend docs.
All operational calls use authenticated live RIDER authorization. Raw backend/provider
error details are discarded; only controlled HTTP status messages reach UI.

| Operation             | Request                                                                    | Response and authority                                                                                                                             | Source                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Start OTP             | POST `/v1/auth/otp/start`, `{client_request_id, phone}`                    | `{challenge_reference}`; client UUID retained for retry                                                                                            | `api/routes/auth.py:65,125`; `modules/identity/service.py`                                                                                |
| Verify OTP            | POST `/v1/auth/otp/verify`, `{client_login_id, challenge_reference, code}` | access JWT, bearer type, server `expires_in`, user ID and stable refresh credential                                                                | `api/routes/auth.py:75,179`                                                                                                               |
| Refresh               | POST `/v1/auth/refresh`, `{refresh_token}`                                 | access-only token response; never replaces stored stable credential                                                                                | `api/routes/auth.py:82,243`                                                                                                               |
| Logout                | POST `/v1/auth/logout`, `{refresh_token}`                                  | 204, server session revocation                                                                                                                     | `api/routes/auth.py`                                                                                                                      |
| Principal             | GET `/v1/auth/me`                                                          | `{user_id, roles}`; private/no-store; presentation admission only                                                                                  | `api/routes/auth.py:51,56`                                                                                                                |
| Availability read     | GET `/v1/rider/me/availability`                                            | `{rider_id, availability_intent, work_state, version, updated_at}`; missing row 404                                                                | `api/routes/rider.py:139,481`; `modules/dispatch/queries.py`                                                                              |
| Availability write    | PUT same path, `{intent: AVAILABLE                                         | OFFLINE, expected_version>=1}`                                                                                                                     | incremented backend version; stale version 409; missing rider 404                                                                         | `api/routes/rider.py:147,492`; `modules/dispatch/service.py:98`      |
| Offers                | GET `/v1/rider/me/offers`                                                  | array of `{offer_id, collection_group_id, offer_round, status, offered_at, expires_at}`; OPEN and unexpired, sorted offered_at/offer_id, limit 100 | `api/routes/rider.py:151,513`; `modules/dispatch/queries.py:87`                                                                           |
| Accept                | POST `/v1/rider/offers/{offer_id}/accept`, no body                         | assignment summary incl rider ID; not-found/foreign offer 404; expiry/ineligibility/competing assignment/state race 409                            | `api/routes/rider.py:160,529`; `modules/dispatch/service.py:181`                                                                          |
| Active assignment     | GET `/v1/rider/me/assignment`                                              | `{assignment: null                                                                                                                                 | {assignment_id, collection_group_id, source, status, assigned_at, started_at, completed_at, pickups}}`; inconsistent multi-assignment 409 | `api/routes/rider.py:177-200,557`; `modules/dispatch/queries.py:108` |
| Route                 | GET `/v2/rider/route`                                                      | JSON null or route identity, vehicle, assignment, revision, status and `tasks`; task order comes from revision-stop ordinal                        | `api/routes/routing_dispatch.py:143,171`; `modules/routing_operations/dispatch_models.py`                                                 |
| Push register (gated) | POST `/v1/rider/me/push-devices`, `{client_device_id, platform: ANDROID    | IOS, registration_token}`                                                                                                                          | registration identity/provider/platform; live Rider ownership, missing/ineligible 404/409                                                 | `api/routes/rider.py:879-923`; `modules/dispatch/devices.py:13`      |
| Push revoke (gated)   | DELETE `/v1/rider/me/push-devices/{client_device_id}`                      | 204; Rider-owned revoke                                                                                                                            | `api/routes/rider.py:926`; `modules/dispatch/devices.py:62`                                                                               |

Assignment pickups expose execution/request/status/slot_start/slot_end/address/latitude/
longitude and declared category/quantity/weight. V1 pickup order is the server's
execution-ID order, not an optimized route. Route tasks expose task/execution/kind/state/
committed_at/receiving_point_id/planned_start/planned_end; the route API exposes no
household address or live ETA. Only the assignment API supplies household details.

Availability compare-and-set is the command's concurrency/idempotency strategy:
the first matching version commits one change; replaying the old version conflicts,
then a GET establishes the actual result. It does not use an invented idempotency key.
Offer acceptance uses offer/group business identity and transactional locks/constraints;
accepted/resolved same-rider replay can return historical assignment after completion.
Competing riders do not both win. No body/header/manager command was invented.
See backend `docs/IDEMPOTENCY.md` assignment sections and dispatch service.

Concurrent protected 401s coordinate one refresh and replay each original request once;
delayed old-token 401 uses the already renewed token. 403 never refreshes tokens.
Operational 403 triggers principal revalidation. Persistent 401 or refresh failure clears
local session. The reused conservative refresh policy also clears credentials after
renewal/network failure, requiring a fresh OTP rather than retaining uncertain access.
Secure writes/removals are ordered and late callbacks cannot restore a logged-out session.

## Notifications boundary and recovery

Backend `modules/dispatch/push.py` delivers Firebase Cloud Messaging notifications:
`{type: ASSIGNMENT_OFFER, collection_group_id, offer_round}` and
`{type: ROUTE_REVISION, revision_id}`. They identify refresh work, not offer acceptance
or route authority. Server outbox/inbox/delivery and notification workers own delivery
and duplicate handling. The typed decoder recognizes only these verified shapes.

This app does not yet register devices or subscribe a native notification listener.
Registration is explicitly disabled in code and UI. Rider-specific Firebase Android/iOS
configuration, provider credentials on the existing backend, compatible native FCM token
acquisition (including iOS FCM/APNs mapping) and development-device delivery tests remain
prerequisites. No Firebase project/service/production identifier was created. An Expo
push token or raw APNs token must not be substituted for the expected FCM registration token.

Focus/foreground return and explicit Refresh re-read authoritative current work, including
manager-driven changes. There is no periodic operational polling and this recovery is
not claimed equivalent to the agreed asynchronous notification mechanism. Full operational
acceptance remains gated on configured native notification delivery.

## Validation

| Check                                                  | Result                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Frozen pnpm installation, strict release-age policy    | Passed, no dependency-policy changes                                                              |
| Rider TypeScript                                       | Passed                                                                                            |
| Rider ESLint                                           | Passed, zero warnings                                                                             |
| Rider formatting                                       | Passed with Windows line-ending adaptation                                                        |
| Rider Jest                                             | 64 tests, 6 suites passed, no skips/force-exit                                                    |
| Rider Android/iOS Hermes and web export                | Passed                                                                                            |
| Expo Doctor                                            | 20/21 checks passed; remote app-config schema check failed on TLS connection after three attempts |
| Customer regression                                    | TypeScript and 98 tests across 14 suites passed                                                   |
| Customer files/workflow/lockfile importer              | Unchanged from origin/main                                                                        |
| Native compilation / real devices / real Rider backend | Not performed                                                                                     |

The actual remaining Doctor error is:

```text
Unexpected error while running 'Check Expo config (app.json/ app.config.js) schema' check:
TypeError: fetch failed
Error: Client network socket disconnected before secure TLS connection was established
```

Dependency compatibility and the other Doctor checks passed; the remote schema
check is **not** claimed passed. No package exclusions, disabled schema check,
TLS verification bypass, test skips or weaker CI checks were used. CI retains the
full Doctor command. Initial local validation exposed and fixed expiry-render purity
and query typing issues. The final validation uses the repository's pnpm scripts;
Jest additionally uses an ignored local transform cache. Logs and export output are
under ignored `.local/rm-p0-01-*` directories, with no operational credentials.

Mocked JavaScript tests and
Hermes/web exports do not establish native compilation, real Rider backend validation,
OTP delivery, assignment races against a real database or native device notification delivery.

No Rider cloud build, signing credential, production registration, release, push, merge or
deployment was initiated. The separate Customer Razorpay continuation and its existing
one-build approval do not authorize a Rider cloud project or Rider cloud builds.

## Remaining integration/configuration requirements

- Configure the Rider-specific HTTPS API URL for the selected backend/APIM, plus
  existing identity provider, refresh-session retention and principal availability.
- Provision/onboard a real Rider through the existing backend/operations process:
  live RIDER membership, active eligible rider profile and availability row. This
  app does not grant roles or create a second onboarding authority.
- Use real owned offers/assignments and existing authorized address decryption.
  V2 route visibility depends on actual backend route authority/activation, which
  the client never enables. Null route is a valid state for retained V1 work.
- Configure/test native FCM and backend delivery before claiming operational offer
  notification acceptance. No polling equivalent is claimed.
- Complete approved Rider-native build registration, signing and device acceptance
  separately. The independent quality/export pipeline is implemented; a production
  release pipeline is not activated without those explicit release prerequisites.
- Rerun full Expo Doctor when Expo's remote schema service is reachable.

## Next increment

RM-P0-02 should add backend-authoritative pickup execution, operational incidents,
evidence capture/upload and receiving-point handover using existing stable execution
IDs and client command replay identities. It should include notification delivery first,
real-device OTP/role/session acceptance, backend-integration concurrency tests, custody
and manager-recovery visibility, and an explicit approved offline/retry/media policy.
Do not infer custody, restore released work, fabricate evidence, or replan routes locally.

## Complete changed-file inventory

- `.github/workflows/rider-mobile.yml`
- `apps/rider-mobile/.env.example`
- `apps/rider-mobile/app.config.ts`
- `apps/rider-mobile/app/_layout.tsx`
- `apps/rider-mobile/app/(rider)/_layout.tsx`
- `apps/rider-mobile/app/(rider)/account.tsx`
- `apps/rider-mobile/app/(rider)/assignment.tsx`
- `apps/rider-mobile/app/(rider)/index.tsx`
- `apps/rider-mobile/app/(rider)/offers.tsx`
- `apps/rider-mobile/app/index.tsx`
- `apps/rider-mobile/eas.json`
- `apps/rider-mobile/eslint.config.js`
- `apps/rider-mobile/jest.config.js`
- `apps/rider-mobile/package.json`
- `apps/rider-mobile/README.md`
- `apps/rider-mobile/src/api/client.ts`
- `apps/rider-mobile/src/api/contracts.ts`
- `apps/rider-mobile/src/api/errors.ts`
- `apps/rider-mobile/src/api/parse.ts`
- `apps/rider-mobile/src/api/transport.ts`
- `apps/rider-mobile/src/configuration.ts`
- `apps/rider-mobile/src/features/Account.tsx`
- `apps/rider-mobile/src/features/Admission.tsx`
- `apps/rider-mobile/src/features/Assignment.tsx`
- `apps/rider-mobile/src/features/auth.ts`
- `apps/rider-mobile/src/features/fixtures.ts`
- `apps/rider-mobile/src/features/Home.tsx`
- `apps/rider-mobile/src/features/Login.tsx`
- `apps/rider-mobile/src/features/Offers.tsx`
- `apps/rider-mobile/src/features/operations.ts`
- `apps/rider-mobile/src/hooks.ts`
- `apps/rider-mobile/src/notifications/signals.ts`
- `apps/rider-mobile/src/runtime.ts`
- `apps/rider-mobile/src/session/admission.ts`
- `apps/rider-mobile/src/session/secure.ts`
- `apps/rider-mobile/src/session/store.ts`
- `apps/rider-mobile/src/test/auth.test.ts`
- `apps/rider-mobile/src/test/contracts.test.ts`
- `apps/rider-mobile/src/test/isolation.test.ts`
- `apps/rider-mobile/src/test/operations.test.ts`
- `apps/rider-mobile/src/test/screens.test.tsx`
- `apps/rider-mobile/src/test/session.test.ts`
- `apps/rider-mobile/src/test/setup.ts`
- `apps/rider-mobile/src/theme/tokens.ts`
- `apps/rider-mobile/src/ui.tsx`
- `apps/rider-mobile/tsconfig.json`
- `docs/RIDER_MOBILE_FOUNDATION_REPORT.md`
- `package.json`
- `pnpm-lock.yaml`
