# CW-P0-01 implementation report

25 October 2026, Asia/Calcutta. Independent Customer Web foundation. **Production authentication, booking and payment remain disabled.** No Azure resources, APIM deployment, EAS builds, paid service, credentials or production deployment were initiated.

## Repository and delivery

- Writable checkout: `C:\Users\91956\Tirodhan-frontend\tirodhan-frontend`.
- Clean starting main: `fe663159cbbc97b50a6a96a09bd7afa4e939b234`, verified equal to fetched origin/main and containing merged Operations PR #12 (`7679624`). No merge performed.
- Branch: `codex/customer-web-foundation`. This report is included in the implementation commit; the full final SHA and push confirmation are reported in the delivery message (a commit cannot include its own hash).
- Backend `b281e03a47d202fd8b5c3d895075aa358062c5fa` inspected strictly read-only, working tree unchanged.
- No PR creation/merge/deployment. Existing app sources and APIM artifacts are unchanged by Git comparison to the starting commit.

## Rendering choice

React 19.2.3, TypeScript 6.0.3, Vite 8.3.5 and TanStack Query 5.104.1 match the established Operations web toolchain without importing its source. Exact app-local versions reuse packages already present in the lockfile. No new package version or server framework is introduced.

An unrendered marketing SPA would leave public content dependent on JavaScript. A request-time SSR framework would add runtime/hosting work for finite static content, while another SSG framework would add a new toolchain unnecessarily. The selected approach uses Vite's supported [build-time prerendering direction](https://vite.dev/guide/ssr) and React server rendering: a small app-local script emits each finite public route as complete HTML, while account paths load a separate client application. No required production server/BFF/cloud cost. Hosting and approved canonical-origin prerequisites are in the README; no hosting action performed. This is scoped implementation, not a global Category 4 architecture decision.

## Implemented product

Nine public pages: Home, How it works, What we collect, Availability, Help, About, policy navigation and two explicitly unpublished policy notices. Semantic/crawlable HTML and metadata, bilingual sentiment, licensed self-hosted Inter/Tiro Hindi, original descriptive SVG, responsive desktop/tablet/mobile layouts, script-free navigation/FAQs and clear publishing boundaries. No fabricated legal terms, testimonials, partners, support numbers, inventory, universal coverage or collection-time/price promises.

CUSTOMER foundation: strict access/principal admission, CUSTOMER membership, memory-only access grant, coordinated bounded refresh/replay, account isolation/cancellation, logout and confirmation recovery, owner-scoped private query state. Manual address create/list/edit/archive/default selection, current-address selection and address-version-bound serviceability. Typed clients implement exactly the seven verified principal/address/serviceability endpoints in the contract matrix; all live use remains behind the production auth gate. Pending checks use explicit persisted reads; expiry/changed address/changed customer/error invalidate presentation. No geolocation request, planner call, backend role assertion or personal data persistence.

Prepared writes retain exact serialized body/idempotency identity through explicit retry and 401 replay; unstructured 409 remains conservatively locked because it cannot distinguish an in-progress command from a version conflict. Account navigation retains drafts/commands, logout clears them. A document reload loses recovery. Real business-write activation needs deployed retention and reconciliation evidence; no replacement queue or guessed idempotency API was added.

Development-only fixture module owns all simulated identities, sign-in action, scenario controls and fake HTTP. Production excludes the whole module and its synthetic phone/code/identity/address/banner content, including when preview flags are true. Fixture scenarios cover serviceable, unserviceable, pending→terminal, technical failure, expiry and backend-unavailable states with zero live protected requests.

Explicitly unavailable: production OTP/cookie authentication; profile/preferences editing; actual dynamic catalogue; slot/quote/hold/reservation/booking/payment; booking history; notifications; geolocation; unpublished policy/support content. Existing backend catalogue/history/financial APIs were identified as existing and deferred, not falsely labelled missing. No native Razorpay in browser and no payment success claim.

## Validation evidence

Final results and any host limitations are recorded below before commit. Tests use synthetic data and establish local contract behavior, not real backend/APIM acceptance. Browser evidence uses actual headless Chrome on loopback with an isolated profile, no browser SDK dependency, live credentials or remote protected services.

| Check                                   | Actual result                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm 11.25 frozen install               | Passed; strict supply-chain/release-age controls retained.                                                                                                                                                   |
| Customer Web TypeScript / ESLint / Jest | Passed; 72 tests, 3 suites. No console warnings in final Jest run.                                                                                                                                           |
| Formatting                              | Scoped default-LF check and global check with end-of-line auto (Windows checkout) passed. Only the generated .ssr output is newly ignored; source and security validation remain checked.                    |
| Web builds and fixture exclusion        | Passed with NODE_ENV=development and production, fixture flag true in both. Complete public HTML/metadata/internal links/private noindex verified.                                                           |
| Chrome production                       | Passed nine public routes with JavaScript disabled; private gate, noindex, keyboard skip link, mobile menu, Home 390/768/1440px without horizontal overflow. Zero live protected requests/resource failures. |
| Chrome development fixture              | Passed CUSTOMER admission, create/select/check/archive/logout; account 390/768/1440px without overflow and zero live protected requests.                                                                     |
| Customer Mobile regression              | TypeScript, ESLint, 223 Jest tests/20 suites passed. Android/iOS/web exports passed.                                                                                                                         |
| Rider Mobile regression                 | TypeScript, ESLint, 206 Jest tests/15 suites passed. Android/iOS/web exports passed.                                                                                                                         |
| Operations regression                   | TypeScript, ESLint, 164 Jest tests/6 suites, production build and fixture exclusion passed; manager commands included unchanged.                                                                             |
| APIM local regression                   | 22 Node tests, XML static checks, 87 exact C# assertions passed. No policy blob change.                                                                                                                      |
| Both Expo Doctor runs                   | 20/21 checks completed successfully; remote Expo config schema check could not complete. Same result after one retry. No dependency mismatch reported; no check disabled.                                    |
| Real backend / APIM / physical devices  | Not exercised or claimed. No native compilation or cloud build was initiated.                                                                                                                                |

Expo Doctor's exact failure on both apps: `Unexpected error while running 'Check Expo config (app.json/ app.config.js) schema' check: TypeError: fetch failed` / `Client network socket disconnected before secure TLS connection was established`. The tool states that this check requires a connection to the Expo API. CI must retain and rerun the check on a working connection; this is not reported as a green Doctor run.

Initial sandbox mobile exports failed with Hermes `Failed to write file ... index.hbc: permission denied`, exit 6. Re-running the exact Android/iOS/web export outside the sandbox passed on both apps; no package/source/SDK/security workaround was used. Existing nonfatal Expo Leaflet CSS/NO_COLOR notices and Vite TanStack use-client directive notices were left intact. No Expo/RN version change or warnings suppression.

The final production public entry JavaScript is approximately 8.83 kB (3.56 kB gzip); CUSTOMER application assets load separately. This is build size evidence, not a measured real-device performance score. Public HTML itself is generated after the client-size listing.

Screenshots (local, synthetic; CI also uploads browser artifacts):

- `.local/cw-p0-01/browser/public-390.png`, `public-768.png`, `public-1440.png`.
- `.local/cw-p0-01/browser/account-390.png`, `account-768.png`, `account-1440.png`.

Home desktop/mobile and account mobile captures were visually inspected. Observed: calm cream/gold editorial hero, legible bilingual text, visible service gate, clear fixture label, mobile account navigation and address form/actions without horizontal overflow. Public pages remain usable with scripts disabled. Keyboard skip link and native mobile menu were exercised. Formal assistive-technology audit, physical-device acceptance and real gateway/browser security acceptance remain unproven.

## Dependency and no-regression evidence

Node 24.19.0 / pnpm 11.25.0 and security controls unchanged. Normal pnpm installation verified the existing lockfile against supply-chain policies, then added the Customer Web importer. Frozen install passed. No existing application manifest changed.

Normal resolution also deduplicated existing transitive references: Expo Metro config postcss 8.5.29 → already present 8.5.31 (orphan 8.5.29 removed); typescript-eslint project-service 8.71.1 references tsconfig-utils/types 8.72.0 already present; eslint-plugin-expo 1.1.0 references utils 8.72.0 already present. Acorn 8.19.0 gains hasBin metadata. No new resolution archive/version introduced; no lockfile surgery, validation exclusions or warning-suppression dependency change. Shared-graph validation therefore includes all existing apps and exports rather than relying only on unchanged source.

APIM regression uses its existing canonical render step (required before byte-for-byte artifact tests on a CRLF Windows checkout), 22 Node tests, XML static validation and 87 exact C# expression assertions. The generated policy remains identical to the starting Git blob. These remain local policy tests, not real APIM acceptance.

## Remaining CW-P0-02 / release prerequisites

Approve and prove the real APIM Customer web session integration and cross-product isolation (#13/#14); approve exact gateway/origins/routes/cookies/CSRF/diagnostics and deployed API/runtime/retention contract. Approve public canonical origin, editorial text, legal/support content and hosting security/cache/404 behavior before publication. Dynamic catalogue, weight/volume declarations, backend quotations, V2 projections/atomic holds/reservation-bound booking and backend-authoritative web-provider payment need their own verified next-increment integration and tests. No frontend pricing or SDK-callback success shortcut is authorized.

## All changed files

- `.github/workflows/customer-web.yml`
- `.prettierignore`
- `apps/customer-web/.gitignore`
- `apps/customer-web/eslint.config.js`
- `apps/customer-web/index.html`
- `apps/customer-web/jest.config.cjs`
- `apps/customer-web/package.json`
- `apps/customer-web/public/fonts/Inter-Regular.ttf`
- `apps/customer-web/public/fonts/Inter-Semibold.ttf`
- `apps/customer-web/public/fonts/LICENSE.txt`
- `apps/customer-web/public/fonts/Tiro-LICENSE.txt`
- `apps/customer-web/public/fonts/TiroDevanagariHindi-Regular.ttf`
- `apps/customer-web/README.md`
- `apps/customer-web/scripts/browser-smoke.mjs`
- `apps/customer-web/scripts/build.mjs`
- `apps/customer-web/scripts/check-production.mjs`
- `apps/customer-web/scripts/dev-fixture.mjs`
- `apps/customer-web/src/api/contracts.ts`
- `apps/customer-web/src/api/customer.ts`
- `apps/customer-web/src/auth/session.ts`
- `apps/customer-web/src/customer-app.tsx`
- `apps/customer-web/src/env.d.ts`
- `apps/customer-web/src/fixture.tsx`
- `apps/customer-web/src/main.tsx`
- `apps/customer-web/src/prerender.tsx`
- `apps/customer-web/src/public.tsx`
- `apps/customer-web/src/runtime.ts`
- `apps/customer-web/src/style.css`
- `apps/customer-web/src/test/contracts.test.ts`
- `apps/customer-web/src/test/helpers.ts`
- `apps/customer-web/src/test/session.test.ts`
- `apps/customer-web/src/test/setup.ts`
- `apps/customer-web/src/test/ui.test.tsx`
- `apps/customer-web/tsconfig.json`
- `apps/customer-web/vite.config.ts`
- `docs/CUSTOMER_WEB_AUTH_BOUNDARY.md`
- `docs/CUSTOMER_WEB_BACKEND_CONTRACT_MATRIX.md`
- `docs/CUSTOMER_WEB_P0_01_IMPLEMENTATION_REPORT.md`
- `docs/CUSTOMER_WEB_PUBLIC_CONTENT_INVENTORY.md`
- `package.json`
- `pnpm-lock.yaml`
- `turbo.json`
