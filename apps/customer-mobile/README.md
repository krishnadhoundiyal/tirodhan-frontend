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

Development build required, not Expo Go:

```sh
pnpm --filter @tirodhan/customer-mobile android
# macOS/Xcode:
pnpm --filter @tirodhan/customer-mobile ios
```

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
