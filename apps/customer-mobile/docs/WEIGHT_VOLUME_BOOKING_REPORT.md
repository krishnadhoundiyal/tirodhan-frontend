# Customer Mobile: weight, volume, quoted booking and restart recovery

22 October 2026, Asia/Kolkata. Frontend implementation based on the newly merged
CM-P0-02/03 and item-volume backend contracts. This supersedes the physical-load
and missing-binding blockers in the historical CM-P0-01 report.

## Repository and delivery

- Writable repository only: `C:\Users\91956\Tirodhan-frontend\tirodhan-frontend`.
- Verified clean starting branch `codex/customer-projected-slots`, HEAD
  `5cbff539be35b99253da08daee31e899e0ce04d6`.
- Dedicated implementation branch: `codex/customer-weight-volume-booking`.
- Backend `main` independently verified using authorized read-only GitHub access:
  `b281e03a47d202fd8b5c3d895075aa358062c5fa`. No backend checkout, clone, files,
  branches, tests or configuration were modified.
- Delivery SHA: the commit containing this report, also supplied in the delivery
  message (`git rev-parse HEAD`). No push, merge, deployment or production activation.

## Completed customer journey

The existing item modal keeps categories, quantity controls, artwork and selection.
Each selected line now loads the active policy's labels and B/T boundaries, and
requires BELOW_B, B_TO_T or ABOVE_T. Numerical kg appears only for ABOVE_T, must be
strictly greater than T, and retains the exact decimal string (at most 3 fractional
digits). Old optional raw-weight catalogue hints do not waive mandatory bands.

One simple input captures **litres occupied by the whole selected quantity,
including packaging**. Conversion to integer millilitres is exact string/integer
unit conversion, with no rounding, density, dimensional workflow, default or
category mapping. Quantity does not multiply weight or volume. Input and aggregate
bounds follow the backend's signed-32-bit gram/ml representation limits.

Review requests a quote whenever valid selected lines/quantities/bands/kg/volumes
change. Incomplete volume can receive a price-only quote with the server's explicit
blocker; invalid entered decimals or missing current bands cannot submit a quote.
The user sees server total kg, total litres and INR pickup price, then explicitly
checks that price before Confirm. Editing or policy revision changes invalidates
the reviewed fingerprint. Stale policy requires current band selection and review.
Missing/inactive configuration, errors and malformed responses never get a default
price or availability.

Confirm uses the existing serviceability and projected-slot checks, then one
BookingFlow: server quote -> atomic hold -> reservation-bound collection creation
-> authoritative PENDING_PAYMENT detail and amount. Raw quote grams/ml are sent
unchanged; regional safety padding happens only in the backend. The original
confirmed totals/price remain visible during ambiguity/recovery. Existing payment
and refund authority is unchanged; there is no native checkout or payment success
simulation in this increment.

## Exact backend integrations

Sources below are pinned to the verified backend commit:

- [Weight/pricing contract](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/docs/CM_P0_03_WEIGHT_PRICING.md)
- [Weight schemas](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/modules/business_admin/weight_contracts.py)
- [Policy and quote routes](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/api/routes/customer_weight_pricing.py)
- [Pricing normalization/confirmation](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/modules/business_admin/weight_pricing.py)
- [Atomic holds](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/modules/routing_operations/slot_holds.py)
- [Collection route](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/api/routes/collection_requests.py)
- [Recovery contract](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/docs/CM_P0_02_BOOKING_RECOVERY.md)
- [Hold binding read](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/src/tirodhan/api/routes/routing_orchestration.py)

`GET /v1/customer/weight-pricing-policy`: consume policy_id/revision, B/T grams,
three labels, display_unit, min/max price, included/saturation grams, exact curvature
string, currency, active, confirmation_freshness, live_customer_holds_available and
hold_blocker. Only an active valid INR/kg policy is accepted. The frontend retains
formula parameters as contract fields but implements no nonlinear pricing formula.

`POST /v1/customer/collection-quotes`: only policy_id, policy_revision and items.
Each line has item_category_code, nullable declared_quantity, weight_band,
weight_kg only for ABOVE_T, and declared_volume_ml. No caller-supplied amount or
aggregate overrides are sent. The normalized response supplies declared_weight_grams
per item, total_weight_grams, nullable total_volume_ml, total_amount_minor,
minimum_amount_minor, maximum_amount_minor, currency, confirmation, freshness,
rounding and readiness/blocker. Validate echoed declarations/version, aggregate
integrity, safe integer money and the active policy's bounds; never recalculate price.

Confirmation is exactly `{policy_id, policy_revision, quote_fingerprint}`. It has
CURRENT_POLICY_REVISION freshness, not an invented client TTL. Controlled weight
error codes are allowlisted from the actual string/detail.code envelopes. Other
raw provider/SQL/exception text stays generic.

`POST /v2/customer/slot-holds`: preserve client_command_id, context_id,
expected_generation, slot_start/end and server-published pickup/discharge seconds.
Add normalized quote items and confirmed_quote; mass_g = quote.total_weight_grams,
volume_ml = quote.total_volume_ml, without client padding. Full positive volume is
required. Fresh generation, source/policy versions, expiry and all four projected
statuses retain their CM-P0-01 behavior.

`POST /v1/collection-requests`: same saved items and confirmed_quote, stable
client_request_id, exact context/slot and capacity_reservation_id. Creation accepts
no client price. Success validation checks the returned declarations and original
reviewed amount. PENDING_PAYMENT remains unpaid; replay can return a subsequent
authoritative status. Detail additionally renders original occupied volume.

`GET /v2/customer/slot-holds/{original command ID}`: consume required nullable
bound_request_id along with reservation_id, basis, bookable, book_by and expiry.
Any non-null binding resolves to the existing owned detail route regardless of
deadline/payment/cancellation status. It does not prove payment success.

## Exact command persistence and recovery

One existing owner-scoped recovery record now contains the exact hold body,
exact booking body, both original command IDs, quoted amount, a may-have-submitted
booking marker and known resource IDs. Bodies are frozen before the first POST.
No address text, coordinates, OTP or credentials are in these command schemas.

Native storage uses the existing OS SecureStore with device-only accessibility,
under a separate booking-recovery key. Values are chunked below native keychain
value limits; a generation pointer is published only after all chunks are durable.
Failed staging leaves the prior complete record readable. Missing committed chunks
fail closed. Serialized reads/writes/removal preserve ordering. This is one private
workflow, not a generic offline queue. SecureStore credentials remain separate.

SCREEN_PREVIEW uses an isolated volatile store, local policy/quote fixtures and its
existing local pending-payment demo. No real hold, backend HTTP, auth credential
or native recovery storage is accessed. NONPROD uses actual HTTP repositories and
the new `weightPricing` capability guard alongside the existing `slots` capability.
No deployment capabilities are enabled by this change.

Recovery checks binding first. Non-null binding is saved and followed to owned
detail; the record is cleared after authoritative detail resolves. Null binding
after an uncertain booking never proves failure: replay the original saved body
and client_request_id, including after hold expiry or later policy changes.
Missing hold after response loss exact-replays the original hold body/generation.
Concurrent recovery taps share one operation; ordinary duplicate submits retain
the same in-flight promise. No replacement identity escapes uncertainty.

Involuntary authentication loss/refresh failure keeps owner-scoped recovery for
same-owner reauthentication. Explicit logout first invalidates the session owner,
then clears recovery, so late writes cannot resurrect it. Account switching clears
the prior workflow; a different owner's stored command is rejected before replay.
Transport/session generation fencing and existing query/draft ownership remain.
User edits can begin a new intent only after an authoritative completed result;
editing cannot unlock an ambiguous operation.

Legacy identifier-only records are retained/read compatibly: bound_request_id can
resolve a historical committed booking. If such a legacy record has no body and
no binding, the frontend cannot invent its body; it stays safely recoverable rather
than claiming exact replay. New native commands always persist both bodies.
Browser storage remains memory-only, so process-death persistence is a native-mobile
feature; no sensitive browser localStorage queue was introduced.

## Validation and acceptance limits

Runtime declarations unchanged: Node >=22.13.0, `.node-version` 22.13.0,
pnpm@11.25.0, lockfile 9.0. Process-local existing Node 24.19.0/pnpm 11.25.0 used.
Frozen installation reports already up to date. No dependency or native SDK change.

| Executed command                                                                                                                           | Result                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                           | PASS; already up to date                                                                     |
| `pnpm typecheck`                                                                                                                           | PASS, strict TypeScript                                                                      |
| `pnpm lint`                                                                                                                                | PASS, zero ESLint warnings                                                                   |
| `pnpm format:check --end-of-line auto`                                                                                                     | PASS; documented Windows CRLF adaptation                                                     |
| `pnpm test -- --cacheDirectory=C:/Users/91956/Tirodhan-frontend/tirodhan-frontend/.local/jest-cm-weight`                                   | PASS, 223 tests / 20 suites; no skipped tests or forced exit                                 |
| `pnpm run doctor`                                                                                                                          | 19/21 checks passed; exit 1, remote schema TLS failure and existing patch-version mismatches |
| `pnpm --filter @tirodhan/customer-mobile exec expo export --platform all --output-dir ../../.local/cm-weight-export-final --max-workers 2` | PASS; final Android/iOS Hermes bytecode and web JS/CSS/HTML/metadata                         |
| `git diff --check`                                                                                                                         | PASS                                                                                         |

One initial full Jest run, concurrent with uncached platform export, timed out in
a rendered-screen test (221 passed, 1 timeout). The subsequent complete run after
bundling passed all 223 tests without console warnings. The additional test covers
auth-loss retention versus explicit logout clearing. No failing/skipped test is
counted as passing.

Expo Doctor's schema connection disconnected before TLS setup. Its other finding
was ten existing package patch mismatches: expo, expo-constants, expo-crypto,
expo-dev-client, expo-linking, expo-location, expo-notifications, expo-router,
expo-splash-screen and jest-expo. Manifests and lockfile are unchanged; no checks
were excluded or dependencies upgraded to conceal those baseline findings.

Export used NONPROD with an empty capability manifest, process-local TEMP/TMP at
`.local/cm-weight-temp`, and authorized execution outside the sandbox because of
the previously established Hermes/output write restrictions. Output/logs remain
inside this frontend's ignored `.local/` directory (`cm-weight-export-final.log`,
`cm-weight-doctor.log`). The uncached web export emitted the existing Leaflet CSS
local-resource warnings; final cached export completed successfully. Build/export
does not establish device acceptance or enable production flags.

Tests distinguish frontend behavior from server guarantees: the complete journey
uses real frontend HTTP adapters with an injected mocked backend; band/volume
boundary, quote refresh/staleness, incomplete input, hold/booking consistency,
lost responses, expired holds, bound/null recovery, duplicate taps, account changes
and secure-record fault injection have focused coverage. These do not establish
PostgreSQL transaction guarantees or native keychain/device acceptance.

No customer-mobile `.env`, reachable authenticated backend test environment or
device was supplied. Backend source verification is real read-only GitHub access;
there is no live API, PostgreSQL or native-device acceptance claim. Expo Go preview
is still explicitly development/native-only, so browser cannot bypass its guards.
Native Razorpay remains a separate increment and is not required to reach unpaid
booking or validate this implementation.

## Configuration and deployment prerequisites

There is no remaining physical-load approval or missing bound-request API blocker
for **new native workflows** against the verified contracts. Before real acceptance:

1. Deploy the merged backend and migrations through item volume, with a configured
   active manager-owned weight-pricing policy. Missing policy returns unavailable;
   no production rates/B/T/default volume are installed by the frontend.
2. Supply HTTPS nonprod URL and verified `weightPricing`, `slots`, principal,
   catalogue and collection capabilities; enable them only for the actual deployed
   endpoints. Keep routing registration, regional projection policy/supply/workers,
   command retention, payment lifetime, serviceability and pricing dependencies valid.
3. Complete real authenticated API tests and native Expo Go/device restart,
   SecureStore, logout/account switch, keyboard/accessibility and platform acceptance.
4. Address the recorded Expo Doctor baseline/network findings separately. Native
   checkout and payment acceptance remain outside this increment.

## Affected files

All paths below are relative to `apps/customer-mobile/`:

- `src/api/{contracts,customer-contracts,slot-contracts,weight-contracts}.ts`:
  additive declaration/confirmation/binding DTOs and strict policy/quote parsing.
- `src/api/{capabilities,customer-client,errors}.ts`: guarded policy/quote adapters
  and safe current error envelopes.
- `src/features/collection/{declarations,ItemSelector,DraftProvider}.ts(x)`:
  exact inputs, current policy selections and existing draft/coordinator lifetime.
- `src/features/collection/{ReviewScreen,CollectionDetailScreen}.tsx`: dynamic
  price review, authoritative totals, complete hold/booking and original volume display.
- `src/features/collection/{repository,queries}.ts`: existing repository integration
  and owner-scoped policy/quote/detail resolution.
- `src/features/collection/{bookingFlow,bookingRecovery}.ts`: immutable confirmed
  commands, bound booking recovery and may-have-submitted replay semantics.
- `src/session/{bookingRecovery,privateCommandStorage}.ts`, `src/lib/runtime.ts`:
  private native command persistence, auth-loss retention and safe explicit clearing.
- `src/features/collection/{developmentRepositories,developmentWeightPricing}.ts`:
  isolated editorial fixtures without a production pricing algorithm or default.
- `src/test/{projected-booking,weight-pricing,app-mode-runtime}.test.ts` and
  `src/test/product-screens.test.tsx`: protocol, restart, input, UI, isolation and
  private storage tests.
- `.env.example`, `README.md`, `docs/{CUSTOMER_MOBILE_BACKEND_CONTRACTS,BACKEND_GAPS,
PROJECTED_BOOKING_REPORT,WEIGHT_VOLUME_BOOKING_REPORT}.md`: current handoff and
  explicit supersession of historical blockers.
