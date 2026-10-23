# CM-P0-05: Payment implementation and native validation

Updated 2026-10-23 (Asia/Calcutta). Branch: `codex/customer-native-razorpay`.
The original assessment commit `640afe4eb31881cf3ea6040156ba9f0c7443f4e1` remains
in this branch's ancestry, along with dependency correction `e32a074` and the
projected-slot, weight/volume, quotation and booking-recovery implementation.

## Current delivery status

The frontend DTOs, payment coordinator, secure preparation recovery, native
adapter boundary, and FinancialSection integration are implemented and tested
with mocked native/backend ports. This is implementation work, not just the
prior compatibility assessment.

**The official SDK is not installed or connected yet.**
`lib/repositories.ts` still supplies `nativeCheckout = null` until the inherited
pnpm release-age restriction expires. Consequently the current application
cannot launch real Razorpay checkout. Native compilation and real device/bank
application testing have not passed and are not implied by JavaScript tests or
Hermes exports. The complete native checkout acceptance target remains pending.

There was no push, merge, deployment, backend change, production credential
creation, or paid build request. Following explicit human approval, the free EAS
project was created and linked as described below. Dependency/security policies
and Expo/RN versions have not been changed.

## Implemented frontend behavior

- `customer-contracts.ts` and `contracts.ts` include the backend payment action,
  reason, verification flag and readiness timestamp fields. `payment-contracts.ts`
  validates runtime responses, preserves only known financial DTO fields, and
  treats unknown actions/reasons as unavailable. Verified SUCCEEDED needs its
  backend timestamp. The SDK cannot set any financial status.
- `customer-client.ts` validates owned detail/payment projections and checkout
  handoffs. `client.ts` accepts an explicitly retained preparation key; transport
  preserves it through request reconstruction and token-refresh replay. No body,
  gateway verification endpoint, client quotation, or provider signature POST
  has been invented.
- A request/owner-generation scoped coordinator serializes Pay taps and refreshes.
  START/RESUME preparation responses require the original verified Order and a
  fresh checkout GET. WAIT never opens the SDK, but a new explicit customer
  inquiry may prepare again with the retained key. UNAVAILABLE does not open
  checkout. Automatic verification performs GETs only.
- The coordinator checks request, payment and attempt identities, frozen money,
  INR currency, provider, public key format, merchant display name, original Order,
  booking expiry and checkout readiness. It checks ownership/foreground/expiry
  again immediately before native opening, including after lazy SDK loading.
  Actual merchant-account binding remains enforced by the owned backend handoff;
  its private account fingerprint is neither invented nor stored by the client.
- A preparation key is durable before HTTP submission. Native recovery uses the
  existing chunked SecureStore mechanism with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
  Records contain owner, request ID, key, attempt ID and original Order ID; they
  do not contain checkout permission, provider errors, credentials, signatures,
  addresses or instruments. Ambiguous responses and restart reuse the same key.
  Involuntary auth loss retains it; explicit logout/account switch clears it.
- Failed instruments and SDK dismissal never allocate another Order. The only
  new-key exception is positive backend proof of a rejected, never-exposed first
  creation: RAZORPAY_ORDER_REJECTED + FAILED + no Order + START/NEW_PAYMENT.
  That proof permits a fresh command only on the next explicit customer tap.
  It is not inferred from a timeout, SDK error, callback absence or an empty GET.
- SDK success, error and dismissal are equivalent reconciliation signals. Raw
  provider results are discarded. Both payment projection and owned detail are
  refreshed after return, timeout, preparation/handoff failure, focus and resume.
  A timeout leaves payment uncertain and keeps another native opening blocked
  while the old native screen might still own SDK listeners.
- Verification uses bounded exponential backoff with jitter: 2, 4, 8 and then
  15-second base delays, +/-20%, inside a default 180000 ms window. The public
  `EXPO_PUBLIC_PAYMENT_VERIFICATION_WINDOW_MS` setting accepts 1000..180000 ms.
  The budget uses a monotonic clock, so wall-clock adjustments cannot extend it.
  Blur/background aborts current verification and stops timers. Return makes one
  refresh and uses the remaining budget; it does not restart automatic checkout.
  Manual refresh can start another finite verification window. No background
  verification job or indefinite payment interval was added.
- FinancialSection supplies processing, awaiting-confirmation, received,
  unavailable and backend-permitted retry states inside the existing detail
  screen. Owner-generation guards protect asynchronous cache publication and
  invalidation. Cancellation/refunds remain independent; uncertain cancellation
  copy explains that an existing Order may still be paid. Late capture cannot
  restore a cancelled booking in the client.
- SCREEN_PREVIEW, Expo Go and web cannot use an injected native checkout port.
  Their payment coordinator has no secure recovery port, including on successful
  fixture/status reads. Tests verify zero native calls/preparation/storage access
  in these modes. The new `razorpayAdapter.ts` boundary also checks its supplied
  runtime guard before loading, rechecks after loading, enforces process-wide
  SDK listener ownership, and forwards only backend checkout fields.

## Authoritative backend reference

Backend main inspected at `b281e03a47d202fd8b5c3d895075aa358062c5fa`:

- [Preparation contract](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/docs/PAYMENT_PREPARATION_API.md)
- `src/tirodhan/api/routes/payments.py`
- `src/tirodhan/api/routes/checkout.py`
- `src/tirodhan/modules/payments/preparation.py`
- Customer financial schemas, projections and finance repository.

The three financial routes used are the existing preparation POST, owned
attempt checkout GET, and owned booking payment GET. Booking detail is refreshed
separately. Backend configuration must include matching merchant account/key,
readiness lifetime, provider verification, webhook processing and reconciliation.
The existing `principal`, `collections`, `payment` and `checkout` capabilities and
HTTPS backend URL must be configured for integrated nonproduction acceptance.
Only the backend checkout GET supplies the public Razorpay key.

## SDK installation and minimal patch follow-up

The selected official package is `react-native-razorpay@3.0.0`, published
2026-04-21T06:52:03.293Z. npm gitHead and tag v3.0.0 both resolve to
`48f9e09eff8390d5e5523fb175a72fac68dc97ee`. It declares codegen and New Architecture
support; that is not a successful build on this exact stack.

Strict installation and lockfile-only attempts in the original assessment both
failed on inherited `expo-notifications@57.0.24`, published
2026-10-22T13:31:41.874Z. Its one-day cutoff expires on **October 23 at
19:01:41.874 IST**. No age exclusion, alternate package manager or manually
assembled lockfile was used. Expo remains 57.0.31; React Native remains 0.86.3;
pnpm remains 11.25.0. Dependency manifests/lockfile are unchanged in this frontend
phase.

After that cutoff, verify time and install with the same policy enforced:

```powershell
pnpm --filter @tirodhan/customer-mobile add react-native-razorpay@3.0.0 --config.minimum-release-age-strict=true
pnpm install --frozen-lockfile --config.minimum-release-age-strict=true
```

Then connect the official SDK through a lazy native loader and the implemented
adapter, preserving module availability/mode/capability guards before preparation.
Web must use a loader stub; Expo Go/SCREEN_PREVIEW must never evaluate the native
SDK module. Rerun runtime isolation tests with the installed SDK as well.

The release's [Android Gradle file](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/android/build.gradle)
has no namespace, while its manifest declares `package="com.razorpay.rn"`.
RN 0.86.3 selects AGP 8.12.0; [AGP 8 requires a module namespace](https://developer.android.com/build/releases/agp-8-0-0-release-notes#namespace-dsl).
This remains a source-level compatibility concern, **not an observed compiler
failure**. Confirm the installed release still has that gap, and if required use
`pnpm patch react-native-razorpay@3.0.0 --edit-dir .local/razorpay-3.0.0-patch`,
change only the editable copy, and record it with `pnpm patch-commit`. Limit the first patch to
the documented namespace/manifest migration; add further compatibility changes
only when supported by actual compilation errors. Compile the patched SDK and retain the actual build log. Do not edit node_modules or
change Expo/RN/architecture merely to fit the SDK.

## Android development build investigation

EAS CLI 25.3.0 authenticated to the existing `tirodhan` account. Read-only
`account:usage tirodhan --non-interactive --json` showed the Free plan, 0/15 Android
builds used and 0/30 total builds used for the current period. Recheck those limits
before every future build; do not incur paid overages or upgrade a plan.

An isolated, ignored pnpm CLI tool installation was used after pnpm dlx hit a
module-resolution error. Its optional dtrace-provider/protobufjs install scripts
remain blocked. Application dependencies and policies were not modified for the
CLI. No account credentials or billing details are committed.

`eas.json` now adds `checkout-development`, extending the existing development
profile. Existing development/preview/production profiles are preserved. Official
EAS schema validation confirmed internal development-client, Node 24.19.0, pnpm
11.25.0, NONPROD mode, medium Android worker, `:app:assembleDebug` and
`withoutCredentials: true`. This uses debug signing, not production credentials.
See [EAS configuration](https://docs.expo.dev/eas/json/) and
[Android development APKs](https://docs.expo.dev/build-reference/apk/).

The actual read-only `eas project:info` result was:

```text
EAS project not configured. This command cannot configure it in non-interactive mode.
```

Automatic approval review initially rejected `eas init --account tirodhan`
because investigation alone did not authorize cloud project creation/linkage.
The human subsequently explicitly approved the free project, owner/project ID
configuration, source upload and free Android development builds. That approval
resolved the earlier restriction; no workaround was used.

The approved command created
[@tirodhan/tirodhan-customer](https://expo.dev/accounts/tirodhan/projects/tirodhan-customer),
then exited with `Cannot automatically write to dynamic config at: app.config.ts`.
The returned project ID `265eed10-2b38-4186-a150-10831653ab7e` and owner `tirodhan`
were added explicitly to `app.config.ts`. A subsequent `eas project:info --json`
resolved that exact full name and ID successfully. Free quota was rechecked:
0/15 Android and 0/30 total builds used. No build source has been uploaded, native
build started or production credential created yet.

The linked configuration passed TypeScript, targeted ESLint, formatting and Expo
Doctor 21/21. Doctor's first remote schema request failed with a TLS connection
interruption; its retry passed without exclusions or configuration changes.

Once SDK installation and the native adapter binding are complete:

```powershell
# Run from apps/customer-mobile with the existing authenticated EAS CLI.
# Confirm the Free account/remaining Android allowance again first.
eas build --platform android --profile checkout-development --non-interactive
```

Do not use auto-submit, production profiles or production signing credentials.
Capture the actual Gradle log and SDK error, apply the smallest reproducible patch
if needed, and rebuild. An EAS build is source upload/compilation, not deployment.
A local alternative needs JDK 17 and the Expo/RN-selected Android SDK/NDK; this
host currently has no configured native toolchain. iOS native compilation needs
macOS/Xcode/CocoaPods. JS/Hermes export is not either native compilation.

For device acceptance, install the development APK, start the existing Metro
`start` script with NONPROD/backend capabilities configured, and use an owned
eligible test booking backed by server-side test merchant configuration. Test
SDK opening, callback delay, bank-app return, dismissal, instrument failure,
restart and account isolation. Expo Go cannot validate this native SDK. No real
merchant or device acceptance has been performed here.

## Validation results for the frontend phase

| Validation                                            | Result                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| TypeScript                                            | Passed                                                           |
| ESLint                                                | Passed, zero warnings                                            |
| Formatting                                            | Passed with Windows line-ending adaptation                       |
| Jest                                                  | 279 tests, 23 suites passed; no skips or force-exit              |
| Expo Doctor                                           | 21/21 passed on retry; first remote schema check had TLS failure |
| Android/iOS Hermes and web exports                    | Passed: Android/iOS Hermes and web bundles                       |
| EAS build-profile schema                              | Passed using official EAS JSON schema                            |
| Official Razorpay SDK installation                    | Deferred until inherited release-age cutoff                      |
| Android native compilation                            | Not run; SDK installation/binding pending; EAS project linked    |
| iOS native compilation                                | Not run; no macOS toolchain                                      |
| Real device / bank application / live backend payment | Not tested                                                       |

VirtualizedList act warnings were observed during the full suite; the run exited normally. Local checks use pnpm-generated launchers directly because pnpm run currently
tries the inherited age-blocked reinstall. Jest uses an ignored local transform
cache. Exports use ignored local output/temp directories. No force-exit, test
skips, Expo Doctor exclusions, CI weakening or dependency-policy bypass was used.
The report in commit 640afe4 records the initial assessment; this document now
records implemented frontend work and explicitly outstanding native validation.

## Changed files

- apps/customer-mobile/docs/NATIVE_RAZORPAY_CHECKOUT_REPORT.md
- apps/customer-mobile/app.config.ts
- apps/customer-mobile/eas.json
- apps/customer-mobile/src/api/client.ts
- apps/customer-mobile/src/api/contracts.ts
- apps/customer-mobile/src/api/customer-client.ts
- apps/customer-mobile/src/api/customer-contracts.ts
- apps/customer-mobile/src/api/payment-contracts.ts
- apps/customer-mobile/src/api/transport.ts
- apps/customer-mobile/src/features/collection/CollectionDetailScreen.tsx
- apps/customer-mobile/src/features/collection/developmentRepositories.ts
- apps/customer-mobile/src/features/collection/FinancialSection.tsx
- apps/customer-mobile/src/features/collection/paymentFlow.ts
- apps/customer-mobile/src/features/collection/paymentRecovery.ts
- apps/customer-mobile/src/features/collection/razorpayAdapter.ts
- apps/customer-mobile/src/features/collection/repository.ts
- apps/customer-mobile/src/lib/runtime.ts
- apps/customer-mobile/src/session/paymentRecovery.ts
- apps/customer-mobile/src/test/contracts.test.ts
- apps/customer-mobile/src/test/financial-section.test.tsx
- apps/customer-mobile/src/test/payment-flow.test.ts
- apps/customer-mobile/src/test/payment-recovery.test.ts
- apps/customer-mobile/src/test/product-screens.test.tsx
- apps/customer-mobile/src/test/razorpay-adapter.test.ts
- apps/customer-mobile/src/test/setup.ts
- apps/customer-mobile/src/test/transport-completion.test.ts
