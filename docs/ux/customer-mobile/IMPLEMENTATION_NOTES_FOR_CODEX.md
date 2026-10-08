# Implementation Notes for Codex

## Read first
The UX images are design references. Real route shapes, request/response payloads, OTP behavior, booking statuses, pricing, serviceability and authorization must come from the backend repository.

## 1. Backend is contract authority
Before implementing a feature, inspect the corresponding FastAPI route and Pydantic models.

Do not create a parallel frontend API/domain contract system unless explicitly required.

## 2. Idempotency boundary
Frontend supplies backend-defined client command IDs such as `client_request_id` or `client_login_id` where required.

Frontend must not invent:
- provider idempotency keys,
- internal replay protection,
- a durable client command queue,
- backend reliability mechanisms.

## 3. Pricing
Do not assume permanent flat-rate pricing.
Render backend-provided pricing/estimate only.

## 4. Address UX
Support standard mobile patterns:
- search,
- current location,
- saved addresses,
- add new address,
- map selection/preview.

Request location permission only when the user invokes current location.

## 5. Receiving kiosk
Display the actual resolved kiosk/destination only when supplied by backend logic.
Do not fabricate a destination from the mockup.

## 6. Category assets
Category/group content should be data-driven.
Do not hardcode asset URLs in components.

## 7. Typography
- Brand wordmark + display headings: approved serif treatment
- App controls/body/labels/buttons: Inter
- Hindi: proper Devanagari font

## 8. Bottom navigation
Primary customer tabs:
- Home
- Bookings
- Book Pickup
- Activity
- Account

Activity is also linked from Account.

## 9. Accessibility
Implement:
- adequate contrast,
- sensible touch targets,
- accessibility labels,
- form validation states,
- keyboard-safe layouts,
- dynamic text support where practical.

## 10. Standard mobile patterns
Use mature, current mobile interaction patterns. Avoid custom interaction inventions unless the Tirodhan domain genuinely requires them.
