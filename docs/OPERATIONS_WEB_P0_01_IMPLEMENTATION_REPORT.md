# OW-P0-01 · Operations Web foundation

## Source and delivery

Starting frontend main: `02de790325661cdd2fac305488a11964e14c3da7`, the merge of
PR #8. The clean initial checkout was on main. The requested location, status,
branch, HEAD, fetch/prune and origin/main checks were executed before changes.
Both mobile applications were present. New work is isolated to
`codex/operations-web-foundation`, created from that fetched main.

Implementation commit: `b688a276e44d29f4d156d83a2aa426236fbe8331`.
The subsequent report commit adds only this document. Its final published HEAD
is supplied in the delivery message and resolves with
`git rev-parse codex/operations-web-foundation`; this document cannot embed its
own content-dependent commit hash.

Backend inspected read-only at `b281e03a47d202fd8b5c3d895075aa358062c5fa`, with
an unchanged clean working tree. No backend files, commands, infrastructure or
contracts were changed. No existing main, Customer or Rider commits were
amended, rewritten, merged or pushed. No PR creation or merge is part of this
increment. No cloud resource, deployment, APIM policy, Firebase application,
production credential or native build was created.

## Application and dependency choices

`apps/operations-web` is a separately buildable static React/TypeScript/Vite
browser application. It has app-local contracts, transport/session boundary,
query state, components, CSS and tests. It imports no implementation source
from another application and creates no shared package. It contains no BFF,
identity provider, GraphQL, WebSocket, browser database, service worker,
micro-frontend or planner integration.

React/React DOM 19.2.3, TypeScript 6.0.3, TanStack Query 5.104.1, ESLint 10.12.0
and Jest 29.7.0 reuse existing workspace versions. Vite 8.3.5 provides a static
SPA build and local development server; internal read views do not require
SSR or an additional server tier. Navigation is app-local; no router package
or cross-application source dependency is necessary. Runtime DTO decoders are
small app-local functions retaining only fields actually displayed.

New web tooling uses exact pins: Vite 8.3.5, typescript-eslint 8.72.0,
React Testing Library 16.3.3, DOM Testing Library 10.4.2 and React DOM types
19.2.7. Babel core/env/react/typescript 7.29.7, babel-jest 29.7.0 and jsdom
environment 29.7.0 keep the component tests compatible with the existing Jest
generation. React hooks lint plugin 7.1.1 is explicitly app-local. Versions,
release timestamps, Node engines and peer requirements were checked against
the official registry before installation. Official framework/testing guidance:
[Vite](https://vite.dev/guide/),
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

Node `24.19.0` and pnpm `11.25.0` were used. Root Node/pnpm requirements and
pnpm-workspace.yaml are unchanged. Installation retained strict release-age
and supply-chain policy, with no exclusions, unsafe flags or additional
install-script approvals. pnpm regenerated the lockfile normally; frozen
installation subsequently passed.

The lockfile adds 81 package-version records and removes none. Existing package
versions and integrity records are retained; eight existing records gain pnpm's
hasBin metadata only. Root importer is unchanged. Both mobile manifests are
unchanged. Mobile Expo Router remains 57.0.29, but its peer-context hash changes
from f66546ae030a9a261cbf45914025b74e to 1c36e180bfe3743a4d754b969c600fd9 because
the new React DOM types bind optional peers in Radix tabs/vaul and @expo/ui.
No Expo, React Native, React or Firebase version was changed. This peer-context
change was covered by actual mobile regression checks.

## Implemented screens and authoritative reads

| Screen      | Implemented behavior                                                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission   | Unavailable, checking, signed-out, denied and controlled error states. No production credential form while the APIM gate is closed. Injected adapter login and current-principal admission are tested.                                                                                                               |
| Overview    | Independent capped rider, pending-group and open-incident snapshots plus optional fleet control. Counts explicitly describe returned rows, never global or regional totals, eligibility or atomic cross-panel state.                                                                                                 |
| Riders      | Rider UUID, profile, availability intent, work state, vehicle/capacity codes, version/update time. Loaded-slice work-state filter, ID order retained. Explicit selected-rider recovery read, without fanout. No GPS, ETA, household or performance view.                                                             |
| Assignments | Pending V1 groups, batch/mode/cell/slot/count/time and optional cursor-paginated fleet backlog. Offered/accepted/manager-assigned/committed source distinctions are documented; known-booking assignment lineage with actual ownership/status/history fields, without a fabricated global assignment list or source. |
| Routes      | UUID lookup of current route/revision, vehicle/assignment references, root state and ordered task facts. Region configuration identity index and regional resource lookup with backend cursors; membership/unclosed shift is not certified spare capacity.                                                           |
| Recovery    | Paginated replacement requests, explicit detail, backend evaluation freshness/version/outcome, candidates in backend rank order and immutable evaluation history. Approval, activation, acknowledgment and custody stay separate. No selection, recovery or planning command.                                        |
| Incidents   | OPEN V1 incident attribution and known V2 rider-failure detail with independently paginated obligations and recovery assignments. Known-booking immutable custody transfers are shown. Receiving-point validation and collection completion remain separate gaps.                                                    |
| Account     | Current principal/roles and sign-out; memory/query/selection clearing. Development principal is labelled as a fixture granting no real permission.                                                                                                                                                                   |

Exact GET APIs implemented:

```text
/v1/auth/me
/v1/manager/riders
/v1/manager/collection-groups/pending-assignment
/v1/manager/incidents
/v1/manager/business/operating_region
/v1/manager/business/bookings/{request_id}/lineage
/v1/manager/business/bookings/{request_id}/events/transfers
/v2/manager/routes/{route_id}
/v2/manager/riders/{rider_id}/recovery-state
/v2/manager/rider-failures/{incident_id}
/v2/manager/replacements
/v2/manager/replacements/{replacement_id}
/v2/manager/replacements/{replacement_id}/evaluations
/v2/manager/regions/{region_id}/capacity
/v2/manager/fleet/backlog
/v2/manager/fleet/status
```

The contract matrix records exact DTO fields, query parameters, nullability,
ordering, caps/cursors, ownership, feature gates, errors and source/test evidence.
Sources include the five requested route modules, router/main mounting, V1
dispatch/incident queries and services, completion service, replacement reads/
options/commands, failure commands, persisted route/fleet/recovery models, and business configuration/history/lineage/event modules.
Legacy replacement requester/reason nullability and required route task pickup
IDs were cross-checked against those models. Unknown diagnostic/proposal fields
are discarded rather than rendered or cached. All business requests are
allowlisted GETs; no operational mutation transport or inert command button
exists. No frontend algorithm chooses candidates or invokes VROOM/OSM/planners.

## Authentication and session isolation

No approved APIM Web Session Adapter contract or POC evidence was found in the
inspected repositories. Deployed gateway state was not inspected or assumed.
Live browser authentication and authenticated live console access remain
**unavailable**. A configured HTTPS API origin or V2 flag cannot enable login.
Direct mobile auth endpoints are never used as a browser refresh-token fallback.

The testable WebSessionAdapter interface preserves backend OTP command identity
and allows only access grants, never a browser-visible refresh credential.
ManagerSession keeps JWTs in private memory, checks grant/principal identity and
live MANAGER membership, coordinates one refresh per read with one 401 retry,
and never refreshes a 403. The server-provided expires_in is used. Refresh cannot
silently switch manager identity. Network/adapter waits are bounded; individual
callers can cancel without cancelling a shared refresh needed by others.

The injected login form preserves original OTP-start and verify command IDs
across retries of unchanged inputs, survives the checking phase, and offers
gateway sign-out before starting another sign-in. Completed backend login replay
still returns a conflict; real cookie-based recovery remains a POC prerequisite.

All query keys include a session ownership epoch. Logout or an explicit new
login aborts old reads, clears token/principal/query state and unmounts all
authenticated selections. Late results cannot populate the next account.
Unconfirmed remote logout blocks login until successful retry. This is tested
against injected adapters, not proof of real cookie revocation. Future adapter
cancellation and ambiguous cookie-operation ordering require POC acceptance.

Business transport uses memory Bearer credentials, exact HTTPS origin,
credentials: omit, no-store, no-referrer and redirect: error. No role assertion,
cookies or request body authorize a business read. There is no token storage in
localStorage/sessionStorage/IndexedDB, token/error-body logging, cross-origin
credential fallback or household/coordinate dump. Failed refreshes hide cached
data; offline requests follow a finite error path. No polling, automatic
focus/reconnect refresh or unbounded detail fanout was introduced.

The precise required real cookie/CORS/CSRF/origin-isolation/error/redaction/
latency acceptance evidence is in OPERATIONS_WEB_AUTH_POC_REQUIREMENTS.md.
An interface or mock does not establish production web authentication.

## Fixture and live capability boundary

Seven development-only scenarios cover normal workload, empty region, pickup
incident, rider failure, recovery pending, reassignment completed and backend
unavailable. The completed scenario illustrates persisted V2 replacement facts,
alongside existing known-booking assignment lineage, not receiving-point handover or request completion. Fixtures use an injected
in-memory fetcher and fake principal; they never call global network fetch,
use real credentials, issue operational commands or grant backend permissions.

The Vite command/mode guard permits fixtures only in the development server.
Every build excludes their module even if NODE_ENV=development and the preview
flag is true. Both that challenge build and the final production build passed
fixture-origin/credential/data sentinel checks. The built application was also
opened in real Chromium: no credential inputs, data tables or fixture banner
were present; the authentication-unavailable gate was displayed.

No real backend, gateway auth, operational side effect or end-to-end manager
workflow was tested or claimed. Fixtures and HTTP mocks establish frontend
behavior only, not backend contract or APIM correctness.

## Actual validation

Final validation results are recorded below after completion. All Turbo checks
were forced to execute, rather than accepted from task cache.

| Check                                | Result                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Frozen installation, strict policies | Passed                                                                                                                              |
| Operations Web TypeScript            | Passed                                                                                                                              |
| Operations Web ESLint, zero warnings | Passed                                                                                                                              |
| Operations Web Jest                  | 85 tests / 3 suites passed                                                                                                          |
| Production web build                 | Passed; independently deployable static output                                                                                      |
| Fixture exclusion                    | Passed for normal production and forced development-environment builds with preview enabled                                         |
| Customer TypeScript / ESLint         | Passed                                                                                                                              |
| Customer Jest                        | 223 tests / 20 suites passed                                                                                                        |
| Rider TypeScript / ESLint            | Passed                                                                                                                              |
| Rider Jest                           | 206 tests / 15 suites passed                                                                                                        |
| Chromium fixture/production QA       | Passed at 1440px desktop and 390px mobile; no page overflow, table-region scrolling, logout clears views, zero browser API requests |

Additional mobile quality checks passed: Customer and Rider Expo Doctor each
passed 21/21 checks after unchanged retries of an Expo schema API TLS failure.
All Android/iOS/web JavaScript exports passed for both mobile apps after the
new lockfile peer bindings. No Doctor check was skipped or suppressed. The
Customer export emitted existing non-fatal Leaflet local-CSS-resource notices.
Exports remain JavaScript validation, not native compilation or device tests.

Formatting uses the exact scoped CI command plus the repository format script
with Windows line-ending normalization; final diffs and Git-normalized source
are checked before committing. Browser QA used isolated real Chromium with a
fresh ignored profile, 1440x1050 desktop and emulated 390x844 viewport, not a
physical mobile device. The bundled browser tool failed to initialize twice
with "failed to write kernel assets"; the existing Chrome headless fallback
completed the local checks without real credentials or external API requests.

The first web test run exposed query construction depending on URLSearchParams
size, unsupported by the older DOM test environment. Query construction now
uses serialized content; cursor assertions remain intact and pass. Model
cross-checks tightened actual nullable/required fields and corrected fixture
state values. No test was disabled, skipped, weakened or given a larger timeout.
Vite emits non-fatal TanStack Query use-client directive bundling notices; this
client-only SPA has no server-component boundary and the notices were not
suppressed. No validation/security setting was weakened.

Native compilation, actual FCM delivery and real-device acceptance are unrelated
to this web increment and were not run or claimed. No Android/iOS cloud build
was submitted.

## CI, prerequisites and next increment

The independent Operations Web quality workflow uses app/docs/shared-tooling
path filters, frozen install, TypeScript, ESLint, formatting, Jest, production
build and fixture exclusion. It has read-only repository permissions and no
deployment step. App-local changes do not require unrelated deployments;
shared lockfile changes still warrant validating consumers. GitHub execution
status is reported after push, separately from these local results.

Remaining native-independent prerequisites are a verified APIM adapter and POC,
approved gateway/origin/cookie/CSRF contracts, deployment-specific V2 feature
verification and real authenticated browser/backend acceptance. Missing
aggregation, global active assignments/offers and route discovery, receiving-point handover validation and collection completion are documented gaps, not frontend inventions. Region identity discovery, known-booking lineage and custody facts use existing business-history reads.

Recommended OW-P0-02: first verify the web-session integration and real reads;
then review a narrowly scoped command journey using the existing backend
manual-assignment/reassignment or replacement-selection contracts. Preserve
actual idempotency/version/authority checks, asynchronous failure/recovery
acceptance and separate custody/activation facts. Add no generalized planner
control or missing backend endpoint without a separately reviewed requirement.

## Modified files

| File                                                         | Change                  |
| ------------------------------------------------------------ | ----------------------- |
| `.github/workflows/operations-web.yml`                       | Added                   |
| `apps/operations-web/.env.example`                           | Added                   |
| `apps/operations-web/README.md`                              | Added                   |
| `apps/operations-web/eslint.config.js`                       | Added                   |
| `apps/operations-web/index.html`                             | Added                   |
| `apps/operations-web/jest.config.cjs`                        | Added                   |
| `apps/operations-web/package.json`                           | Added                   |
| `apps/operations-web/scripts/check-production-isolation.mjs` | Added                   |
| `apps/operations-web/scripts/dev-fixture.mjs`                | Added                   |
| `apps/operations-web/src/App.tsx`                            | Added                   |
| `apps/operations-web/src/api/contracts.ts`                   | Added                   |
| `apps/operations-web/src/api/reads.ts`                       | Added                   |
| `apps/operations-web/src/api/schema.ts`                      | Added                   |
| `apps/operations-web/src/auth/session.ts`                    | Added                   |
| `apps/operations-web/src/env.d.ts`                           | Added                   |
| `apps/operations-web/src/main.tsx`                           | Added                   |
| `apps/operations-web/src/preview/fixtures.ts`                | Added                   |
| `apps/operations-web/src/runtime.ts`                         | Added                   |
| `apps/operations-web/src/screens.tsx`                        | Added                   |
| `apps/operations-web/src/styles.css`                         | Added                   |
| `apps/operations-web/src/test/contracts.test.ts`             | Added                   |
| `apps/operations-web/src/test/helpers.ts`                    | Added                   |
| `apps/operations-web/src/test/screens.test.tsx`              | Added                   |
| `apps/operations-web/src/test/session.test.ts`               | Added                   |
| `apps/operations-web/src/test/setup.ts`                      | Added                   |
| `apps/operations-web/src/ui.tsx`                             | Added                   |
| `apps/operations-web/tsconfig.json`                          | Added                   |
| `apps/operations-web/vite.config.ts`                         | Added                   |
| `docs/OPERATIONS_WEB_AUTH_POC_REQUIREMENTS.md`               | Added                   |
| `docs/OPERATIONS_WEB_BACKEND_CONTRACT_MATRIX.md`             | Added                   |
| `docs/OPERATIONS_WEB_P0_01_IMPLEMENTATION_REPORT.md`         | Added                   |
| `package.json`                                               | Modified shared tooling |
| `pnpm-lock.yaml`                                             | Modified shared tooling |
| `turbo.json`                                                 | Modified shared tooling |

All Customer and Rider source/config/test/documentation files and existing
workflows remain identical to starting main; frozen architecture and pnpm
security configuration are unchanged. Only the shared root scripts/task graph
and normally regenerated lockfile accompany the independent new web app and
its documentation/workflow. No secrets or Firebase configuration were added.
