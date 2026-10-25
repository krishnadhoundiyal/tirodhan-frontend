# Operations Web APIM session POC gate

Status: **not established; live browser authentication unavailable**.

The frozen architecture was read in full. Backend commit
`b281e03a47d202fd8b5c3d895075aa358062c5fa` exposes Phase 1O `/v1/auth/otp/start`,
`/otp/verify`, `/refresh`, `/logout` and `/me`. Its verify response includes a
refresh_token, and refresh/logout consume that credential in JSON. These are
mobile contracts, not approved browser auth endpoints. Read-only searches of
backend routes, infrastructure, tests and docs found no web-session adapter,
approved web route/cookie/CORS/CSRF contract or POC acceptance evidence. Absence
of repository evidence does not establish the state of any deployed gateway.
No real auth endpoint, gateway policy, cloud resource or credential was used.

## Implemented boundary

`apps/operations-web/src/auth/session.ts` defines an injected WebSessionAdapter:

- startOtp receives the existing client_request_id and phone semantics and
  returns challenge_reference.
- verifyOtp receives client_login_id, challenge_reference and code and returns
  only access_token, token_type, expires_in and user_id.
- refresh returns the same access grant, never a browser-visible refresh token.
- logout revokes the cookie-backed session through the future adapter.
- Every call accepts cancellation and has a finite deadline. The future HTTP
  adapter must honor cancellation and cookie-operation ordering, including
  ambiguous login/logout completion. The interface does not prove gateway
  security or remote cookie revocation.

The production composition always injects unavailableAdapter. Setting a gateway
origin or feature flags cannot enable login. No window/global adapter injection
or fallback to direct FastAPI token endpoints exists. A future reviewed adapter
must replace this composition only after the evidence below is accepted.

OTP command identities are retained in component memory for retries of the same
input; changed phone/challenge/code inputs receive new command identities. A
checking state does not unmount the form and lose that identity. Starting another
sign-in first clears the gateway session. This does not promise credential
replay: FastAPI rejects a previously completed login with 409
LoginCredentialsUnavailableReplayError and does not re-expose its original grant.
The real adapter POC must distinguish a request that never completed from an
already established cookie session or a case requiring a new OTP. Mock acceptance
of a retried call is not evidence of completed-backend-login replay.

Access JWTs live only in ManagerSession private memory and are absent from
public state, URLs, storage, logs and telemetry. Business transport accepts only
allowlisted GET manager reads and OW-P0-02 branded POST commands; it uses an exact HTTPS origin, credentials: omit,
no-store, no-referrer and redirect: error. Admission requires fresh `/v1/auth/me`
with current MANAGER role, matching the issued user_id. Roles are never decoded
from JWTs or asserted in requests. Coordinated 401 refresh rechecks principal,
retries each request at most once with its exact body/identity, and rejects account changes; 403 never refreshes.
Uncertain mutation outcomes require explicit manager confirmation before an
identical command retry; no timer resubmits a business decision. Logout also
clears the session-memory command journal and cancels selected reconciliation.
Logout immediately advances the ownership epoch, aborts reads, clears token,
principal and query cache, and removes the authenticated shell/selections.
Unconfirmed remote logout blocks further sign-in until logout retry succeeds.

## Required approved contract and evidence

Do not assume cookie names, auth endpoint URLs or anti-CSRF headers. Record their
actual allowlisted values and versioned policy implementation in POC evidence:

| Area              | Required acceptance                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login             | Real OTP verify response strips refresh_token and all credential echoes before browser delivery; only the exact four access-grant fields are visible. Unexpected/malformed backend responses fail closed. No refresh secret in body, URL, redirects, headers readable to JS or diagnostics.                       |
| Cookie            | Secure, HttpOnly, host-scoped (no Domain), approved SameSite/Path/max-age behavior, expiry and deletion attributes verified in real browser devtools/network evidence. Expiry matches backend semantics. No cookie secret exposed to JS.                                                                          |
| Product isolation | Explicitly trusted Operations and Customer origins select separate allowlisted host-scoped cookie names. Logging into or out of either product cannot overwrite/revoke the other product's session accidentally. Arbitrary origins/product headers cannot select a cookie identity.                               |
| Refresh           | Browser credentialed call maps the cookie to existing FastAPI refresh JSON, returns only the access grant, and never logs it. Concurrent 401s share one browser refresh; stable backend refresh credential supports ambiguous-response retry. Revoked/expired/deleted cookies and backend 401s clear admission.   |
| Logout            | Cookie-to-FastAPI logout mapping revokes the existing refresh session and reliably expires the exact cookie; attributes match creation. Verify idempotent replay, network loss, logout ordering, cancellation, stale cookie response and account switch. Local-only clearing is not claimed as server revocation. |
| CORS              | Exact trusted-origin allowlist, credentials true only for approved web-auth routes, correct Vary: Origin and preflight methods/headers. No wildcard origin with credentials, arbitrary reflection or upstream CORS override. Verify success and backend error responses.                                          |
| CSRF              | Tirodhan-specific non-simple request header or approved equivalent plus exact origin enforcement for credentialed refresh/logout/login where appropriate. Foreign-origin, missing-header, null-origin and simple-form attempts fail before session effects. Cookie alone never authorizes business APIs.          |
| Errors            | Backend 4xx/5xx, 429, malformed JSON, timeouts and missing policy configuration surface bounded controlled failures with correct CORS; no raw diagnostic/PII/secret reflection or opaque error masking.                                                                                                           |
| Cache / redirects | no-store/private auth responses, no shared cache/CDN retention of cookies or grants, no credential-bearing cross-origin redirects. Browser and service-worker cache behavior verified; this app has no service worker.                                                                                            |
| Logging           | Reviewed redaction at APIM inbound/outbound, tracing, application telemetry and downstream logs. No OTP, access token, refresh credential, Cookie/Set-Cookie or Authorization collection; no phone/address payload dumps. Evidence uses redacted examples, never real secrets committed to Git.                   |
| Roles / identity  | `/v1/auth/me` live authority, user_id consistency, role revocation, disabled user/session, CUSTOMER/RIDER-only denial and 403 without refresh. Backend authorization remains mandatory per request.                                                                                                               |
| Reliability       | Cold/idle-path and steady-state latency measured in intended Azure region on actual APIM plan. No assumed latency; concurrent refresh, expired access, lost response, intermittent gateway/backend failure and finite cancellation tests.                                                                         |

The POC must include versioned approved policy artifacts, environment/origin
inventory, redacted real browser observations and automated positive/negative
tests. A separate review must authorize implementing and enabling the concrete
browser HTTP adapter. This increment creates no APIM policy, BFF, identity
provider, cloud resource, cookie or production credential.

## Development fixtures

`VITE_OPERATIONS_PREVIEW=true` works only in the Vite development server. The
fixture module supplies a fake principal and responses through an injected
in-memory fetcher at fixture.invalid; it never uses global network fetch or
real credentials, grants permissions or sends operational commands. Production
builds constant-fold out the import even if that environment flag is true.
The production-isolation script verifies the output contains no fixture
origin, credential or sentinel. Fixtures exercise presentation and isolation;
they do not establish backend, APIM or end-to-end acceptance.
