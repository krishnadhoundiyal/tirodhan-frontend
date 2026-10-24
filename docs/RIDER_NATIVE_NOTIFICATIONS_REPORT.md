# Rider RM-P0-04 — Native notifications and operational synchronization

## Revision and outcome

- Branch: `codex/rider-native-notifications`.
- Implementation commit: `dab2d4499b114d8fc299d6fb3b1c5ace583eca12`; the subsequent report commit records this exact implementation.
- Exact branch parent: `ad45dd0b7545b5f19693a933a33d305e1a756701` from `codex/rider-evidence-handover`.
- Retained ancestors: foundation `afdcb3032f371173db8802673068996c79949a5d`, pickup execution `216a6f2e292ef98fde3cfc5d89f628386ad6969c`, evidence `99d204741d49503ff1fae221145f64fa43cf22e7`, report `ad45dd0b7545b5f19693a933a33d305e1a756701`.
- Backend inspected read-only at `b281e03a47d202fd8b5c3d895075aa358062c5fa`.
- Validation date: 2026-10-23. Node 24.19.0; pnpm 11.25.0.

Application-side native FCM registration, token rotation, account isolation, revocation and refresh-only reception are implemented and tested against mocked native boundaries. **No real device token or FCM delivery was established in this run.** Both Firebase app configuration files are absent, so live registration remains gated. Native Android/iOS compilation and deployed-backend delivery acceptance remain unverified.

No push, merge, backend modification, cloud project/application creation, credentials provisioning, deployment or EAS submission occurred. The deferred reliability findings and previously overruled backend proposals were not taken into this increment.

## Selected library and compatibility evidence

| Component                          | Added version                  | Evidence and limits                                                                                                             |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `@react-native-firebase/app`       | exact `26.4.0`                 | Installed manifest declares Expo `>=47`, React Native `>=0.60.0-0`; ships TurboModule/codegen sources for the New Architecture. |
| `@react-native-firebase/messaging` | exact `26.4.0`                 | Requires the aligned App version and Expo `>=47`; installed modular API declarations type-check with this app.                  |
| `expo-build-properties`            | `~57.0.22`, resolved `57.0.22` | Selected by existing Expo tooling; sets iOS dynamic frameworks for RNFB's default SPM integration.                              |

Expo remains `57.0.31`, React Native `0.86.3`, React `19.2.3`. No architecture, Kotlin, SDK-major or native-library patch was applied. RNFB 26.4.0's installed native metadata pins Android Firebase BoM `34.18.0` and Apple Firebase `12.18.0`; its Android minimum SDK is 23, below React Native's installed minimum 24. Its manifest declares Apple iOS target 15. These are source/metadata checks, not a native compile result.

RNFB 27.0.0 was also investigated. Its documented supported setup requires Kotlin at least 2.4.0, Android BoM 35 and Apple Firebase 13/SPM-only. This checkout's React Native catalog uses Kotlin 2.1.20. The aligned 26.4.0 release was selected to avoid introducing that toolchain migration. Its npm release date, 2026-09-05, was verified before installation; no release-age exception was used.

Primary references: [v26 modular API migration](https://rnfirebase.io/migrating-to-v26), [v26.4.0 App manifest](https://github.com/invertase/react-native-firebase/blob/v26.4.0/packages/app/package.json), [v26.4.0 Messaging manifest](https://github.com/invertase/react-native-firebase/blob/v26.4.0/packages/messaging/package.json), [v27 native requirements](https://rnfirebase.io/migrating-to-v27), [Messaging state handlers](https://rnfirebase.io/messaging/usage). Installed package source and declarations were also inspected. No upstream claim of a completed Expo 57/RN 0.86.3 native build is made here.

### Dependency security

Installation used the existing Expo/pnpm tooling with strict release-age enforcement:

`pnpm --filter @tirodhan/rider-mobile exec expo install @react-native-firebase/app@26.4.0 @react-native-firebase/messaging@26.4.0 expo-build-properties --pnpm`

The first install resolved/downloaded dependencies but correctly failed on unapproved transitive postinstall scripts. Their installed sources were inspected: `@firebase/util@1.15.2` can fetch/write Firebase JS App Hosting configuration from an environment variable; `protobufjs@7.6.6` performs a dependency-version warning check. Neither is needed for native messaging. Both are explicitly **denied** with `allowBuilds: false` in `pnpm-workspace.yaml`; the existing `unrs-resolver: true` remains intact. Frozen installation then passed supply-chain validation. No script was globally enabled, no `ignore-scripts` bypass was used, and no node_modules source was edited.

The lockfile contains the Firebase SDK transitives selected by these packages; Customer direct dependencies and existing Expo/RN versions did not change. `pnpm peers check` still reports the existing ESLint 10 versus plugin peer-range warnings (`eslint-plugin-import`, `eslint-plugin-react`); actual ESLint passes with the unchanged validation configuration.

## Backend contract mapping

Inspected `api/routes/rider.py`, `modules/dispatch/devices.py`, `push.py`, `models.py`, dispatch worker/outbox delivery code, `tests/unit/test_dispatch_push.py`, Rider device API tests and registration/delivery integration tests. Backend tests were read, not executed or changed.

| Contract                                              | Frontend behavior                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/v1/rider/me/push-devices`                      | Exact body `{client_device_id,platform:ANDROID                                                                                                                                                                                                      | IOS,registration_token}`. The token comes only from RNFB modular `getToken(messaging)` on either platform. No Expo token, APNs token, Firebase Installation ID, actor ID or new idempotency header is substituted. |
| Registration response                                 | Validate `push_registration_id`, echoed installation ID, platform and provider `FCM`; discard the receipt after confirming the registration. Never expose raw response/error bodies.                                                                |
| DELETE `/v1/rider/me/push-devices/{client_device_id}` | Bodyless, URL-encoded stable installation ID. Natural actor/device revocation; 204 is handled by the existing transport.                                                                                                                            |
| Device ownership                                      | Backend uniqueness/update is scoped to `(rider_id, client_device_id)` for active rows. Registering as a new rider does not revoke the prior rider's row. The client therefore invalidates the old native token before a new owner can register.     |
| `ASSIGNMENT_OFFER`                                    | Existing decoder requires `collection_group_id` plus positive integer string `offer_round`; refresh current owned offers, assignment, availability and route. Do not accept, fetch arbitrary payload resources or trust the round as current state. |
| `ROUTE_REVISION`                                      | Existing decoder requires `revision_id`; refresh current owned route, assignment and other operational reads. Never apply the pushed revision or ordering to the cache.                                                                             |
| Delivery worker                                       | Backend sends generic notification title/body plus the verified data payload. It owns outbox/delivery attempts. Permanent invalid-token results revoke the matching registration; the frontend creates no broker/worker model.                      |

No planner, regional planner, OSM or VROOM call was added. Existing authenticated Rider transport and principal admission are reused; SessionStore and identity-token storage were not changed.

## Registration, permissions and account lifecycle

1. Native loading requires LIVE mode, Android/iOS, a configured platform and a non-Expo-Go environment. A synchronous lazy loader prevents JavaScript Firebase import/initialization from SCREEN_PREVIEW, web, Expo Go and unconfigured builds. Native autolinking also excludes App/Messaging from unconfigured/preview platforms. Bootstrap can safely tolerate an older binary without the native module.
2. Firebase token auto-init and automatic iOS APNs registration default to **false** in the Rider-owned `firebase.json`. Only an authenticated principal with a matching user ID and verified RIDER role can proceed to permission/token registration. CUSTOMER/MANAGER-only admission cannot acquire/register a token.
3. On admitted startup and foreground return, inspect existing notification permission without prompting. The Home notification control explicitly requests permission or retries reconciliation. Android 13+ uses POST_NOTIFICATIONS; earlier Android uses the SDK's notification-permission check. iOS requests alert/badge/sound and accepts authorized/provisional status. Denial leaves operational features usable.
4. A UUID installation ID is generated once and retained under `tirodhan.rider.push-installation.v1` in device-bound, when-unlocked SecureStore. The small record contains only version, installation ID, owner and a pending-reset flag. It survives logout and normal launches. No app-managed FCM token, JWT, notification payload or location is persisted there; malformed state fails closed.
5. Bind the owner durably **before native token creation**, then acquire FCM through the native SDK and register using the existing API. The token remains in controller memory; the SDK manages its own native registration state. Duplicate events for the same token/session do not cause duplicate POSTs. Rotation reacquires the current token and updates the same installation. Startup/foreground reconciliation deliberately re-registers even if unchanged.
6. Transient native/storage/API failure becomes a sanitized retry state. The next foreground return, rotation event or explicit retry reconciles the same installation. No continuous polling, durable payload queue or independent offline synchronization service was added.
7. Logout stops listeners immediately, serializes against any outstanding token acquisition/POST, records a reset obligation and tries backend DELETE while the old Rider credential is usable. It disables native auto-init and deletes the FCM token. The UI waits at most 15 seconds before continuing local sign-out; an unresolved SDK operation stays serialized and blocks subsequent push registration, not unrelated Rider features.
8. If DELETE is offline/unavailable, native token invalidation prevents token reuse by another account. If native deletion also fails, the private reset obligation survives restart. A new owner is **not registered** until invalidation succeeds. The same check handles direct account switches, cold startup under a different owner and ambiguous old registration responses. Old-owner backend DELETE is never attempted through the new owner's credentials.

The backend row can remain active after offline logout; its old token must be invalidated before a new account can register. The backend worker can then revoke it on permanent delivery failure. Already delivered OS notifications cannot be recalled; their data is only a hint, and opening them reads the currently authorized rider's state. A permission withdrawal or definite role loss likewise triggers native invalidation. Temporary principal rechecking disposes listeners and waits for verified admission.

## Reception and synchronization

`index.js` installs the background handler before requiring Expo Router. The existing verified `riderSignal` decoder is preserved; only its old hardcoded “not implemented” registration-status export was replaced by live status UI.

| Native state                    | Implemented handling                                                                                                                                                                                                              | Acceptance status                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Foreground                      | `onMessage` sends data to a scoped decoder/coalescer; refreshes current owned reads. No automatic operational mutation or route navigation.                                                                                       | Mocked SDK tests pass; real delivery not tested.                                     |
| Background                      | `setBackgroundMessageHandler` recognizes hints without starting a session, requesting permission/token, accessing credentials, persisting payloads or calling authenticated APIs. SDK/OS handles the generic remote notification. | Handler behavior unit-tested; actual OS wake/display behavior unverified.            |
| Notification tap                | `onNotificationOpenedApp` refreshes current owned state. Payload IDs are never used as authorization or direct resource destinations.                                                                                             | Mocked tests include changed assignment and stale callbacks.                         |
| Terminated launch/tap           | `getInitialNotification` feeds the same guarded hint path after admission. Android headless delivery uses the early handler; iOS background launches do not bootstrap authentication until the app is active.                     | JavaScript boundaries tested; actual headless/terminated device behavior unverified. |
| Foreground return / missed push | Recheck the existing session/principal, fetch all operational resources and reconcile device registration, regardless of whether any hint was retained.                                                                           | Tested with missed/background hints and permission denial.                           |

Known hint fingerprints are bounded to 128 per listener scope. Duplicates coalesce; a different hint arriving during a refresh schedules a subsequent fresh read. Out-of-order revisions do not replace current backend state. Owner/session guards prevent stale callbacks and late responses from publishing another rider's data. Reattachment/foreground can cause additional idempotent reads; no timers poll work state. Existing explicit Refresh controls and authoritative offer expiry/task checks remain intact. Execution/evidence command payloads and journals were not modified.

## Missing configuration and native prerequisites

The repository was checked including ignored application configuration filenames (excluding dependency/generated directories). Neither Rider file is present:

- `apps/rider-mobile/google-services.json` for the existing approved Firebase Android app with package `com.tirodhan.rider`.
- `apps/rider-mobile/GoogleService-Info.plist` for the existing approved Firebase iOS app with bundle identifier `com.tirodhan.rider`.

These files are already Git-ignored. Obtain the actual application config from the existing authorized Firebase project; **do not** put Firebase Admin/service-account JSON or a private APNs key into the app repository. No project/app IDs or credentials were fabricated, and no new Firebase app/project was registered.

Build configuration derives per-platform availability from the real files, disables it for SCREEN_PREVIEW builds and exposes only booleans in Expo extras. The wrapper applies the public Firebase plugins only to configured platforms while preserving other platform mods. A missing iOS config therefore does not apply an incomplete Firebase AppDelegate setup to an Android-only configuration. Configured iOS uses dynamic frameworks for RNFB's default SPM path. Configured iOS adds remote-notification background mode and the APNs entitlement; `RIDER_APNS_ENVIRONMENT` defaults to `development` and must match approved signing (`production` requires the corresponding approved distribution setup).

Native prerequisites still require verification: installed Android SDK/JDK/toolchain and Google Play services; macOS/Xcode compatible with the selected Firebase Apple SDK, SPM dependency resolution and approved Apple provisioning; Push Notifications capability, appropriate APNs environment and approved APNs key/certificate configuration in the existing Firebase project. Build a new Rider development binary after configuration. An old binary/Expo Go cannot supply the RNFB modules. No EAS build is authorized or submitted by this increment.

Native isolation also accounts for the installed iOS `RNFBMessaging+NSNotificationCenter.m:74` class-load observer and `RNFBMessaging+FIRMessagingDelegate.m:42` messaging singleton access. `react-native.config.js` excludes both Firebase native libraries for missing-configuration/preview platforms. Actual Android autolinking output confirms their absence in this unconfigured checkout; conditional configuration behavior is unit-tested. A preview build or Expo Go provides native-free fixtures. Switching JavaScript mode cannot remove a Firebase SDK already linked/configured in an existing LIVE binary.

## Validation results

| Check                                             | Actual result                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen pnpm install, strict release-age policies  | PASS; supply-chain policies verified; reviewed transitive postinstall scripts denied explicitly.                                      |
| Rider TypeScript                                  | PASS.                                                                                                                                 |
| Rider ESLint with `--max-warnings 0`              | PASS, no warnings.                                                                                                                    |
| Prettier Rider/lockfile/workspace/report          | PASS.                                                                                                                                 |
| Rider Jest                                        | PASS, 206 tests / 15 suites; 164 prior tests retained, 42 new tests; no skips.                                                        |
| Expo Doctor                                       | PASS, 21/21 on the final configuration. An initial config-schema TLS failure cleared on one unchanged retry; no checks were disabled. |
| Android/iOS/web LIVE JavaScript exports           | PASS; Android 3.3 MB / iOS 3.0 MB Hermes bundles, web bundles/index under ignored `.local/rm-p0-04-export`.                           |
| Targeted Customer TypeScript                      | PASS through the existing command and a separate fresh `tsc --noEmit` (exit 0).                                                       |
| Customer Jest regression                          | PASS, 98 tests / 14 suites.                                                                                                           |
| Rider native Android/iOS compilation              | NOT RUN; export/type-check success does not establish compilation.                                                                    |
| Real device token acquisition / real FCM delivery | NOT RUN; configuration absent. Mock token strings are confined to tests.                                                              |
| Deployed backend / physical device acceptance     | NOT RUN.                                                                                                                              |

New tests cover actual Rider gating, granted/denied/undetermined permissions, FCM versus APNs API selection, stable installation, token rotation/duplicates, registration conflicts/errors, storage failure, logout/offline invalidation, account switches during SDK and HTTP calls, stale callbacks, permission withdrawal, unknown/duplicate/out-of-order payloads, cold notification taps, foreground recovery, expired offers, authoritative route reads, partial listener cleanup, private-state corruption, exact backend DTOs, platform config mods, early background handling and native isolation in preview/web/Expo Go.

Detailed local logs are ignored under `.local/rm-p0-04-*`. Existing ESLint peer metadata warnings were inspected without weakening lint or CI. No production acceptance is claimed from unit tests or exports.

## Remaining acceptance work

With separately approved real application configuration and a new native binary, verify Android and iOS permissions, foreground/background/terminated reception, notification taps after reassignment, expired offers and reordered messages; inspect the backend registration for the real FCM token without logging it. Exercise rotation, revoked/expired sessions, offline logout and cross-account invalidation on a real device. Verify SDK deletion semantics, APNs environment, OS notification display/delivery restrictions, headless startup and network restoration. Confirm delivery worker behavior against the deployed existing FCM project. These are native/device/deployed-service checks, not further frontend API invention.

## Changed files

- `apps/rider-mobile/package.json`, `pnpm-lock.yaml`: aligned native Firebase/build-properties dependencies and custom entrypoint.
- `pnpm-workspace.yaml`: explicit denial of the two reviewed transitive install scripts.
- `apps/rider-mobile/index.js`: background registration before Router.
- `apps/rider-mobile/react-native.config.js`: exclude Firebase native autolinking for unconfigured/preview platforms.
- `apps/rider-mobile/firebase.json`: native messaging auto-init/auto-APNs registration disabled; Android delegation disabled.
- `apps/rider-mobile/app.config.ts`: file-derived platform flags, Firebase/build-properties plugins, notification permission and conditional iOS capability metadata.
- `apps/rider-mobile/plugins/firebase-config.js`: configuration presence detection without fabricated IDs.
- `apps/rider-mobile/plugins/with-rider-firebase.js`: per-platform Firebase plugin application.
- `apps/rider-mobile/src/api/push-client.ts`: exact register/revoke API adapter.
- `apps/rider-mobile/src/notifications/contracts.ts`: narrow native/API/private-state ports.
- `apps/rider-mobile/src/notifications/installation.ts`: stable private installation identity/reset obligation.
- `apps/rider-mobile/src/notifications/lifecycle.ts`: registration, rotation, retry, serialized ownership and revocation.
- `apps/rider-mobile/src/notifications/native.ts`, `native-sdk.js`: lazy modular native SDK boundary and permission handling.
- `apps/rider-mobile/src/notifications/bootstrap.ts`: early background hint handler.
- `apps/rider-mobile/src/notifications/synchronization.ts`: bounded duplicate handling and fresh-read coalescing.
- `apps/rider-mobile/src/notifications/signals.ts`: preserve decoder, remove obsolete hardcoded unavailable status.
- `apps/rider-mobile/src/notifications/NotificationCard.tsx`: permission/retry/status UI without token exposure.
- `apps/rider-mobile/src/runtime.ts`: existing-session composition, foreground synchronization and best-effort pre-signout revocation.
- `apps/rider-mobile/app/_layout.tsx`: active-only auth bootstrap and lifecycle wiring for background safety.
- `apps/rider-mobile/src/features/Home.tsx`, `Account.tsx`: notification control and accurate sign-out timing text.
- `apps/rider-mobile/src/test/push.test.ts`: coordinator/API/privacy/synchronization/race tests.
- `apps/rider-mobile/src/test/push-native.test.ts`: mocked native token/permission/reception/isolation tests.
- `apps/rider-mobile/src/test/push-config.test.ts`: selective native configuration tests.
- `apps/rider-mobile/src/test/contracts.test.ts`: preserve signal assertions after replacing the obsolete status constant.
- `apps/rider-mobile/src/test/execution-runtime.test.ts`: assert live principal admission remains healthy.
- `apps/rider-mobile/src/test/screens.test.tsx`: notification status port in the existing screen fixture.
- `apps/rider-mobile/README.md`: configuration and native-delivery prerequisites.
- `docs/RIDER_NATIVE_NOTIFICATIONS_REPORT.md`: this report.
