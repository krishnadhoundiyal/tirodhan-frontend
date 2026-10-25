# APIM session contract — local POC candidate

**PROPOSED — NOT APPROVED. NOT DEPLOYED. Production gate remains closed.**

No concrete gateway, resource ID, browser origin, cookie name, route or CSRF
header has been approved. The checked-in environment manifest has null values
and approval false. Its rendered policy denies every request. The following
names are review proposals only; code has no enabled defaults for them:

| Item                     | PROPOSED — NOT APPROVED              |
| ------------------------ | ------------------------------------ |
| Browser OTP start        | `/web/session/otp/start`             |
| Browser OTP verify       | `/web/session/otp/verify`            |
| Browser refresh          | `/web/session/refresh`               |
| Browser logout           | `/web/session/logout`                |
| Operations cookie        | `__Host-tirodhan-operations-refresh` |
| Customer cookie          | `__Host-tirodhan-customer-refresh`   |
| Non-simple CSRF contract | `X-Tirodhan-Web-Session: 1`          |

## Required approved inputs

The policy manifest requires explicit nonprod environment and approval reference,
gateway/backend HTTPS origins, four unique web-auth paths, distinct exact HTTPS
Operations and Customer origins, distinct `__Host-` cookie names, CSRF header/value,
SameSite with justification, cookie maximum age and verified backend refresh TTL.
Effective-policy and diagnostics review are mandatory. Renderer validation rejects
missing, unsafe, wildcard, duplicate or unbounded values. No values are derived
from arbitrary request/product/role headers, guessed hostnames or Terraform names.

The separate frontend configuration contains the approved Operations origin,
gateway origin, four routes and CSRF marker; it contains no cookie credential,
refresh-token key, Azure secret or role assertion. The adapter requires Web Locks
and exact current browser origin. Only nonprod is supported by this POC factory.
`main.tsx` never imports or invokes it. Even approved-looking inputs cannot
silently activate the production composition.

## Exact upstream authority

| Browser operation | Existing FastAPI request                                                       | Browser-visible result                                                                            |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| POST start        | `/v1/auth/otp/start` `{client_request_id,phone}`                               | 202 `{challenge_reference}`                                                                       |
| POST verify       | `/v1/auth/otp/verify` `{client_login_id,challenge_reference,code}`             | 200 `{access_token,token_type,expires_in,user_id}` and only the selected product's refresh cookie |
| POST refresh      | `/v1/auth/refresh` `{refresh_token}` constructed from selected HttpOnly cookie | 200 same four-field access grant; no cookie renewal                                               |
| POST logout       | `/v1/auth/logout` `{refresh_token}` from selected cookie                       | 204 and selected cookie expiry only after backend success; no token body                          |

Browser refresh/logout bodies are empty JSON objects. Client-supplied refresh
credentials or extra properties are rejected. Exact Origin selects a cookie
from the configured two-product allowlist. A valid marker is required on all
actual operations, including login. Missing/null/foreign/lookalike origins and
wrong marker/methods are rejected before forwarding. OPTIONS explicitly allows
only POST and Content-Type plus the configured marker; it has no business effect.
Queries are rejected; no credential or arbitrary path is forwarded in a URL.
APIM neither selects MANAGER roles nor authorizes business operations.

## Cookie and response boundary

Cookies use Secure, HttpOnly, host-only (no Domain), Path=/ and an explicitly
reviewed SameSite setting. The `__Host-` prefix requires Secure and Path=/ and
prevents a Domain attribute. Strict is a proposal for a same-site deployment;
cross-site origins may require None and remain subject to browser third-party
cookie restrictions. No setting is selected without the actual domain topology.

Maximum age must not exceed the verified fixed backend session TTL. Gateway
elapsed time is deducted before issuance; refresh never slides cookie lifetime.
Expiry is not inferred from access-JWT TTL. Backend still rejects expired,
revoked or disabled sessions even if a browser retains a cookie. Invalid refresh
401 clears that product cookie. Missing-cookie logout is an idempotent local
204/expiry; malformed or duplicate cookies fail closed. Failed backend logout
does not claim revocation or discard the credential required for retry.

Success grants are strictly validated and reconstructed; refresh_token appears
only in server-side adaptation and Set-Cookie. Upstream cookies, Location,
diagnostic headers, raw errors and credential echoes are not copied. Every
constructed response uses private/no-store, Pragma no-cache and Vary Origin.
Allowed-origin errors receive explicit credentialed CORS; foreign origins are
not reflected. Gateway failures before policy execution still require actual
environment tests. The raw-auth browser guard and direct backend ingress CORS
must be reviewed so browser JavaScript cannot bypass adaptation via mobile URLs.

## Browser operation ordering and ambiguity

The concrete adapter snapshots configuration and OTP bodies. It uses credentials
only on verify/refresh/logout; start omits cookies and business transport remains
Bearer with credentials omitted. It rejects redirects, non-JSON/malformed grants,
extra credential fields and uncontrolled diagnostic details. It never reads or
stores cookies or refresh credentials in JavaScript/storage.

Cookie operations use an exclusive Web Lock shared by Operations tabs for that
gateway/product. Caller waits are bounded and cancelable. Aborting a fetch is
not treated as proof a late Set-Cookie cannot occur: an in-flight cookie operation
holds the lock through raw response/body settlement. Later logout cannot overtake
it. If delivery stalls, caller wait ends but later cookie work remains blocked
until that raw operation settles. No background retry, timer orchestrator or
parallel speculative cleanup is introduced. This liveness/security tradeoff
requires real multi-tab/browser acceptance; reload alone is not revocation proof.

Before a fresh verify, the adapter confirms cookie-backed logout of the previous
Operations session. Concurrent identical verifies coalesce; the same completed
client_login_id is never replayed. An ambiguous verify, backend 409 or failed
verification requires confirmed cleanup and a fresh OTP/login identity. The
adapter never assumes an unknown cookie belongs to that OTP attempt or silently
refreshes it to establish a principal. Backend completed-login replay cannot
recover credentials. Stable refresh can be retried after ordinary delivery loss;
if the caller deadline/cancellation makes cookie ordering uncertain, confirmed
logout is required before another login. Failed logout stays blocked until a
confirmed idempotent retry.

ManagerSession still verifies `/v1/auth/me`, coordinates GET/POST 401 refresh,
preserves original mutation body/identity, rejects owner changes and never
refreshes 403. Session/token/query/command state is cleared on logout/account
change. None of the OW-P0-02 mutation contracts or coordinator logic is changed.
