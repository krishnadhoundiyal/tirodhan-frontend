# CM-P0-01: Projected slots and atomic booking integration

> Historical report. The later [weight/volume booking increment](WEIGHT_VOLUME_BOOKING_REPORT.md)
> uses backend `b281e03a` and resolves the physical-load and bound-request recovery
> blockers below for new native workflows. Retained here as implementation history.

Source verification: 21 October 2026. Delivery: 22 October 2026, Asia/Kolkata.

**Live hold/booking submission is deliberately blocked pending an approved source
of physical mass and volume. This is not complete live booking acceptance.**
The independent V2 adapters, command lifecycle, reservation binding and recovery
boundaries are implemented. Native Razorpay checkout remains disabled.

## A. Repository state

- Only modified repository: `C:\Users\91956\Tirodhan-frontend\tirodhan-frontend`.
- Starting branch `codex/ios-expo-go-preview`, HEAD
  `6a66b7f3749ac664bd30680f3090c1be81890ec1`, clean working tree.
- `git merge-base --is-ancestor codex/customer-mobile-production HEAD` succeeded.
  Production base `08c39eb50ac7df5155ea7765501134cdf54f4520` is included;
  Expo Go preview work (`9585b97`, `6a66b7f`) is retained.
- Implementation branch `codex/customer-projected-slots`, based on that HEAD.
- Backend `main` verified through authorized read-only GitHub branch/source
  requests at `c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b`. No local backend
  directory was required or accessed; no backend write, clone or branch.
- Resulting commit is the commit containing this report: `git rev-parse HEAD` on
  the implementation branch. Its SHA and final status are in the delivery message
  (a commit cannot embed its own SHA in its content).
- No push, merge, deployment, production activation or infrastructure change.

## B. Exact verified backend contracts

All links are pinned to the verified backend commit. The 9 October documents are
historical; they do not override these current implementations.

### Projected availability

[routing_orchestration.py](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/api/routes/routing_orchestration.py)
and [slot_projection.py](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/routing_operations/slot_projection.py):

`GET /v2/customer/slot-availability?serviceability_context_id=<UUID>` requires an
owned, SERVICEABLE, unexpired context. Unavailable context is 404; absent region
mapping is 409. Response fields:

- `region_id`, `capacity_certified: false`, `allowance_is_estimate: true`,
  `standard_pickup_seconds`, `standard_discharge_seconds`, `slots`.
- Each slot: `slot_start`, `slot_end`, `status`, `remaining_bookings`,
  `policy_version`, `generation`, `valid_until`,
  `admission_basis: PROJECTED_ALLOWANCE`, `source_version`, `computed_at`,
  `capacity_certified: false`.

The response does not echo context ID; the adapter attaches its request context
as local metadata. Server source/expiry drift yields UNKNOWN. Unconfigured policy
legitimately has `policy_version: 0` and UNKNOWN. AVAILABLE/LIMITED permit selection;
FULL/UNKNOWN do not. Versions, timestamps, expiry, server durations and counts are
retained/validated; no availability is inferred. Slots display 30-minute intervals
in Asia/Kolkata. Projection/hold does not promise a feasible route or assigned rider.

### Atomic holds

[HoldSlot](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/routing_operations/slot_holds.py)
inherits [ReserveCapacity](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/routing_operations/admission.py).
`POST /v2/customer/slot-holds` returns 201 and accepts:

| Field                                 | Constraint/source                                              |
| ------------------------------------- | -------------------------------------------------------------- |
| `client_command_id`                   | UUID generated once per logical hold                           |
| `context_id`                          | Owned serviceability UUID                                      |
| `expected_generation`                 | Strict integer >=1 from selected projection                    |
| `slot_start`, `slot_end`              | Selected aware timestamps unchanged                            |
| `mass_g`, `volume_ml`                 | Strict positive integers <=2147483647; approved source missing |
| `pickup_seconds`, `discharge_seconds` | Strict integers 0..86400; server-published standards           |
| `reattempt_request_id`                | Optional nullable UUID; omitted for new booking                |

No extra fields are permitted by the backend. The prepared adapter freezes the
body, validates required inputs and adds no legacy idempotency header. The
backend uses `client_command_id` as the authoritative reservation UUID.

`GET /v2/customer/slot-holds/{reservation_id}` and POST return `reservation_id`,
`admission_basis`, `bookable`, `expires_at`, `book_by`. Owned reads can describe
historical EXACT_CERTIFICATE holds; current holds use PROJECTED_ALLOWANCE.
`book_by` is server expiry minus configured payment lifetime; the client never
guesses that lifetime. False bookability alone may mean already bound, not expired.
409 indicates conflict; missing required lifetime configuration returns 503.

### Binding and financial state

[collection route](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/api/routes/collection_requests.py)
and [service](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/collection_requests/service.py):

`POST /v1/collection-requests` receives `client_request_id`,
`serviceability_context_id`, `capacity_reservation_id`, `slot_start`, `slot_end`,
`items`. Items preserve `item_category_code`, optional nullable
`declared_quantity` and `declared_weight_grams`. No client price is sent.
The legacy route permits a nullable reservation field; this coordinator always
supplies the actual hold and never disables V2 orchestration.

Response: `request_id`, `client_request_id`, `status`, `quoted_amount_minor`,
`currency`, `payment_expires_at`, `payment_id`, item snapshots (`request_item_id`,
category/declarations, server line amount/currency, nullable `pricing_rule_version`).
Malformed or mismatched success remains ambiguous. New booking is PENDING_PAYMENT;
replay may reflect a later authoritative status. No hold implies paid/accepted.

`bind_reservation` checks exact customer/context/slot/location, unused or same
booking binding, expiry covering payment lifetime, and mass covering declared
weight. Backend cutoff/payment/transaction checks remain authoritative. Completed
booking replay precedes fresh temporal/policy checks; expired old hold state must
not prevent replay of an already-submitted booking.

## C. Implemented behavior

- Existing repository/client architecture now uses V2 projections and hold APIs.
  No V1 slot or retired commercial-capacity API call remains in application source.
- Review preserves its cards/items/address/pricing structure, displays all four
  statuses, handles empty/error/expired projections, and explains the load block.
- Keys include owner/context/address/version. Address changes invalidate selection;
  old asynchronous query results cannot replace another context. Selected generation
  must match current data. Expiration triggers refresh. Refresh or 409 clears
  selection and requires current server permission.
- Address changes during hold acquisition also fence binding before booking.
  The old reservation ID is retained for recovery until authoritative expiry;
  no booking is silently submitted for the previous address. An already acquired
  compatible hold remains usable when its original projection expires.
- One BookingFlow lives inside the existing owner-keyed DraftProvider and survives
  Review navigation. It is one prepared operation, not a queue or capacity ledger.
- Hold and eventual collection IDs/body are prepared together, copied before HTTP
  and retained across ambiguity. Duplicate taps share one in-flight promise.
- Before a new collection POST, an owned hold read must be bookable and within
  server `book_by` and expiry. Booking payload includes the exact hold/context/slot
  and original item declarations. Server pricing remains unchanged.
- SCREEN_PREVIEW continues local fixture booking without real holds or HTTP. Its
  hold methods reject explicitly, and its recovery store never accesses SecureStore.
  NONPROD continues using real session/HTTP repositories and capability gates.

## D. Physical load determination — unresolved business approval

No approved pre-booking physical-load mapping was found in the inspected models,
policies, declarations, binding, configuration or approved projection document.

- [RoutingManifest](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/routing_operations/models.py)
  explicitly describes one indivisible household lot with **no inferred loads**;
  mass/volume must be positive.
- Reservation binding copies both physical inputs into the operational manifest
  and rejects known declared weight exceeding reserved mass.
- [physical.py](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/src/tirodhan/modules/routing_operations/physical.py)
  uses manifests and subsequently observed loads for custody; that is not an
  approved pre-booking source.
- [PROJECTED_SLOT_ALLOWANCES.md](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/docs/PROJECTED_SLOT_ALLOWANCES.md)
  excludes physical load from forecasting while retaining operational checks.
  Standard pickup/discharge durations provide no mass/volume mapping.

**Decision needed:** approve an authoritative source of whole-collection `mass_g`
and `volume_ml`, including units, provenance, applicability and consistency with
optional declared weight, or separately approve a backend contract change.
No constant, customer-volume form, category estimate or conversion was introduced.
Review explicitly supplies `load: null`, displays temporary booking unavailability
and disables live hold/booking. The coordinator's load parameter is the isolated
seam for a future approved source. Synthetic loads exist only in unit tests.

## E. Error, concurrency and recovery behavior

- Network/timeout/protocol/cancellation/5xx write failures retain the prepared
  identity. A 503 is conservatively ambiguous; mutations do not auto-retry.
- Lost hold response: read deterministic reservation ID first; after 404, replay
  the exact original in-memory command. Other errors preserve uncertainty.
- First definite 409/422 does not fabricate success; Review refreshes on 409.
  A later conflict after an ambiguous attempt cannot erase the previous identity.
  Raw FastAPI detail strings are not interpreted/rendered.
- Booking-response loss: replay identical prepared booking, even if the old hold
  is now expired or bound. New booking is prohibited against known unbookable state.
- Prepared Transport commands capture owner/version. Checks before fetch, after
  response decode and around 401 refresh prevent replay or late success under a
  changed account. Coordinator checks and owner-keyed draft remount reinforce this.
- Serialized recovery record contains only `owner`, `holdCommandId`, and when
  known `reservationId`, `bookingCommandId`, `requestId`. Native uses existing
  OS SecureStore with device-only accessibility; browser is memory-only.
  No drafts, address, coordinates, OTP or credentials are stored in this record.
- Writes precede HTTP, so failed persistence prevents a new submission. Logout/
  account change clears records; temporary startup-refresh failure preserves
  unresolved IDs for same-owner reauthentication. Different-owner records are
  discarded, never replayed.
- Restart: open known request ID or read deterministic hold. A never-booked hold
  with authoritative read and passed cutoff may be cleared. If booking might have
  been sent, false bookability cannot prove it failed; new operations remain blocked.

**Precise restart limitation:** hold reads omit bound request ID and original body.
Current collection list/detail contracts provide no command-ID lookup or original
create body. Identifier-only storage cannot recreate the exact fingerprint after
process death. The UI retains recovery identity and offers another read/Bookings;
it cannot guarantee automatic replay/reconciliation. Hold read 404 after restart
also cannot reconstruct the missing hold body. An owned result lookup/bound booking
ID or another explicitly approved recovery contract is needed. No generic offline
queue, body persistence or guaranteed web/native restart acceptance is claimed.

## F. Validation

Actual declarations: Node `>=22.13.0`, `.node-version` `22.13.0`,
`packageManager: pnpm@11.25.0`, lockfile `9.0`. Selected existing process-local
runtime: Node `24.19.0`, pnpm `11.25.0`. Manifests/lockfile unchanged. No custom
development build or native Razorpay SDK is needed for this integration.

| Command                                                                                                                                     | Result                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                            | PASS; already up to date                                                                          |
| `pnpm typecheck`                                                                                                                            | PASS, strict TypeScript, final source                                                             |
| `pnpm lint`                                                                                                                                 | PASS, zero warnings, final application source                                                     |
| `pnpm format:check --end-of-line auto`                                                                                                      | PASS; Windows CRLF adaptation documented in README                                                |
| `pnpm test -- --cacheDirectory=C:/Users/91956/Tirodhan-frontend/tirodhan-frontend/.local/jest-cm-p0`                                        | PASS, 173 tests in 19 suites, no skipped tests, no forced exit                                    |
| `pnpm run doctor`                                                                                                                           | 19/21 checks passed; remote schema TLS failure and existing Expo patch-version mismatches; exit 1 |
| `pnpm --filter @tirodhan/customer-mobile exec expo config --type public`                                                                    | PASS                                                                                              |
| `pnpm --filter @tirodhan/customer-mobile exec expo export --platform all --output-dir ../../.local/cm-p0-export-acceptance --max-workers 2` | PASS, final source, Android/iOS Hermes bytecode and web JS/CSS/HTML/metadata                      |
| `git diff --check`                                                                                                                          | PASS                                                                                              |

Expo Doctor initially could not resolve the registry inside the sandbox. A
network-authorized rerun completed checks, but Expo's remote schema connection
failed before TLS setup. It also reported existing patch recommendations for
`expo`, `expo-constants`, `expo-crypto`, `expo-dev-client`, `expo-linking`,
`expo-location`, `expo-notifications`, `expo-router`, `expo-splash-screen`,
`jest-expo` (10 packages). These manifest/lockfile versions predate this change;
no dependency upgrade or excluded check was introduced to conceal the findings.

The first Jest run failed before tests because its sandbox temporary transform
cache could not rename files. The repository-local ignored cache above resolved
that environment failure. Initial export attempts hit sandbox Hermes temp/output
write errors; final export used process-local `TEMP`/`TMP` at `.local/cm-p0-temp`
and an authorized execution outside the sandbox, with all output inside this
frontend repository. Logs/artifacts are ignored under `.local/`, including
`cm-p0-export-acceptance.log`. Existing Leaflet CSS local-resource warnings appeared
on the uncached web build; no web/native dependency or native-checkout change was
needed. NONPROD mode with an empty capability manifest was used for export;
release flags were not enabled. Compilation is not device acceptance.

Backend [test_slot_holds.py](https://github.com/krishnadhoundiyal/tirodhan/blob/c1e2e7c7fba12bda3b3df03710418c2f1e7b0d0b/tests/integration/test_slot_holds.py)
was reviewed read-only, **not executed**. Source coverage includes last-allowance
contention, adjacent shared budgets, publication/hold/withdrawal races, rollback,
expiry refresh, source drift with existing binding, and paid booking without routing.
Frontend tests mock winners/conflicts and establish client behavior only.

No deployment URL/test identity, approved load source, native device or disposable
database was supplied. No live cross-system or native-device acceptance is claimed.
SCREEN_PREVIEW remains development Expo-Go-only, so browser cannot bypass its
guards. Automated rendered-screen tests exercise Review and error/race states.

## G. Remaining blockers

1. **Business:** approve authoritative whole-collection physical mass and volume;
   live holds/bookings stay blocked until resolved.
2. **Backend recovery:** owned command-result/bound booking lookup for identifier-only
   recovery after process death. In-memory exact replay works independently.
3. **Nonprod:** reachable HTTPS backend, verified capabilities (`slots` now means
   V2 projections/holds), principal/catalogue/collection reads, region mapping,
   estimator policy/supply, command/payment lifetimes and projection workers.
   No deployment flags were enabled here.
4. **Environment/acceptance:** Expo remote checks, real backend/PostgreSQL execution,
   device storage and native acceptance are separate from frontend unit validation.
5. **Next increment:** native Razorpay provider checkout and device validation.

## H. Change manifest

Paths relative to `apps/customer-mobile/`:

| File                                                 | Purpose                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/api/slot-contracts.ts`                          | Exact DTOs, strict parsing/input validation, freshness, bookability and IST labels        |
| `src/api/client.ts`                                  | Prepared hold POST and owned hold GET                                                     |
| `src/api/contracts.ts`                               | Collection reservation field                                                              |
| `src/api/customer-client.ts`                         | Replace V1 eligibility with validated V2 projection read                                  |
| `src/api/customer-contracts.ts`                      | Remove obsolete V1 slot DTO                                                               |
| `src/api/errors.ts`                                  | Ambiguous-command classification including 5xx                                            |
| `src/api/transport.ts`                               | Prepared/in-flight/401 replay owner fencing                                               |
| `src/features/collection/repository.ts`              | Extend existing repository with projection and gated hold methods                         |
| `src/features/collection/bookingFlow.ts`             | Immutable single-flight hold/booking lifecycle and recovery boundary                      |
| `src/features/collection/bookingRecovery.ts`         | Serialized identifier-only record                                                         |
| `src/features/collection/DraftProvider.tsx`          | Coordinator lifetime within existing owner-scoped draft                                   |
| `src/features/collection/ReviewScreen.tsx`           | Projection/status/expiry UI, load block, binding and recovery                             |
| `src/features/collection/developmentRepositories.ts` | Four-state local fixtures; actual hold methods remain blocked                             |
| `src/session/bookingRecovery.ts`                     | Minimal-ID SecureStore adapter; volatile web storage                                      |
| `src/session/store.ts`                               | Expose owner/version and distinguish transient refresh clearing                           |
| `src/lib/runtime.ts`                                 | Recovery clearing on logout/account change, retention on transient startup failure        |
| `src/test/projected-booking.test.ts`                 | Protocol, exact replay, contention handling, expiry, ownership and invalid response tests |
| `src/test/product-screens.test.tsx`                  | Review block, selection invalidation and old-address response tests                       |
| `docs/CUSTOMER_MOBILE_BACKEND_CONTRACTS.md`          | Current verified contract notice                                                          |
| `docs/BACKEND_GAPS.md`                               | Supersede historical slot gap; identify actual load/recovery limits                       |
| `docs/PROJECTED_BOOKING_REPORT.md`                   | This implementation/contract/validation record                                            |
| `README.md`                                          | Current integration status and report link                                                |
