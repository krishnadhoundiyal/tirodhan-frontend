# Customer Mobile backend contracts

Canonical handoff · reverified 2026-10-09 against backend remote main `afa140012db29ec0e83c25f3ff378765a7fe7b88`. Read-only route/model inspection and complete commit comparisons confirm unchanged application API/domain contracts from review revision `4994089a0bd5f7317bba1ab49cdfb8d4cec0241a` and the prior verification. Local backend checkout C:\Users\91956\Tirodhan\tirodhan remains unchanged at `302c272d902b0adedb2cbf5b0a965f23c3f07673`; no fetch, checkout or backend write was performed. Sources: src/tirodhan/api/routes/{auth,addresses,serviceability,collection_requests,payments}.py; dependencies; customer, collection, payment/refund services and relevant ADRs. Examples are invented nonproduction data. PROPOSED does not mean currently implemented.

## Activation and status

EXISTING paths/bodies remain compatible, including temporary Idempotency-Key adaptation. PROPOSED typed clients, concrete repositories and screens are disabled before HTTP until the deployed backend supports them. EXPO_PUBLIC_CUSTOMER_CAPABILITIES is a comma-separated deployment manifest: principal,catalogue,slots,collections,recommendations,payment,checkout,refunds,push,notifications,profile,preferences,content,favourites,paymentMethods,feedback,cancellationCompensation. Enable only verified deployed capabilities. This is not authorization; the backend independently enforces authenticated identity, active roles and resource ownership. Cancellation requires the compensation enhancement below, not merely the existing cancel route.

## Common field, cache, error and command semantics

HTTPS in release; JSON UTF-8; Accept application/json; Bearer protected requests, no cookie/URL credential. Required response fields always present. Nullable fields explicitly null; optional request fields may be omitted. In exact TypeScript schema below, ? means optional and | null means nullable. IDs UUID unless specified as category code, event id, slot id or cursor. All timestamps RFC3339 with timezone (UTC preferred), intervals start-inclusive/end-exclusive and start<end. Strings plain text, never executable markup. Integers finite and safely represented. Money nonnegative integer minor units, uppercase ISO currency; INR MVP uses100 minor units/rupee. Display formatting is not client pricing.

Read commands have no side effects/idempotency keys. Proposed writes with client_request_id use UUID scoped by authenticated customer + operation; identical body/id replays original durable result, changed body/same ID409. Publish configured retention before release. Replay precedes optimistic-version comparison; expected_version>=1 avoids lost updates under concurrent distinct commands. Device PUT naturally idempotent by installation. Legacy header keys generated once per PreparedCommand and reused on user retry and401 replay. No durable command queue or generic replay engine. Mutations never auto-retry; network/timeout/protocol ambiguity retains prepared command.

Private/no-store prevents shared intermediary caching; frontend private memory query freshness30 seconds, catalogue/content300 seconds, unsettled payment10-second/refund20-second polls. No disk persistence for personal API data. Signed asset expiry shortens cache TTL. Protected query keys include owner. Logout/account switch cancels/clears queries, resets principal/draft/GPS/notification generations. Ordinary commands use targeted invalidation.

Errors:401 invalid/missing/revoked credentials (one shared refresh/replay, except principal401 directly revokes),403 authenticated forbidden never refreshes,404 safely missing/non-owned,409 conflict/eligibility,422 schema,429 rate limit,503 required runtime unavailable. Existing FastAPI detail strings are neither parsed nor rendered. Proposed safe envelope:

```json
{ "error": { "code": "PLANNING_STARTED" } }
```

Allowed frontend codes: PLANNING_CUTOFF_REACHED,PLANNING_STARTED,SERVICEABILITY_EXPIRED,SERVICEABILITY_UNSERVICEABLE,SLOT_UNAVAILABLE,VERSION_CONFLICT,NOT_ELIGIBLE,CURSOR_EXPIRED. Unknown code uses generic status copy. No raw SQL/provider/exception text or credentials in UI/logs. An existing unstructured409 does not prove cutoff. Malformed successful JSON is protocol failure;204 never decodes JSON. Cancellation and timeout remain separate failures.

## Existing route inventory

| Capability                            | Method/path                                                                         | Status   | Consumer                             |
| ------------------------------------- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| OTP start                             | POST /v1/auth/otp/start                                                             | EXISTING | Login                                |
| OTP verify                            | POST /v1/auth/otp/verify                                                            | EXISTING | OTP                                  |
| Session refresh                       | POST /v1/auth/refresh                                                               | EXISTING | Bootstrap / bounded 401 replay       |
| Logout                                | POST /v1/auth/logout                                                                | EXISTING | Account                              |
| Owned active addresses                | GET /v1/addresses                                                                   | EXISTING | Address selection                    |
| Create saved address                  | POST /v1/addresses                                                                  | EXISTING | Address form                         |
| Edit saved address                    | PUT /v1/addresses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa                              | EXISTING | Address form                         |
| Archive saved address                 | POST /v1/addresses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive                     | EXISTING | Address form                         |
| Create serviceability context         | POST /v1/serviceability/contexts                                                    | EXISTING | Review                               |
| Read persisted serviceability         | GET /v1/serviceability/contexts/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb                | EXISTING | Review polling                       |
| Create collection and logical payment | POST /v1/collection-requests                                                        | EXISTING | Review confirm                       |
| Customer cancellation                 | POST /v1/collection-requests/11111111-1111-4111-8111-111111111111/cancel            | EXISTING | Collection details destructive modal |
| Initiate payment attempt              | POST /v1/payments/collection-requests/11111111-1111-4111-8111-111111111111/attempts | EXISTING | Future native checkout coordinator   |

### otp-start

Status: EXISTING · Capability: OTP start · Consumer: Login

`POST /v1/auth/otp/start`

Authentication: Public. Success: 202.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "phone": "+919999999999"
}
```

Response:

```json
{
  "challenge_reference": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
}
```

Idempotency/concurrency: Body UUID client_request_id; repeated same start intent reuses challenge while eligible. Explicit resend is a new intent.

Errors: 409 in progress/conflict;422 input;429 rate limit;503 provider/configuration.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Phone/OTP/provider response never logged or stored. Server-owned challenge reference.

### otp-verify

Status: EXISTING · Capability: OTP verify · Consumer: OTP

`POST /v1/auth/otp/verify`

Authentication: Public. Success: 200.

Request:

```json
{
  "client_login_id": "11111111-1111-4111-8111-111111111111",
  "challenge_reference": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "code": "123456"
}
```

Response:

```json
{
  "access_token": "REDACTED-example",
  "token_type": "bearer",
  "expires_in": 60,
  "user_id": "11111111-1111-4111-8111-111111111111",
  "refresh_token": "REDACTED-example-refresh"
}
```

Idempotency/concurrency: Body UUID client_login_id per verify command; credential replay is deliberately unavailable after committed login.

Errors: 401 invalid/denied;409 conflict/login replay unavailable;422 input;429;503.

Pagination, sort, cache, privacy and frontend behavior: Access token in memory; refresh only OS SecureStore. expires_in controls renewal. Successful credentials remain successful if proposed principal read temporarily fails.

### refresh

Status: EXISTING · Capability: Session refresh · Consumer: Bootstrap / bounded 401 replay

`POST /v1/auth/refresh`

Authentication: Refresh credential; no bearer. Success: 200.

Request:

```json
{
  "refresh_token": "REDACTED-example-refresh"
}
```

Response:

```json
{
  "access_token": "REDACTED-example",
  "token_type": "bearer",
  "expires_in": 60,
  "user_id": "11111111-1111-4111-8111-111111111111"
}
```

Idempotency/concurrency: No new command key; single shared refresh flight; no rotating refresh token in this verified response.

Errors: 401 invalid/revoked;503 unavailable/configuration.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Late result after logout cannot resurrect session. Refresh failure clears local credentials and customer state.

### logout

Status: EXISTING · Capability: Logout · Consumer: Account

`POST /v1/auth/logout`

Authentication: Refresh credential; no bearer. Success: 204.

Request:

```json
{
  "refresh_token": "REDACTED-example-refresh"
}
```

Response:

204, no body

Idempotency/concurrency: Repeated revocation is safe. Local cleanup runs in finally even after transport failure.

Errors: 422 malformed body; infrastructure failures generic.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Clear memory/secure credential/query cache/principal/draft/GPS/notification token and callbacks. Push revocation enhancement is PROPOSED.

### addresses-list

Status: EXISTING · Capability: Owned active addresses · Consumer: Address selection

`GET /v1/addresses`

Authentication: Bearer CUSTOMER. Success: 200.

Request:

None

Response:

```json
[
  {
    "address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "label": "Home",
    "address": "Example household address, Green Park, New Delhi",
    "location": null,
    "status": "ACTIVE",
    "is_default": true,
    "version": 1
  }
]
```

Idempotency/concurrency: Read-only; no key.

Errors: 401/403;503 protection/runtime.

Pagination, sort, cache, privacy and frontend behavior: No pagination. Verified service sorts created_at ASC, address_id ASC. ACTIVE only. Private in-memory query; no disk persistence.

### addresses-create

Status: EXISTING · Capability: Create saved address · Consumer: Address form

`POST /v1/addresses`

Authentication: Bearer CUSTOMER. Success: 201.

Request:

```json
{
  "address": "Example household address, Green Park, New Delhi",
  "label": "Home",
  "location": null,
  "is_default": true
}
```

Response:

```json
{
  "address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "label": "Home",
  "address": "Example household address, Green Park, New Delhi",
  "location": null,
  "status": "ACTIVE",
  "is_default": true,
  "version": 1
}
```

Idempotency/concurrency: Required temporary Idempotency-Key header (1..200); prepare once and reuse through ambiguity/401.

Errors: 401/403;409 key/default/in-progress conflicts;422 invalid;503 configuration.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Address1..2000, label optional nullable <=80, pin optional nullable bounds90/180, is_default optional backend defaultfalse (client sends boolean). Default uniqueness enforced by server.

### addresses-update

Status: EXISTING · Capability: Edit saved address · Consumer: Address form

`PUT /v1/addresses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`

Authentication: Bearer CUSTOMER. Success: 200.

Request:

```json
{
  "address": "Example household address, Green Park, New Delhi",
  "label": "Home",
  "location": null,
  "is_default": true,
  "expected_version": 1
}
```

Response:

```json
{
  "address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "label": "Home",
  "address": "Example household address, Green Park, New Delhi",
  "location": null,
  "status": "ACTIVE",
  "is_default": true,
  "version": 2
}
```

Idempotency/concurrency: Temporary Idempotency-Key; required expected_version integer >=1, replay same command/body.

Errors: 401/403;404 missing/not-owned;409 version/key/default;422;503.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Invalidate addresses; edited pin/version invalidates draft distance confirmation and serviceability context. Never overwrite conflict silently.

### addresses-archive

Status: EXISTING · Capability: Archive saved address · Consumer: Address form

`POST /v1/addresses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive`

Authentication: Bearer CUSTOMER. Success: 200.

Request:

No body

Response:

```json
{
  "address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "label": "Home",
  "address": "Example household address, Green Park, New Delhi",
  "location": null,
  "status": "ARCHIVED",
  "is_default": false,
  "version": 1
}
```

Idempotency/concurrency: Temporary Idempotency-Key; prepare once; clear selected/draft archived address on success.

Errors: 401/403;404;409;422 header;503.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Historical immutable collection address remains unaffected.

### serviceability-create

Status: EXISTING · Capability: Create serviceability context · Consumer: Review

`POST /v1/serviceability/contexts`

Authentication: Bearer CUSTOMER. Success: 201.

Request:

```json
{
  "source_address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

Response:

```json
{
  "serviceability_context_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "source_address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "source_address_version": 1,
  "status": "PENDING",
  "cell_id": null,
  "failure_code": null,
  "expires_at": "2026-10-08T05:15:00Z",
  "resolved_at": null
}
```

Idempotency/concurrency: Temporary Idempotency-Key; reuse same address/version intent until expiry; changed/expired address check new intent.

Errors: 401/403;404 source missing/not-owned;409 invalid/in-progress/key;422 shape/header;503 protection/config.

Pagination, sort, cache, privacy and frontend behavior: Exactly one source_address_id or address (1..2000), optional nullable location. PENDING normally resolves asynchronously; frontend never sends or derives cell_id. expiry/resolved_at server-owned.

### serviceability-read

Status: EXISTING · Capability: Read persisted serviceability · Consumer: Review polling

`GET /v1/serviceability/contexts/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`

Authentication: Bearer CUSTOMER. Success: 200.

Request:

None

Response:

```json
{
  "serviceability_context_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "source_address_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "source_address_version": 1,
  "status": "SERVICEABLE",
  "cell_id": "example-server-cell",
  "failure_code": null,
  "expires_at": "2026-10-08T05:15:00Z",
  "resolved_at": "2026-10-08T05:00:00Z"
}
```

Idempotency/concurrency: Read-only; no key and GET does not trigger provider resolution.

Errors: 401/403;404 context missing/not-owned;422 path;503 infrastructure.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Poll PENDING every3s until expiry/terminal. Match exact saved source id/version; UNSERVICEABLE distinct from TECHNICAL_FAILURE. Do not expose/log precise GPS, failure detail or cell_id.

### collection-create

Status: EXISTING · Capability: Create collection and logical payment · Consumer: Review confirm

`POST /v1/collection-requests`

Authentication: Bearer CUSTOMER. Success: 201.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "serviceability_context_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "slot_start": "2026-10-10T04:30:00Z",
  "slot_end": "2026-10-10T05:00:00Z",
  "items": [
    {
      "item_category_code": "FLOWERS",
      "declared_quantity": null,
      "declared_weight_grams": 500
    }
  ]
}
```

Response:

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "status": "PENDING_PAYMENT",
  "quoted_amount_minor": 35000,
  "currency": "INR",
  "payment_expires_at": "2026-10-08T05:15:00Z",
  "payment_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "items": [
    {
      "request_item_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "item_category_code": "FLOWERS",
      "declared_quantity": null,
      "declared_weight_grams": 500,
      "quoted_line_amount_minor": 35000,
      "currency": "INR",
      "pricing_rule_version": "example-rule-v1"
    }
  ]
}
```

Idempotency/concurrency: Body UUID client_request_id; NO temporary header. Retry exact body/id after ambiguous result; protect draft from changes during uncertainty.

Errors: 401/403;409 context/eligibility/input/pricing/key/in-progress conflicts;422 validation;503 required runtime.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Nonempty items, code1..100, nullable optional positive integer declarations. Timezone-aware interval start<end. Quote/payment expire server-owned. Current backend lacks authoritative slot read/revalidation enhancement; do not fabricate catalogue/slots/prices.

### collection-cancel

Status: EXISTING · Capability: Customer cancellation · Consumer: Collection details destructive modal

`POST /v1/collection-requests/11111111-1111-4111-8111-111111111111/cancel`

Authentication: Bearer CUSTOMER. Success: 200.

Request:

No body

Response:

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "status": "CANCELLED",
  "quoted_amount_minor": 35000,
  "currency": "INR",
  "payment_expires_at": "2026-10-08T05:15:00Z",
  "payment_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "items": [
    {
      "request_item_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "item_category_code": "FLOWERS",
      "declared_quantity": null,
      "declared_weight_grams": 500,
      "quoted_line_amount_minor": 35000,
      "currency": "INR",
      "pricing_rule_version": "example-rule-v1"
    }
  ]
}
```

Idempotency/concurrency: Temporary Idempotency-Key. Same prepared command retry; repeated cancelled request safe.

Errors: 400 missing header;401/403;404;409 planning/cutoff/key conflicts;422 UUID;503 configuration.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. Existing backend locks planning freeze and reloads request to resolve race; only ACCEPTED before cutoff. Current implementation does NOT create refund intent. Production UI additionally requires cancellationCompensation gate and the enhancement below.

### payment-attempt

Status: EXISTING · Capability: Initiate payment attempt · Consumer: Future native checkout coordinator

`POST /v1/payments/collection-requests/11111111-1111-4111-8111-111111111111/attempts`

Authentication: Bearer CUSTOMER. Success: 201.

Request:

No body

Response:

```json
{
  "payment_attempt_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
  "status": "CREATED",
  "provider": "RAZORPAY",
  "provider_order_id": "order_example",
  "provider_payment_id": null,
  "failure_code": null
}
```

Idempotency/concurrency: Temporary Idempotency-Key; exact prepared attempt retry. A new attempt requires authoritative retry_allowed.

Errors: 401/403;409 no eligible owned pending payment/conflict;422 path/header;503 provider/config.

Pagination, sort, cache, privacy and frontend behavior: No pagination/cache. This result alone lacks coherent native public checkout config. No Razorpay SDK initialized; never call provider webhook from mobile. Provider callback/return/timeout does not accept collection.

## Proposed route inventory

| Capability                                     | Method/path                                                                                  | Gate            | Status   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------- | -------- |
| Current principal                              | GET /v1/auth/me                                                                              | principal       | PROPOSED |
| Authoritative collection catalogue             | GET /v1/customer/collection-catalogue                                                        | catalogue       | PROPOSED |
| Pickup slot availability                       | GET /v1/customer/pickup-slots?serviceability_context_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb | slots           | PROPOSED |
| Active and historical collections              | GET /v1/customer/collection-requests?view=active&limit=20                                    | collections     | PROPOSED |
| Owned collection detail                        | GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111                    | collections     | PROPOSED |
| Prior-collection category recommendations      | GET /v1/customer/recommendations/collection-categories                                       | recommendations | PROPOSED |
| Authoritative payment status                   | GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111/payment            | payment         | PROPOSED |
| Coherent native checkout parameters            | GET /v1/customer/payment-attempts/{payment_attempt_id}/checkout                              | checkout        | PROPOSED |
| Independent refund progress                    | GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111/refunds            | refunds         | PROPOSED |
| Register or rotate native customer push device | PUT /v1/customer/me/push-devices/11111111-1111-4111-8111-111111111111                        | push            | PROPOSED |
| Revoke customer push installation              | DELETE /v1/customer/me/push-devices/11111111-1111-4111-8111-111111111111                     | push            | PROPOSED |
| Customer notification history                  | GET /v1/customer/notifications?limit=20                                                      | notifications   | PROPOSED |
| Minimal customer profile                       | GET /v1/customer/me/profile                                                                  | profile         | PROPOSED |
| Update profile                                 | PUT /v1/customer/me/profile                                                                  | profile         | PROPOSED |
| Minimal service preferences                    | GET /v1/customer/me/preferences                                                              | preferences     | PROPOSED |
| Update service preferences                     | PUT /v1/customer/me/preferences                                                              | preferences     | PROPOSED |
| Favourite category codes                       | GET /v1/customer/me/favourite-categories                                                     | favourites      | PROPOSED |
| Update favourite categories                    | PUT /v1/customer/me/favourite-categories                                                     | favourites      | PROPOSED |
| Approved service and legal content             | GET /v1/content/{slug}                                                                       | content         | PROPOSED |
| Available provider checkout methods            | GET /v1/customer/payment-methods                                                             | paymentMethods  | PROPOSED |
| Submit bounded service feedback                | POST /v1/customer/feedback                                                                   | feedback        | PROPOSED |

### principal

Status: PROPOSED · Capability: Current principal · Consumer: All product route guards · Gate: `principal`

`GET /v1/auth/me`

Authentication: Bearer authenticated active user; CUSTOMER is not required to discover own current roles. Success: 200.

Request:

None

Response:

```json
{
  "user_id": "11111111-1111-4111-8111-111111111111",
  "roles": ["CUSTOMER"]
}
```

Pagination, sorting and caching: No pagination/order. No-store; reload on login/refresh and explicit retry.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid credential;403 inactive identity;429;503. Own roles may be returned without CUSTOMER.

Frontend behavior: Authoritative current identity and active roles, never JWT decoding. 401 invalidates session without refresh recursion. Transient failures retain credentials and show admission retry. Non-CUSTOMER yields forbidden.

Backend external requirements and privacy: Roles are exact uppercase role codes. user_id must match the authenticated token/session subject. Never return phone, secrets or provider identities.

### catalogue

Status: PROPOSED · Capability: Authoritative collection catalogue · Consumer: Home / Review / item selector / Favourites · Gate: `catalogue`

`GET /v1/customer/collection-catalogue`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "version": "2026-10-1",
  "groups": [
    {
      "group_code": "FLORAL",
      "display_name": "Floral & organic offerings",
      "display_order": 1,
      "active": true
    }
  ],
  "categories": [
    {
      "category_code": "FLOWERS",
      "group_code": "FLORAL",
      "display_name": "Used Flowers & Garlands",
      "description": "Fresh and dried flowers, garlands and petals",
      "display_order": 1,
      "active": true,
      "image": {
        "url": "https://assets.example.tirodhan.in/catalogue/flowers.webp",
        "thumbnail_url": "https://assets.example.tirodhan.in/catalogue/flowers-thumb.webp",
        "width": 640,
        "height": 360,
        "alt_text": "Used flowers and garlands",
        "blurhash": null,
        "expires_at": null
      },
      "thumbnail": {
        "url": "https://assets.example.tirodhan.in/catalogue/flowers.webp",
        "thumbnail_url": "https://assets.example.tirodhan.in/catalogue/flowers-thumb.webp",
        "width": 640,
        "height": 360,
        "alt_text": "Used flowers and garlands",
        "blurhash": null,
        "expires_at": null
      },
      "handling_hints": "Pack separately",
      "input": {
        "quantity": "NONE",
        "weight_grams": "OPTIONAL"
      }
    }
  ],
  "quick_categories": [
    {
      "category_code": "FLOWERS",
      "label": "Flowers",
      "display_order": 1
    }
  ],
  "artwork": {
    "hero": {
      "url": "https://assets.example.tirodhan.in/catalogue/flowers.webp",
      "thumbnail_url": "https://assets.example.tirodhan.in/catalogue/flowers-thumb.webp",
      "width": 640,
      "height": 360,
      "alt_text": "Used flowers and garlands",
      "blurhash": null,
      "expires_at": null
    },
    "home": null,
    "rickshaw": null,
    "receiving_point": null
  }
}
```

Pagination, sorting and caching: Complete bounded catalogue; no pagination. Order group/category by display_order then code; quick by display_order then code. Private cache max 300 seconds, frontend staleTime 300 seconds.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Select only active known server category codes; inputs follow explicit capabilities. Loading skeleton, safe error/retry, stable remote-media fallback. Signed URL expiry limits freshness below normal cache TTL.

Backend external requirements and privacy: Taxonomy remains server owned. Existing development codes are editorial fixtures only. No frontend price, handling eligibility or legal acceptance is inferred from illustrations. Every category group reference must exist. Serve safe Blob/CDN metadata per remote media section.

### slots

Status: PROPOSED · Capability: Pickup slot availability · Consumer: Review · Gate: `slots`

`GET /v1/customer/pickup-slots?serviceability_context_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Query: serviceability_context_id UUID required.

Response:

```json
{
  "serviceability_context_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "expires_at": "2026-10-08T05:15:00Z",
  "slots": [
    {
      "slot_id": "delhi-20261010-am-1",
      "start": "2026-10-10T04:30:00Z",
      "end": "2026-10-10T05:00:00Z",
      "label": "10 Oct · 10:00–10:30 AM",
      "availability": "AVAILABLE"
    }
  ]
}
```

Pagination, sorting and caching: No pagination. Chronological start/end then slot_id. Private no-store; context-bound TTL must not exceed context expiry.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 expired/ineligible context or CURSOR_EXPIRED.

Frontend behavior: Read only after matching source address/version is SERVICEABLE and unexpired. Display AVAILABLE/FULL; never create slot times. Reset selection on context change. Expired or unavailable slots block booking.

Backend external requirements and privacy: Reject non-owned context with 404; PENDING/unserviceable/expired with 409 safe code; return expires_at. Collection create must revalidate context address/version, expiry and actual available exact slot interval under concurrency. This required enhancement does not change the existing create body.

### collections

Status: PROPOSED · Capability: Active and historical collections · Consumer: Home / Activity / Bookings · Gate: `collections`

`GET /v1/customer/collection-requests?view=active&limit=20`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Query view active|history required; limit integer 1..50 default 20; optional opaque cursor.

Response:

```json
{
  "items": [
    {
      "request_id": "11111111-1111-4111-8111-111111111111",
      "status": "ACCEPTED",
      "title": "Collection scheduled",
      "slot": {
        "start": "2026-10-10T04:30:00Z",
        "end": "2026-10-10T05:00:00Z",
        "label": "10 Oct · 10:00–10:30 AM"
      },
      "address_summary": "Green Park · New Delhi",
      "category_codes": ["FLOWERS"],
      "image": null,
      "journey_status": "BOOKED",
      "refund_status": null,
      "created_at": "2026-10-08T04:45:00Z",
      "updated_at": "2026-10-08T05:00:00Z"
    }
  ],
  "next_cursor": null
}
```

Pagination, sorting and caching: Private no-store. Stable newest-first created_at DESC, request_id DESC. Cursor bound to owner/view/filter and a stable snapshot boundary; end is null. Page limit counts rows, not groups.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 expired/ineligible context or CURSOR_EXPIRED.

Frontend behavior: Infinite pages with duplicate-id suppression, explicit load-more and pull-refresh. A next-page 409 CURSOR_EXPIRED discards the complete old chain and restarts from the first page; network/5xx failure retains its cursor for ordinary retry. Active vs History segments share ownership-keyed reads; Home displays an active summary. Never synthesize records from local create responses.

Backend external requirements and privacy: Active contains PENDING_PAYMENT, ACCEPTED, PRE_PLANNING, PLANNED; history CANCELLED, COMPLETED, EXPIRED. Empty success is items [], next_cursor null. Expired cursor returns 409 CURSOR_EXPIRED; refresh from first page. No full address or GPS in summary.

### detail

Status: PROPOSED · Capability: Owned collection detail · Consumer: Collection details / notification destination · Gate: `collections`

`GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Path request_id UUID; no body.

Response:

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "status": "ACCEPTED",
  "title": "Collection scheduled",
  "slot": {
    "start": "2026-10-10T04:30:00Z",
    "end": "2026-10-10T05:00:00Z",
    "label": "10 Oct · 10:00–10:30 AM"
  },
  "address_summary": "Green Park · New Delhi",
  "category_codes": ["FLOWERS"],
  "image": null,
  "journey_status": "BOOKED",
  "refund_status": null,
  "created_at": "2026-10-08T04:45:00Z",
  "updated_at": "2026-10-08T05:00:00Z",
  "address": {
    "label": "Home",
    "text": "Example household address, Green Park, New Delhi"
  },
  "items": [
    {
      "category_code": "FLOWERS",
      "display_name": "Used Flowers & Garlands",
      "declared_quantity": null,
      "declared_weight_grams": 500,
      "quoted_line_amount_minor": 35000,
      "image": {
        "url": "https://assets.example.tirodhan.in/catalogue/flowers.webp",
        "thumbnail_url": "https://assets.example.tirodhan.in/catalogue/flowers-thumb.webp",
        "width": 640,
        "height": 360,
        "alt_text": "Used flowers and garlands",
        "blurhash": null,
        "expires_at": null
      }
    }
  ],
  "quote": {
    "amount_minor": 35000,
    "currency": "INR"
  },
  "payment": {
    "payment_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "request_id": "11111111-1111-4111-8111-111111111111",
    "amount_minor": 35000,
    "currency": "INR",
    "status": "SUCCEEDED",
    "retry_allowed": false,
    "expires_at": null,
    "succeeded_at": "2026-10-08T05:00:00Z",
    "current_attempt": null
  },
  "cancellation": {
    "allowed": true,
    "cutoff_at": "2026-10-10T02:30:00Z",
    "reason": null,
    "refund_expectation": "FULL_PAYMENT"
  },
  "journey": {
    "request_id": "11111111-1111-4111-8111-111111111111",
    "milestones": [
      {
        "code": "BOOKED",
        "state": "COMPLETE",
        "occurred_at": "2026-10-08T05:00:00Z",
        "label": "Booked",
        "detail": null,
        "image": null
      },
      {
        "code": "COLLECTED",
        "state": "CURRENT",
        "occurred_at": null,
        "label": "Collected by Tirodhan",
        "detail": "Human-powered collection",
        "image": null
      },
      {
        "code": "RECEIVED",
        "state": "UPCOMING",
        "occurred_at": null,
        "label": "Authorised receiving point",
        "detail": null,
        "image": null
      },
      {
        "code": "HANDOVER_VALIDATED",
        "state": "UPCOMING",
        "occurred_at": null,
        "label": "Handover validated",
        "detail": null,
        "image": null
      }
    ],
    "receiving_point": null,
    "handover": {
      "state": "NOT_RECORDED",
      "recorded_at": null,
      "validated_at": null
    }
  },
  "refunds": [],
  "cancelled_at": null,
  "completed_at": null
}
```

Pagination, sorting and caching: No pagination. Private no-store. Items stable booking order; refunds initiated_at ASC then refund_id.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Load/pull-refresh the owned booking projection. Address is immutable booking snapshot. Display quote and authoritative cancellation eligibility. Destructive cancellation UI requires both cancellation.allowed=true and the cancellationCompensation deployment capability; the repository gate remains mandatory. Seed independent payment/refund query caches from this initial detail snapshot, then retain their normal freshness, polling and refetch behavior. 403/404 safe unavailable state; never expose another owner.

Backend external requirements and privacy: Return one internally coherent projection, including financial and journey versions of recorded truth at read time. Quote/items remain immutable financial facts. Never re-read a changed live saved address into a historical booking. No precise GPS/internal cell/charge secrets.

### Journey projection within detail

V1 returns `journey: JourneyDto` inside `CollectionDetail`; there is no standalone journey endpoint or deployment capability. Collection detail refresh, native resume and push invalidation already refresh the complete owned projection. Independent journey polling has no current consumer.

Milestones are ordered BOOKED, COLLECTED, RECEIVED, HANDOVER_VALIDATED. Completed steps use only recorded timestamps; upcoming steps have no completed timestamps. The sequence is home → human-powered collection → designated government/authorised receiving point → validated handover. `receiving_point` is null until confirmed; `authority_label` is a safe customer description. RECORDED handover does not imply VALIDATED. Never manufacture immersion, recycling or downstream disposal after validated handover. The detail endpoint's ownership, errors and private/no-store caching apply to this embedded projection.

### recommendations

Status: PROPOSED · Capability: Prior-collection category recommendations · Consumer: Home / Activity footer · Gate: `recommendations`

`GET /v1/customer/recommendations/collection-categories`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "recommendations": [
    {
      "category_code": "FLOWERS",
      "rank": 1,
      "reason": "PREVIOUS_COLLECTION"
    }
  ]
}
```

Pagination, sorting and caching: No pagination; at most 12. Rank ASC, category_code ASC. Private no-store; frontend stale 30 seconds.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Restore exact heading “Based on your previous collections”. Join with active authoritative catalogue, deduplicate and hide unknown/inactive/unsupported reasons. Empty or unavailable response hides whole section.

Backend external requirements and privacy: Compute from this customer’s actual historical collections. No fabricated popular taxonomy or other-customer history. Return code/rank/reason only; no addresses or prices. Cancellation invalidates this query.

### payment

Status: PROPOSED · Capability: Authoritative payment status · Consumer: Collection detail / checkout return · Gate: `payment`

`GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111/payment`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Path request_id UUID.

Response:

```json
{
  "payment_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "amount_minor": 35000,
  "currency": "INR",
  "status": "SUCCEEDED",
  "retry_allowed": false,
  "expires_at": null,
  "succeeded_at": "2026-10-08T05:00:00Z",
  "current_attempt": null
}
```

Pagination, sorting and caching: No pagination. Private no-store. Poll unsettled state at 10 seconds; foreground manual refresh also works.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Provider return is a signal only. Show pending/processing/confirming safely until SUCCEEDED from backend. Show server retry_allowed separately; native checkout action remains blocked pending configuration/checkout contract.

Backend external requirements and privacy: One logical obligation per collection; current_attempt is optional projection. SUCCEEDED requires durable accepted payment truth; additional external success belongs to reconciliation/refund, never a second acceptance. FAILED describes current failure requiring attention, not permission to double-pay. retry_allowed includes expiry/ownership/concurrency decision. Never expose provider credentials, instrument/token/bank data.

### refunds

Status: PROPOSED · Capability: Independent refund progress · Consumer: Cancelled collection / history detail · Gate: `refunds`

`GET /v1/customer/collection-requests/11111111-1111-4111-8111-111111111111/refunds`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Path request_id UUID.

Response:

```json
{
  "refunds": [
    {
      "refund_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "amount_minor": 35000,
      "currency": "INR",
      "status": "INITIATED",
      "initiated_at": "2026-10-08T05:30:00Z",
      "completed_at": null,
      "reason": "CUSTOMER_CANCELLATION"
    }
  ]
}
```

Pagination, sorting and caching: No pagination; bounded refunds per owned obligation, initiated_at ASC then refund_id. Private no-store. Poll unsettled states at 20 seconds.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Display INITIATED/PROCESSING/COMPLETED/CONFIRMING/FAILED independently from collection CANCELLED. Empty response never implies “no refund” or completed refund. Render safe confirming-provider copy.

Backend external requirements and privacy: Project existing internal refund states using mapping below. completed_at non-null only for durable provider success. No provider refund/charge reference or operational failure strings. Support multiple/partial refunds without totals exceeding refundable charge.

### push-register

Status: PROPOSED · Capability: Register or rotate native customer push device · Consumer: Opt-in / existing permission / rotation · Gate: `push`

`PUT /v1/customer/me/push-devices/11111111-1111-4111-8111-111111111111`

Authentication: Bearer CUSTOMER Success: 200.

Request:

```json
{
  "client_device_id": "11111111-1111-4111-8111-111111111111",
  "platform": "ANDROID",
  "token_provider": "FCM",
  "token": "example-fcm-token"
}
```

Response:

```json
{
  "client_device_id": "11111111-1111-4111-8111-111111111111",
  "registered_at": "2026-10-08T05:00:00Z"
}
```

Pagination, sorting and caching: No pagination/cache. Natural idempotency by owned installation UUID; PUT same token/provider is same effect.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 command/version conflict;422 invalid fields.

Frontend behavior: Android maps FCM; iOS maps APNS. Memory-only token, SecureStore installation id, serialized rotation, generation guards after logout. Backend-pending registration never claims successful delivery.

Backend external requirements and privacy: Body id must equal path. Platform/provider pair must be ANDROID/FCM or IOS/APNS else 422. Atomically bind installation/token to current authenticated customer/session and remove prior account binding; retain no duplicate delivery bindings. Return no token. Protect token at rest; never log token. Revoke on server logout/session revocation. Invalid provider token removes delivery eligibility.

### push-revoke

Status: PROPOSED · Capability: Revoke customer push installation · Consumer: Logout / disable registration · Gate: `push`

`DELETE /v1/customer/me/push-devices/11111111-1111-4111-8111-111111111111`

Authentication: Bearer CUSTOMER Success: 204.

Request:

Path client_device_id UUID; no body.

Response:

204 with no response body

Pagination, sorting and caching: No pagination/cache. Repeated DELETE returns 204.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Before logout attempt revocation using live credentials; always clear local session/token/generations even if server call fails.

Backend external requirements and privacy: Revoke only current owned binding; another customer binding must not be deleted. 404 may be normalized to 204 for privacy. Server logout/session invalidation must also revoke the session’s binding so offline logout cannot retain a stale delivery subscription.

### notifications

Status: PROPOSED · Capability: Customer notification history · Consumer: Notifications · Gate: `notifications`

`GET /v1/customer/notifications?limit=20`

Authentication: Bearer CUSTOMER Success: 200.

Request:

Query limit 1..50 default20; optional opaque cursor.

Response:

```json
{
  "items": [
    {
      "event_id": "event_01",
      "title": "Collection update",
      "body": "Open your collection to see its latest status.",
      "created_at": "2026-10-08T05:00:00Z",
      "target": "COLLECTION",
      "request_id": "11111111-1111-4111-8111-111111111111"
    }
  ],
  "next_cursor": null
}
```

Pagination, sorting and caching: Stable created_at DESC then event_id DESC, cursor bound owner/snapshot. Private no-store.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 expired/ineligible context or CURSOR_EXPIRED.

Frontend behavior: Display safe history and open collection details. A next-page 409 CURSOR_EXPIRED discards all cached pages and refetches page one; ordinary network/5xx load-more failures retry the existing next-page cursor. Deep link performs fresh ownership-checked read. Do not derive status from event text.

Backend external requirements and privacy: Exclude address, GPS, contact details, amounts, provider fields and internal failure descriptions. Minimal lock-screen content. History targets only owned request IDs.

### profile-read

Status: PROPOSED · Capability: Minimal customer profile · Consumer: Account / profile editor · Gate: `profile`

`GET /v1/customer/me/profile`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "user_id": "11111111-1111-4111-8111-111111111111",
  "display_name": "Customer",
  "email": null,
  "phone_display": "+91 •••••• 1234",
  "version": 1
}
```

Pagination, sorting and caching: No pagination. Private no-store.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Show safe name/masked phone and edit optional name/email. Pending/error retry stays distinct from signed-out.

Backend external requirements and privacy: Phone is identity-managed and not editable here. version integer >=1; no provider account id, raw identity phone, credentials or address.

### profile-write

Status: PROPOSED · Capability: Update profile · Consumer: Profile form · Gate: `profile`

`PUT /v1/customer/me/profile`

Authentication: Bearer CUSTOMER Success: 200.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "expected_version": 1,
  "display_name": "Customer",
  "email": null
}
```

Response:

```json
{
  "user_id": "11111111-1111-4111-8111-111111111111",
  "display_name": "Customer",
  "email": null,
  "phone_display": "+91 •••••• 1234",
  "version": 2
}
```

Pagination, sorting and caching: No pagination/cache. Body command UUID, optimistic expected_version; same intent/body replays same result; changed body same command409.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 command/version conflict;422 invalid fields.

Frontend behavior: Validate name/email, safe success/error, invalidate profile. 409 refetch version; no silent overwrite.

Backend external requirements and privacy: Name null or trimmed 1..100; email null or valid trimmed email <=254. Preserve identity phone. Atomic version compare/update; replay lookup precedes version comparison. No marketing consent implied.

### preferences-read

Status: PROPOSED · Capability: Minimal service preferences · Consumer: Language / notifications preferences · Gate: `preferences`

`GET /v1/customer/me/preferences`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "language": "en-IN",
  "collection_notifications": true,
  "version": 1
}
```

Pagination, sorting and caching: No pagination. Private no-store.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Show authoritative service language and collection update opt-in. Device permission is a separate native state.

Backend external requirements and privacy: Languages en-IN, hi-IN; collection_notifications boolean; version >=1. Preference does not promise untranslated UI or override OS permission.

### preferences-write

Status: PROPOSED · Capability: Update service preferences · Consumer: Preferences form · Gate: `preferences`

`PUT /v1/customer/me/preferences`

Authentication: Bearer CUSTOMER Success: 200.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "expected_version": 1,
  "language": "hi-IN",
  "collection_notifications": false
}
```

Response:

```json
{
  "language": "hi-IN",
  "collection_notifications": false,
  "version": 2
}
```

Pagination, sorting and caching: No pagination/cache. Body UUID replay and optimistic expected_version same as profile.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 command/version conflict;422 invalid fields.

Frontend behavior: Save explicitly; refetch conflicts and invalidate preferences. Off does not change native OS permission.

Backend external requirements and privacy: Collection delivery honors persisted false preference immediately. Required service/legal communications, if any, need separately approved policy; no marketing channel introduced.

### favourites-read

Status: PROPOSED · Capability: Favourite category codes · Consumer: Account favourites · Gate: `favourites`

`GET /v1/customer/me/favourite-categories`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "category_codes": ["FLOWERS"],
  "version": 1
}
```

Pagination, sorting and caching: No pagination; bounded to catalogue active categories. Private no-store.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Join codes with authoritative active catalogue; show empty selection and allow edit.

Backend external requirements and privacy: This is explicit user favourites, independent of historical recommendations. No collection/address history returned.

### favourites-write

Status: PROPOSED · Capability: Update favourite categories · Consumer: Favourites form · Gate: `favourites`

`PUT /v1/customer/me/favourite-categories`

Authentication: Bearer CUSTOMER Success: 200.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "expected_version": 1,
  "category_codes": ["FLOWERS"]
}
```

Response:

```json
{
  "category_codes": ["FLOWERS"],
  "version": 2
}
```

Pagination, sorting and caching: No pagination/cache. Command UUID replay/version conflict as profile.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 command/version conflict;422 invalid fields.

Frontend behavior: Checkbox choices, explicit Save, invalidate own favourites.

Backend external requirements and privacy: Reject unknown/inactive/duplicate codes with422; [] clears favourites. Stable response order by catalogue order.

### content

Status: PROPOSED · Capability: Approved service and legal content · Consumer: Help / About / Terms / Privacy / Login links · Gate: `content`

`GET /v1/content/{slug}`

Authentication: Public; no bearer required Success: 200.

Request:

Path slug allowlist help|about|terms|privacy.

Response:

```json
{
  "slug": "help",
  "title": "Help & Support",
  "paragraphs": ["Approved Tirodhan support information goes here."],
  "updated_at": "2026-10-08T05:00:00Z"
}
```

Pagination, sorting and caching: No pagination. Public max-age300; version freshness by updated_at. Paragraph order is authored order.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 404 unpublished/unknown slug;422 malformed path;429;503. Public route needs no credential refresh.

Frontend behavior: Public content route; loading/error/retry. Explicit development legal placeholder is never production legal text. No inferred support phone or payment link.

Backend external requirements and privacy: Only approved plain text; no executable markup or arbitrary external payment/support routes. Unknown slug404. Provide real approved support and legal publication before release.

### payment-methods

Status: PROPOSED · Capability: Available provider checkout methods · Consumer: Account Payment Methods · Gate: `paymentMethods`

`GET /v1/customer/payment-methods`

Authentication: Bearer CUSTOMER Success: 200.

Request:

None

Response:

```json
{
  "methods": [
    {
      "code": "UPI",
      "label": "UPI",
      "description": "Available through secure provider checkout"
    }
  ]
}
```

Pagination, sorting and caching: No pagination; authored supported checkout order. Private no-store.

Idempotency/concurrency: Read-only, no command key; enforce owner and return persisted authoritative projection.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text.

Frontend behavior: Display informational available methods. Do not store/add/edit card credentials.

Backend external requirements and privacy: Provider-neutral availability metadata only. No saved instrument model, account balance, PAN, CVV, payment token or provider key. [] means no available method. Checkout runtime remains separate readiness prerequisite.

### feedback

Status: PROPOSED · Capability: Submit bounded service feedback · Consumer: Account feedback · Gate: `feedback`

`POST /v1/customer/feedback`

Authentication: Bearer CUSTOMER Success: 201.

Request:

```json
{
  "client_request_id": "11111111-1111-4111-8111-111111111111",
  "message": "Please improve pickup time clarity."
}
```

Response:

```json
{
  "feedback_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
}
```

Pagination, sorting and caching: No pagination/cache. Body command UUID replay, changed body same ID409; rate limits explicit429.

Idempotency/concurrency: Common body UUID/optimistic version rules or natural device idempotency apply as specified below. No automatic mobile mutation retry.

Errors: 401 invalid/revoked credential;403 forbidden active principal;404 missing or non-owned resource without identity disclosure;422 invalid parameter;429 rate limited;503 unavailable. Never return raw operational exception text. 409 command/version conflict;422 invalid fields.

Frontend behavior: Validated RHF text, explicit submit, pending/safe error/success, same prepared command after ambiguous retry.

Backend external requirements and privacy: Trimmed message 5..2000 characters, plain text. No email/send connector integration here. Reject invalid input422, no sensitive diagnostics; retention/access controlled as customer service data.

## Cancellation and compensation enhancement

Status: PROPOSED enhancement of EXISTING POST /v1/collection-requests/{request_id}/cancel. Preserve bodyless command, CollectionResponse and temporary Idempotency-Key. Gate cancellationCompensation remains disabled until the following business effect is implemented. No mobile refund-create API exists.

Success must represent one durable business effect: revalidate owned ACCEPTED collection, cutoff and planning eligibility under current planning race; transition to CANCELLED; establish any required CUSTOMER_CANCELLATION refund intent against actual successful charge; durably establish required refund-initiation/outbox work; commit together. Do not report cancellation success while dropping required compensation. Provider completion remains later and independent. This is externally observable atomicity, not a prescription for backend implementation architecture.

Serialize with existing planning freeze/reload. Planning winner returns409 PLANNING_STARTED/PLANNING_CUTOFF_REACHED with no cancellation/refund. Identical replay, already-cancelled requests and concurrent distinct keys cannot duplicate refunds or exceed remaining charge. No refund against pending/failed charge; no undo of payment truth or repeated acceptance. Current backend cancellation.py does locking/reload/cutoff correctly but DOES NOT create refund intent/outbox.

Modal uses authoritative allowed/cutoff/reason, slot/address and paid amount/refund_expectation. Human confirmation precedes submission. Ambiguous retry reuses same PreparedCommand. Definite403/404/409 refreshes eligibility. Success says “Pickup cancelled”, then independently reads refunds. Targeted invalidation: own detail, active/history, recommendations, payment/refunds. No provider or refund-create call from frontend.

## Refund and payment projections

| Existing refund internal state | Customer status | External meaning                                        |
| ------------------------------ | --------------- | ------------------------------------------------------- |
| PENDING                        | INITIATED       | Durable refund intent                                   |
| PROCESSING, SUBMITTED          | PROCESSING      | In progress, not completion                             |
| SUCCEEDED                      | COMPLETED       | Persisted provider success; completed_at required       |
| INITIATION_UNCERTAIN           | CONFIRMING      | We’re confirming your refund with the payment provider. |
| FAILED                         | FAILED          | Safe attention/support state                            |

Cancelled never implies refund completed. Null summary means no safely available summary, not proof of ineligibility. Empty refund read with compensation expected displays pending confirmation. Multiple/partial refunds remain individual safe records; no client compensation arithmetic or initiation. No provider refund/charge reference or raw failure description.

Logical payment PENDING/SUCCEEDED/CANCELLED/EXPIRED remains authoritative. Customer PROCESSING/FAILED/CONFIRMING describes current obligation/attempt projection; never overrides succeeded truth or allows double acceptance. retry_allowed includes pending expiry/reconciliation/concurrency eligibility. Current attempt is nullable. Native Razorpay execution is pending coherent public checkout metadata, approved merchant runtime, SDK integration and native validation. Existing attempt supplies provider_order_id but lacks public key/amount/merchant launch configuration. No native checkout SDK is initialized. Provider return is only a refresh signal; SUCCEEDED must come from backend read. This is an explicit runtime blocker, not fabricated checkout success.

## Checkout

Status: PROPOSED · Capability: owned native checkout launch parameters · Consumer: paymentFlow/native provider adapter · Gate: checkout.

`GET /v1/customer/payment-attempts/{payment_attempt_id}/checkout`

Authentication: Bearer CUSTOMER. Path UUID required, no body. Success200. Complete required response example:

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "payment_attempt_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
  "provider": "RAZORPAY",
  "public_key_id": "rzp_live_EXAMPLE_PUBLIC_KEY",
  "provider_order_id": "order_example",
  "merchant_display_name": "Tirodhan",
  "amount_minor": 35000,
  "currency": "INR",
  "expires_at": "2026-10-08T05:15:00Z"
}
```

No optional/nullable fields, pagination, sorting or cache. Side-effect-free owned attempt projection; it does not create another attempt or charge. Errors401/403,404 absent/non-owned,409 expired/non-eligible attempt,422 invalid UUID,429,503 checkout/provider runtime unavailable. All strings plain text; expiry timezone RFC3339, amount positive safe integer minor units, currency INR MVP, provider exact RAZORPAY. Public key is deliberately publishable provider SDK key id; never return secret/API-signing key or write-capable credentials. No payment instrument, provider customer identity, OTP, phone or private metadata.

Backend must bind provider_order_id and quote to the owned existing attempt/collection and current logical payment; reject expired/non-eligible state. Retain existing POST payment-attempt route and prepared legacy header. This read adds missing coherent public launch parameters without modifying that current response.

Frontend paymentFlow reads authoritative retry_allowed, prepares one attempt, verifies returned request/attempt/provider/amount/currency/expiry, and passes parameters only to an explicitly supplied native adapter. Single-flight launch; ambiguous attempt retries reuse its command; a provider dismissal/error/return does not supply business success. It always reads authoritative payment afterward and does not relaunch an already launched intent. With no validated adapter, it returns backendPending before creating an attempt. The current app has no native adapter and keeps checkout disabled. No SDK/provider secrets or webhook call from mobile.

## Remote media architecture

MediaDto is used for catalogue image/thumbnail and hero/home/rickshaw/receiving-point art, summary/detail imagery and journey images. Backend resolves approved Blob/CDN URL metadata. url required absolute HTTPS without userinfo; thumbnail_url nullable safe HTTPS; width/height positive pixel integers; alt_text useful plain text; blurhash nullable standard blurhash; expires_at nullable timezone timestamp (null means stable public asset). Version URLs for immutable cache and safe lifetimes covering expected screen duration. Read-only signed URLs may be used with tightly bounded expiry/scope; never log URLs/query strings or expose write SAS, connection/account keys, storage SDK credentials or administrative paths. Client must not construct guessed storage-account URLs.

expo-image uses memory/disk cache for approved nonpersonal product art only, fixed pre-load layout, placeholders/loading indicator, source recycling, correct contain/cover, alt and neutral onError fallback. Expired signed URL must refresh owning metadata rather than retry storage indefinitely. Catalogue read freshness must not outlive signed URL expiry. No personal/GPS/address material encoded in image metadata or image cache. Additional personal imagery requires separate approved privacy policy.

Local reference-derived WebPs are ONLY explicit development fallback, excluded from release asset imports. Production taxonomy and URLs come from backend; missing image yields icon fallback. Approved docs/ux references remain unchanged. OTP local decorative crop is also development-only; production neutral artwork awaits approved public brand media.

## Push payload and lifecycle

Status: PROPOSED customer envelope:

```json
{
  "schema_version": 1,
  "event_id": "event_01",
  "target": "COLLECTION",
  "request_id": "11111111-1111-4111-8111-111111111111"
}
```

No status/address/GPS/contact/phone/amount/provider data, arbitrary route or URL. event_id ASCII alphanumeric/underscore/hyphen1..100; request_id UUID. Display title/body generic approved lock-screen copy. Validate version/target/UUID before navigation; unsupported goes Activity. Foreground/tap refetches authoritative query; no payload state written to cache. Duplicate event id navigates once (bounded100 events/10-minute memory), including duplicate signals still refetch. Cold-start response cleared after handling. Ownership always enforced by destination read. Resume/reconnect/manual refresh stays correct without push.

Tokens memory only, never browser/AsyncStorage. SecureStore holds installation UUID only. Android FCM and iOS APNs distinct provider integrations. No customer token sent to rider FCM route. Permission requested only explicit opt-in; existing grant may reacquire/register silently. Acquisition is not delivery registration; display pending/backendPending/failed separately. Serialized rotation prevents stale overwrite. Generation/account guards dispose listeners and invalidate callbacks on logout/user change. Attempt revoke before logout; always clear locally. Server refresh-session logout/revocation must disable corresponding push binding even when local revoke fails/offline. Reassignment of installation/token must atomically remove previous-account delivery ownership. Preview cannot submit protected writes.

## Address distance and maps

Presentation-only approximate Haversine straight-line distance, radius6371km and default threshold5km. Helper parameter allows explicit product-policy adjustment. Compare selected saved pin only with an already available authorized current device position. Never request permission solely for warning. Null/invalid pin/position gives no warning. Explicit Use current location may request permission and stores result only in draft memory. Denied permission leaves saved/manual entry available.

Confirmation bound to this draft’s address id/version/pin, reset when changed. Modal shows approximate km, “Use this address”/“Choose another”; Review also protects an unconfirmed far address before booking. No GPS/distance persistence, logging or telemetry. No derived serviceability, H3, route distance or planning decisions.

Native react-native-maps remains iOS/Android implementation. Browser-only .web adapter uses [Leaflet1.9.4 stable](https://leafletjs.com/download.html) with visible OpenStreetMap attribution and normal browser caching/referrer. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) forbids bulk/offline prefetch; no tile prefetcher or headless traversal implemented. EXPO_PUBLIC_WEB_MAP_TILE_URL supports approved provider override; default community tiles are development preview choice and wider distribution requires capacity/privacy review. Browser preview is not a new Customer Web app and proves no native map correctness. Native expo-location geocoding retained; unsupported web reverse geocode falls back to complete manual address with selected pin preserved. No geocoding service invented.

## Development fixtures and state ownership

`__DEV__` && EXPO_PUBLIC_PREVIEW_CATALOGUE=true selects explicit same-repo development repositories; release ignores flag. Product screen banner labels all records fixtures/no server writes. Fixtures cover principal reader, catalogue/media, address CRUD, serviceability, slots, historical recommendations, active/history pagination, owned detail/journey/handover, pending payment, all5 refund states, cancellation success/race/network retry, profile/preferences/favourites/content/feedback and notification history. Zero HTTP in fixture repositories; protected Transport writes additionally blocked despite real credentials. Public OTP remains real auth flow.

Editorial fixture category codes/quotes/destinations/times are not backend taxonomy/pricing/coverage. Booking stays PENDING_PAYMENT, no provider success manufactured. Fixed quote demonstrates layout; fixture cancellation simulates server atomic compensation in memory. Principal reader fixture is separate from visible preview admission. Reset owner caches/fixtures/draft on logout/switch. No release flag can promote fixtures into production.

## Exact DTO field schemas

The schemas below are implemented frontend types, not claims that PROPOSED backend fields exist. Every required response property present; optional versus nullable as above. Examples provide complete wire responses. Backend validates bounds/UUID/state coherence/roles/ownership; compile-time TypeScript does not validate server truth. Strings and known enums retain semantics in the endpoint requirements above. Changes to required fields/enums require compatibility/version review.

```typescript
// PROPOSED customer-facing projections. These are not current backend response fields.
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
export interface PrincipalDto {
  user_id: string;
  roles: string[];
}
export interface MediaDto {
  url: string;
  thumbnail_url: string | null;
  width: number;
  height: number;
  alt_text: string;
  blurhash: string | null;
  expires_at: string | null;
}
export interface CatalogueDto {
  version: string;
  groups: {
    group_code: string;
    display_name: string;
    display_order: number;
    active: boolean;
  }[];
  categories: {
    category_code: string;
    group_code: string;
    display_name: string;
    description: string;
    display_order: number;
    active: boolean;
    image: MediaDto;
    thumbnail: MediaDto;
    handling_hints: string | null;
    input: { quantity: 'NONE' | 'OPTIONAL'; weight_grams: 'NONE' | 'OPTIONAL' };
  }[];
  quick_categories: {
    category_code: string;
    label: string;
    display_order: number;
  }[];
  artwork: {
    hero: MediaDto | null;
    home: MediaDto | null;
    rickshaw: MediaDto | null;
    receiving_point: MediaDto | null;
  };
}
export interface RecommendationDto {
  recommendations: {
    category_code: string;
    rank: number;
    reason: 'PREVIOUS_COLLECTION';
  }[];
}
export interface SlotsDto {
  serviceability_context_id: string;
  expires_at: string;
  slots: {
    slot_id: string;
    start: string;
    end: string;
    label: string;
    availability: 'AVAILABLE' | 'FULL';
  }[];
}
export type CollectionStatus =
  | 'PENDING_PAYMENT'
  | 'ACCEPTED'
  | 'PRE_PLANNING'
  | 'PLANNED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED';
export type CancellationReason =
  | 'PLANNING_CUTOFF_REACHED'
  | 'PLANNING_STARTED'
  | 'NOT_ACCEPTED'
  | 'ALREADY_CANCELLED'
  | 'NOT_ELIGIBLE';
export interface CancellationCapability {
  allowed: boolean;
  cutoff_at: string | null;
  reason: CancellationReason | null;
  refund_expectation: 'NONE' | 'FULL_PAYMENT' | 'REVIEW_REQUIRED';
}
export interface CollectionSummary {
  request_id: string;
  status: CollectionStatus;
  title: string;
  slot: { start: string; end: string; label: string };
  address_summary: string;
  category_codes: string[];
  image: MediaDto | null;
  journey_status:
    'BOOKED' | 'COLLECTED' | 'RECEIVED' | 'HANDOVER_VALIDATED' | 'NOT_STARTED';
  refund_status: RefundStatus | null;
  created_at: string;
  updated_at: string;
}
export interface Money {
  amount_minor: number;
  currency: string;
}
export interface PaymentRead extends Money {
  payment_id: string;
  request_id: string;
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CONFIRMING'
    | 'CANCELLED'
    | 'EXPIRED';
  retry_allowed: boolean;
  expires_at: string | null;
  succeeded_at: string | null;
  current_attempt: {
    payment_attempt_id: string;
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CONFIRMING';
  } | null;
}
export type RefundStatus =
  'INITIATED' | 'PROCESSING' | 'COMPLETED' | 'CONFIRMING' | 'FAILED';
export interface RefundRead extends Money {
  refund_id: string;
  status: RefundStatus;
  initiated_at: string;
  completed_at: string | null;
  reason:
    'CUSTOMER_CANCELLATION' | 'SERVICE_UNAVAILABLE' | 'PAYMENT_CORRECTION';
}
export interface JourneyDto {
  request_id: string;
  milestones: {
    code: 'BOOKED' | 'COLLECTED' | 'RECEIVED' | 'HANDOVER_VALIDATED';
    state: 'COMPLETE' | 'CURRENT' | 'UPCOMING';
    occurred_at: string | null;
    label: string;
    detail: string | null;
    image: MediaDto | null;
  }[];
  receiving_point: {
    name: string;
    address_summary: string;
    authority_label: string;
    image: MediaDto | null;
  } | null;
  handover: {
    state: 'NOT_RECORDED' | 'RECORDED' | 'VALIDATED';
    recorded_at: string | null;
    validated_at: string | null;
  };
}
export interface CollectionDetail extends CollectionSummary {
  address: { label: string | null; text: string }; // Immutable booking snapshot, no GPS in customer reads.
  items: {
    category_code: string;
    display_name: string;
    declared_quantity: number | null;
    declared_weight_grams: number | null;
    quoted_line_amount_minor: number;
    image: MediaDto | null;
  }[];
  quote: Money;
  payment: PaymentRead;
  cancellation: CancellationCapability;
  journey: JourneyDto;
  refunds: RefundRead[];
  cancelled_at: string | null;
  completed_at: string | null;
}
export interface PushRegistration {
  client_device_id: string;
  platform: 'ANDROID' | 'IOS';
  token_provider: 'FCM' | 'APNS';
  token: string;
}
export interface PushRegistrationResult {
  client_device_id: string;
  registered_at: string;
}
export interface CustomerPushPayload {
  schema_version: 1;
  event_id: string;
  target: 'COLLECTION';
  request_id: string;
}
export interface NotificationEntry {
  event_id: string;
  title: string;
  body: string;
  created_at: string;
  target: 'COLLECTION';
  request_id: string;
}
export interface CustomerProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone_display: string;
  version: number;
}
export interface CustomerPreferences {
  language: 'en-IN' | 'hi-IN';
  collection_notifications: boolean;
  version: number;
}
export interface CustomerContent {
  slug: string;
  title: string;
  paragraphs: string[];
  updated_at: string;
}
export interface FavouriteCategories {
  category_codes: string[];
  version: number;
}
export interface PaymentMethods {
  methods: { code: string; label: string; description: string }[];
}

// Hand-mapped from backend afa1400; backend remains the authority.
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
}
export interface LoginTokenResponse extends AccessTokenResponse {
  refresh_token: string;
}
export interface Location {
  latitude: number;
  longitude: number;
}
export interface AddressWrite {
  address: string;
  label?: string | null;
  location?: Location | null;
  is_default: boolean;
}
export interface Address extends AddressWrite {
  address_id: string;
  label: string | null;
  location: Location | null;
  status: string;
  version: number;
}
export interface AddressUpdate extends AddressWrite {
  expected_version: number;
}
export type ServiceabilityInput = (
  | { source_address_id: string; address?: never }
  | { address: string; source_address_id?: never }
) & { location?: Location | null };
export interface ServiceabilityContext {
  serviceability_context_id: string;
  source_address_id: string | null;
  source_address_version: number | null;
  status: string;
  cell_id: string | null;
  failure_code: string | null;
  expires_at: string;
  resolved_at: string | null;
}
export interface CollectionItemInput {
  item_category_code: string;
  declared_quantity?: number | null;
  declared_weight_grams?: number | null;
}
export interface CollectionCreate {
  client_request_id: string;
  serviceability_context_id: string;
  slot_start: string;
  slot_end: string;
  items: CollectionItemInput[];
}
export interface CollectionItem {
  request_item_id: string;
  item_category_code: string;
  declared_quantity: number | null;
  declared_weight_grams: number | null;
  quoted_line_amount_minor: number;
  currency: string;
  pricing_rule_version: string | null;
}
export interface CollectionResponse {
  request_id: string;
  client_request_id: string;
  status: string;
  quoted_amount_minor: number;
  currency: string;
  payment_expires_at: string;
  payment_id: string;
  items: CollectionItem[];
}
export interface PaymentAttempt {
  payment_attempt_id: string;
  status: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  failure_code: string | null;
}
```

## Release and native prerequisites

Live readiness requires these proposed projections, atomic cancellation compensation, authoritative catalogue/media/slots, coherent native public checkout contract/runtime, customer FCM/APNs delivery and approved legal/support content. Keep absent capabilities gated. Validate actual principal loading/403/401, provider reconciliation, planning/refund races, cursor expiry and account ownership against deployed APIs. Native Android/iOS must validate map/pin, permission/denial, SecureStore, OTP autofill/keyboard, push foreground/background/cold start/rotation/revoke, modal focus/screen readers/dynamic text and payment return. Browser checks alone are not native verification. No backend changes or provisioning performed.
