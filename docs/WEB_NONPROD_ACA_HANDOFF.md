# Customer and Manager Web NONPROD ACA handoff

The two release targets serve static frontend builds. APIM owns browser session adaptation and FastAPI owns session validation, live role checks and revocation. This handoff targets the protected NONPROD `configure` workflow from [backend PR #133](https://github.com/krishnadhoundiyal/tirodhan/pull/133), merged at `5c3a8beb43e7b601ccbcb746798e96ba6531a266`. See the [session contract](OPERATIONS_WEB_APIM_SESSION_CONTRACT.md) and the [security report](OPERATIONS_WEB_APIM_SECURITY_TEST_REPORT.md).

## Release artifacts

Use the manual [Publish NONPROD web images](../.github/workflows/publish-nonprod-web.yml) workflow on `main` with the full reviewed source commit. The workflow reuses verified GHCR images when available, smoke-tests both targets before publishing, and writes the source commit and digest references to the run summary. Use those digests for ACA and keep the runtime settings below.

For local validation, build from the frontend repository root using Node 24, the pinned pnpm 11.25.0 and the committed lockfile. Docker installs only the selected web workspace's dependency closure, builds in production mode and checks the output for fixture leakage. The final image runs the static server as the unprivileged `node` user and copies only its site's `dist`. There are no required build arguments or deploy-time rebuilds.

```sh
docker build --platform linux/amd64 -f Dockerfile.web --target customer-web -t tirodhan-customer-web:local .
docker build --platform linux/amd64 -f Dockerfile.web --target operations-web -t tirodhan-operations-web:local .
node infra/web-host/smoke.mjs customer tirodhan-customer-web:local
node infra/web-host/smoke.mjs operations tirodhan-operations-web:local
```

| OCI target       | Proposed ACA external hostname    | Target port | Startup/readiness/liveness         |
| ---------------- | --------------------------------- | ----------- | ---------------------------------- |
| `customer-web`   | `customer-nonprod.qtkservice.com` | HTTP 8080   | `GET /health`, HTTP 200, body `ok` |
| `operations-web` | `manager-nonprod.qtkservice.com`  | HTTP 8080   | `GET /health`, HTTP 200, body `ok` |

The hostnames in the table and `https://api-nonprod.qtkservice.com` are the exact review inputs. Approval remains pending. ACA terminates HTTPS and forwards to port 8080. Health confirms the static server started with its required entry files. Release automation can tag each target separately in GHCR (proposed repositories `ghcr.io/krishnadhoundiyal/tirodhan-customer-web` and `ghcr.io/krishnadhoundiyal/tirodhan-operations-web`). Record the commit and use the resulting immutable digest per ACA revision.

Customer serves its prerendered public pages and returns its 404 page with HTTP 404 for unknown public routes. `GET/HEAD /account/collections/{UUID}` falls back to the private account entry while retaining the requested URL. Manager section URLs and `/routes/{UUID}` serve the protected shell. Neither entry embeds request-specific or account data. Private entries send `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. Unknown assets return 404. Preserve these behaviors at the edge and disable cache overrides for the runtime config, private entries and auth APIs.

## Exact frontend runtime inputs

Set the following public environment variables separately on the two ACA revisions. Keep `WEB_AUTH_ENABLED=false` pending real acceptance in Issues #13 and #14. The static host serves `/web-session-config.json` with `Cache-Control: no-store`, and the entry points validate the exact HTTPS browser origin, product and session contract before composing the adapter. Both apps offer **Restore secure browser session** on the login page once enabled.

| Variable                  | Value                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `WEB_ENVIRONMENT`         | Literal `nonprod`                                                                                    |
| `WEB_AUTH_ENABLED`        | Literal `false` pending acceptance                                                                   |
| `WEB_AUTH_POC_REFERENCE`  | Unset pending acceptance, then the real public evidence reference                                    |
| `WEB_AUTH_BROWSER_ORIGIN` | Customer `https://customer-nonprod.qtkservice.com`, Manager `https://manager-nonprod.qtkservice.com` |
| `WEB_AUTH_GATEWAY_ORIGIN` | `https://api-nonprod.qtkservice.com`                                                                 |
| `WEB_AUTH_START_PATH`     | Proposed `/web/session/otp/start`                                                                    |
| `WEB_AUTH_VERIFY_PATH`    | Proposed `/web/session/otp/verify`                                                                   |
| `WEB_AUTH_REFRESH_PATH`   | Proposed `/web/session/refresh`                                                                      |
| `WEB_AUTH_LOGOUT_PATH`    | Proposed `/web/session/logout`                                                                       |
| `WEB_AUTH_CSRF_HEADER`    | Proposed `X-Tirodhan-Web-Session`                                                                    |
| `WEB_AUTH_CSRF_VALUE`     | Proposed public marker `1`                                                                           |

Set each route and marker exactly as registered at APIM. All values above are public. Product is fixed by the image target. Gateway secrets, refresh tokens, cookie names and raw FastAPI URLs do not belong in this configuration. Web Locks and local browser storage for the opaque cookie recovery flag are prerequisites. The access grant remains in memory.

Customer profile, preferences and payment methods each have a separate runtime switch. After authentication acceptance and verification of the matching FastAPI operations through APIM, set `WEB_CUSTOMER_PROFILE_ENABLED`, `WEB_CUSTOMER_PREFERENCES_ENABLED` or `WEB_CUSTOMER_PAYMENT_METHODS_ENABLED` to literal `true` for the approved capability. Each defaults to off, and the host returns all three disabled while web authentication is off. The current payment methods contract can legitimately return an empty list. Provider checkout remains separately gated.

The Manager image supports the existing optional build arguments `VITE_OPERATIONS_V2_DISPATCH`, `VITE_OPERATIONS_V2_FLEET`, and `VITE_OPERATIONS_V2_ORCHESTRATION`. All default to `false`. Set each to literal `true` only with the corresponding backend capability. Fleet depends on dispatch, and orchestration depends on both. The Manager route UUID page resolves the shell in either configuration. Reading a route revision requires the dispatch capability.

### ACA web-origin authentication

For each web origin, the backend Terraform release can set `WEB_APIM_ORIGIN_REQUIRED=true` and inject `WEB_APIM_ORIGIN_SECRET` through its approved secret reference. The secret must be 64 lowercase hexadecimal characters. The trusted reverse proxy sets `X-Tirodhan-Web-Origin` on its hop to the static host, overriding any inbound value. The host rejects unauthorized requests with HTTP 403 and leaves `/health` available to ACA probes. Required mode refuses startup without a valid secret. Supplying a secret also enables enforcement. Keep this secret out of browser configuration, logs and committed files. The separate `X-Gateway-Secret` authenticates APIM's hop to FastAPI.

### Customer Razorpay test checkout

Leave `WEB_CHECKOUT_POC_REFERENCE` unset until the checkout POC has separate approval and the Customer session and checkout routes are available through APIM. The Customer host serves a no-store `/web-checkout-config.json` and the browser validates the exact HTTPS Customer origin. The adapter accepts Razorpay test keys and backend-prepared orders. Configure the reviewed edge policy for the Razorpay script and checkout and exercise it at the actual origin before enabling the feature. The backend financial projection determines whether payment succeeded. The account page lists API-provided options or directs the customer to bookings when the API returns an empty list. Example UPI, card and net banking entries are local fixture data.

## Backend and APIM Terraform release

- [Pending NONPROD policy manifest](../infra/apim/web-session/configuration.nonprod.pending.json) fixes all technical inputs for review, including the backend origin `https://tirodhan-np-tdnp01-api.gentlepond-c2abba96.centralindia.azurecontainerapps.io`. Supply only its hostname to Terraform `backend_hostname`. The verified lifetime supplied for this review is `604800` seconds (`TIRODHAN_AUTH_REFRESH_SESSION_TTL_SECONDS`). Cookie maximum age is bounded by that lifetime and elapsed gateway time. `SameSite=Strict` is the review candidate for the same-site HTTPS topology.
- [Business operations](../infra/apim/web-session/business-operations.nonprod.json) contains the exact `apim_web_session.business_operations` value under its top-level key. The 26 stable IDs include `GET /auth/me` and `manager-business-command` for `POST /v1/manager/business/commands`. Each map path is relative to the module's `/v1` API. Explicit literals narrow the backend's parameterized reads to the UI's operating region and custody transfer variants. Query strings are forwarded as request parameters.
- [Separate feature routes](../infra/apim/web-session/feature-operations.nonprod.json) excludes optional Customer account surfaces and provider checkout, and Manager feature-flagged V2 routes, from the initial allowlist. Browser push has no initial web transport. The Customer build **requires three real `/v2` routes** for projected slots and hold creation/recovery. PR #133's module registers only a `/v1` business API. Do not copy V2 paths into that map. A separately scoped `/v2` gateway API with the same Bearer/CORS and invocation controls is required for full Customer booking acceptance.
- Both maps were checked against the FastAPI router declarations and their application registrations at the backend merge commit. The conditional V2 routers require the matching backend flags. Re-run `python infra/apim/web-session/verify_backend_routes.py <backend-checkout> 5c3a8beb43e7b601ccbcb746798e96ba6531a266` against that source. Confirm the actual deployed revision and feature configuration during acceptance.

1. Confirm the existing gateway resource, exact technical inputs, SameSite behavior, and effective-policy and diagnostics review. The checked-in manifest keeps `approved`, `diagnosticsReviewed` and `effectivePolicyReviewed` false and `approvalReference` null. No approved XML or digest is supplied yet.
2. After genuine confirmation, render the separately approved manifest at the reviewed frontend commit with `node infra/apim/web-session/render.mjs <approved-manifest> <output-policy.xml>`. Supply the exact XML as `web_policy_xml`, its lowercase SHA-256 as `web_policy_sha256` (`Get-FileHash -Algorithm SHA256 <output-policy.xml>` or `sha256sum <output-policy.xml>`), and record `git rev-parse HEAD` as the source commit in the signed handoff. Register POST and OPTIONS for all four paths. Bind APIM's secret named value `gateway-secret` to the same Key Vault secret consumed by `TIRODHAN_GATEWAY_SECRET`. Configure managed identity access and use the [rotation guidance](../infra/apim/web-session/README.md#coordinated-gateway-secret-rotation).
3. APIM overwrites `X-Gateway-Secret` on the upstream hop. Apply the equivalent override to separately managed native auth and Bearer API forwarding. Verify deployed backend rejects missing/wrong secret on protected routes and fails closed if its deployment secret is missing. Keep probe and provider-webhook exemptions consistent with the reviewed backend. APIM and edge settings must reject browser access to raw mobile refresh-credential routes while preserving native JSON requests. Prevent direct backend browser access and credential disclosure via inherited policies or diagnostics.
4. Browser POST start sends `{client_request_id,phone}` and expects 202 challenge JSON. Verify sends `{client_login_id,challenge_reference,code}`. Refresh and logout send `{}` with credentials. All four require the approved marker and exact origin. APIM forwards the existing `/v1/auth/otp/start`, `/v1/auth/otp/verify`, `/v1/auth/refresh`, `/v1/auth/logout` JSON calls. Only APIM constructs `{refresh_token}` for the last two. Verify and refresh expose `{access_token,token_type,expires_in,user_id}`. Logout expires only the selected cookie after backend success when a credential was present. Missing-cookie 204 establishes browser cookie cleanup and does not itself prove backend revocation of an orphaned session. Bearer business/preflight routes need exact origins and the applicable `Authorization`, `Content-Type` and `Idempotency-Key` allowlist. Browser business requests omit cookies.
5. Publish and deploy using the backend Terraform release and its approved DNS, TLS, Cloudflare and registry settings. Configure the effective CSP and cache rules for the two origins. Record exact image digests, backend commit, Terraform and policy revision, approver and test environment.

## Live acceptance checklist

- Use controlled test identities and a restricted POC client to validate OTP, exact sanitized grants and cookie flags, approved origin/CSRF, and no refresh or gateway secret in browser-readable responses. Include foreign and missing origins, same-site form requests, wrong markers, raw-auth access, error/CORS handling and redacted diagnostics.
- Sign in to both products in the same browser in both orders. Reload and restore each, refresh protected requests with a new access grant, confirm live CUSTOMER/MANAGER admission and role removal, and sign out of each while the other keeps working. Verify backend revocation using authoritative evidence and confirm expiry is scoped to the selected cookie.
- Exercise lost or stalled verify, refresh and logout, tab changes/reloads and browser/network transitions. Confirm the recovery marker and ordering hold, measure lock liveness and record explicit resolution or acceptance of [#14](https://github.com/krishnadhoundiyal/tirodhan-frontend/issues/14). Capture only redacted results. Record cold and steady-state APIM latency in the actual region.
- Verify mediated routes, direct-ingress denial, native auth regression, probe behavior, public 404s, authenticated deep links and reloads at the actual ACA/edge origins. Confirm no per-user static data, cache bypass or credential leak. Record evidence under [#13](https://github.com/krishnadhoundiyal/tirodhan-frontend/issues/13) before enabling app login.
- With a controlled verified user and Manager account, verify rider profile creation and the separate access grant. Confirm the active profile from the backend roster and verify intended Rider access after the grant. Verify that customers and unauthorized roles cannot submit either command.
- With separate checkout approval, exercise Razorpay Test Mode for an eligible booking. Include dismissal, resumable attempts and a provider callback before the backend financial projection records payment. Confirm the browser shows the backend result and that unavailable payment actions stay unavailable.
- If acceptance fails, leave or restore `WEB_AUTH_ENABLED=false` and follow the backend release rollback for any gateway change. Disabling the frontend toggle alone does not revoke prior sessions or disable APIM routes.

Local tests use synthetic configuration and service responses, and the APIM harness executes the local policy expressions. Live APIM, ACA edge behavior, real OTP and device acceptance are pending the backend rollout.
