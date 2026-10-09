# Temporary native screen preview and real nonprod testing

Base: `9585b97f04946b1fea882c89cb841ac30b3cfaa6`, clean
`codex/ios-expo-go-preview`, verified before edits. Backend is read-only.

## Investigation before implementation

The existing `__DEV__ && EXPO_PUBLIC_PREVIEW_CATALOGUE=true` condition selects
`createDevelopmentRepositories`, enables product admission, and redirects Index
to Home. It does not isolate authentication: root layout always calls
`SessionStore.bootstrap`, app activation renews the real session, public OTP
still calls `api`, and logout reads/removes the real SecureStore refresh credential.
The authenticated transport blocks only protected mutations; reads and public
OTP/refresh/logout requests remain possible. The second public transport has no
preview guard. Query ownership can inherit an already-authenticated real user.

Login/OTP use the real authFlow, backend challenge, verification and SessionStore
establishment. The store validates ownership/principal, refreshes credentials and
preserves CUSTOMER admission. These implementations must not be replaced.
The existing fixture repository supplies catalogue, addresses, serviceability,
slots, booking, history/detail/journey, payment/refund reads, account/preferences
and notification history. Its local pending-payment booking and financial/error
states already exist; checkout/payment initiation are rejected. No new financial
success response is needed. Cancellation UI remains guarded by the deployment's
`cancellationCompensation` capability. Native checkout is currently null.

Smallest isolated implementation: one exact mode resolver, a removable preview
navigation adapter with no customer principal or credentials, a preview transport
that rejects every request/command, defensive credential rejection in the
composition root, and the existing fixture repositories. Route/query boundaries
use the navigation adapter; SessionStore, OTP business flow, HTTP transport,
contracts and payment/collection services retain their normal implementations.
The old fixture flag is deprecated and ignored, not a second switch.

## Mode boundary and navigation

`src/lib/appMode.ts` validates the exact, case-sensitive values `SCREEN_PREVIEW`,
`NONPROD` and `PRODUCTION`. Unset/empty means normal production behavior. Unknown
values throw at startup. SCREEN_PREVIEW throws unless development and Expo Go are
both true. Release builds and custom native development builds cannot activate
preview. `isRunningInExpoGo()` supplies runtime detection, not a user flag.

`runtime.ts` resolves the mode once, exposes `previewCatalogue` as a compatibility
name derived solely from that mode, and locks the initial mode in the JS runtime.
Fast Refresh cannot replace the mode; a different value throws with a restart
instruction. `EXPO_PUBLIC_PREVIEW_CATALOGUE` is never read. It is deprecated and
should be removed from local `.env` files and shell environments.

`src/preview/navigation.ts` is a separate in-memory navigation adapter. Its snapshot
always has `status: signedOut`, `userId: null`, no principal and no credential.
It implements subscribe/snapshot and no-op startup/foreground/principal methods,
but has no access-token, refresh-token, establish or real-refresh interface.
`screen-preview:synthetic-navigation-only` is exclusively a query/draft namespace,
not a customer ID or backend principal. Reset only advances local ownership.
The existing fixture principal reader is unused; it is not injected into SessionStore.

`src/lib/navigation.ts` selects that adapter only for validated preview. Root,
Index and protected layout consume this boundary. Index redirects directly to
`/(product)/(tabs)`; the existing protected admission function admits only through
the derived preview flag. Login/OTP route wrappers redirect preview before the
real auth screens mount. The root renders the small “Preview Mode · Local fixtures
· No real transactions” label across the app. It is absent in NONPROD/production.

Address and collection query owners use the synthetic namespace. DraftProvider is
keyed by namespace and local owner version. Preview logout cancels and clears
queries and resets local notification memory/navigation ownership; root's existing
owner effect resets fixtures. Mode restart creates a new QueryClient and draft;
there is no persisted query cache or identity migration.

## HTTP, credentials and real authentication

`src/preview/isolation.ts` overrides both `request` and prepared `command` on a
preview-only Transport subclass. Every invocation rejects with `ApiError(kind:
preview)` before fetch, token access, refresh, UUID/idempotency preparation or
response handling. Both the public refresh/logout transport and exported customer
transport select this implementation in preview. Isolation therefore includes
public OTP, protected reads, principal, refresh, addresses/serviceability/slots,
booking, cancellation, payment attempts/checkout, refunds, profile/preferences,
feedback and push, including capabilities explicitly present in the environment.
The normal core HTTP Transport is unchanged.

Root preview startup never bootstraps, renews or reads the real SessionStore.
The composition root additionally supplies a rejecting credential adapter to the
unstarted real store in preview, so an accidental establishment cannot write a
refresh token or apply an access token. No real auth SecureStore get/set/remove
occurs. Existing stored credentials remain untouched. Preview cannot transition
into real authentication; switching mode requires a clean JS runtime restart.
A new NONPROD startup may resume a pre-existing real credential through normal
backend refresh and principal validation.

NONPROD and production select the original Transport, secureCredential,
SessionStore, createApi/createCustomerApi, authFlow and HTTP repositories. OTP
challenge/verification, access-token handling, existing refresh semantics,
principal ownership/CUSTOMER admission and logout remain authoritative. NONPROD
requires HTTPS when a base URL is provided; missing configuration or deployment
capabilities report the existing errors. Repository selection depends only on
the mode; network failures never select fixtures. No production authentication
bypass exists: a release-configured SCREEN_PREVIEW throws before composition.

No changes were made to `session/store.ts`, `session/secure.ts`, `session/admission.ts`,
`features/auth/flow.ts`, OTP verification logic, `api/transport.ts`, contracts,
HTTP repository/business implementations or payment/refund state machines.

## Screen coverage and native restrictions

The existing native screens, tab/stack routing, keyboard provider, gestures, fonts,
maps and location UI remain. The fixture repository supplies Home, catalogue/item
selection, saved/manual address selection, local serviceability/slots, review,
local pending-payment booking, Activity/history, details/journey, existing payment/
refund statuses, Account/preferences/content/feedback and notification history.
Foreground location is user-triggered and native maps use Apple Maps on iOS.
Local fixture changes stay local and reset with ownership/restart. No separate
pages or replacement screen designs were created.

Missing actionable capability: there is no fixture successful payment-provider
checkout; payment initiation/checkout reject and `nativeCheckout` remains null.
No new successful financial response was added. Existing status fixtures can be
read, including cancelled/refund states. Native Razorpay execution in NONPROD
still needs an approved implemented provider adapter, public checkout metadata,
test-mode backend configuration and device validation in a custom development
build. Merely switching mode or creating a custom build cannot enable the absent
adapter. Payment/refund API reads require actual verified deployed capabilities.
Backend/webhook authority, amount/currency validation, collection idempotency,
scheduling and cancellation policy are unchanged.

`cancellationCompensation` is not enabled by this change or by selecting preview.
Keep it absent from the capability manifest until actual Batch B deployment and
verification. The existing UI and HTTP repository gate remain. Do not enable it
to make a fixture button appear functional. No deployment was performed or verified.

The existing `notifications/environment.ts` and integration guards remain: development
Expo Go returns unavailable without requesting permissions/tokens, registering a
device or installing listeners. Preview also has a signed-out navigation snapshot,
so root does not install authenticated listeners, and the installation-ID factory
rejects preview before SecureStore. Preview logout performs no push revocation or
credential access. NONPROD Expo Go retains real session/logout while skipping host
push revocation; custom native NONPROD retains the existing native push path.
Full APNs/FCM, branded native splash/icon/scheme and provider-native SDK acceptance
require custom development builds. `expo start --go` and normal `--dev-client`
scripts from the base commit are preserved. No Apple Developer account is needed
for SCREEN_PREVIEW through Expo Go; no signed iOS build is produced here.

Expo Go constraints and matching SDK guidance: [Expo development-build FAQ](https://docs.expo.dev/develop/development-builds/faq/).
The retained map library is supported by [Expo's SDK 57 maps documentation](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
Environment configuration is public client configuration, as described by
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

## Exact physical iPhone launch commands

Use the existing supported Node 24.19.0 and pnpm 11.25.0 in this terminal only:

```powershell
Set-Location 'C:\Users\91956\Tirodhan-frontend\tirodhan-frontend'
$runtimeBin = 'C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$pnpmBin = 'C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback'
$env:Path = "$runtimeBin;$pnpmBin;$env:Path"
Get-Command node, pnpm | Select-Object Name, Source
node --version
pnpm --version
Remove-Item Env:EXPO_PUBLIC_PREVIEW_CATALOGUE -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_APP_MODE = 'SCREEN_PREVIEW'
$env:EXPO_PUBLIC_CUSTOMER_CAPABILITIES = ''
pnpm dev:customer:go --lan --clear
```

Keep Metro running. Use an SDK 57-compatible Expo Go on iOS 16.4+; connect iPhone
and PC to a LAN that allows device-to-device traffic. Allow Expo Go Local Network
access. Scan the terminal QR using the iPhone Camera and choose Open in Expo Go.
Metro should say Using Expo Go and the URL should begin `exp://`. This renders the
actual iOS React Native bundle. Preview needs no backend URL or backend access;
even an existing configured URL is blocked. No client secrets are required.

Before switching: Ctrl+C Metro, fully close the project/force-quit Expo Go, then
restart Metro with `--clear` and scan the new QR. A clean reload must create a new
JS runtime; Fast Refresh is insufficient and rejects mode changes. Edit/remove
conflicting values in local `.env` files too. No machine/global configuration is
changed by these commands. `.node-version` is only a version-manager hint.

For real NONPROD, use the same PATH selection above, then enter actual public
deployment configuration supplied by the backend owner:

```powershell
Remove-Item Env:EXPO_PUBLIC_PREVIEW_CATALOGUE -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_APP_MODE = 'NONPROD'
$env:EXPO_PUBLIC_API_BASE_URL = Read-Host 'Actual deployed HTTPS nonprod backend base URL'
$env:EXPO_PUBLIC_CUSTOMER_CAPABILITIES = Read-Host 'Comma-separated deployed and verified capability names'
pnpm dev:customer:go --lan --clear
```

No working URL or deployed manifest was provided, so none is invented here.
The backend URL must be reachable directly from the phone. A Metro connection
does not expose a PC-local backend. `principal` requires verified `/v1/auth/me`;
valid names are in `src/api/capabilities.ts`. Keep `cancellationCompensation`
absent pending Batch B verification. Do not enter API keys, credentials, JWTs,
refresh tokens, Razorpay secrets or database secrets into EXPO_PUBLIC variables.
NONPROD uses the configured real OTP provider and backend; fresh signed-out launch
opens Login, while an existing valid real session can resume normally.

For an already-installed custom native development build, retain that configuration
and run `pnpm dev:customer --lan --clear` instead. It starts `--dev-client`.
Custom iOS builds require the appropriate macOS/Xcode/signing setup; they are not
created by this task. Go handles maps/location/keyboard/fonts/routing and supported
backend APIs. It cannot provide the application's absent native Razorpay adapter
or full remote push integration.

## Verification

| Check                                        | Result                                            |
| -------------------------------------------- | ------------------------------------------------- |
| `pnpm typecheck`                             | Passed                                            |
| `pnpm lint`                                  | Passed, zero warnings                             |
| `pnpm test`                                  | Passed: 18 suites, 130 tests (28 added cases)     |
| `pnpm format:check --end-of-line auto`       | Passed                                            |
| `git diff --check`                           | Passed                                            |
| Native iOS SCREEN_PREVIEW development export | Passed: 2,192 modules, 56 assets                  |
| Native iOS NONPROD optimized export          | Passed: 2,006 modules, 29 assets, Hermes bytecode |

The existing Windows checkout has `core.autocrlf=true`; its default LF-only
format check flagged 102 untouched files in the base investigation. No Git/global
configuration or unrelated line endings were changed. The current full formatting
check passed with the documented `--end-of-line auto` argument. The first complete
test run emitted the existing intermittent VirtualizedList `act` warning; all
tests passed, and the final complete run passed without that warning. No test
expectations or native guards were relaxed to obtain passing checks.

New tests cover exact development/Expo Go activation, release/native rejection,
invalid/unset values and ignored legacy flag, same-runtime mode-change rejection,
credential-free navigation, Home/protected/auth routing, indicator visibility,
address/collection ownership, zero SecureStore consumption/writes/removals, no
real bootstrap/principal/refresh invocation, public/protected request and command
rejection, real NONPROD OTP/SecureStore/refresh/principal/logout composition, and
backend failure without fixture fallback. Existing auth, session races/logout,
fixture/screen, payment/refund, admission and notification suites also passed.

Both native exports used the supported existing Node 24.19.0/pnpm 11.25.0 runtime.
For reproducible compile checks after selecting that PATH:

```powershell
$env:CI = '1'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_API_BASE_URL = ''
$env:EXPO_PUBLIC_CUSTOMER_CAPABILITIES = ''
$env:EXPO_PUBLIC_APP_MODE = 'SCREEN_PREVIEW'
pnpm --filter @tirodhan/customer-mobile exec expo export --platform ios --dev --clear --output-dir dist/screen-preview-mode-ios
$env:EXPO_PUBLIC_APP_MODE = 'NONPROD'
pnpm --filter @tirodhan/customer-mobile exec expo export --platform ios --output-dir dist/nonprod-mode-ios
```

These are static compile checks with dotenv loading disabled and no deployment
URL/capabilities, not runnable NONPROD deployment configuration. Use a fresh
terminal for the device launch commands above. Artifacts are ignored under
`apps/customer-mobile/dist/screen-preview-mode-ios` and `dist/nonprod-mode-ios`.
They are not published or included in the commit. Expo Doctor's remote schema
TLS failure from the prior launch investigation is not represented as a pass;
dependencies/native configuration were not changed or revalidated through a
signed device build in this task.

The user reports successful physical iPhone launch of the previous commit.
Physical acceptance of the new modes remains pending; bundling and mocked tests
cannot establish device navigation, maps, payment execution, APNs or deployed API
acceptance. No real backend/provider request was made for these checks.

Device acceptance: cold-start SCREEN_PREVIEW and confirm Home/label with no OTP;
navigate catalogue/items, addresses/native map, slots/review, local pending-payment
detail, history/journey/refund states and Account/preferences; verify no backend
auth/business traffic and no persisted credential change. Try notification opt-in
and confirm unavailable; payment execution must remain disabled. Restart into
NONPROD with verified deployment configuration, confirm Login or authoritative
session resumption, real challenge/OTP/CUSTOMER principal, authoritative reads and
booking. Verify backend errors remain visible with no fixtures and preview label
absent. Payment-provider/push acceptance waits for the custom build/adapter and
cancellation/refund mutation acceptance waits for deployed Batch B verification.

## Exact changed files

All paths below are relative to `apps/customer-mobile/` in the writable frontend:

| File                                 | Change                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| `.env.example`                       | Authoritative mode and deprecated flag documentation            |
| `README.md`                          | Current mode/device instructions and financial restrictions     |
| `app/_layout.tsx`                    | Navigation startup/owner boundary and preview indicator         |
| `app/index.tsx`                      | Preview navigation snapshot and Home routing                    |
| `app/(product)/_layout.tsx`          | Boundary adapter, existing admission, moved indicator           |
| `app/login.tsx`                      | Preview auth-route wrapper                                      |
| `app/otp.tsx`                        | Preview auth-route wrapper                                      |
| `docs/IOS_EXPO_GO_REPORT.md`         | Mark old flag instructions as historical/superseded             |
| `docs/TESTING_MODES_REPORT.md`       | Investigation, architecture, checks and removal inventory       |
| `src/api/capabilities.ts`            | Remove obsolete independent preview resolver                    |
| `src/lib/appMode.ts`                 | Exact mode validation and restart lock                          |
| `src/lib/navigation.ts`              | Route/query boundary selecting real or preview navigation       |
| `src/lib/runtime.ts`                 | Mode composition, rejecting transport/credentials, local logout |
| `src/preview/navigation.ts`          | Synthetic namespace and credential-free adapter                 |
| `src/preview/isolation.ts`           | Reject every backend request/command and auth credential access |
| `src/preview/AuthRoute.tsx`          | Redirect direct preview auth routes before real screens mount   |
| `src/features/addresses/queries.ts`  | Isolated address query ownership                                |
| `src/features/collection/queries.ts` | Isolated collection query ownership                             |
| `src/test/app-mode.test.ts`          | Mode/restart/identity gates                                     |
| `src/test/app-mode-runtime.test.ts`  | Composed credential/transport isolation and real NONPROD auth   |
| `src/test/preview-routes.test.tsx`   | Home/auth routes/root indicator/query ownership                 |
| `src/test/product-state.test.ts`     | Remove old-flag assertion, retain capability regression         |

Dependencies, package scripts, lockfile, native configuration, maps, keyboard
controller and fonts are unchanged in this commit. No backend files changed;
read-only backend `git status --porcelain=v1` remained empty. No push, merge,
deployment, global install/config change or signed build was performed.

## Future removal inventory

1. In `src/lib/appMode.ts`, remove SCREEN_PREVIEW from the permitted mode set and
   its activation branch; keep validated NONPROD/PRODUCTION behavior. Remove its
   preview-only test cases while retaining real-mode/invalid-mode validation.
2. Delete `src/preview/navigation.ts`, `src/preview/isolation.ts` and
   `src/preview/AuthRoute.tsx`. Remove `src/lib/navigation.ts` or reduce it to the
   real session owner helper. Rewire `app/_layout.tsx`, `app/index.tsx`,
   `app/(product)/_layout.tsx`, and address/collection query imports directly to
   the real SessionStore; remove root preview label. Restore direct Login/OTP
   route exports in `app/login.tsx` and `app/otp.tsx`.
3. Remove preview composition branches/imports and local logout/device-ID guard
   in `src/lib/runtime.ts`; keep the original Transport, SecureStore, SessionStore,
   capability configuration and normal logout. In `src/lib/repositories.ts`,
   remove fixture selection/import and always select `createHttpRepositories`.
4. Delete `src/features/collection/developmentRepositories.ts` (including its unused
   fixture principal reader) and `developmentCatalogue.ts`. Remove development
   assets from `src/features/media/MediaImage.tsx` and the `developmentAssetKey`
   seam in `src/features/media/model.ts`; retain remote media behavior. Delete
   fixture-only `src/features/collection/assets.ts`, `scripts/extract-reference-assets.py`
   and `assets/catalogue/*.webp` after confirming no shared production references.
5. Remove remaining existing preview-only UI branches/imports in
   `src/features/auth/LoginScreen.tsx`, `src/features/collection/CollectionDetailScreen.tsx`
   and `src/features/collection/FinancialSection.tsx`. Keep normal OTP, financial
   states, checkout adapter gating and deployed cancellation capability checks.
6. Delete `src/test/preview-routes.test.tsx`; remove preview-only cases in
   `src/test/app-mode.test.ts` and `app-mode-runtime.test.ts` while retaining NONPROD
   authentication/no-fallback coverage. Remove fixture-dependent cases or move
   their existing UI regression expectations to API test doubles in
   `product-state.test.ts`, `product-screens.test.tsx`, `address-screen.test.tsx`,
   `pagination-recovery.test.tsx` and `media-recommendations.test.tsx`. Keep auth,
   SessionStore, admission, transport, payment/refund and notification regressions.
7. Remove SCREEN_PREVIEW/deprecated-flag instructions from `.env.example`, README
   and these reports; delete local preview overrides. Keep NONPROD deployment
   configuration, `start:go`/`dev:customer:go`, `--dev-client` and the Expo Go push
   guard wherever that runtime is still supported.

Removal does not rewrite SessionStore, SecureStore, authFlow/OTP, HTTP Transport,
API contracts, booking/serviceability/slot workflows or financial logic. This
delivery stops at local commit for architectural review.
