# Tirodhan Operations Web · OW-P0-01

Independent React/TypeScript/Vite manager read console in the pnpm monorepo.
No source imports from Customer or Rider apps, shared-package scaffolds, server
component layer, BFF, browser database, WebSocket or service worker.

From the repository root, using the recorded Node/pnpm versions:

```powershell
pnpm install --frozen-lockfile
pnpm run dev:operations
pnpm run dev:operations:fixture
pnpm run typecheck:operations
pnpm run lint:operations
pnpm run test:operations
pnpm run build:operations
pnpm --filter @tirodhan/operations-web run test:production-isolation
```

Use either dev command, not both on the same port. The default local server is
`http://127.0.0.1:5180`. An alternate local port can be supplied with
`pnpm --filter @tirodhan/operations-web run dev:fixture --port 5182`.
The dev server binds loopback only. `pnpm --filter @tirodhan/operations-web run
preview` serves the already built static application on port 5181; it does not
enable fixtures. No hosting or deployment is configured by this increment.

## Live integration boundary

The normal development and production compositions show authentication
unavailable. There is no credential form in that state. A public
VITE_OPERATIONS_API_ORIGIN can configure only an exact HTTPS gateway origin,
not enable authentication. No direct call to FastAPI OTP verify/refresh/logout
is made, because those mobile contracts expose/consume refresh credentials.

The injected adapter/session implementation is unit/component tested, but there
is no verified real APIM adapter. Do not claim live login, live manager reads,
real recovery, end-to-end authorization, CORS/CSRF security or deployment
acceptance from fixtures or mocks. See the three Operations Web documents under
`docs/` for exact contracts, missing reads and mandatory POC evidence.

V2 feature flags default false. Fleet requires dispatch; orchestration requires
both fleet and dispatch, matching backend mounting prerequisites. Enable only
reads whose deployment flags have been verified after the authentication gate
is satisfied. A 404 may mean either a missing resource or an unregistered V2
router; the UI does not guess which.

## Isolated fixture review

`dev:operations:fixture` enables labelled in-memory fixtures in the development
server. The build-command constant is false for all builds, including a build
with NODE_ENV=development and VITE_OPERATIONS_PREVIEW=true. No fixture module,
fake credential, origin or operational dataset is included in production output.

The scenario selector covers normal workload, empty region, open pickup
incident, rider failure, recovery pending, reassignment completed, and backend
unavailable. The completed scenario illustrates persisted V2 replacement/
activation/custody fields and known-booking assignment lineage, not collection completion.
Expand “Fixture reference UUIDs” to inspect known route, region, replacement and
failure references. “Read sample route” navigates to a read view only. These
references and roles grant no real permission. No global network fetch, OTP or
operational command is used by the fixture runtime.

## Data and lifecycle rules

- Overview counts describe each capped response, never regional/global totals
  or an atomic cross-endpoint snapshot. V1 lists have no invented pagination.
- Preserve backend list order and each V2 cursor independently. Filters apply
  only to the loaded slice. There is no unbounded per-rider/route fanout.
- Route lookups require UUIDs; no global route list exists. Region identities come from a separate configuration-history index.
- Replacement candidates retain backend ranks; selection is not implemented.
  Approval, activation, acknowledgment and physical custody remain distinct.
- No live assignment, reassign, failure, recovery, policy, planning, completion
  or handover mutation button or business POST transport exists.
- Reads run on navigation, selection and manual refresh, with no polling or
  focus/reconnect auto-refresh. Each transport/adapter wait is bounded; queries
  run through the same finite error path when offline rather than pausing
  indefinitely. A failed refresh hides prior data instead of labelling it current.
- Access JWT is private session memory. Query keys include an ownership epoch;
  logout/account changes abort requests, clear query state and unmount all
  authenticated selections. Refresh grants cannot silently change identity.
- Runtime decoders retain only fields required by the console. Opaque candidate
  proposals, search diagnostics, fleet measurements, coordinates and household
  PII are not dumped into the UI, cache or logs.

Visual treatment uses app-local CSS and system fonts, semantic navigation,
labelled forms, captions/column headers, textual statuses, focus styles and a
skip link. Tables scroll within their region on narrow screens. No remote font,
map or image service is needed.

## Build and CI

The build produces static `dist/` output. The independent Operations Web workflow
uses app/shared-tooling path filters, frozen installation, TypeScript, ESLint,
formatting, Jest, production build and fixture-isolation verification. It creates
no deployment and does not require a Customer or Rider release. Shared lockfile
changes still require mobile regression validation.

Vite and React Testing Library were selected from their official guidance:
[Vite](https://vite.dev/guide/),
[Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
React 19.2.3, TypeScript 6.0.3, ESLint 10.12.0, Jest 29.7.0 and TanStack Query
5.104.1 reuse existing workspace versions. Exact app-local versions are recorded
in package.json and pnpm-lock.yaml. No dependency security policy was relaxed.
