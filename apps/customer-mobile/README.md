# Tirodhan Customer Mobile

Expo SDK 57 / React Native 0.86 / React 19.2.3, TypeScript strict, Expo Router, Hermes and React Native New Architecture. SDK 57 uses Hermes and New Architecture by default; obsolete `jsEngine`/`newArchEnabled` config fields are intentionally absent.

## Run

Use Node >=22.13 and pnpm 11.25.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run doctor
pnpm dev:customer
```

Copy `apps/customer-mobile/.env.example` to `.env` and configure the public APIM base URL. Production requires HTTPS. API host is intentionally not guessed. Credentials, OTPs and coordinates are never logged. Access tokens are private in-memory session fields; refresh credentials use SecureStore only. No remote state or query caches are persisted to ordinary storage.

This app requires a development build, not Expo Go:

```sh
pnpm --filter @tirodhan/customer-mobile android
# macOS with Xcode:
pnpm --filter @tirodhan/customer-mobile ios
# Alternatively use an authenticated EAS project:
eas build --profile development --platform android
```

Set package-restricted `GOOGLE_MAPS_ANDROID_API_KEY` for Android map tiles. iOS uses native Apple Maps. Location permission is requested only on a location/search action; manual input works without it. Geocoding is Expo's native platform capability and does not decide business serviceability.

For Android remote push, supply a local `GOOGLE_SERVICES_FILE` and matching Firebase/EAS credentials; never commit Firebase files. Permission is opt-in from Account. iOS native device tokens are APNs, so the current FCM backend needs a future agreed integration. There is no Expo Push Service dependency. Foreground/cold-start taps and app resume invalidate queries; background OS-delivered notifications work through Expo native integration. Data-only headless background business fetching is deferred until a Customer payload/read contract exists. The app always re-fetches when foregrounded.

## Design preview

Set `EXPO_PUBLIC_PREVIEW_CATALOGUE=true` in a development build to inspect Home/category selection/Review/Account/Activity. A persistent development banner identifies the preview. The flag is ignored when `__DEV__` is false. The fixture is editorial content only, not business data. No fake address, journey, quote, slot, role or API success is used. Login has a preview entry point; production requires actual session/principal bootstrap.

Optional browser QA is a mobile viewport preview of this app, not a Customer Web implementation:

```sh
pnpm --filter @tirodhan/customer-mobile exec expo start --web --port 8081
```

## Ownership

- `app/`: routes and guarded layouts only.
- `src/api/`: backend DTO mapping, bounded/cancellable fetch and narrow temporary header compatibility.
- `src/session/`: secure refresh adapter, in-memory credentials, single-flight renewal and injectable live principal reader.
- `src/features/`: auth, Home, address forms/query, local collection draft, Review, activity repository and Account.
- `src/components/`, `src/theme/`: application-owned primitives and approved tokens/fonts.
- `src/notifications/`: centralized native permission/token/listener and safe navigation/refetch integration.
- `src/test/`: session concurrency, endpoint mapping, auth, notification and meaningful component interactions.

No speculative shared packages or other apps were scaffolded. Root Turbo scripts filter to Customer Mobile.

## Release limitations

Read [BACKEND_GAPS.md](docs/BACKEND_GAPS.md). Production admission is intentionally blocked until live principal bootstrap exists. Booking is blocked by slot discovery and approved catalogue; payment checkout is not fabricated. Account legal/support destinations await approved content/contracts. Native device testing and design acceptance are mandatory before claiming production readiness.

## Design interpretation

Approved screen order, cream/gold palette, rounded card treatments, display serif, Inter controls, live Hindi and five navigation entries are preserved. Long lists use vertical FlatList with finite horizontal lists. The neutral “Popular collection groups” replaces personalised copy because past collections cannot be read yet. Availability/price/kiosk fixtures in reference images are omitted in favour of honest unavailable states. Reference imagery is cropped into small WebP assets using `scripts/extract-reference-assets.py`; no UI or generated Hindi is rasterized. The lotus is an app-owned vector recreation pending a canonical vector brand asset.

## Official compatibility references

- [Expo stable SDK reference](https://docs.expo.dev/versions/latest/)
- [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo react-native-maps integration](https://docs.expo.dev/versions/latest/sdk/map-view/)

Exact installed dependency versions and responsibilities are recorded in `docs/IMPLEMENTATION_REPORT.md` after verification.
