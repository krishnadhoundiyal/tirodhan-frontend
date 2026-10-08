# Customer Mobile implementation report

Implemented on `codex/customer-mobile-production` from frontend `origin/main` at `ea2a6d86b93ea95ff46c255e496744cf3e9bbe9e`. Backend `main` inspected at `4994089a0bd5f7317bba1ab49cdfb8d4cec0241a`. The implementation commit SHA is supplied in the delivery message and available with `git log -1`. No merge, push, backend change, or other application implementation was performed.

This is a committed application foundation with backend-aligned integrations and guarded unavailable states. It is **not production release-ready**: the current backend cannot bootstrap a live Customer principal, discover slots, or return customer journeys. A native development build could not be launched in this environment. Those definition-of-done items remain open; passing JavaScript checks does not satisfy native acceptance.

## Delivered application and ownership

Only `apps/customer-mobile` was created, plus root pnpm/Turbo/formatting/CI scaffolding. Original architecture and UX documents/images remain unchanged. All required frontend documents, screen specifications and eight approved PNGs were read before implementation. Backend routes, dependencies, Pydantic DTOs, services, ports, tests and relevant ADRs were inspected before adapters were written.

```text
apps/customer-mobile/
  app/                 Expo Router routes, layouts, product admission guard
  assets/catalogue/    small WebP crops from approved references
  src/
    api/               exact backend DTOs, fetch transport, normalized errors
    session/           memory-only access, SecureStore refresh, principal boundary
    features/
      auth/            Splash, Login, OTP, ephemeral challenge
      home/            grouped catalogue and category selection
      addresses/       authoritative queries, selection, forms, native location/map
      collection/      local draft, repository/slot boundaries, Review
      activity/        Active/History, journey renderer, unavailable read repository
      account/         approved rows, navigation, sign-out
    components/        Brand, Header, application-owned primitive UI
    theme/             approved colors and font names
    lib/               runtime/query ownership and unavailable-contract type
    notifications/     native integration, safe signal dispatcher, permission UI
    test/              interaction, contract and concurrency tests
  scripts/             reproducible reference asset extraction
  docs/                verified gaps and this report
```

Splash, Login, OTP/error, Home, Review, Activity, Address Selection and Account are implemented. Five-entry bottom navigation includes centered Book Pickup; Account includes Activity. Bookings shares the journey presentation/query boundary. Home preserves header/address/hero/quick strip/four grouped horizontal lists/activity/recommendation section order. Catalogue metadata lives behind a repository, outside JSX.

Remote state belongs to TanStack Query, forms to React Hook Form, and transient address/category selections to the local draft provider. Logout clears remote cache and changes the draft owner. Archiving a selected saved address clears it from the draft; updating it refreshes its version. Native geocoding results are ignored after a newer pin/address selection.

## Backend endpoints and execution status

Every path below was verified against backend source. Adapter tests exercise exact bodies and header/version behavior; a deployed APIM URL was not supplied, so these are not live-server end-to-end claims.

| Endpoint                                                      | Wiring                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST `/v1/auth/otp/start`                                     | Login and resend; defined `client_request_id`, `phone`; challenge held only in memory                 |
| POST `/v1/auth/otp/verify`                                    | OTP submit/error; defined `client_login_id`, challenge reference and code; establishes secure session |
| POST `/v1/auth/refresh`                                       | Startup, expiry and coordinated protected-call 401 renewal; defined refresh credential body           |
| POST `/v1/auth/logout`                                        | Sign-out with refresh credential; local cleanup in `finally`                                          |
| GET `/v1/addresses`                                           | Customer-scoped cancellable query and saved-address UI                                                |
| POST `/v1/addresses`                                          | Address form; exact write fields                                                                      |
| PUT `/v1/addresses/{address_id}`                              | Edit form; server `expected_version`                                                                  |
| POST `/v1/addresses/{address_id}/archive`                     | Archive form action and query/draft cleanup                                                           |
| POST `/v1/serviceability/contexts`                            | Review availability action using selected source-address ID                                           |
| GET `/v1/serviceability/contexts/{context_id}`                | Persisted-state read; poll only while PENDING/unexpired; address/version guards                       |
| POST `/v1/collection-requests`                                | Typed prepared-command adapter; UI execution blocked until real catalogue/slot contracts exist        |
| POST `/v1/collection-requests/{request_id}/cancel`            | Typed prepared-command adapter; no invented activity action without real customer read                |
| POST `/v1/payments/collection-requests/{request_id}/attempts` | Typed adapter; checkout execution deferred pending complete integration/configuration                 |

IDs are encoded in paths. Optional quantities/gram declarations are preserved; quotes and line amounts remain backend-owned. Unknown business statuses remain opaque DTO strings. No client price formula, H3 calculation, captured-payment state, webhook call, or fabricated API success was added.

The six verified legacy mutation patterns require a temporary transport-only request-scoped `Idempotency-Key`. A prepared command snapshots its body and reuses its key during the same in-memory intent/401 replay; changed input or expired availability creates a new intent. There is no persistent command queue, generic feature-level key management, automatic network retry of mutations, or safe-replay promise after process death. This mismatch remains a release blocker.

## Session and security

Access credentials remain private memory fields. Refresh credentials use only Expo SecureStore with device-only unlocked access; snapshots contain no credentials. Single-flight refresh handles concurrent and delayed old-token 401s, permits one replay, clears on renewal failure or a second 401, and never renews on 403. Backend `expires_in` controls lifetime. Generation guards and serialized secure writes prevent late renewal/login persistence from undoing logout.

No role is inferred from JWT. Production product routes fail closed until the injected principal reader can use a real backend contract. A development-only catalogue flag permits explicitly labelled design inspection, is ignored in release, and cannot enable production booking. OTP/phone challenge state is ephemeral and excluded from navigation parameters. No application logging, ordinary credential storage, analytics, or raw backend error display was added. Query cache is memory-only. Production API configuration requires HTTPS.

## Verified backend blockers

Detailed source evidence and frontend consequences are in [BACKEND_GAPS.md](BACKEND_GAPS.md): missing live principal bootstrap; customer collection/list/detail/activity reads; slot discovery; actual receiving-destination/onward-processing reads; Customer push registration/replacement/revocation and payload/history contracts; catalogue/taxonomy/assets; standalone pre-create quote/authoritative customer payment read; account/profile/preferences/legal content. Current Rider-only push endpoints are not Customer endpoints. Android maps/Firebase credentials and an actual APIM host also remain deployment inputs.

## Notification integration status

Centralized Expo native integration handles opt-in permissions, existing permission reuse, Android channel creation, native token acquisition/reacquisition/rotation, foreground receipt, notification taps, last-response cold start, cleanup and sensitive token removal. Tokens stay in memory. Android native tokens are FCM; iOS tokens are APNs and are never sent to an FCM-only backend.

The existing worker emits Rider `ASSIGNMENT_OFFER`; no Customer payload schema exists. Unknown/minimal signals safely navigate to Activity and refetch authoritative reads. Arbitrary URLs, payload business status and PII are ignored. Bounded duplicate-tap tracking prevents repeated navigation while preserving refetch. App resume triggers stale-query refresh and activity invalidation without any push. OS-delivered background notifications/taps are supported by the native integration; data-only headless business fetching is deferred. Real registration, revocation and end-to-end push cannot be claimed until Customer contracts and native credentials exist.

## Validation and outstanding acceptance

| Check                                            | Result                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                 | Passed with bundled Node 24.19.0 and pnpm 11.25.0                                                                                               |
| `pnpm typecheck`                                 | Passed, strict TypeScript                                                                                                                       |
| `pnpm lint`                                      | Passed, zero warnings                                                                                                                           |
| `pnpm test`                                      | 7 suites / 41 tests passed; no full-screen snapshots                                                                                            |
| Prettier                                         | Passed for all new application/root/CI files                                                                                                    |
| `pnpm run doctor`                                | 21/21 checks passed, no exclusions; network check required Node's environment-proxy support                                                     |
| Expo dependency compatibility                    | `expo install --check` passed                                                                                                                   |
| Android CNG/prebuild                             | Passed, native configuration generated; generated native files are ignored                                                                      |
| Android production export                        | Passed, Hermes bundle and asset export                                                                                                          |
| Development web preview                          | Started locally; Headless Edge at 390×844 verified Home selection→Review, Activity, Account, Address and Login with zero page or console errors |
| Android native development launch                | Attempted `expo run:android --no-install`; blocked by missing Android SDK/`adb`                                                                 |
| iOS native build/device                          | Not run; Windows host has no Xcode/iOS device toolchain                                                                                         |
| Live backend auth/mutations/payments/push        | Not exercised; no actual APIM/native configuration supplied                                                                                     |
| Native visual fidelity/accessibility/performance | Outstanding on physical mid-range Android and iOS; not inferred from browser/Jest results                                                       |

Tests cover one/concurrent/delayed 401, shared renewal, one-retry limit, 403, failed renewal, logout during renewal, secure-write/logout races, server expiry and secure-only persistence; auth DTOs and actual Login/OTP interactions; saved-address loading/selection/empty/retry/archive draft cleanup and expected-version transport mapping; legacy command key reuse; optional collection quantities/weights and server pricing/payment DTOs; native permission/token/listener lifecycle, foreground/tap/duplicates/stale signals; disabled CTA, skeletons and safe error/retry states.

Final self-review covered product admission, sensitive storage/logging, route encoding, bounded request cancellation including body reads, stale address/serviceability results, renewal/logout races, notification cleanup and filtered ownership. The requested native-start/smoothness/visual-acceptance definition of done is explicitly **not complete**. The commit preserves reviewable work without representing it as a release candidate.

## UX deviations and interpretations

- Cream/gold palette, rounded cards, Cormorant display, Inter UI, live Tiro Hindi, illustrated hero/journey, circular quick strip and four horizontal category sections are retained. Images are reference crops, not rasterized screen UI. Only five required font variants and the used Ionicons set are imported.
- Responsive card/quick-strip dimensions prioritize readable text and touch controls rather than scaling the tall PNG as one raster image. Native safe-area, keyboard, text-scale, screen-reader and performance acceptance remains open. Browser captures alone do not establish a pixel-perfect match.
- Primary gold CTA/active-segment labels use dark text for contrast. Brand lotus is an application-owned SVG recreation awaiting the canonical vector asset. Hero pager dots retain the approved visual treatment; there is one approved hero content panel, with no fabricated additional marketing slides.
- “Based on your previous collections” becomes neutral “Popular collection groups” until real history exists. Mock address, journey progress, dates, prices, discounts and kiosk names are replaced with explicit unavailable/selection states. Actual receiving destinations are never invented; Review describes intended process using neutral imagery.
- Legal/support/profile/settings destinations remain honest unavailable screens until approved text/contracts exist. Razorpay SDK is intentionally not added without usable checkout/client/read contracts.
- Frozen `/auth/me` intent is represented by `PrincipalReader`, without issuing a nonexistent request. Product admission remains blocked. Temporary mutation-header adaptation is narrowly isolated and documented rather than promoted into a permanent architecture.
- SDK 57 mandates Hermes/New Architecture; obsolete configuration keys are omitted. Expo Router owns routing/error boundaries/deep links; TanStack Query owns cancellation/deduplication; native platform geocoding owns address discovery; backend owns serviceability/business truth.
- ESLint 10 is current stable; some Expo-provided React/import rules still declare older peer ranges. Official `@eslint/compat` adapts removed rule APIs, with all lint rules active and passing. Testing Library 14 uses its asynchronous API; `test-renderer` 1.2.0 is pinned because its React reconciler matches React 19.2, whereas 1.3.0 expects React 19.3. These are concrete tooling compatibility choices.
- The stock system Node 18 is below SDK requirements; the supplied Node 24 runtime was used. Sandbox command startup repeatedly failed, so authorized shell checks ran through reviewed escalation. No automatic approval rejection occurred.

## Exact direct dependencies and responsibilities

Installed versions below are from package manifests resolved by the committed lockfile, not merely version ranges. Expo-managed/native dependencies were installed through `expo install`; the stable framework baseline was checked against [official Expo compatibility documentation](https://docs.expo.dev/versions/latest/). [Notification](https://docs.expo.dev/versions/latest/sdk/notifications/) and [map](https://docs.expo.dev/versions/latest/sdk/map-view/) configuration follows the SDK documentation. Rule adaptation follows [official ESLint compatibility utilities](https://eslint.org/blog/2024/05/eslint-compatibility-utilities/).

| Runtime package                            | Installed | Concrete responsibility                                            |
| ------------------------------------------ | --------- | ------------------------------------------------------------------ |
| `expo`                                     | 57.0.27   | Stable Expo runtime, CLI and native configuration                  |
| `react-native`                             | 0.86.3    | Native UI/runtime                                                  |
| `react`                                    | 19.2.3    | Component/state model                                              |
| `expo-router`                              | 57.0.25   | File routes, stacks/tabs, deep links and error boundary            |
| `expo-dev-client`                          | 57.0.19   | Native development build workflow                                  |
| `expo-constants`                           | 57.0.21   | Router/development runtime integration requirement                 |
| `expo-linking`                             | 57.0.12   | Router's platform linking integration                              |
| `expo-crypto`                              | 57.0.3    | Backend-defined UUID command identifiers                           |
| `expo-secure-store`                        | 57.0.4    | OS secure refresh credential storage                               |
| `@tanstack/react-query`                    | 5.104.1   | Server state, deduplication, cancellation, invalidation            |
| `react-hook-form`                          | 7.89.0    | Login/OTP/address validation and submission                        |
| `react-native-confirmation-code-field`     | 9.0.0     | OTP entry/autofill/focus behavior                                  |
| `react-native-keyboard-controller`         | 1.21.9    | Native keyboard-aware form layout                                  |
| `react-native-gesture-handler`             | 2.32.0    | Native navigation/gesture integration                              |
| `react-native-safe-area-context`           | 5.7.0     | Native safe-area insets                                            |
| `react-native-screens`                     | 4.26.2    | Native route/screen integration                                    |
| `react-native-reanimated`                  | 4.5.1     | Expo navigation/keyboard animation integration                     |
| `react-native-worklets`                    | 0.10.1    | Required Reanimated native runtime                                 |
| `expo-location`                            | 57.0.20   | Opt-in location and platform geocoding                             |
| `react-native-maps`                        | 1.27.2    | Native preview/pin map; Android config plugin                      |
| `expo-notifications`                       | 57.0.22   | Native permission, tokens, channels and notification listeners     |
| `expo-device`                              | 57.0.2    | Physical-device capability check for push                          |
| `expo-image`                               | 57.0.5    | Sized, cached WebP images and transitions                          |
| `expo-font`                                | 57.0.4    | Load only the five required live font faces                        |
| `@expo-google-fonts/cormorant-garamond`    | 0.4.1     | Approved display serif                                             |
| `@expo-google-fonts/inter`                 | 0.4.2     | Approved controls/body text                                        |
| `@expo-google-fonts/tiro-devanagari-hindi` | 0.4.1     | Live Hindi wordmark/tagline typography                             |
| `@expo/vector-icons`                       | 15.1.1    | Ionicons navigation/location/account symbols                       |
| `react-native-svg`                         | 15.15.4   | Application-owned scalable lotus brand mark                        |
| `expo-splash-screen`                       | 57.0.9    | Native splash lifetime while fonts/session bootstrap               |
| `expo-status-bar`                          | 57.0.1    | Approved light-screen status-bar treatment                         |
| `expo-system-ui`                           | 57.0.4    | Native light appearance configuration support                      |
| `react-dom`                                | 19.2.3    | Expo browser development preview renderer                          |
| `react-native-web`                         | 0.21.3    | Browser UI verification of Customer Mobile, not a separate web app |

| Development/root package        | Installed | Concrete responsibility                           |
| ------------------------------- | --------- | ------------------------------------------------- |
| `typescript`                    | 6.0.3     | Strict compile-time checking                      |
| `@types/react`                  | 19.2.18   | React declarations                                |
| `eslint`                        | 10.12.0   | Static code/rule checks                           |
| `eslint-config-expo`            | 57.0.2    | SDK-specific flat lint configuration              |
| `@eslint/compat`                | 2.1.1     | Adapt older plugin APIs to stable ESLint 10       |
| `jest`                          | 29.7.0    | SDK-compatible test runner                        |
| `jest-expo`                     | 57.0.5    | Expo native module test environment               |
| `@react-native/jest-preset`     | 0.86.3    | Current React Native preset required by jest-expo |
| `@testing-library/react-native` | 14.0.1    | Actual accessible component interactions          |
| `@types/jest`                   | 29.5.14   | Typed test APIs                                   |
| `react-test-renderer`           | 19.2.3    | Expo/RN preset's renderer dependency              |
| `test-renderer`                 | 1.2.0     | Testing Library 14's compatible modern renderer   |
| `prettier`                      | 3.9.9     | Root/application formatting                       |
| `turbo`                         | 2.11.7    | Filtered monorepo quality tasks                   |

`pnpm` 11.25.0 is the pinned workspace package manager. Expo Doctor is invoked via `pnpm dlx expo-doctor`; it is a validation tool, not a shipped runtime dependency. Native maps, location, notifications, SecureStore, font, splash and dev-client config plugins are in `app.config.ts`; EAS development/preview/production profiles are in `eas.json`. No Redux, Axios, Paper, local database, payment SDK or push-service substitute was introduced.
