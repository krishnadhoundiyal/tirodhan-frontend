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

## Next architecture category

**Category 2 — Repository and Platform Structure**

To be reviewed before anything from that category is committed as architecture.
