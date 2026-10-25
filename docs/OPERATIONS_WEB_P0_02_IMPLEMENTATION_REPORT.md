# OW-P0-02: Manager commands and asynchronous recovery

Validation completed October 25, 2026 (Asia/Calcutta).

## Repository evidence

- Branch: `codex/operations-web-manager-commands`.
- PR #9 was verified merged before branching; its merge commit and this branch's
  starting HEAD are `69904e440b3fa5762cf4c6168e0e9470591f846e`.
- OW-P0-01 `1ab110722f1c97274d8eb0e2ba4c0cf659ef051c` remains in ancestry.
- Local `main` stays `02de790325661cdd2fac305488a11964e14c3da7`.
- Backend was read only, remains clean at
  `b281e03a47d202fd8b5c3d895075aa358062c5fa`.
- Customer Mobile, Rider Mobile, shared packages, package manifests, lockfile,
  workspace dependency/security policy and Turbo configuration are unchanged.
- No push, new PR, merge, cloud build, deployment or production authentication
  enablement was performed. The Operations workflow adds this branch to its
  push trigger; its checks are retained. Remote CI has not run for these local
  commits.

## Implemented behavior

The pre-implementation mutation matrix is
`OPERATIONS_WEB_MUTATION_CONTRACT_MATRIX.md`. It records actual handler models,
identity ownership, versions, response semantics, replay/conflict behavior,
follow-up reads, route mapping and feature gates. Backend services and tests
were inspected directly; no backend tests were executed or backend files edited.

- Pending V1 groups can be reviewed with their recorded planning mode, cell,
  slots and pickup count, assigned to a backend-known rider and submitted only
  after separate confirmation. The exact body contains only `rider_id`.
- V1 reassignment uses actual predecessor references from an assignment response
  or an ACTIVE/unreleased, unrouted known-booking lineage entry with ASSIGNED
  pickup state. Lineage does not expose assignment source/group identity;
  absence of a route is not a claim of V1 authority. The server verifies the V1
  group, current ownership and transferable work. Routed work is excluded from
  this action. Optional OPEN V1 pickup incidents are loaded and matched to the
  predecessor, never confused with V2 rider failure incidents.
- Failure declaration uses the selected backend rider and the complete
  non-closed route/version map returned by rider recovery-state. The server
  discovers affected work, locks resources, checks the map again, blocks
  resources and queues recommendations. No browser route discovery/allocation
  algorithm is introduced.
- Backend candidate rank and immutable evaluation evidence remain authoritative.
  Ordinary replacement selection and failure incident allocation use distinct
  commands. Incident approval requires the candidate's complete affected-booking
  coverage to map to the obligations available in the current incident page.
  No inferred or partial candidate coverage is submitted. Larger/unavailable
  coverage remains disabled rather than fabricated.
- ATTENTION/AWAITING_TRANSFER assignments expose separate review actions for
  activation retry and requesting new options. Failed-pickup service resolution
  requires explicit no-collection attestation and a replacement version. It
  neither confirms custody nor completes a collection request.
- HTTP 202 is labelled accepted for processing. Returned incident, assignment
  and replacement identities are retained with parent context. Actual
  projections expose PENDING/RUNNING/AWAITING_TRANSFER/ACTIVATED/ATTENTION/
  SUPERSEDED, failure codes, activation/current revision references,
  acknowledgment/due/escalation and custody facts. Command acceptance and UI
  timers do not establish recovery completion.

## Session, replay and reconciliation

Only validated command factories can issue POST requests through ManagerSession;
there is no generic write URL/body escape hatch. Access JWT remains private
memory. Requests use the exact HTTPS origin, bearer authorization, omitted
cookies, no-store, no-referrer and rejected redirects. Concurrent GET/POST 401s
share refresh, read current `/v1/auth/me`, preserve identity and retry each exact
request at most once. A 403 never refreshes. Logout/account changes abort work,
advance ownership epoch, clear queries/command records and reject late results.

Command records retain the immutable serialized request and business identity
through navigation, transient errors and ambiguous responses. Double clicks
cannot submit concurrently. An uncertain command cannot be discarded or
replaced with changed intent for the same endpoint/target. Retry requires
separate explicit confirmation; only recognized transient conflict codes permit
an identical retry from conflict state. Other conflicts require a fresh review.
Unknown error payloads are not reflected. Malformed success, unexpected status,
5xx or lost response remains uncertain rather than successful.

Records are session memory only, limited to 50; they do not survive reload or
logout. The local submission/retry window is 15 minutes, not a promise about
deployment idempotency retention. Once it expires, the original uncertain
identity stays retained and submission stops. A lost browser session requires
inspection of backend state before another business decision.

Accepted/completed records select a known authoritative projection. Further
reconciliation is user-started for one selected resource: at most six reads,
five seconds apart, with a hard 30-second deadline including network time.
Errors, terminal backend projections, explicit stop, hidden document,
navigation, unmount and session change cancel the loop. No automatic command
retry, global fetch fanout, manager notification subscription, planner invocation
or permanent background orchestrator exists. Mounted relevant group/rider/
lineage/incident/replacement reads are invalidated after a command attempt.

## Validation results

| Check                                                                    | Result                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| pnpm 11.25.0 frozen-lockfile installation, strict security policy intact | Passed; already up to date; no dependency changes                                                     |
| Operations TypeScript                                                    | Passed                                                                                                |
| Operations ESLint, zero warnings permitted                               | Passed                                                                                                |
| Prettier for Operations sources/docs and workflow                        | Passed                                                                                                |
| Jest                                                                     | **128 tests passed in 5 suites**                                                                      |
| Production static build                                                  | Passed; 301.62 kB JS, 89.81 kB gzip                                                                   |
| Build with NODE_ENV=development and preview=true                         | Passed; fixture exclusion passed                                                                      |
| Production with preview=true, API origin and all V2 flags enabled        | Passed; fixture exclusion and browser authentication gate passed                                      |
| Desktop fixture browser interactions                                     | Passed: assignment confirmation/navigation retention, failure acceptance, incident candidate approval |
| 390px browser layout                                                     | Passed; no document horizontal overflow                                                               |
| Fixture and production browser API isolation                             | Passed; zero Fetch/XHR requests and zero runtime exceptions                                           |
| Git whitespace check and protected path diff                             | Passed; protected mobile/dependency paths unchanged                                                   |

Tests cover exact bodies/discriminators, natural manual-assignment identity,
stable reassignment identity, 202 handling, conflicts, malformed responses,
concurrent 401 refresh, 403, changed principal, logout/late results, bounded body
timeouts, production/feature gating, stale/expired/missing candidate evidence,
full candidate coverage, V1/V2 action separation, explicit attestation, finite
reconciliation, cancellation, terminal reads, hard deadline and expired local
retry window. The original foundation tests remain enabled.

The standard Jest temporary cache initially hit Windows sandbox EPERM on rename;
the unchanged suite passed with its cache located under ignored
`.local/ow-p0-02/jest`. No test or validation was disabled. The browser-control
tool failed initialization with `failed to write kernel assets ... os error 3`;
local browser QA used the already installed Chrome in headless mode with an
isolated ignored profile, against loopback servers only.

Vite retains nonfatal TanStack `use client` notices. The deliberate development-
NODE_ENV build also reports a >500 kB development React bundle; the production
bundle is smaller. No warning suppression or dependency/version change was made.
Local QA evidence is under ignored `.local/ow-p0-02/` (browser JSON/screenshots
and build logs), not production output.

## Remaining acceptance boundary

Production browser authentication is intentionally unavailable until the APIM
Web Session Adapter POC and its real browser CORS/CSRF/cookie/role evidence pass.
Fixtures simulate commands entirely in memory and cannot perform operational
mutations. Mock tests do not prove a live assignment, worker activation, physical
custody transfer, rider notification delivery, acknowledgment or end-to-end
recovery. None is claimed here. No native/mobile/device acceptance was performed
for this isolated web increment.

Direct route activation/recovery, fleet policy, arbitrary operational commands,
planner execution, handover confirmation and collection completion remain
outside this increment. The existing architecture, read surfaces, cursors,
production fixture exclusion and authentication POC requirements are retained.
