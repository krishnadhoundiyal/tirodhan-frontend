# APIM POC findings

Status: **NOT YET PROVEN**. Findings recorded October 25, 2026, Asia/Calcutta.

The human explicitly confirmed that no nonproduction gateway/resource group,
Operations or Customer origin, route, cookie name or CSRF header is approved.
Only local implementation/tests and proposals are authorized. No cloud resources
or policies may be provisioned/deployed and live authentication must stay closed.

## Repository and infrastructure evidence

Frontend base `14368b5df7e3305242927a6d49d7dc0444729743` merges OW-P0-02;
branch `codex/operations-web-apim-session-poc` starts from that remote HEAD.
Backend was inspected read only at `b281e03a47d202fd8b5c3d895075aa358062c5fa`.

No existing APIM policy XML, web-session adapter implementation or APIM Terraform
resource was found in either repository. The backend `infra/terraform/nonprod/`
contains Container Apps, identity/RBAC, PostgreSQL, Storage, Key Vault, Service Bus
and job definitions. Names use `tirodhan-np-${suffix}`, with application/environment
tags and AzureRM subscription/tenant inputs. `outputs.tf` exposes a Container App
API URL, not an APIM gateway. Existing names and outputs are **not POC approval**.
No secret values, Terraform state or private credentials were read for this work.

Backend architecture selects APIM Consumption as an initial replaceable edge.
This is a documented selection, not evidence of a deployed tier. FastAPI owns
identity, sessions and live roles; infrastructure provisioning uses Terraform,
separate environments and explicit production approval. No BFF, identity model,
Azure diagnostics service or backend business rule is added.

Azure CLI sign-in availability was checked: account metadata reported Enabled in
AzureCloud. Two read-only inventory attempts, `az resource list --resource-type
Microsoft.ApiManagement/service` and `az apim list`, both failed with:

```text
ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host')
```

This does not establish resource absence, permissions, tier, effective policies,
gateway reachability or diagnostics configuration. No further cloud action was
taken. Even a successfully discovered resource would require separate approval.

## Feasibility assessment

| Question                                       | Verified evidence / remaining limit                                                                                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing policies or adaptation?               | None found in repositories. Deployed state inaccessible/unverified.                                                                                                                                                                                             |
| Selected tier supports transformations?        | Microsoft documents policy expressions and the required set-body, set-header, return-response and rewrite operations for Consumption. Actual deployed tier and policy acceptance remain unverified.                                                             |
| Strip login refresh credential and set cookie? | Implemented as strict five-field login validation and a fresh four-field access response plus selected host cookie. Exact expression bodies compile and pass local tests; gateway execution not proven.                                                         |
| Map cookie into refresh/logout JSON?           | Implemented against actual stable Phase 1O credential semantics. Product selected from exact Origin; duplicates/malformed cookies rejected. Real backend/APIM/browser not exercised.                                                                            |
| CORS, CSRF and errors?                         | Explicit origin/preflight/header checks and constructed error responses implemented/tested locally. Full gateway/on-error/CORS behavior, platform errors before policy execution and browser cookie enforcement require live acceptance.                        |
| Secret redaction?                              | No policy log/trace/cache operation; response allowlists and local tests prove sanitizer output. Effective parent policies, service diagnostics, backend logging and real trace/log redaction remain unverified.                                                |
| Access needed?                                 | Approved resource/environment inventory, deployment identity/permissions, route registration, backend origin/TTL evidence, browser origins, test identity/OTP access and a separately approved deployment/testing run. None has been approved/provisioned here. |

Primary references: [policy expressions](https://learn.microsoft.com/en-us/azure/api-management/api-management-policy-expressions),
[set-body](https://learn.microsoft.com/en-us/azure/api-management/set-body-policy),
[set-header](https://learn.microsoft.com/en-us/azure/api-management/set-header-policy),
[return-response](https://learn.microsoft.com/en-us/azure/api-management/return-response-policy),
[rewrite-uri](https://learn.microsoft.com/en-us/azure/api-management/rewrite-uri-policy),
[forward-request](https://learn.microsoft.com/en-us/azure/api-management/forward-request-policy)
and [CORS](https://learn.microsoft.com/en-us/azure/api-management/cors-policy).
Microsoft notes that expressions receive limited definition-time verification
and execute at gateway runtime. Local .NET execution is therefore insufficient
to claim APIM policy acceptance or browser security.

## Backend contracts inspected

`api/routes/auth.py`, identity `service.py`/`tokens.py`, ADR-007, data protection,
idempotency guidance and identity/challenge integration tests were inspected.
OTP start is 202 with a public challenge UUID. Verify returns an access grant
plus refresh_token once; exact completed login replay is 409 and never remints
credentials. Refresh is stable, repeatable and nonrotating, with fixed server
session expiry; it returns a four-field access grant. Logout is idempotent 204
including unknown credentials. `/v1/auth/me` reflects live session/user/roles.
Revocation and disabled user/session affect the next authenticated request.
Backend integration tests were inspected, not executed or modified.

No deployed policy, actual cookie, login, revocation, notification, cold-start
latency or diagnostics result is claimed. Production composition remains
`unavailableAdapter`; supplying flags or a URL cannot enable it.
