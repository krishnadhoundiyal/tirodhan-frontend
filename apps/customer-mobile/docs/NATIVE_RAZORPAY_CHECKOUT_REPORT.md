# CM-P0-05: Native Razorpay checkout compatibility assessment

Assessment date: 2026-10-23 (Asia/Calcutta).

## Delivery status

**Blocked before SDK integration. The checkout acceptance target is not met.**
This increment records the exact blockers under the brief's instruction to
document SDK incompatibility rather than fabricate a working checkout. No native
checkout, revised payment coordinator, new financial UI, or new recovery behavior
has been implemented. The existing `nativeCheckout` remains `null` and cannot
launch a provider. Existing payment-flow tests are baseline regression checks,
not acceptance evidence for CM-P0-05.

The implementation branch is `codex/customer-native-razorpay`, created from
`codex/customer-weight-volume-booking` at
`e32a074038b883ff6aef6dd30ca2304237a7bcfd`. The workspace and working tree were
verified before branching. Frontend main was not used. Projected slots,
weight/volume declarations, dynamic quotations, booking recovery, SCREEN_PREVIEW,
and the Expo SDK 57 dependency correction are unchanged. Backend access was
read-only. No push, PR creation, merge, or deployment is part of this delivery.

## Dependency policy blocks installation

The published official `react-native-razorpay` version is `3.0.0`, published
2026-04-21T06:52:03.293Z. Its npm `gitHead` and Git tag `v3.0.0` both resolve to
`48f9e09eff8390d5e5523fb175a72fac68dc97ee`. The candidate itself is older than
pnpm's minimum release age.

Both commands below were attempted with the existing pnpm 11.25.0 and strict
release-age enforcement:

```powershell
pnpm --filter @tirodhan/customer-mobile add react-native-razorpay@3.0.0 --config.minimum-release-age-strict=true
pnpm --filter @tirodhan/customer-mobile add react-native-razorpay@3.0.0 --lockfile-only --config.minimum-release-age-strict=true
```

Both exited 1 with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` for the inherited
`expo-notifications@57.0.24` lockfile entry, published
2026-10-22T13:31:41.874Z. Its one-day cutoff expires at
**2026-10-23T13:31:41.874Z (19:01:41.874 IST)**. Expiry is a prerequisite for
retrying installation, not a promise that native builds will then pass.

Neither attempt changed package.json, pnpm-lock.yaml, or pnpm-workspace.yaml.
No exclusion, relaxed policy, alternate package manager, manually assembled
lockfile, or package installation outside the workspace was used to evade this
failure. Expo remains 57.0.31 and React Native remains 0.86.3.

## Native compatibility finding

The official release provides codegen and New Architecture sources. Its
`package.json` declares React Native `>=0.66.0`; its JavaScript loader checks
bridgeless/TurboModule indicators. These are source-level compatibility evidence,
not proof of compatibility with this application's exact native toolchain.

The released Android `android/build.gradle` contains no `namespace` declaration;
the Android manifest instead declares `package="com.razorpay.rn"`. The installed
React Native 0.86.3 Gradle version catalogue specifies Android Gradle Plugin
8.12.0. Android's AGP 8 migration documentation requires a namespace in the
module build script rather than the manifest. Consequently the unmodified SDK
has an Android configuration incompatibility to resolve and compile-test before
claiming native support. A namespace-only fix would still need verification of
codegen, compilation, event delivery, and actual checkout lifecycle behavior.
No build failure is claimed as observed: compilation could not be run here.

References audited at the published release revision:

- [Razorpay package and codegen configuration](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/package.json)
- [Android Gradle configuration](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/android/build.gradle)
- [Android manifest](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/android/src/main/AndroidManifest.xml)
- [Native JavaScript loader](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/RazorpayCheckout.js)
- [iOS podspec](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/react-native-razorpay.podspec)
- [Official Expo prebuild instructions](https://github.com/razorpay/react-native-razorpay/blob/48f9e09eff8390d5e5523fb175a72fac68dc97ee/README.md)
- [Android: AGP 8 namespace requirement](https://developer.android.com/build/releases/agp-8-0-0-release-notes#namespace-dsl)

## Authoritative backend contract reviewed

Backend main resolved to `b281e03a47d202fd8b5c3d895075aa358062c5fa`.
The assessment read `docs/PAYMENT_PREPARATION_API.md`, the payment and checkout
routes, customer financial schemas/projections, and payment action derivation.

- POST `/v1/payments/collection-requests/{request_id}/attempts` requires the
  retained Idempotency-Key. Responses include `action`, `action_reason`, and
  nullable `checkout_ready_until`. Exact commands retain attempt identity;
  eligible fresh commands converge on the original exposed Order.
- START and RESUME permit a fresh checkout GET after preparation. WAIT never
  permits checkout, but allows another explicit, serialized preparation inquiry
  with the retained key. UNAVAILABLE never permits checkout. Unknown actions or
  reasons must fail closed.
- GET `/v1/customer/payment-attempts/{attempt_id}/checkout` is the sole handoff
  source. Validate request/attempt/provider/Order identities, public key, merchant
  display name, positive safe-integer INR amount, booking expiry, and the separate
  readiness deadline immediately before native launch. Do not manufacture or
  persist reusable checkout authorization from a previous GET.
- Payment GET and embedded detail now include `action`, `action_reason`,
  `verification_pending`, and `checkout_ready_until`, in addition to
  `retry_allowed`. The frontend DTOs/coordinator still need updating to these
  fields when implementation resumes; the existing stub is not sufficient.
- After any provider callback, timeout, dismissal, foreground return, focus,
  or restart, refresh both owned booking detail and payment projection. Only
  backend SUCCEEDED is payment success. Automatic verification needs a bounded,
  jittered foreground window, one refresh flight, and manual refresh after the
  window. No automatic SDK reopening or new Order on ambiguous results.
- Retained preparation commands need owner-scoped secure restart storage;
  in-flight work and cache publication must be invalidated on account change or
  logout. Cancellation and refunds remain independent, including late capture
  after cancellation. No provider error payloads should be logged.

[Authoritative backend preparation contract](https://github.com/krishnadhoundiyal/tirodhan/blob/b281e03a47d202fd8b5c3d895075aa358062c5fa/docs/PAYMENT_PREPARATION_API.md).

## Development-build requirements and remaining work

1. After the release-age cutoff, retry strict pnpm installation without changing
   SDK 57/RN 0.86 or adding policy exclusions. Regenerate and verify the lockfile.
2. Resolve the released Android namespace issue through a reviewed upstream fix
   or a reproducible package patch, then test it with this exact native stack.
   Review the release's iOS codegen/pod integration as well.
3. Complete DTO parsing, retained command storage, serialized coordinator,
   foreground verification, lazy official SDK adapter, and FinancialSection UX.
   Test all four actions, same-Order retries, callbacks, ambiguous responses,
   restart, duplicate taps, cancellation, and account isolation with mocks.
4. Use Node >=22.13.0 (the existing validation runtime is Node 24.19.0), pnpm
   11.25.0, and the project's existing Expo development-build approach. On a
   configured Android machine, use JDK 17, Android SDK/NDK versions selected by
   Expo/RN, an emulator or attached device, and then:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm --filter @tirodhan/customer-mobile exec expo prebuild --platform android
   pnpm --filter @tirodhan/customer-mobile android --device
   pnpm --filter @tirodhan/customer-mobile start
   ```

5. For iOS use macOS, supported Xcode, CocoaPods, an iOS simulator/device and
   appropriate signing. Prebuild for iOS and run the existing `ios` script.
   Add the official release's documented UPI query schemes to Expo configuration
   if enabling those instruments; verify return-from-bank behavior on devices.
6. Configure the HTTPS nonproduction backend and existing `principal`,
   `collections`, `payment`, and `checkout` capabilities. Backend merchant keys,
   matching merchant account identity, readiness lifetime (1..60 seconds),
   webhook processing and reconciliation workers must be configured there.
   Public checkout keys come only from the checkout GET. Never put a merchant
   secret in Expo configuration or an EXPO_PUBLIC variable.
7. Keep native loading behind Android/iOS development-build and capability
   guards. SCREEN_PREVIEW, Expo Go and web must never import/invoke the SDK.
   Rebuild the native client after adding the package; Metro reload and Expo Go
   cannot add native modules. Test with backend/provider test-mode configuration
   before any live acceptance.

This Windows host has no discoverable `java`, `adb`, `sdkmanager`, `gradle`, or
`xcodebuild`, no configured JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT, and no Android
SDK or Android Studio at the standard inspected paths. Xcode/iOS compilation
requires macOS. No native compilation, device checkout, bank-app return, or
merchant acceptance has been performed. JS/Hermes exports are not native builds.

## Validation of the preserved baseline

The following checks were rerun on this branch with Node 24.19.0. pnpm's generated
`.cmd` launchers were used directly for local checks because `pnpm run` attempts
an automatic reinstall that encounters the inherited release-age gate. No
repository, CI, validation, or package policy setting was changed.

| Check                                         | Result                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| TypeScript (`tsc --noEmit`)                   | Passed                                                                   |
| ESLint (`eslint . --max-warnings 0`)          | Passed                                                                   |
| Prettier (`--check . --end-of-line auto`)     | Passed; Windows line-ending adaptation                                   |
| Jest (`--runInBand`)                          | 223 tests, 20 suites passed                                              |
| Expo Doctor (`pnpm dlx expo-doctor`)          | 21/21 passed on retry; first run failed the remote schema TLS connection |
| Android/iOS/web exports                       | Passed; Android/iOS Hermes bundles and web assets emitted                |
| SDK installation and lockfile-only resolution | Both blocked by inherited notifications release age                      |
| Native compilation/device checkout            | Not run; toolchain unavailable, SDK compatibility not established        |

These are preserved-baseline regression results. They do not establish CM-P0-05
native acceptance. Jest uses an ignored workspace-local transform cache;
exports use ignored workspace-local output/temp paths. No live backend,
Razorpay merchant, or payment instrument was exercised.
