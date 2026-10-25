# Customer Web

Independent React/TypeScript public website and complete CUSTOMER application. Booking/payment exclusions from the initial foundation are withdrawn. See the durable `docs/CUSTOMER_WEB_FUNCTIONAL_PARITY_MATRIX.md` for every Mobile equivalent, source hashes, tests and activation gates. Production authentication remains disabled pending APIM Issues #13/#14; no environment flag enables it.

From the monorepo root:

```sh
pnpm install --frozen-lockfile
pnpm dev:customer-web
pnpm dev:customer-web:fixture
pnpm typecheck:customer-web
pnpm lint:customer-web
pnpm test:customer-web
pnpm build:customer-web
pnpm --filter @tirodhan/customer-web run test:production-isolation
pnpm --filter @tirodhan/customer-web run test:browser
pnpm --filter @tirodhan/customer-web run test:browser --fixture
```

Development uses loopback port 5185; fixture entry `/account/addresses`. Preview: 5186. Chrome tests start isolated servers/profile (fixture 5187); installed Chrome required, CHROME_BIN override. Screenshots: `.local/cw-p0-01/browser/`. Fixtures implement the complete synthetic booking/financial/account backend and callback-only/lost-command/planning-race controls, with zero live protected requests or cookies. Every build excludes fixtures regardless of NODE_ENV or preview flags.

## Application and hosting contract

Nine public pages are prerendered complete HTML; finite private entries load the CUSTOMER browser application. Dynamic `/account/collections/:UUID` deep links require an **account-scoped** fallback to `/account/index.html`. Unknown public paths must return real 404, not successful Home. Serve directory index documents, HTTPS, correct asset MIME types, reviewed CSP/cache/security headers. Private and legal publication notices are noindex. Approved canonical/public origin, legal/support content and hosting remain prerequisites; nothing deployed.

Production composes unavailableAdapter and null API origin. Complete clients/screens/state are implemented behind approval/capability gates. The app-local concrete APIM adapter requires exact approved nonprod configuration and real acceptance before composition. Business HTTP omits cookies; only approved auth routes include HttpOnly browser-session cookies. No SecureStore/native refresh storage or sibling runtime source imports.

Booking/payment prepared commands have encrypted owner-scoped IndexedDB recovery with nonextractable WebCrypto keys and lifetime Web Locks. Unsupported browser capability fails closed before financial/capacity preparation. No credentials/address text/GPS stored; explicit logout wipes records. Address/account-edit commands containing personal text remain in memory through navigation. XSS can use same-origin keys even if nonextractable: CSP and real security acceptance remain mandatory.

Browser Razorpay is lazy and approval gated; backend projection alone establishes payment. Optional Leaflet tiles/geocoder endpoints require explicit approved configuration; no automatic location permission. Web Push subscription/VAPID needs an approved server contract, with no native token reuse. See authentication/contract docs for exact prerequisites.

## Assets and local parity snapshots

Original SVG line art/placeholder is illustrative, not official receiving-point evidence. Self-hosted Inter/Tiro fonts retain their SIL licenses. Remote managed media is accepted only via safe backend HTTPS metadata with expiry/fallback behavior.

Pure DTO/declaration/slot/quote/booking/recovery/catalogue/media modules are reviewed **app-local snapshots** of current Mobile behavior under `src/parity`, with browser transport/storage and stricter current financial decoders. No React Native imports, source aliases or new shared runtime package. Global frozen sharing policy is unchanged. Audit refresh after reviewing future Mobile changes: `cd apps/customer-web && node scripts/audit-mobile.mjs`; commit the updated matrix/evidence along with the snapshot. CI fails on source/route drift rather than silently marking a new Mobile function covered.
