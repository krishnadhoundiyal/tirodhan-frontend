# Customer Web authentication and recovery boundary

**Production authentication and payment activation remain disabled.** Full parity workflows are implemented behind the existing acceptance gates. Issues #13/#14 require separate environment approval and real gateway/browser evidence. No flag in this application activates production login.

## Separate CUSTOMER application

No Customer Mobile, Rider Mobile or Operations Web runtime imports. The app owns CustomerSession, concrete APIM adapter and strict parsers. The adapter is an app-local adaptation of the reviewed narrow browser protocol, not a shared MANAGER implementation or a global shared-code decision. Production composes unavailableAdapter, null origin and zero protected requests.

Phone/start/resend/OTP/cookie-resume controls are implemented. The adapter requires explicit approved nonproduction gateway/browser origins, routes, CSRF and Web Locks. It accepts exactly `{access_token,token_type,expires_in,user_id}`, rejects credential-bearing extra fields/redirects/non-JSON and serializes Set-Cookie-capable operations across tabs. A UI timeout does not release a stalled underlying cookie operation; cleanup waits in order. Lost verify/logout requires confirmed revocation before another login. Raw Phase 1O auth endpoints and mobile refresh storage are never used by the browser.

Access grants live only in private memory. Admission requires matching live `/v1/auth/me` user and CUSTOMER membership. JWT decoding or MANAGER/RIDER membership cannot grant access. Concurrent 401s share one bounded refresh/re-admission; immutable business requests replay at most once. 403 does not refresh. Epoch/abort guards reject stale results, owner changes and role loss.

Logout immediately clears access/principal, aborts requests, clears private cache/forms/drafts/commands and closes checkout. Owner-bound encrypted recovery is wiped before confirmed gateway logout. Failed revocation keeps local access cleared and blocks authentication until explicit cleanup succeeds. Switching owners cannot reuse old commands/cache/coordinators; prior-owner recovery is wiped. Push delivery is locally unsubscribed on admission loss, and explicit revocation uses the approved injected port.

## Command recovery and browser storage

Business HTTP: exact HTTPS origin, Bearer, credentials omit, no-store, redirect error, no-referrer. Method/path/query allowlists reject raw auth/foreign origin/query injection. DTOs validate controlled enums, IDs, quote/policy/slot data, owner/resource echoes and financial freshness. Safe allowlisted error codes only. No credential/household/OTP/provider logging or analytics.

Only the address-free booking/payment command journal is durable: owner/command/reservation/request/attempt IDs, frozen items/quote/slot declaration body and submission/launch state. No address text, GPS, phone, OTP, access/refresh token, callback data or push subscription is stored. AES-256-GCM uses a random IV, authenticated owner and nonextractable CryptoKey stored by structured clone in IndexedDB. An exclusive owner Web Lock spans the recovery lifetime, preventing concurrent tabs from preparing independent journals. Missing secure-context/WebCrypto/IndexedDB/Web-Lock support fails closed before new hold/attempt preparation. Corruption/tampering/owner loss/write failure fail closed. This is a narrow encrypted command-storage exception; ordinary auth/personal-data browser storage remains forbidden.

Nonextractability prevents export; it does not protect against compromised same-origin JavaScript/XSS. CSP/dependency controls and real-browser security acceptance remain release requirements. Site-data clearing or explicit logout removes local recovery; backend owned history/financial reads and command reconciliation remain authoritative. No offline queue or automatic retry. Address/account-edit commands with personal text remain in memory across navigation, as their Mobile forms do; reload uncertainty needs reconciliation before replacement.

The app-local pure Mobile booking engine is adapted through browser ports. No Expo/React Native/SecureStore import. Both exact commands are durable before first hold POST. Response loss never creates replacement identity. Deterministic hold/binding reads resolve restart; uncertain submitted booking retains identity after expiry. Payment persists key before preparation and attempt/launch identity before checkout. Callbacks discard provider truth. Verification is limited to six reads and a 30-second total deadline, stopping on abort, hidden page, terminal result or error.

## Platforms, fixtures and approvals

Geolocation/notification/provider interaction requires explicit user action. Geocoder/tile/provider configuration requires approval; no hosts guessed. Web Push uses an approved subscription port, not native token endpoints. Minimal notifications invalidate owned reads; payload routes/status/payment claims are discarded. Taps open only owned collection reads or Activity. History is independent of browser permission and gated by its own absent backend capability.

Fixture code, financial controls, synthetic identities/hosts/phone/code and fake provider keys are excluded from all builds, including NODE_ENV=development with fixture flags. Fixtures run only in explicit local Vite development with injected fake HTTP/adapter, no real payments, cookies or protected services. They establish local implementation behavior, not real APIM/provider acceptance.

Still required: APIM resource/gateway/tier, distinct exact Customer/Operations origins, separate secure HttpOnly host cookies/TTL/SameSite, routes/CSRF/diagnostic redaction; real cross-product/foreign-origin/refresh/logout/multi-tab/latency acceptance; business API/CORS/retention; browser nonproduction checkout/CSP/merchant; Web Push contract/VAPID; optional map/geocoder privacy/attribution; legal/support/canonical origin/hosting approval. Existing resources and local tests are not approval. No provisioning, deployment, paid service, production credentials or live login occurred.
