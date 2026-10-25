# OW-P0-03 implementation report

Completed local implementation/validation October 25, 2026 (Asia/Calcutta).
**Real APIM acceptance remains NOT PROVEN. Production login remains unavailable.**

## Git and scope

Branch: `codex/operations-web-apim-session-poc`, created from verified merged
OW-P0-02 `origin/main` at `14368b5df7e3305242927a6d49d7dc0444729743`.
The foundation and manager-command commits remain in ancestry. No merge/rebase,
backend edit, mobile edit, dependency change or cloud deployment was performed.
The implementation commit SHA is recorded in the delivery message/Git history.

Backend stayed clean at `b281e03a47d202fd8b5c3d895075aa358062c5fa` after read-only
contract/infrastructure inspection. Local main stays at the starting merge.
All OW-P0-02 command DTOs, transport behavior, coordinator, views and tests are
unchanged. The only edit to existing session code is its outdated comment.

## Implemented locally

- Concrete Operations `WebSessionAdapter`, with explicit approved nonprod
  configuration, exact HTTPS/browser-origin/path validation, non-simple CSRF
  marker, strict response decoders, memory-only grants, bounded caller waits,
  preserved OTP identities and snapshotted inputs.
- Cookie operations serialized with a required Web Locks interface, including
  late-response ordering. Lost verification does not assume backend login replay
  or attribute an unknown cookie to an OTP. Confirmed cleanup and a fresh attempt
  are required. Failed/logout delivery loss retains the revocation retry path.
- Versioned candidate APIM policy, raw-mobile-auth browser guard, renderer,
  environment manifest, exact C# expression source, local executable expression
  tests and XML/static/configuration tests under `infra/apim/web-session/`.
- Exact Origin selects isolated host cookies; strict validation/credential
  stripping, cookie lifetime/expiry, empty browser refresh/logout requests,
  fixed upstream Phase 1O routes, controlled errors/CORS, no redirects/retries/
  caching/logging operations, and fresh response/header construction.
- CI now watches this branch and the policy directory, retaining all original
  quality checks and adding local policy/configuration/XML/expression tests.
  No CI step authenticates to Azure, provisions or deploys anything.
- All four requested documents plus updated foundation gate/readme material.

The checked-in environment configuration is explicitly unapproved with null
gateway/origin/path/cookie/CSRF/lifetime values. The generated policy denies all
requests. Proposed names exist only in clearly labelled design documentation.
`main.tsx` still uses unavailableAdapter and never imports the concrete POC
adapter. Flags, a URL, local tests or compiled artifacts cannot enable login.

## Automatically tested

| Check                                                                      | Result                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| pnpm 11.25.0 frozen-lockfile installation                                  | Passed; already up to date; strict release-age/security policy retained |
| Operations TypeScript                                                      | Passed                                                                  |
| Operations ESLint, no warnings permitted                                   | Passed                                                                  |
| Operations/policy/docs/workflow formatting                                 | Passed                                                                  |
| Full Operations Jest suite, including OW-P0-01/02 regressions              | 164 tests in 6 suites passed                                            |
| Node policy renderer/configuration tests                                   | 22 passed                                                               |
| Exact embedded C# policy expression bodies, C# 7.3/.NET 8                  | 87 assertions passed                                                    |
| XML well-formedness/source embedding/forwarding/error/gate checks          | Passed                                                                  |
| Build with NODE_ENV=development and preview=true                           | Passed; fixture exclusion passed                                        |
| Production build with preview, gateway-origin and all capability flags set | Passed; fixture exclusion passed                                        |
| Protected mobile/dependency/main-composition/manager-command diff          | No changes                                                              |
| Backend working tree                                                       | Clean                                                                   |

Production JS is 301.62 kB / 89.81 kB gzip and retains the OW-P0-02 bundle hash
`index-BnnBewcZ.js`; the uncomposed adapter is not in the runtime bundle.
Vite retains the existing nonfatal TanStack use-client notices; the deliberately
development-NODE_ENV build retains the >500 kB development React warning. No
warning, doctor, package/security or CI validation was disabled.

The affected application is Operations Web; its full existing regressions run.
No mobile/shared dependency/source change justifies a new native build, mobile
release or device claim. No EAS build or paid service was invoked. Local build
logs and generated harness/build/cache artifacts remain ignored under `.local/`.

## Verified against real APIM

**None.** Azure CLI account metadata reported Enabled/AzureCloud, but both
read-only APIM inventory commands failed with ConnectionResetError 10054. No
gateway policy, resource/tier, login, real cookie, backend session, diagnostics
or latency was verified. No cloud resource absence is inferred from that failure.
The human also confirmed that no discovered resource would be approved by default.

Microsoft documentation supports the proposed Consumption transformation
primitives; it does not prove this policy's full gateway execution. The local
harness runs the actual expression bodies, not Azure's context wrappers or
pipeline. XML/configuration checks and mock browser interfaces do not replace
real-browser/APIM acceptance. See the findings and security report for sources,
exact test boundaries and the inventory error.

## Not verified / exact acceptance blockers

1. Approved nonprod subscription/resource group/APIM gateway, actual tier and
   deployment identity/permissions. There is no approved target or successful
   resource inventory, and no deployment is authorized.
2. Approved exact Operations/Customer browser origins, gateway/backend origins,
   four web-auth routes/OPTIONS operations, separate host cookie names, CSRF
   marker and SameSite/domain-topology decision. All are still unapproved.
3. Verified backend fixed refresh TTL and cookie age, effective API/parent policy
   composition, required throttling/backend controls, direct-ingress/raw-mobile-
   route browser boundary, and diagnostics/trace/cache/redaction review.
4. Approved nonproduction test identities/OTP-provider access and an explicitly
   authorized policy deployment/testing run. No production credentials may be
   substituted.
5. Real browser evidence for secret-free JSON, actual cookie flags/expiry,
   refresh/revoking logout, live MANAGER/role/session revocation, cross-product
   isolation, hostile origins/CSRF, nonopaque errors, multiple tabs/Web Locks,
   cancellation/lost response ordering and privacy/third-party cookie behavior.
6. Measured cold/steady APIM latency and redacted real diagnostics evidence.

If a verification response is wholly lost before its credential reaches the
browser, that orphaned server session cannot be identified by this client; the
backend's fixed expiry remains authoritative. No new credential recovery model
was invented. If a raw cookie-capable fetch stalls, finite UI waits end while
the serialization barrier stays closed; logout must not race a late cookie.
These limits are explicit real-environment acceptance items, not claimed fixes.

## Changed files

Existing files: `.github/workflows/operations-web.yml`,
`apps/operations-web/README.md`, `apps/operations-web/src/auth/session.ts`
(comment only), `docs/OPERATIONS_WEB_AUTH_POC_REQUIREMENTS.md`.

New application files: `apps/operations-web/src/auth/apim-adapter.ts`,
`apps/operations-web/src/test/apim-adapter.test.ts`.

New documents: `docs/OPERATIONS_WEB_APIM_POC_FINDINGS.md`,
`docs/OPERATIONS_WEB_APIM_SESSION_CONTRACT.md`,
`docs/OPERATIONS_WEB_APIM_SECURITY_TEST_REPORT.md`, this report.

New policy/test files under `infra/apim/web-session/`: `README.md`,
`configuration.unapproved.json`, `policy.xml`, `raw-auth-browser-guard.xml`,
`render.mjs`, `render.test.mjs`, `validate.py`, `expressions/admit.cs`,
`expressions/shape.cs`, `tests/.gitignore`, `tests/Directory.Build.props`,
`tests/NuGet.Config`, `tests/PolicyExpressions.csproj`, `tests/Program.cs`.

No PR creation, main merge, infrastructure deployment or production activation
is part of this delivery. Push is authorized only to the specified POC branch.
