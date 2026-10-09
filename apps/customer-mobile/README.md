# Tirodhan Customer Mobile

Expo SDK57, React Native0.86, React19.2, strict TypeScript, Expo Router, Hermes and New Architecture. This app extends the existing frontend workspace; it does not scaffold other apps or shared packages.

## Run and validate

Node >=22.13, pnpm11.25.0. From repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm run doctor
pnpm dev:customer
```

Configure `apps/customer-mobile/.env` from `.env.example`: actual HTTPS APIM base URL; verified capability manifest; optional package-restricted Android Maps key and local Firebase config. Never commit credentials/Firebase files or put secrets in EXPO_PUBLIC variables. Production gate checks the live authoritative principal; transient principal errors retain successful credentials and offer retry. Access token is memory only; refresh credential uses OS SecureStore. No persisted query cache/address/GPS.

The default launch still targets a development build. Use it for native push,
custom native configuration and release acceptance:

```sh
pnpm --filter @tirodhan/customer-mobile android
# macOS/Xcode:
pnpm --filter @tirodhan/customer-mobile ios
```

### Native iPhone screen preview with Expo Go

Expo Go for SDK 57 can run the existing React Native screens on an iPhone with
iOS 16.4 or later, without Apple Developer membership or a paid Expo service.
The installed Expo Go runtime must support SDK 57; update it from the App Store
before starting. Device validation remains a separate acceptance step.

From repository root in PowerShell, first select a supported Node runtime.
`.node-version` declares Node 22.13.0; it is a version-manager hint, not an installer
or an automatic PATH change. pnpm remains pinned to 11.25.0. On the investigated
Windows machine, an existing Node 24.19.0 runtime is available; select it for only
this terminal process (CI also uses Node 24):

```powershell
Set-Location 'C:\Users\91956\Tirodhan-frontend\tirodhan-frontend'
$runtimeBin = 'C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$pnpmBin = 'C:\Users\91956\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback'
$env:Path = "$runtimeBin;$pnpmBin;$env:Path"
Get-Command node, pnpm | Select-Object Name, Source
node --version
pnpm --version
pnpm install --frozen-lockfile
$env:EXPO_PUBLIC_PREVIEW_CATALOGUE = 'true'
pnpm dev:customer:go --lan
```

No machine-wide Node installation or PATH change is needed. With an already
installed `fnm`, an alternative is `fnm env --shell powershell | Out-String |
Invoke-Expression`, then `fnm install 22.13.0` and `fnm use 22.13.0`; review and run
those commands yourself. No version manager was found during this investigation.
Corepack 0.22.0 was present but is old; it was not enabled or updated. The existing
pnpm wrapper already supplies pnpm 11.25.0, so Corepack is unnecessary here.
For the existing Windows CRLF checkout, the formatting check is
`pnpm format:check --end-of-line auto`; the default check expects LF and flags
untouched files when Git's existing `core.autocrlf=true` supplies CRLF.

Keep this terminal running. Connect the iPhone and PC to a network that permits
device-to-device traffic. Allow Expo Go's Local Network access in iOS Settings.
Scan the terminal QR code with the iPhone Camera and choose **Open in Expo Go**.
The terminal must say **Using Expo Go**, and the link must use `exp://`, rather
than `exp+tirodhan-customer://expo-development-client`. Metro then bundles the actual iOS app.
The existing labelled development catalogue opens product screens; Login's
existing preview entry also opens them. Login and OTP still use the real backend.
For real authentication, configure the actual API URL and verified capabilities
in the existing `.env` workflow. Never use example URLs as working endpoints.

Preview uses native Apple Maps, the existing keyboard controller, animations,
fonts, Expo Router and SecureStore. It reuses the existing fixture system and
does not enable checkout or cancellation capabilities. Remote push is explicitly
unavailable in Expo Go: permission reads return `unavailable`, opt-in performs no
permission/token/registration calls, no push listeners are installed, and logout
skips host push revocation while keeping credential logout/session clearing. Use the
normal development build for APNs/FCM, notification tap acceptance, native splash
branding, app icon and native URL scheme configuration. Notification history
screens still render through the existing repositories.

LAN may fail on guest Wi-Fi, with client isolation, VPNs, or Windows firewall
rules. A shared Wi-Fi name alone does not prove reachability. The phone must reach
the PC's LAN address on TCP 8081. Review any Windows firewall permission prompt;
no firewall rules are modified by this setup. Expo also supports a free tunnel:

```powershell
pnpm dev:customer:go --tunnel
```

Tunnel requires Internet on both devices and Expo's optional `@expo/ngrok` helper.
If the CLI asks to install it globally, decline under this task's no-global-change
policy. A project-local helper installation needs separate review because it
changes dependencies and the lockfile. Tunnel availability is not validated here;
LAN is the dependency-free path. Tunnel outages/timeouts are separate from SDK
compatibility, and a Metro tunnel does not expose a PC-local backend API.

If launch fails, provide the exact iOS and Expo Go versions, terminal command and
error, whether the QR uses `exp://`, connection mode, and the red-screen text.
SDK mismatch requires matching SDK 57 Expo Go; `toReversed` errors mean Node 18
still runs Metro. Timeouts suggest reachability, while missing native modules or
Reanimated version errors require recording the exact module and Go version.
Do not downgrade dependencies or bypass authentication to fix those errors.

Stop Metro with Ctrl+C. Remove the process-local fixture override before normal
backend development: `Remove-Item Env:EXPO_PUBLIC_PREVIEW_CATALOGUE`, and ensure
`.env` also has preview disabled. `pnpm dev:customer` retains `--dev-client`.

See [IOS_EXPO_GO_REPORT.md](docs/IOS_EXPO_GO_REPORT.md) for the investigation,
dependency assessment, validation evidence and native-device limitations.

Native maps use react-native-maps (Android configured Google Maps, iOS Apple Maps). Location/search permission is user-triggered; saved/manual addresses work without it. Browser QA uses an isolated Leaflet adapter with attribution. It does not validate native maps or create a Customer Web application.

```sh
pnpm --filter @tirodhan/customer-mobile exec expo start --web --port 8081
```

## Explicit development preview

`__DEV__ && EXPO_PUBLIC_PREVIEW_CATALOGUE=true` selects labelled product fixtures through the same concrete repository interface: catalogue/media, saved addresses, serviceability/slots, historical recommendations, active/history/details/journey, cancellation success/race/network retry, all refund states, pending payment, profile/preferences/favourites/content/feedback/notification history. No fixture HTTP and no protected preview writes, even if real credentials exist. Release ignores the flag; local artwork imports are development-only. Public OTP remains real authentication. Fixture legal/support text is not approved production content. Logout/account switching clears query ownership and resets draft/fixture state.

Cancellation UI also requires the `cancellationCompensation` deployment flag, including in development preview. Enable that flag when inspecting fixture cancellation states; protected preview writes remain blocked.

## Ownership and product behavior

- `app/`: thin routes and authenticated layouts.
- `src/api/`: existing DTO/client, proposed DTO/client, explicit capability gates, bounded/cancellable transport and narrow legacy-header adaptation.
- `src/session/`: secure refresh credential, memory access token/current principal, single-flight refresh and guarded admission.
- `src/lib/repositories.ts`: simple composition root selecting concrete HTTP or development implementation; no DI container.
- `src/features/`: local draft/location/confirmation, RHF forms, authoritative queries, Review modal/slot/booking, Activity/history/detail/journey, independent payment/refund reads and Account flows.
- `src/features/media/`: remote HTTPS expo-image metadata adapter, cache/placeholder/fallback and development-only local asset seam.
- `src/notifications/`: opt-in, FCM/APNs registration, serialized rotation, revocation, strict minimal payload, duplicate navigation protection and authoritative refetch.
- `src/test/`: meaningful endpoint, transport/session race, ownership, draft/screen, cancellation/refund and notification checks.

Review edits items inline while retaining address and pickup context. Ambiguous booking/cancellation retries reuse their exact prepared commands. Financial truth always comes from backend. Cancelled and refund completed are independent. Address-distance warning uses only already acquired position, approximate straight-line distance and draft-local confirmation. No GPS permission solely for warning.

## Backend and release handoff

[CUSTOMER_MOBILE_BACKEND_CONTRACTS.md](docs/CUSTOMER_MOBILE_BACKEND_CONTRACTS.md) defines every existing/proposed route, examples, nullable/enums, sorting/cursors/cache, concurrency, privacy, atomic cancellation compensation and safe financial projections. [BACKEND_GAPS.md](docs/BACKEND_GAPS.md) maps each missing capability to its exact section. Native checkout execution remains disabled until approved public checkout metadata/runtime and a validated provider adapter are present. Customer push requires distinct server FCM/APNs delivery, registration and session revocation semantics. Approved legal/support/media/taxonomy and actual runtime configuration remain release prerequisites.

## Design

Approved cream/gold palette, serif display, Inter controls, live Hindi, rounded imagery/cards and five tabs remain. Reference files are unchanged. Home and Activity use only server historical recommendations with exact “Based on your previous collections” copy; empty/unavailable recommendations are hidden. Journey stays home → human-powered collection → authorised receiving point → validated handover, with recorded timestamps only. Compact history imagery uses category metadata rather than stretched journey art.

See [IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) for actual verification results and remaining native work.
