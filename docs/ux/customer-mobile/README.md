# Tirodhan Customer Mobile UX Handoff

## Purpose
This directory is the implementation handoff for the **approved customer-mobile UX** for Tirodhan. It is intended to be consumed by Codex during implementation.

Approved screens:
1. Splash
2. Mobile Login
3. OTP Verification Error State
4. Collection Home
5. Review Your Collection / Book Pickup Review
6. Activity
7. Select Pickup Address
8. Account

## Important usage rule
The mockups define **visual intent, information hierarchy, and interaction expectations**. They do **not** replace the backend contract.

Before implementing any screen, inspect the actual FastAPI routes, request/response models, and auth rules in the Tirodhan backend repository.

Do not invent:
- pricing logic,
- reliability/idempotency rules,
- booking states,
- address/serviceability rules,
- kiosk identifiers,
- payload shapes.

## Approved design principles
- Warm cream + gold visual system.
- Tirodhan feels calm, respectful, devotional, and contemporary.
- Avoid loud e-commerce colors, aggressive gradients, or ornamental clutter.
- Collection content should read like **respectful handover/disposal/transition**, not like a shopping catalogue.
- Hero + quick circular category icons + horizontally scrollable grouped sub-category sections are part of the approved Collection Home.
- Use standard modern mobile patterns for forms, maps, navigation, OTP, loading and error states.

## Navigation model
Primary bottom navigation:
- Home
- Bookings
- Book Pickup
- Activity
- Account

**Activity** must also be reachable from the **Account** screen.

## Pricing
Pricing is **not frozen** as flat-rate. The frontend must not embed a fixed pricing model assumption.

Use neutral wording such as:
- “Collection summary”
- “Estimated collection charge”
- “Calculated based on pickup details”

Any charge shown must come from backend calculation.

## Catalogue
Collection categories and sub-categories are content-managed and should be backed by metadata and image references. See `CATALOGUE_AND_ASSETS_SPEC.md`.

## Hindi text
Hindi text, especially the splash tagline, must be rendered using a real Devanagari font/text engine. Do not bake generated Hindi glyphs into raster images.

Approved tagline:
- श्रद्धा से संग्रह
- सम्मान से प्रस्थान

## Screen specs
- `screen-specs/splash.md`
- `screen-specs/mobile-login.md`
- `screen-specs/otp-error.md`
- `screen-specs/collection-home.md`
- `screen-specs/review-collection.md`
- `screen-specs/activity.md`
- `screen-specs/address-selection.md`
- `screen-specs/account.md`
