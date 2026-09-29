# Tirodhan Frontend Architecture

This document records frontend architecture decisions only after they have been reviewed and agreed.

Architecture is developed incrementally. Each category is discussed and frozen before the next category is added. Implementation agents must not fill undecided architecture gaps silently.

---

## Category 1 — Product and Application Boundaries

### Status

**Frozen**

### Product horizon

Tirodhan is not architected as a single-purpose broken-idol collection application.

The first production capability is respectful household collection of broken, damaged, or no-longer-required religious idols and sacred material.

The long-term customer platform may later include distinct capabilities such as:

- idol restoration / mending;
- reuse or recycling through appropriate authorised or government-linked channels;
- Rent-a-Cow;
- Rent-a-Farm;
- puja-related commerce and partner sellers.

These future capabilities inform the application boundary, but **must not be implemented or generalized into V1 domain models prematurely**.

### Frontend applications

Tirodhan has four frontend product surfaces.

#### 1. Customer Mobile

**Primary customer product surface.**

The Customer Mobile application is the long-lived Tirodhan customer application. V1 exposes the collection service; future customer capabilities may be added as independent feature areas within the same customer product.

V1 customer responsibilities include the customer-facing journey for:

- authentication;
- addresses and serviceability;
- collection booking;
- slot selection;
- payment;
- request/activity status;
- account and support entry points.

The application must not be architected on the assumption that every future customer activity is a `CollectionRequest`.

**Mobile is the primary/required customer application surface.** Public web may assist discovery and acquisition but is not the primary transactional customer experience.

#### 2. Rider Mobile

**Separate operational mobile application.**

Rider Mobile is not a role-switched mode inside Customer Mobile.

It exists as a separate application because its responsibilities, permissions, reliability requirements, and release lifecycle differ materially from the customer application.

Its V1 responsibility is collection-field operations, including:

- rider availability;
- work offers and assignment;
- pickup execution;
- incidents;
- receiving-point handover;
- evidence capture;
- operational media handling.

Future operational workflows may be added if the business requires them, but V1 remains collection-focused.

A Rider installation must not be assumed to be a Customer installation, and Customer Mobile must not acquire Rider-only permissions merely to share one binary.

#### 3. Operations Web

**Primary MANAGER operational surface.**

Operations Web is the browser-based console for internal operations.

V1 scope includes collection operations such as:

- rider operational visibility;
- pending assignment groups;
- manual assignment;
- incidents;
- reassignment;
- collection completion operations.

Future businesses such as restoration, cow/farm operations, commerce, or partner operations may add their own modules within the Operations product.

They must not be modelled as collection screens merely because collection exists first.

#### 4. Customer Web

**Secondary but complete CUSTOMER-facing web surface.**

Customer Web serves both public acquisition/content routes and authenticated customer journeys.

Public responsibilities include:

- explaining Tirodhan and its services;
- public informational content;
- search/discovery and campaign landing pages;
- trust/credibility content;
- directing users toward the appropriate customer journey.

Authenticated V1 responsibilities include:

- OTP authentication;
- addresses and serviceability;
- collection booking;
- slot selection;
- payment;
- request/activity status;
- account and support entry points.

Customer Mobile remains the primary customer product, but Customer Web is part of V1 and must support a real customer transaction journey rather than acting only as a marketing site.

### Application boundary

The agreed product boundary is:

```text
                         Tirodhan
                            |
        +-------------------+-------------------+
        |                   |                   |
 Customer Mobile        Rider Mobile       Operations Web
    CUSTOMER                RIDER              MANAGER
        |                   |                   |
        +-------------------+-------------------+
                            |
                       FastAPI API

 Customer Web
   public routes + authenticated CUSTOMER journey
```

Customer Mobile and Rider Mobile are **separate application binaries/products**, even if later architecture allows them to share code and infrastructure.

Operations Web is a separate operational product.

Customer Web is a separate deployable customer-facing web application containing both public and authenticated CUSTOMER routes.

### Future actor boundary

Future external participants may include, for example:

- restoration artisans;
- farm/cow operators;
- recyclers;
- puja-material sellers;
- other business partners.

No `PARTNER` frontend application or identity role is frozen yet.

These actors must not be forced into `CUSTOMER`, `RIDER`, or `MANAGER` merely because those roles exist in V1.

### Already-agreed mobile framework direction

React Native is the selected mobile framework direction for both Customer Mobile and Rider Mobile.

This category does **not** yet freeze:

- Expo;
- repository/monorepo structure;
- navigation framework;
- shared-package boundaries;
- authentication/session storage;
- API-client generation;
- state-management libraries;
- Rider offline/synchronisation design;
- local database technology;
- UI/component libraries;
- maps, notifications, analytics, hosting, or CI/CD.

Those decisions belong to later architecture categories.

---

## Category 2 — Repository and Platform Structure

### Status

**Frozen — monorepo direction and isolation rules**

### Repository model

Tirodhan frontend uses a **single monorepo**.

The monorepo contains the separately deployable frontend applications defined in Category 1 and provides one place for frontend architecture, tooling, contracts, and deliberately shared packages.

The reason for choosing a monorepo is **not** that all frontend code should be shared.

The primary benefits are:

- one frontend architecture and governance boundary;
- coordinated dependency/tooling policy;
- easier cross-application contract validation;
- one place for genuinely shared assets or contracts;
- atomic changes when a cross-application change is genuinely required;
- reduced repository and pipeline administration.

### Independent application boundaries remain mandatory

Monorepo does **not** mean monolithic deployment.

Each application remains an independent product and deployable:

- Customer Mobile;
- Rider Mobile;
- Customer Web;
- Operations Web.

Customer Mobile and Rider Mobile remain separate application binaries.

Customer Web and Operations Web remain separately deployable web applications.

No deployment pipeline may treat all frontend applications as one release unit merely because they share a repository.

### Build isolation

An application-local change should not require unrelated applications to be built or deployed.

For example:

```text
Rider-only change
    -> Rider build/test
    -> Rider release only

Customer remains untouched
```

If a shared dependency changes, every consuming application may need validation.

That does **not** imply that every validated application must also be deployed.

CI must therefore support an affected-application/dependency-graph model rather than a permanent "build everything, deploy everything" model.

The exact CI/task-orchestration tool is not frozen in this category.

### Source-code isolation

Applications must not import implementation source directly from another application.

Conceptually:

```text
apps/customer-mobile   X--> apps/rider-mobile
apps/rider-mobile      X--> apps/operations-web
apps/operations-web    X--> apps/customer-web
```

Cross-application sharing, where justified, must pass through an explicit shared-package or shared-contract boundary.

This prevents the monorepo from becoming an accidental frontend monolith.

### Sharing policy

TypeScript sharing is **permitted but not an objective by itself**.

A shared abstraction must provide meaningful cross-application value.

The default is not to generalize application-specific workflows merely because two applications use TypeScript or React.

Likely candidates for later review include:

- design tokens;
- backend API contracts/generated types;
- narrow authentication protocol primitives;
- common frontend tooling configuration.

The exact packages, APIs, and implementation mechanisms are **not frozen here** and belong to their respective later architecture categories.

Application-specific concerns such as Customer workflows, Rider operational flows, Manager screens, navigation trees, and business orchestration remain owned by their application unless a later architecture decision explicitly says otherwise.

### Initial repository shape

The monorepo is expected to separate applications from explicitly shared packages:

```text
tirodhan-frontend/
├── apps/
│   ├── customer-mobile/
│   ├── rider-mobile/
│   ├── customer-web/
│   └── operations-web/
│
├── packages/
│   └── [only explicitly approved shared packages]
│
└── docs/
    └── frontend architecture
```

This is an architectural boundary, not a requirement to scaffold every application or package immediately.

### Guardrail

The governing principle is:

> **Share the platform deliberately; do not couple the products accidentally.**

A monorepo must preserve:

- independent application ownership;
- independent buildability;
- independent deployability;
- narrow, explicit sharing boundaries;
- no mandatory all-app release.

---

## Category 3 — Authentication and Session Architecture

### Status

**Frozen for mobile and role/bootstrap semantics. Web session direction is frozen subject to a mandatory APIM integration POC before production dependence.**

### Existing backend authority

Frontend authentication consumes the already-frozen backend Phase 1O model.

FastAPI/PostgreSQL remain authoritative for:

- OTP verification;
- application user identity;
- refresh-session lifecycle and revocation;
- access-token issuance and verification;
- live role membership;
- authorization of protected operations.

Azure API Management (APIM) remains the public API gateway.

Frontend applications must not create a second identity, session, or authorization model.

### Role/bootstrap semantics

Access JWTs intentionally contain no roles or PII.

Frontend applications therefore require a small authenticated principal/bootstrap read:

```text
GET /v1/auth/me
```

returning only the information needed for presentation/bootstrap, conceptually:

```json
{
  "user_id": "...",
  "roles": ["CUSTOMER", "RIDER"]
}
```

The role returned to the frontend is **presentation/bootstrap information only**.

It may determine whether the authenticated user may enter the currently opened product experience:

- Customer Mobile / Customer Web -> CUSTOMER;
- Rider Mobile -> RIDER;
- Operations Web -> MANAGER.

Frontend applications must never send asserted roles back as authorization input.

No role header, role body field, or role-derived client assertion may authorize a backend operation.

Every protected API operation continues to derive identity from the access token and perform current authorization server-side through FastAPI/live PostgreSQL role state.

A cached frontend role never overrides a current backend decision.

### Mobile session handling

Customer Mobile and Rider Mobile use the existing Phase 1O token contract directly through APIM.

After OTP verification:

- the short-lived access JWT is held in application memory;
- the stable opaque refresh credential is held only in operating-system secure credential storage;
- neither token is written to ordinary local storage, application logs, analytics, or the Rider operational database.

On application restart:

```text
secure refresh credential
    -> /v1/auth/refresh through APIM
    -> new access JWT
    -> memory
```

The frontend uses the server-returned token lifetime and does not hardcode an access-token TTL.

For a protected call returning `401`:

- perform at most one coordinated refresh;
- concurrent failed calls must share the same in-flight refresh attempt;
- retry the original call once after successful refresh;
- if refresh itself is rejected, clear the local authenticated session and require OTP login again.

A `403` is an authorization result, not a refresh signal. It must not cause a refresh loop.

The stable refresh credential deliberately supports safe retry after a lost successful refresh response.

### Web session model

Customer Web and Operations Web must not expose the stable refresh credential to browser JavaScript or store it in `localStorage`, `sessionStorage`, or IndexedDB.

The chosen direction is an **APIM Web Session Adapter** in front of the existing Phase 1O FastAPI endpoints.

APIM is an adapter only; it is not a second identity service and not a general-purpose BFF.

#### Web login

FastAPI continues to return its normal Phase 1O login result.

For approved web-auth routes, APIM:

1. receives the FastAPI login response;
2. extracts the refresh credential;
3. removes it from browser-visible JSON;
4. stores it in a `Secure` + `HttpOnly` host-scoped cookie;
5. returns the access JWT and normal non-secret response data to browser JavaScript.

The access JWT remains in browser memory and is sent as a normal Bearer token for business APIs.

#### Web refresh

Browser JavaScript calls the approved APIM web-refresh route with credentials enabled.

APIM:

1. reads the approved refresh cookie;
2. reconstructs the existing FastAPI refresh request body;
3. forwards to the same Phase 1O refresh endpoint;
4. returns the new access JWT to browser memory.

FastAPI remains unaware of browser cookie mechanics.

#### Web logout

APIM reads the refresh cookie, reconstructs the existing FastAPI logout request, forwards it, and expires the browser cookie.

Backend refresh-session revocation remains authoritative.

### Separate customer and operations browser sessions

Customer Web and Operations Web must not accidentally overwrite one another's browser refresh session.

Use separate host-scoped refresh-cookie names for the two web products, selected only from an explicit allow-list of trusted origins.

The exact cookie names are implementation details, but the isolation requirement is architectural.

### CORS and CSRF boundary

Credentialed web auth calls must allow only explicit trusted web origins.

Wildcard credentialed CORS is prohibited.

Refresh/logout requests must also require a Tirodhan-specific non-simple request header (or equivalent approved anti-CSRF mechanism) so a foreign origin cannot trigger credentialed session actions without a successful preflight.

Normal business APIs remain Bearer-token APIs.

### APIM responsibility boundary

APIM web-session policy may perform only narrow transport/session adaptation such as:

- refresh-cookie extraction;
- refresh-cookie creation/expiry;
- removal of refresh credentials from browser-visible responses;
- construction of the existing FastAPI refresh/logout request body;
- explicit CORS/origin checks;
- security-sensitive response/header handling.

APIM must not own:

- CUSTOMER/RIDER/MANAGER authorization;
- business/domain decisions;
- frontend view aggregation;
- workflow orchestration;
- application-specific business transformations.

Those remain in FastAPI or the owning frontend application.

### Logging and diagnostics

Raw OTP values, refresh credentials, access tokens, auth cookies, and authorization headers must not be captured in APIM diagnostics, application logs, analytics, or browser telemetry.

Authentication operations require explicit log/redaction review before production.

### Mandatory APIM POC gate

The web-session architecture is accepted in principle but must be proven before frontend implementation depends on it.

The POC must verify at minimum:

1. OTP login removes the refresh credential from browser-visible JSON and sets the intended `Secure`/`HttpOnly` cookie.
2. Web refresh converts the cookie into the existing FastAPI refresh contract.
3. Logout revokes the FastAPI refresh session and expires the cookie.
4. Customer Web and Operations Web sessions remain isolated.
5. Only approved origins succeed with credentialed CORS.
6. Foreign-origin refresh/logout attempts fail the anti-CSRF boundary.
7. FastAPI 4xx/5xx and malformed/unexpected responses do not degrade into opaque browser CORS failures.
8. Refresh credentials/tokens do not appear in APIM diagnostics or downstream logs.
9. Revoked/expired refresh sessions surface the existing FastAPI authentication result correctly.
10. APIM Consumption idle/cold-path latency is measured in the intended Azure region rather than assumed from historical figures.

If the POC reveals unacceptable policy fragility, latency, security, or observability risk, the fallback is a small dedicated web BFF/session service. That fallback must not change the Phase 1O FastAPI identity model.

### Deliberately open in this category

This category does not yet freeze:

- the concrete mobile secure-storage library;
- the exact APIM policy XML/implementation;
- the exact web cookie names;
- the exact CI tooling for APIM policy tests;
- offline logout behavior for Rider Mobile;
- future partner authentication.

---

## Next architecture category

**Category 4 — API and Contract Architecture**

To be reviewed before anything from that category is committed as architecture.
