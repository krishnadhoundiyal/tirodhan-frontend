# Customer Web

Independent React/TypeScript public website and CUSTOMER application foundation. No sibling application source imports. Production sign-in remains disabled pending APIM approval and real acceptance (#13/#14). No booking, payment, deployment or infrastructure activation.

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

Development: `http://127.0.0.1:5185`; open `/account/addresses` for the explicitly labelled fixture customer. Preview: port 5186. Chrome tests start their own isolated static server or fixture Vite process (5187). Installed Chrome is required (`CHROME_BIN` override). Screenshots: `.local/cw-p0-01/browser/`. No live protected API requests or cookies.

## Rendering / hosting contract

Vite builds client assets and a build-only React server renderer; `scripts/build.mjs` emits complete HTML for nine public pages, four private entry pages and a 404 document. Public routes need no JavaScript/hydration. Account paths load the CUSTOMER client application. This is static generation; no production Node server, identity server or BFF is introduced.

A future static host must serve directory `index.html` documents, serve `404.html` with an actual 404 status for unknown paths, provide HTTPS, correct MIME types and appropriate security/cache headers. Do not rewrite every unknown public path to successful Home. Account/legal entries are `noindex, nofollow`; robots excludes them. Approved public origin is needed for canonical URLs, sitemap and absolute share URLs. No host is guessed or deployed.

Production always composes `unavailableAdapter` and a null API origin. Vite's serve/development/not-preview constant plus the explicit fixture flag is required for development fixtures. Every build sets that constant false, including NODE_ENV=development. Isolation checks scan all output for synthetic identity/host/token/address/sentinel markers.

## Assets and boundaries

Inline SVG is original website line art, not an official receiving-point image or endorsement. Inter Regular/Semibold and Tiro Devanagari Hindi Regular are copied from the already installed `@expo-google-fonts` packages (Inter 0.4.2, Tiro 0.4.1), with their SIL Open Font Licenses in `public/fonts`. Display uses Georgia serif; UI uses Inter; Hindi uses Tiro. No external imagery/CDN URLs or sibling source/assets imports.

See `docs/CUSTOMER_WEB_*.md` for contracts, session security, editorial boundaries and evidence. Uncertain writes survive account navigation in memory; document reload loses recovery. No personal-data persistence is added. Actual authentication, retention/reconciliation, API deployment and editorial approvals remain release gates.
