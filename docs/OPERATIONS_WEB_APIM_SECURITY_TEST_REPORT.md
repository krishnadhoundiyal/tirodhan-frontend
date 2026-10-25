# APIM web session security test report

Status: **LOCAL IMPLEMENTATION TESTED; REAL APIM/BROWSER ACCEPTANCE NOT PROVEN**.

## Evidence categories

- The Operations Jest suite tests the concrete adapter with injected network and
  lock interfaces, plus the unchanged foundation/session/manager-command suites.
- Node tests validate rendering, disabled configuration, dangerous configuration
  rejection and policy structure.
- The .NET harness compiles and executes the exact two expression bodies embedded
  in the XML, using C# 7.3 and the installed SDK's Newtonsoft.Json. Assertions
  inspect results without dumping synthetic secrets. This is local expression
  execution against explicit inputs, not a running APIM instance.
- Python standard-library XML checks verify well-formedness, exact embedded source,
  forwarding bounds, query rejection, constructed response/error paths and disabled
  configuration. These do not validate Azure's gateway context wrappers/compiler.
- Existing production fixture-isolation and build checks remain mandatory. The
  concrete adapter is not imported by production composition.

## Security coverage and limits

| Boundary                  | Automated local evidence                                                                                                                                                                               | Actual environment evidence                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OTP start/verify          | Exact bodies/identities, strict DTOs, status 202/200, malformed responses, coalesced verify, completed verify refusal, immutable input snapshot                                                        | No real OTP provider/backend/APIM login performed                                                                                                                                          |
| Credential stripping      | Exact policy bodies produce four-field access JSON; missing/extra/invalid fields, credential echo and CR/LF injection rejected; browser decoder rejects a credential-bearing grant                     | Browser-visible refresh secrecy and packet/log capture not proven. Rejecting a leaked response cannot undo exposure from a misconfigured gateway                                           |
| Cookie creation/deletion  | Policy outputs enforce separate __Host- names, Secure/HttpOnly/Path=/, no Domain, configured SameSite, bounded age/Expires, no renewal, clock/elapsed-time bounds, selected cookie expiry              | Browser enforcement, Set-Cookie delivery/limits, third-party cookie behavior and true expiry unverified                                                                                    |
| Stable refresh/revocation | Cookie-only JSON reconstruction, no browser refresh body, missing/invalid/duplicate cookies, controlled 401 and selected expiry                                                                        | No live stable-session refresh, expiry, revocation or logout proven                                                                                                                        |
| Origin/CORS/CSRF          | Exact origin matching; null/foreign/lookalike/HTTP/path/port/CRLF inputs denied; exact preflight method/headers; missing/invalid marker rejected; error responses constructed with allowed-origin CORS | Real preflight, inherited policies, errors before API selection and nonopaque browser errors unverified                                                                                    |
| Product isolation         | Origin chooses only its configured cookie, names/origins must differ, Customer logout/refresh cannot select Operations cookie in expression tests                                                      | Real Customer/Operations tabs and approved domains not tested                                                                                                                              |
| Role/current owner        | Full ManagerSession regressions plus concrete-adapter CUSTOMER/RIDER denial, current /me admission, owner-switch refusal and preserved mutation after 401                                              | Provisioned MANAGER identity, role revocation and enabled/disabled user/session not exercised live                                                                                         |
| Cookie ordering           | Serialized lock interface, queued cancellation, no logout overtaking a late verify response, deadlines without early lock release, failed/lost logout retry                                            | Actual Web Locks, multiple tabs, browser shutdown/network behavior and late cookie effects not proven                                                                                      |
| Lost verify               | Confirm cleanup first, block unknown-cookie attribution and refresh, require fresh OTP/login after verified sign-out; no completed-login replay assumption                                             | Orphaned backend login after a completely lost Set-Cookie response cannot be identified/revoked by a client that never received its credential; fixed backend expiry remains authoritative |
| Errors and redaction      | Backend 401/403/409/422/429/5xx, network failures, malformed/non-JSON grants, redirects and upstream secret-bearing errors become controlled results; no policy trace/log/cache operation              | Effective diagnostics, traces, parent policies, Container App logs, browser telemetry and log redaction review remain outstanding                                                          |
| Cache/redirect safety     | Exact HTTPS origins/routes, redirect:error, no-store/no-referrer; gateway forward redirects disabled; fresh responses do not copy Location/upstream cookies/diagnostic headers                         | CDN/proxy/service cache behavior and actual redirect/cookie processing unverified                                                                                                          |
| Mutation replay           | Original OW-P0-02 suite retained; concrete-adapter integration preserves serialized mutation body/identity through session refresh                                                                     | No live operational mutation performed                                                                                                                                                     |

Unit tests deliberately use `.invalid` origins and synthetic grants. None is an
approved environment configuration. No access/refresh token, OTP, real phone,
cookie value or sensitive cloud identifier is recorded as acceptance evidence.

## Acceptance run still required

After separate nonprod configuration/deployment approval, use approved synthetic
test identities and a real browser to verify all eleven acceptance items in the
user brief: OTP through APIM, secret-free JSON, actual cookie attributes, stable
refresh, revoking logout, current MANAGER admission, product isolation, hostile
origin/CSRF denial, controlled error CORS, measured cold/steady latency and
credential-free diagnostics. Include role/session revocation, duplicate/lost
responses, real multi-tab Web Locks and browser privacy settings. Record redacted
observations and timings; do not capture raw credentials in HAR/log artifacts.

No cold/steady latency is reported because no real request was authorized or
performed. A signed-in Azure CLI is not gateway acceptance or deployment approval.
