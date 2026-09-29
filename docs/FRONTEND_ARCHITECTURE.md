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

#### 4. Public Web

**Public information, discovery, trust, and acquisition surface.**

Its purpose includes:

- explaining Tirodhan and its services;
- public informational content;
- search/discovery and campaign landing pages;
- trust/credibility content;
- directing users to the customer mobile experience;
- future partner or business information where appropriate.

V1 does not require Public Web to reproduce the complete Customer Mobile transactional journey.

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

 Public Web
   discovery / information / acquisition
```

Customer Mobile and Rider Mobile are **separate application binaries/products**, even if later architecture allows them to share code and infrastructure.

Operations Web is a separate operational product.

Public Web is a separate public-facing surface.

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
- Operations Web;
- Public Web.

Customer Mobile and Rider Mobile remain separate application binaries.

Operations Web and Public Web remain separately deployable web applications.

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
apps/operations-web    X--> apps/public-web
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
│   ├── operations-web/
│   └── public-web/
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

## Next architecture category

**Category 3 — Authentication and Session Architecture**

To be reviewed before anything from that category is committed as architecture.
