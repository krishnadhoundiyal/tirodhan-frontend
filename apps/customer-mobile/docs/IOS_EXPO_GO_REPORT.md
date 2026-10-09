# iOS Expo Go investigation and review

This historical report records commit `9585b97f04946b1fea882c89cb841ac30b3cfaa6`.
The old fixture-flag/real-OTP instructions below are superseded by
[TESTING_MODES_REPORT.md](TESTING_MODES_REPORT.md) and the current README.
`EXPO_PUBLIC_PREVIEW_CATALOGUE` is now deprecated and ignored.

Investigation date: 9 October 2026. This is a native React Native preview using
the existing Customer Mobile app, routes, components, styles and assets. Physical
iPhone acceptance has not been performed. No browser preview is used as evidence.

## Initial environment and evidence

Before application edits, the working directory was
`C:\Users\91956\Tirodhan-frontend\tirodhan-frontend`. Branch: `main`; HEAD and
remote `refs/heads/main`: `103d181eae4ebc539f8253cb009ac1b42c953e12`.
`git status --porcelain=v1` returned no entries. `git ls-remote origin
refs/heads/main` confirmed remote main matched; no pull, merge or feature-branch
rewrite was needed. Changes were then made on `codex/ios-expo-go-preview`.

Read-only commands included `Get-Location`, `git branch --show-current`,
`git rev-parse HEAD`, `git status --short`, `Get-Command`, `where.exe node`,
`where.exe pnpm`, executable `--version` commands and `$PSVersionTable`.

| Item                    | Observed result                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Default Node            | `C:\Program Files\nodejs\node.exe`, v18.19.0                                                             |
| npm                     | `C:\Program Files\nodejs\npm.cmd`, 10.2.3                                                                |
| Codex pnpm              | `C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd`, 11.25.0 |
| Corepack                | `C:\Program Files\nodejs\corepack.cmd`, 0.22.0                                                           |
| Existing supported Node | `C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`, v24.19.0    |
| Version managers        | No `nvm`, `fnm` or `volta` command found; installation elsewhere is not ruled out                        |
| Codex shell             | PowerShell Core 7.6.5, Windows 10.0.26200; neither WSL nor a container                                   |
| User terminal           | Windows PowerShell; terminal snapshot shows Node 18.19.0 and npm 10.2.3                                  |

The user-terminal snapshot confirms the same Node/npm versions; it does not
expose that terminal's PATH or pnpm availability. Its executable resolution is
not separately claimed. Codex augments PATH with bundled tools. The machine's `Program Files\nodejs`
entry precedes bundled Node, so an unqualified `node` resolves to the host's Node 18. This is a host installation plus PATH ordering issue, not a repository runtime
installation. The pnpm fallback wrapper explicitly invokes bundled Node and
`pnpm.mjs`; therefore `pnpm --version` can succeed even when `node --version`
reports 18. Child tools must still resolve the supported Node consistently.

The sandbox process launcher failed to initialize with `helper_unknown_error:
setup refresh had errors`. Diagnostics and validation used approved host
PowerShell processes. This failure is separate from Metro and Expo Go.

The root `package.json` declares `engines.node >=22.13.0` and
`packageManager pnpm@11.25.0`. The installed pnpm package also requires Node
`>=22.13`. React Native 0.86.3 declares
`^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0`; Node 24.19.0 satisfies all relevant
constraints. The root requirement was preserved, not weakened.

The workspace manifest lists `apps/*` and `packages/*`, allowing the existing
`unrs-resolver` build. Lockfile format is `9.0`. No tracked `.npmrc`, `.nvmrc`,
`.node-version`, Dockerfile or development-container configuration existed at
baseline. No project setup script selected a Node runtime. The only app script
file was reference-asset extraction. The app README declares Node >=22.13 and
pnpm 11.25.0. No inspected tooling requires Node 18.

`.github/workflows/customer-mobile.yml` selects Node **24**, uses pnpm's action
and the repository package-manager declaration, performs a frozen install,
typecheck, lint, formatting, Jest, Doctor and Android export. The prior
`IMPLEMENTATION_REPORT.md` explicitly records Node **24.19.0** and pnpm 11.25.0
for validation. There is no evidence that those successful runs used Node 18;
the current terminal version alone cannot establish a previous test runtime.

## Independent root causes

Running the installed Expo CLI directly with host Node 18 from the app directory:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/expo/bin/cli start --go --offline --port 8091
```

emitted an unsupported-Node warning and failed with
`TypeError: configs.toReversed is not a function` in
`metro-config/src/loadConfig.js:202`. Node 18 lacks the array API used by this
Metro version. The probe exited with code 1. An initial probe from repository
root instead reported no root Expo module; that directory error was corrected
before drawing the Metro conclusion.

The second issue is the app's original `start: expo start --dev-client`. That
flag explicitly launches a custom development build. It is independent of the
Node failure. Installing a newer Node alone cannot change that target or provide
an installed native client. Merely declaring `expo-dev-client` does not prevent
Expo Go: a separate `expo start --go` explicitly selects Go.

The original README's blanket “not Expo Go” statement was too broad for screen
preview. The native dependencies below are included in the matching runtime.
There was no device launch available to prove an additional missing-module error.

## SDK and native dependency assessment

The official [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) specifies
React Native 0.86, React 19.2.3, minimum Node 22.13.x and iOS 16.4+. The repository
and installed `expo/bundledNativeModules.json` agree. [Expo Go's download page](https://expo.dev/go)
lists SDK 57 as latest on the investigation date. The user's installed Expo Go
and iOS versions remain unknown; compatibility is conditional on SDK 57 Go and
iOS 16.4+. Each Go binary supports a matching SDK; an arbitrary older phone
installation is not evidence of compatibility.

| Dependency / version                                                                                                     | Actual path and matching-runtime finding                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo 57.0.27, React Native 0.86.3, React 19.2.3                                                                          | Installed SDK metadata matches the intended native runtime. No upgrade or downgrade needed.                                                                                                                                                                                                   |
| Expo Router 57.0.25                                                                                                      | Router entry, root Stack and product/tab layouts use existing supported navigation. Preserve typed routes and links. Custom app/universal link acceptance needs a development build.                                                                                                          |
| expo-dev-client 57.0.19                                                                                                  | Config plugin and CLI target only; no direct app import or dev-client-only application API found. Keep dependency, plugin, start, ios/android and EAS development profile.                                                                                                                    |
| expo-notifications 57.0.22                                                                                               | Imported by integration from root layout and NotificationScreen. Uses native APNs/FCM tokens, rotation, responses and registration. Tirodhan remote push identity/delivery cannot be validated in Go. Development-only runtime guard disables this boundary in Go; history rendering remains. |
| expo-location 57.0.20                                                                                                    | AddressScreen uses foreground permission/location and geocoding. Included in Go. No background-location path found. Keep native behavior and manual/saved address fallbacks.                                                                                                                  |
| expo-secure-store 57.0.4                                                                                                 | Session refresh credentials and push installation ID. Included in Go; the app does not request biometric `requireAuthentication`. Session handling is unchanged, including `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.                                                                                  |
| react-native-maps 1.27.2                                                                                                 | Native MapPreview imports MapView and Marker without forcing Google provider on iOS. Go includes this version; iOS uses Apple Maps. Preserve the native map and marker interactions.                                                                                                          |
| react-native-keyboard-controller 1.21.9                                                                                  | Root KeyboardProvider plus Login/OTP KeyboardAwareScrollView. Included in SDK 57 Go; no replacement needed.                                                                                                                                                                                   |
| react-native-reanimated 4.5.1                                                                                            | Required by keyboard/navigation dependencies; no direct app import found. SDK-recommended version; preserve Hermes and Expo Babel handling.                                                                                                                                                   |
| react-native-worklets 0.10.1                                                                                             | SDK metadata matches; supports the existing Reanimated dependency. No custom worklet/native module found.                                                                                                                                                                                     |
| react-native-gesture-handler 2.32.0                                                                                      | Root GestureHandlerRootView. Included matching SDK version.                                                                                                                                                                                                                                   |
| safe-area-context 5.7.0, screens 4.26.2, svg 15.15.4                                                                     | Existing screens/navigation/graphics use included native libraries compatible with SDK metadata.                                                                                                                                                                                              |
| expo-font 57.0.4, Google-font packages, vector-icons 15.1.1                                                              | Root loads bundled TTFs using useFonts, rather than relying solely on build-time font embedding. Go can load existing fonts and icons.                                                                                                                                                        |
| expo-splash-screen 57.0.9                                                                                                | Existing prevent/hide calls and React Native SplashScreen remain. Go's native launch branding is not production splash acceptance.                                                                                                                                                            |
| expo-crypto 57.0.3, device 57.0.2, image 57.0.5, linking 57.0.12, constants 57.0.21, status-bar 57.0.1, system-ui 57.0.4 | SDK-aligned modules remain intact. Existing UUID/media/status/navigation paths are not substituted.                                                                                                                                                                                           |
| react-native-confirmation-code-field 9.0.0, React Query, React Hook Form                                                 | Existing JS screen/state/form code is retained; no extra custom native module identified.                                                                                                                                                                                                     |
| Leaflet / react-native-web                                                                                               | Existing browser-specific adapter is excluded by native Metro platform resolution. No browser substitute is introduced or tested for this task.                                                                                                                                               |

Official verification: [maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/),
[keyboard](https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/),
[Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/),
[gestures](https://docs.expo.dev/versions/v57.0.0/sdk/gesture-handler/),
[location](https://docs.expo.dev/versions/v57.0.0/sdk/location/),
[SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/),
[fonts](https://docs.expo.dev/versions/v57.0.0/sdk/font/),
[notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) and
[development-build limitations](https://docs.expo.dev/develop/development-builds/faq/).
The notification reference specifically removes Android remote push in Go; the
FAQ explains the broader custom-certificate limitation. This report does not
mislabel iOS `expo-notifications` import itself as a launch blocker. The installed
package warns about limited Go support; that warning may still appear because its
module is imported. The new guard prevents Tirodhan token/registration execution.

Config plugins are Router, dev-client, SecureStore, font, splash, foreground
location, notifications and maps. Plugins configure a custom native binary;
they cannot modify Expo Go's compiled permissions, branding or entitlements.
None is removed. `git ls-files` found no maintained Swift/Objective-C/Java/Kotlin,
Podfile or Gradle source. A generated, ignored local Android project exists;
it is not rebuilt or edited. No tracked custom native modules were identified.

## Minimum change and regression assessment

The assessment above preceded source edits. It established that Expo Go screen
preview is feasible without an architectural rewrite, paid services or signing.

- Add root `dev:customer:go` and app `start:go` using `--go`; keep `--dev-client`.
- Add `.node-version` with 22.13.0 as a selection hint. For this validation, use
  already-installed Node 24.19.0 through a process-local PATH prefix. No Node 22
  installation was performed; exact Node 22 execution is not claimed.
- In the existing notification integration, gate permission, opt-in and listener
  setup on `__DEV__ && isRunningInExpoGo()`. Use Expo's native detection rather
  than Constants StoreClient (which also identifies development builds).
  Share this predicate with logout's push revocation boundary: revocation
  otherwise creates an installation ID even without a registered token. Real
  credential logout and session clearing remain unchanged.
- Reuse `EXPO_PUBLIC_PREVIEW_CATALOGUE`; do not automatically enable it from the
  new launch script. Document explicit fixture opt-in and cleanup.
- Add meaningful notification isolation and release/development-build regression
  checks; document Windows LAN/QR and optional tunnel constraints.

Files intended to change: `.node-version`, root `package.json`, app `package.json`,
app `README.md`, `src/notifications/integration.ts`,
`src/notifications/environment.ts`, `src/lib/runtime.ts`,
`src/test/notification-integration.test.ts`, `src/test/notification-runtime.test.ts`
and this report. No dependencies,
lockfile, native config, production API contracts, backend files or CI workflow
changes are required. The declared runtime/package manager remain coherent.
TypeScript, ESLint, Jest and Turbo versions stay intact; CI Node 24 remains valid.

Splash/Login/OTP retain existing native views, fonts and keyboard handling. OTP
remains actual authentication. Home and collection categories use the existing
catalogue repository. Address selection keeps native Apple Maps, user-triggered
location, search and manual/saved fallbacks. Review and slot selection reuse
the existing draft/repositories; activity, journey and account keep routes,
query ownership and rendering. Navigation is still Expo Router. No new fixture
architecture, categories, prices, schedules or backend responses are added.

Existing development fixtures admit labelled product previews through the
already-present productAdmission boundary; that boundary is not changed.
Release ignores the fixture flag and still requires authoritative CUSTOMER
admission. Access tokens remain memory-only and refresh credentials remain in
SecureStore. Protected fixture writes are still blocked, capability checks
including `cancellationCompensation` remain, and nativeCheckout remains null.
No fake financial mutation, payment/cancellation enablement or security bypass
is introduced. Normal development builds can still use the real backend.

In a native development build, Expo Go detection is false and the original
notification registration/listener logic executes. In release, `__DEV__` is false
and the original behavior executes. In Expo Go development, permission returns
unavailable, enable performs no token or backend registration, listener setup
returns a no-op cleanup, and logout skips host push revocation. No other native feature is disabled. Risks are incorrect
runtime detection, native/JS version mismatch on an outdated Go install and LAN
reachability; tests and Metro probes cover the first and tooling aspects, while
the phone acceptance step covers actual native behavior and connectivity.

## Validation evidence

Validation uses Node 24.19.0 and pnpm 11.25.0, selected only in child processes.
The frozen install passed: all two workspace projects were already up to date,
with no lockfile churn. The supported runtime evaluated public Expo configuration
as SDK 57.0.0 with original native plugins and identifiers intact.

| Check                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                         | PASS, pnpm 11.25.0; no lockfile change.                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm typecheck`                                                                         | PASS after correcting the test-only typing for Jest's replacement of the React Native `__DEV__` global; final source typechecks.                                                                                                                                                                                                                                                              |
| `pnpm lint`                                                                              | PASS, final source with the shared Expo Go predicate and logout guard.                                                                                                                                                                                                                                                                                                                        |
| `pnpm test`                                                                              | PASS, final full run: 102 tests / 15 suites. Initial parallel run hit an existing Review test timeout; sequential rerun passed. A new test harness initially omitted the native crypto mock; corrected harness and all eight focused notification tests passed. Existing AddressScreen tests emit VirtualizedList act warnings. No timeout thresholds or existing product tests were changed. |
| `pnpm format:check`                                                                      | FAIL on 102 untouched Windows CRLF files; `core.autocrlf=true` conflicts with Prettier's default LF requirement. No unrelated formatting/configuration changes made.                                                                                                                                                                                                                          |
| `pnpm format:check --end-of-line auto`                                                   | PASS for the complete checkout; explicit Windows line-ending override. Changed files are formatted with the repository's Prettier.                                                                                                                                                                                                                                                            |
| `pnpm run doctor`                                                                        | 20/21 checks passed on both attempts; remote Expo config schema fetch failed before TLS handshake (`Client network socket disconnected before secure TLS connection was established`). External schema check remains unverified, not reported as a pass.                                                                                                                                      |
| `expo install --check`                                                                   | PASS: dependencies are up to date. No `--fix`, upgrades or downgrades used.                                                                                                                                                                                                                                                                                                                   |
| `expo config --type public --json`                                                       | PASS, SDK 57.0.0, existing plugins and identifiers.                                                                                                                                                                                                                                                                                                                                           |
| `expo config --type introspect --json`                                                   | PASS, native plugins evaluated without prebuild or generated native-source changes.                                                                                                                                                                                                                                                                                                           |
| Metro Go startup                                                                         | PASS, new script invokes `expo start --go`; iOS open endpoint resolves `runtime: expo`, `exp://192.168.1.8:8091`, and both expo/custom runtimes remain available.                                                                                                                                                                                                                             |
| Native iOS development bundle                                                            | PASS, Go manifest selects SDK 57.0.0, iOS platform, dev mode and Hermes; final guarded-source response is 10,580,504 bytes under ignored `.local/qa`.                                                                                                                                                                                                                                         |
| `expo export --platform ios --dev --output-dir dist/ios-expo-go-preview --max-workers 2` | PASS, final source: 2,187 modules, 56 existing assets including bundled fonts/media, 11 MB native JS bundle; generated output stays in ignored, lint-excluded dist.                                                                                                                                                                                                                           |
| iPhone launch                                                                            | NOT PERFORMED. Installed iOS/Expo Go version, actual maps/keyboard/fonts/native behavior and screen navigation require physical-device acceptance.                                                                                                                                                                                                                                            |

The initial export used `.local/ios-expo-go-export`. ESLint scanned that generated
JS despite Git ignoring it; it was moved into the existing lint-excluded `dist`
directory before final checks. No lint rules or product files were changed to
accommodate generated code. The initial connection probe reached port 8091 before Metro was listening and
was refused; retry after readiness returned the native manifest/bundle. This is
not evidence of phone-to-PC LAN reachability. QA uses 8091 to avoid other local
servers; the documented user command uses default 8081. A Metro bundle or export
is not physical-device acceptance. No web bundle or browser rendering was used.

## Device launch and architectural review

The app README provides exact PowerShell setup, `pnpm dev:customer:go --lan`,
fixture opt-in, iPhone Camera QR flow and error triage. Expect an `exp://` URL and
**Using Expo Go**. Check SDK 57 support and iOS 16.4+, local-network permission,
PC LAN address/TCP 8081, guest/client isolation, VPN and firewall restrictions.
No firewall rule or machine-wide PATH is modified automatically.

[Expo CLI](https://docs.expo.dev/more/expo-cli/) supports LAN and free ngrok
tunneling. `pnpm dev:customer:go --tunnel` is an optional fallback, subject to
the helper's availability and network restrictions. No global ngrok installation
is authorized or performed. Adding a local helper would be a separate dependency
decision; no paid tunnel service is required by this solution. A Metro tunnel does
not make an unreachable backend URL reachable from the phone.

Physical validation must open the app on the iPhone and check fonts/splash,
Login/OTP, Home, category selection, saved/manual/native-map address selection,
Review/items/slots, Activity/history/journey, Account and navigation. Check
notification opt-in reports unavailable, checkout stays disabled and capability
gates remain. With fixture flag off and a configured backend, verify real login
and authoritative admission separately. Report exact device/Go versions,
red-screen text and terminal errors if it fails; do not infer success from a QR.

Backend Git status was recorded read-only before implementation; it already had
uncommitted changes. A later read-only status was clean, reflecting external
activity; this task performed no backend writes. Those files are outside this task and are not edited,
formatted, migrated or tested. No Azure Terraform, OTP provider, Razorpay, GCP,
scheduling, compaction or financial-business changes are made. No global
installation, push, merge, deployment or iOS signing build is performed. The
local commit is intended for architectural review, not release acceptance.

Normal development-build startup also passed through the unchanged
`pnpm dev:customer --offline --port 8092 --max-workers 2` command. Its iOS
endpoint returned `runtime: custom`, scheme `exp+tirodhan-customer` and
`exp+tirodhan-customer://expo-development-client/?url=...`. This verifies
the original Metro launch target; an actual signed native build was not run.
