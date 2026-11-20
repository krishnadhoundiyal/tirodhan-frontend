# Nonproduction APIM Web Session POC artifacts

**NOT DEPLOYED. NOT ACCEPTED AGAINST APIM. Production login remains unavailable.**

No frontend infrastructure directory or APIM Terraform/policy convention existed.
This directory holds portable candidate API policies, their renderer and local
tests. It does not create an APIM instance, API, operation, named value, secret,
subscription, diagnostic setting or Terraform state. Backend Terraform is read only.

`configuration.unapproved.json` deliberately contains null environment values and
`approved: false`. `policy.xml` is generated from it and denies all requests.
No guessed gateway, origin, cookie, CSRF name or resource ID is an enabled default.
`render.mjs` rejects incomplete approved input, duplicate product origins/cookies,
wildcards, unsafe paths/headers and a cookie age beyond the verified backend TTL.
Approval metadata is a prerequisite, not evidence of real APIM acceptance.

For backend PR #133, use `configuration.nonprod.pending.json` to review the
exact NONPROD origins, routes, cookies, CSRF marker and 604800-second refresh
lifetime. The renderer tests exercise the confirmed technical inputs with
synthetic approval in memory. The checked-in configuration stays disabled.
The [handoff](../../../docs/WEB_NONPROD_ACA_HANDOFF.md) explains which route
map feeds Terraform, which routes require additional rollout work, and how
to record the XML digest and frontend source commit after approval.

```powershell
node infra/apim/web-session/render.mjs
node --test infra/apim/web-session/render.test.mjs
python infra/apim/web-session/validate.py
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_ADD_GLOBAL_TOOLS_TO_PATH='false'
dotnet run --project infra/apim/web-session/tests/PolicyExpressions.csproj
```

The .NET 8 test harness executes the exact expression source embedded in the
policy (C# 7.3), using Newtonsoft.Json bundled with the installed SDK. It downloads
no NuGet package. Generated source and build outputs go under ignored `.local/`.
This compiles/tests the expression bodies, **not** the APIM context wrapper or
gateway pipeline. XML checks are static. Neither replaces actual policy upload,
gateway validation, real cookies, real-browser CORS or diagnostics inspection.

The candidate API requires four separately registered POST routes and matching
OPTIONS routes using the approved manifest paths. No wildcard route should expose
business APIs through this policy. Exact origins select product cookies; no
client role/product header authorizes anything. CORS preflights explicitly allow
only POST and Content-Type plus the configured non-simple CSRF header. The marker
is not a secret. All actual operations require both exact Origin and marker.

The isolated policy intentionally has no inherited base policy: uninspected
parent policies might log credentials or forward an unsanitized response. This
is not authorization to bypass existing gateway controls. Before any deployment,
review the full effective policy and diagnostics, preserve required throttling,
backend authentication and other approved controls, and confirm no logging,
tracing, caching or error path captures raw auth data. A boolean review input is
not proof this review occurred. No existing API/policy is changed here.

Backend forwarding uses fixed Phase 1O paths, a ten-second header timeout, no
redirect following or automatic retry, stripped browser Cookie/Authorization,
and a reconstructed JSON refresh/logout body. Gateway errors and upstream bodies
are converted into fresh responses with only explicit headers and validated JSON.
Upstream Set-Cookie, Location, diagnostic headers and raw errors are not copied.
Body delivery timing and inherited service/platform diagnostics remain real POC
acceptance items; the forwarding header timeout is not a body-stream deadline.

`raw-auth-browser-guard.xml` is a separate, undeployed candidate guard for raw
mobile auth routes. It rejects browser Origin-bearing traffic while retaining
the existing parent pipeline for nonbrowser clients. Its attachment scope,
effective policy and native mobile regressions must be reviewed before use.
Also verify direct Container App ingress does not expose those mobile grants to
browser JavaScript through permissive CORS. No backend CORS change is made here.

See the four OW-P0-03 documents in `docs/` for proposed names, missing approvals,
actual observations, security test boundaries and acceptance requirements.

## Gateway invocation dependency

Every forwarded candidate web-auth request overrides `X-Gateway-Secret` with the
APIM secret named value `gateway-secret`. A caller-supplied value is never trusted.
Before policy upload, Terraform must bind that named value to the same independent
Key Vault secret referenced by the API's `TIRODHAN_GATEWAY_SECRET`, and grant the
APIM managed identity the required secret-read access. The secret value never
belongs in this manifest, frontend environment, bundle, or policy source.

This source change does not create the named value, enable the manifest, register
APIs, or prove real gateway invocation. Native auth and Bearer business APIs need
the same override in their separately reviewed APIM forwarding policies. Their
browser/raw-auth boundary and all diagnostics still require live POC acceptance.

## Coordinated gateway-secret rotation

The current backend Terraform constructs versionless Key Vault secret references.
The APIM named value is still an undeployed prerequisite. APIM and Container Apps
refresh their secret references independently; changing the Key Vault value alone
can make the API and gateway disagree and reject all forwarded requests.

Until overlapping backend credentials are explicitly implemented, rotate only in
a reviewed maintenance release. First pause ordinary upstream forwarding at APIM.
Then enroll the new independent secret through the signed secret-seeding path,
refresh the APIM named value explicitly, and replace/restart the API revision so
its process reads the new value. Do not rely on either platform's polling delay
or assume these updates are atomic. Keep traffic paused on any uncertain result.

Before restoring ordinary forwarding, use a restricted synthetic acceptance path
to verify successful APIM-authenticated invocation and rejection of missing/wrong
gateway headers. Confirm the same intended secret version at both bindings without
recording its value. Rollback must restore both bindings together while forwarding
stays paused. This procedure deliberately has a maintenance window; continuous
availability needs a separately implemented bounded overlap protocol. None of
these cloud operations is executed by this source change.
