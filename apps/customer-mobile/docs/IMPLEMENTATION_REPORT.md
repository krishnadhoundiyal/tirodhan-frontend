# Customer Mobile completion report

For the subsequent narrow correction pass and its current validation/backend verification, see [PRE_MERGE_CORRECTION_REPORT.md](PRE_MERGE_CORRECTION_REPORT.md). The completion-pass evidence below is historical.

Completion pass: 2026-10-08. The frontend now represents the intended customer product through typed clients, concrete repositories, query hooks and finished interactions. Live release remains dependent on the proposed backend capabilities and native device acceptance. Development fixtures are explicitly labelled, selected only with `__DEV__` and the preview flag, and never substitute for production responses.

## 1. Branch

`codex/customer-mobile-production`. The existing implementation was evolved in place. No merge or push was performed.

## 2. Commit

This report is included in the completion commit. Its exact SHA is supplied in the delivery message and can be retrieved with `git log -1 --format=%H` from the frontend workspace.

## 3. Base and backend verification

Frontend base: `225f3e14cf59f30efe7523504568b18392c9c9ad`.

Backend inspected read-only: `C:\Users\91956\Tirodhan\tirodhan`, HEAD `302c272d902b0adedb2cbf5b0a965f23c3f07673`. Verification used its routes, DTOs, auth dependencies, address ordering, collection/planning cancellation semantics, payment/refund services and relevant ADRs. The backend worktree was clean before and after this work. No backend commands that generate, format or rewrite files were run.

## 4. Files changed

Application changes are confined to `apps/customer-mobile`. The only changes outside it are the pnpm lockfile for Leaflet/types, one `format:check` step in Customer Mobile CI, and a formatter exclusion for Customer Mobile's untracked Expo-generated `expo-env.d.ts`. The delivery includes a complete file inventory below. Generated Android projects, Expo exports, browser captures and local QA scripts/logs are ignored artifacts, excluded from the commit.

## 5. Architecture

Preserved Expo development builds, Expo Router, React Native New Architecture/Hermes, strict TypeScript and existing monorepo boundaries. Removed the old unavailable collection/slot stubs and replaced them with narrow feature repositories. The canonical [backend contract handoff](CUSTOMER_MOBILE_BACKEND_CONTRACTS.md) covers existing wire compatibility and exact proposed endpoints. [BACKEND_GAPS.md](BACKEND_GAPS.md) links each deployment blocker to its contract.

Resolved runtime versions: Expo 57.0.27, React Native 0.86.3, React 19.2.3, Expo Router 57.0.25, TanStack Query 5.104.1, React Hook Form 7.89.0, expo-image 57.0.5, SecureStore 57.0.4, react-native-maps 1.27.2, expo-location 57.0.20, expo-notifications 57.0.22, Leaflet 1.9.4. Node 24.19.0 and pnpm 11.25.0 were used for validation.

No global state library, Axios, local database, DI container, generic replay engine, shared API-contract package or other application implementation was introduced.

## 6. State ownership and auth

TanStack Query owns remote reads; React Hook Form owns input; SessionStore owns credential/principal lifecycle; the feature draft owns address, selected category codes, declarations, temporary GPS coordinates and distance confirmation. Access tokens and native push tokens stay in memory. Refresh credentials use only SecureStore. The installation identifier is separate from the push token and stored in native SecureStore.

Credential authentication and principal availability are distinct. Principal loading/transient failure exposes guarded retry while retaining a successful OTP session; authoritative non-CUSTOMER identity is forbidden; principal 401 clears credentials. No JWT role inference. Generation checks prevent late principal/refresh/login results from resurrecting an old customer. Logout/account switch cancels and clears queries, clears principal and notification generations, resets fixtures and remounts the draft by owner/version.

Transport retains bounded timeout/cancellation, one 401 replay, single-flight refresh and delayed-401 handling. It never refreshes a 403. Successful malformed JSON is a protocol error; 204 does not decode JSON. Only allowlisted machine error codes affect business copy; human backend/provider text is never parsed or rendered. Prepared mutations retain their body/key across ambiguity; they do not automatically retry.

## 7. DI and repositories

Composition selects either concrete HTTP repositories or an explicit development implementation of the same `CustomerRepositories` interface. Injected fetch/UUID, SessionAccess, SecureCredential, PrincipalReader, native checkout and push ports remain test seams. Proposed clients enforce deployment capabilities before HTTP. These flags declare deployment availability; server authorization remains mandatory.

Fixtures cover address CRUD, contexts/slots, active/history pagination, owned snapshots, recorded journey, historical recommendations, all refund states, cancellation success/race/ambiguity and account/content/notification flows. They perform zero HTTP. A second transport guard blocks protected preview mutations even if credentials exist. Release ignores the preview flag. Native checkout remains disabled; fixtures never fabricate payment success.

## 8. Existing APIs integrated

Preserved all 13 verified routes: OTP start/verify, refresh/logout, address list/create/update/archive, serviceability create/read, collection create/cancel and payment-attempt creation. Exact paths and bodies are in the canonical inventory. Nullable address coordinates and optional item quantity/gram declarations match the backend. Existing address ordering is `created_at ASC, address_id ASC`.

Legacy `Idempotency-Key` compatibility is isolated in PreparedCommand transport. Quotes, payment acceptance, planning cutoff and refund creation remain backend-owned. No APIM host or deployment credentials were supplied, so this is adapter/interaction validation rather than live-server acceptance.

## 9. Proposed APIs defined

Defined 21 endpoint contracts (after the V1 pre-merge removal of the redundant standalone journey route): current principal; remote catalogue; context-bound slots; active/history list; owned immutable detail including journey; historical recommendations; payment read; checkout parameters; refund read; Customer FCM/APNs registration/revocation; notification history; profile read/update; preference read/update; favourite read/update; approved public content; payment-method metadata; feedback.

Each contract documents method/path, consumers, auth/ownership, fields and examples, nullable/optional semantics, enums, errors, caching, pagination/sort where applicable, concurrency/idempotency, privacy and frontend behavior. Existing cancellation additionally requires the documented atomic compensation enhancement. The contract specifies external business effects without prescribing backend implementation architecture.

## 10. Screens and recoverable states

Completed Review inline add/edit/remove, optional positive quantity/weight forms, context-bound slot selection, pending-payment detail, owned collection detail, paginated Active/History, ordered journey, destructive cancellation modal, independent financial status, minimal profile/preferences/favourites/feedback forms, payment-method information, approved help/about/legal-content boundary and notification history/permission/registration state.

Review preserves the address and draft while editing; it never sends the customer Home to edit items. Context source/version/expiry and slot context/availability/expiry must agree before create. PENDING contexts poll. A terminal result permits a fresh prepared check; a failed context read has explicit retry. Booking ambiguity locks changes and retains the same prepared intent. No production price formula or manufactured slot is displayed. The server quote appears after collection creation.

Account actions route to actual feature screens with loading/error/retry/save behavior. Legal fixture text is explicitly unapproved development content. Unknown information routes do not fabricate content. Address conflict refreshes saved addresses and explains reopening the latest version.

## 11. Cancellation

Only the server's `cancellation.allowed` capability offers Cancel pickup. Confirmation displays pickup date/address/amount and refund expectation. Confirmation creates one cancellation command; retries after network/timeout/protocol ambiguity reuse it. Success requires a CANCELLED response and refreshes owned detail, active/history lists, recommendations, payment and refunds. 403/404/409 also refresh current authority/eligibility; only explicit machine cutoff codes produce cutoff-specific copy.

Production cancellation additionally requires `cancellationCompensation`. The existing backend planning lock/reload/cutoff behavior was preserved, but its missing atomic cancellation + refund intent + durable outbox business effect is documented as a blocker. The frontend never creates a refund separately.

## 12. Refunds and payment

Cancellation success and refund progress are separate. Render initiated, processing, completed, confirming and needs-attention states from authoritative reads. Provider `INITIATION_UNCERTAIN` maps to safe “confirming” copy; internal terminology is absent from UI. Only a server completed state/date says refund completed. Unsettled refunds poll; missing/failed reads remain recoverable rather than implying completion.

Payment reads show server truth and poll unsettled status. A thin future native coordinator retains one prepared attempt, validates owned/coherent public checkout parameters, prevents duplicate concurrent SDK launches, and rereads payment after return or dismissal. SDK callbacks cannot accept a booking. With no configured native adapter, execution is blocked before creating an attempt. The payment screen is wired to this coordinator through the composition-level nativeCheckout port, currently null. Actual provider SDK integration and native validation remain pending.

## 13. Remote media

Production taxonomy and media metadata come from the catalogue contract. Blob/CDN HTTPS URLs use expo-image caching, fixed layouts, accessibility text, optional blurhash and neutral error/expiry fallback. URLs with credential/userinfo or invalid expiry are rejected. Asset expiry shortens query freshness. No API credential is attached to image requests.

Approved-reference WebP artwork is loaded only by explicit development asset keys inside the `__DEV__` branch. Release Android/iOS export metadata contains no WebP catalogue assets. Neutral placeholders do not claim product imagery or personalization.

## 14. History, recommendations and journey

Active/history queries use owner-scoped keys, opaque cursor contracts, stable sort and duplicate filtering. Pull-to-refresh, load-more, empty and error states are implemented. Historical detail uses immutable pickup address/items/quote rather than today's edited saved address.

“Based on your previous collections” uses server historical category codes/rank joined to active catalogue entries. Empty/unavailable results hide the section. Development recommendations also derive from completed fixture records. Journeys use recorded ordered milestones, a human-powered collection step, an authorised receiving point only when supplied and validated handover only when recorded. Unpaid fixtures leave journey steps upcoming. No fabricated downstream disposal, ETA or collection completion.

## 15. Address distance and privacy

The configurable 5 km default uses local Haversine distance from an already authorised current coordinate to the selected saved pin. It is labelled approximate; absent/invalid coordinates skip the warning. No location permission is requested solely for this warning. Confirmation is bound to address ID, version and pin; address changes invalidate it. Coordinates and confirmation are ephemeral; they are not logged, persisted or placed in telemetry. Native location objects are narrowed to latitude/longitude before address DTO use.

## 16. Maps

Native map behavior remains in react-native-maps with native location permission/geocoding boundaries. An isolated `.web.tsx` adapter uses Leaflet, standard tiles/attribution, a draggable pickup pin and map-click selection. It is only the Customer Mobile browser preview; no Customer Web app or custom map engine was built. Tile configuration can be replaced for deployment; serviceability stays backend-owned.

Expo web export warns that Leaflet's CSS local PNG URLs are unsupported. Those unused layer/default-marker resources are not used by this adapter's DivIcon and controls; the inspected preview works. Native map and geocoding have not been validated on a device.

## 17. Tests

Expanded from 41 tests in 7 suites to 85 tests in 13 suites. Added six suites covering actual product-route admission, transient principal retry/401/non-CUSTOMER/account switch, proposed capability and release-preview gates, transport protocol/204/abort/timeout/403 semantics, exact cancellation replay without a refund call, pagination/snapshots/all refund states, serviceability expiry/version/terminal recovery, Review inline item editing/quantity/removal and slot requirement, local distance warning without a permission request, media failure/expiry/development isolation, recommendation hiding/history coherence, push FCM/APNs rotation/revocation/generation/deduplication, and the native payment boundary.

Retained existing session concurrency, refresh/logout, API body/header, address interaction, OTP and notification tests. Tests clear query clients and use appropriate mutation GC settings; Jest exits normally without forced exit.

## 18. Validation evidence

| Check                                           | Result                                                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                | PASS                                                                                                                                                                                               |
| `pnpm typecheck`                                | PASS                                                                                                                                                                                               |
| `pnpm lint`                                     | PASS                                                                                                                                                                                               |
| `pnpm test`                                     | PASS, 85 tests / 13 suites; no forced exit or React lifecycle warnings in the final run                                                                                                            |
| `pnpm format:check`                             | PASS                                                                                                                                                                                               |
| `pnpm run doctor`                               | PASS, 21/21. First run's remote schema fetch failed with ECONNRESET; retry passed.                                                                                                                 |
| `expo export --platform all`                    | PASS: Android/iOS Hermes bundles and web bundle/HTML/metadata. Final source rerun passed with preview flag=true. Native catalogue WebP assets: zero on both platforms.                             |
| `expo prebuild --platform android --no-install` | PASS; generated project ignored, package manifest unchanged.                                                                                                                                       |
| `expo run:android --no-install`                 | Attempted; blocked because Android SDK and adb are absent.                                                                                                                                         |
| Browser, 390×844 / 360×640 / 412×915            | PASS scripted customer flows, 13 captures each, zero runtime errors. Critical modal/footer controls checked within viewport. Fresh-cache rerun passed at all three sizes with zero runtime errors. |

Browser verification exercised Home, inline item modal/quantity, saved-address selection and approximate-distance confirmation, serviceability/slot/create, pending payment, history/detail, cancellation confirmation, initiated/completed refund, ambiguous same-command retry and Account. Screenshots were visually inspected, including the smallest viewport. A discovered narrow Review row was corrected and rerun. Browser verification does not establish native acceptance.

The exported release web artifact was also opened with preview flag=true at export: Login appeared, the development product banner was absent, and no runtime errors occurred. Android exported 33 framework/font assets and iOS 29; neither included catalogue WebP assets.

Local evidence is under `.local/qa/completion-*` (logs, browser script/results and 39 captures); generated exports are under `apps/customer-mobile/dist`. These artifacts are intentionally excluded from source control.

## 19. Remaining backend/deployment blockers

Implement and deploy the contracts in the canonical handoff, including principal authorization, authoritative remote catalogue/slots, owned active/history/detail/journey, historical recommendations, independent payment/refund projections, atomic cancellation compensation, native checkout parameters, Customer push registration/delivery/history and minimal account/content endpoints. Provide APIM HTTPS configuration, approved legal/support content, production media/expiry policy, Android maps/Firebase configuration and APNs/provider checkout configuration. Enable capabilities only after verified deployment. No rider registration endpoint is used for Customer push.

## 20. Remaining native validation

Run Android development builds on an SDK-equipped host/device and iOS on macOS/Xcode or the configured build service. Validate actual maps/pin/geocoding and permission denial, SecureStore lifecycle, OTP autofill/keyboard, safe areas/small displays/dynamic text, TalkBack/VoiceOver and modal focus, FCM/APNs registration/rotation/revocation plus foreground/background/cold-start taps, deep links, device performance and provider checkout return/dismissal/reconciliation. Exports and generated native projects do not substitute for these tests.

## 21. Monorepo safety

Frontend workspace modified: `C:\Users\91956\Tirodhan-frontend\tirodhan-frontend`.

Backend workspace modified: **NO**.

Original `docs/FRONTEND_ARCHITECTURE.md`, frozen `docs/ux/**` specifications and approved PNGs are unchanged. No other application/shared package was implemented or modified. Backend HEAD/worktree were verified unchanged. Only the existing frontend branch receives the completion commit; no merge or push.

## Complete file inventory

70 files, including three removed unavailable stubs.

- `.github/workflows/customer-mobile.yml`
- `.prettierignore`
- `apps/customer-mobile/.env.example`
- `apps/customer-mobile/app/_layout.tsx`
- `apps/customer-mobile/app/(product)/_layout.tsx`
- `apps/customer-mobile/app/(product)/account-options.tsx`
- `apps/customer-mobile/app/(product)/collections/[requestId].tsx`
- `apps/customer-mobile/app/information.tsx`
- `apps/customer-mobile/docs/BACKEND_GAPS.md`
- `apps/customer-mobile/docs/CUSTOMER_MOBILE_BACKEND_CONTRACTS.md`
- `apps/customer-mobile/docs/IMPLEMENTATION_REPORT.md`
- `apps/customer-mobile/package.json`
- `apps/customer-mobile/README.md`
- `apps/customer-mobile/src/api/capabilities.ts`
- `apps/customer-mobile/src/api/contracts.ts`
- `apps/customer-mobile/src/api/customer-client.ts`
- `apps/customer-mobile/src/api/customer-contracts.ts`
- `apps/customer-mobile/src/api/errors.ts`
- `apps/customer-mobile/src/api/transport.ts`
- `apps/customer-mobile/src/components/ActionModal.tsx`
- `apps/customer-mobile/src/features/account/AccountOptionsScreen.tsx`
- `apps/customer-mobile/src/features/account/AccountScreen.tsx`
- `apps/customer-mobile/src/features/activity/ActivityScreen.tsx`
- `apps/customer-mobile/src/features/activity/JourneyTimeline.tsx`
- `apps/customer-mobile/src/features/activity/repository.ts`
- `apps/customer-mobile/src/features/addresses/AddressForm.tsx`
- `apps/customer-mobile/src/features/addresses/AddressScreen.tsx`
- `apps/customer-mobile/src/features/addresses/distance.ts`
- `apps/customer-mobile/src/features/addresses/DistanceConfirmation.tsx`
- `apps/customer-mobile/src/features/addresses/MapPreview.web.tsx`
- `apps/customer-mobile/src/features/addresses/queries.ts`
- `apps/customer-mobile/src/features/auth/OtpScreen.tsx`
- `apps/customer-mobile/src/features/collection/cancellation.ts`
- `apps/customer-mobile/src/features/collection/catalogue.ts`
- `apps/customer-mobile/src/features/collection/CollectionDetailScreen.tsx`
- `apps/customer-mobile/src/features/collection/developmentCatalogue.ts`
- `apps/customer-mobile/src/features/collection/developmentRepositories.ts`
- `apps/customer-mobile/src/features/collection/DraftProvider.tsx`
- `apps/customer-mobile/src/features/collection/financial.ts`
- `apps/customer-mobile/src/features/collection/FinancialSection.tsx`
- `apps/customer-mobile/src/features/collection/ItemSelector.tsx`
- `apps/customer-mobile/src/features/collection/paymentFlow.ts`
- `apps/customer-mobile/src/features/collection/queries.ts`
- `apps/customer-mobile/src/features/collection/repository.ts`
- `apps/customer-mobile/src/features/collection/ReviewScreen.tsx`
- `apps/customer-mobile/src/features/collection/serviceabilityState.ts`
- `apps/customer-mobile/src/features/collection/slots.ts`
- `apps/customer-mobile/src/features/home/HomeScreen.tsx`
- `apps/customer-mobile/src/features/home/Recommendations.tsx`
- `apps/customer-mobile/src/features/media/MediaImage.tsx`
- `apps/customer-mobile/src/features/media/model.ts`
- `apps/customer-mobile/src/lib/repositories.ts`
- `apps/customer-mobile/src/lib/runtime.ts`
- `apps/customer-mobile/src/lib/unavailable.ts`
- `apps/customer-mobile/src/notifications/credential.ts`
- `apps/customer-mobile/src/notifications/integration.ts`
- `apps/customer-mobile/src/notifications/lifecycle.ts`
- `apps/customer-mobile/src/notifications/NotificationScreen.tsx`
- `apps/customer-mobile/src/notifications/signals.ts`
- `apps/customer-mobile/src/session/admission.ts`
- `apps/customer-mobile/src/session/store.ts`
- `apps/customer-mobile/src/test/address-screen.test.tsx`
- `apps/customer-mobile/src/test/media-recommendations.test.tsx`
- `apps/customer-mobile/src/test/notification-integration.test.ts`
- `apps/customer-mobile/src/test/payment-flow.test.ts`
- `apps/customer-mobile/src/test/product-admission.test.tsx`
- `apps/customer-mobile/src/test/product-screens.test.tsx`
- `apps/customer-mobile/src/test/product-state.test.ts`
- `apps/customer-mobile/src/test/transport-completion.test.ts`
- `pnpm-lock.yaml`
