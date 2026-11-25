# Customer and Manager Web review guide

This review covers the Customer Web experience, Manager rider provisioning and the shared web host for NONPROD. The [ACA handoff](WEB_NONPROD_ACA_HANDOFF.md) describes runtime inputs, gateway routing, image publishing and live acceptance. The [frontend architecture](FRONTEND_ARCHITECTURE.md), [browser session contract](OPERATIONS_WEB_APIM_SESSION_CONTRACT.md) and [session security report](OPERATIONS_WEB_APIM_SECURITY_TEST_REPORT.md) describe the application boundaries and session behavior.

## Customer Web

- The signed-in navigation follows the Customer Mobile journey. Home, Bookings, Book Pickup, Activity and Account are separate destinations. The home banner shows garlands and a brass diya being prepared for collection.
- The catalogue preview shows the collection artwork and a four-card row when space permits. Narrow layouts use two columns. An empty backend catalogue shows an explicit empty state.
- Saved addresses support manual entry, user-initiated device location and optional coordinates. The booking review displays the saved address the customer selected in the current session. A fresh session requires selection, including when a default address exists. Availability is checked before reserving capacity.
- Payment methods link to bookings. An eligible booking offers **Continue to secure payment** when checkout is enabled. The localhost fixture simulates this flow. Approved NONPROD checkout opens Razorpay Test Mode, and the backend financial projection determines the outcome. The payment method screen supports the backend's empty list and shows sample UPI, card and net banking rows in the fixture.
- Profile, preferences and the payment methods lookup have independent default-off runtime switches. Review the [Customer backend contract matrix](CUSTOMER_WEB_BACKEND_CONTRACT_MATRIX.md) and [functional parity matrix](CUSTOMER_WEB_FUNCTIONAL_PARITY_MATRIX.md) for endpoint and workflow context.

## Manager Web

On **Riders**, enter the UUID of an already verified user and review profile creation. Vehicle type and capacity class codes are optional. After the backend roster shows the active profile, select it and review the separate rider access grant. Both commands use `POST /v1/manager/business/commands`. Manager commands retain their existing confirmation, identity and recovery handling. See the [Operations Web implementation report](OPERATIONS_WEB_P0_01_IMPLEMENTATION_REPORT.md) for context.

## Local review

Install with Node 24 and the pinned pnpm version. Run the fixtures in separate terminals and use the localhost origins printed by Vite.

```sh
pnpm install --frozen-lockfile
pnpm dev:customer-web:fixture
pnpm dev:operations:fixture
```

For Customer Web, enter the development customer and open `/account/home`, `/account/catalogue`, `/account/addresses` and `/account/payment-methods`. Open `/account/catalogue?catalogue=empty` to see the empty state. Follow Book Pickup through address selection, review and fixture checkout. Confirm that a simulated provider callback alone leaves payment pending. For Manager Web, enter the Manager preview, open **Riders** and inspect the two command review steps.

The Chrome fixture smoke test writes desktop and mobile captures to `.local/cw-p0-01/browser`, including `customer-home`, `catalogue`, `pickup-location`, `pickup-saved-address` and `payment-methods`.

```sh
pnpm --filter @tirodhan/customer-web run test:browser --fixture
pnpm --filter @tirodhan/customer-web run test
pnpm --filter @tirodhan/operations-web run test --runTestsByPath src/test/commands.test.ts
node --test infra/apim/web-session/render.test.mjs
python infra/apim/web-session/verify_backend_routes.py <backend-checkout> 5c3a8beb43e7b601ccbcb746798e96ba6531a266
```

Run the renderer equality check from an LF checkout. Its policy comparison is byte-for-byte. Use the [ACA handoff](WEB_NONPROD_ACA_HANDOFF.md#release-artifacts) for both container builds and smoke tests.

## Release acceptance

Both stopped NONPROD revisions already have browser authentication enabled. Publish reviewed images during the pause. When testing resumes, preserve the existing login settings and validate the candidate and new Customer account switches through Cloudflare → APIM → ACA. [#13](https://github.com/krishnadhoundiyal/tirodhan-frontend/issues/13#issuecomment-7046530014) records configuration approval. [#14](https://github.com/krishnadhoundiyal/tirodhan-frontend/issues/14) tracks the stalled multi-tab cookie test. Verify the existing Customer checkout reference against the intended Razorpay Test Mode configuration before exercising payment. Follow the [existing NONPROD rollout](WEB_NONPROD_ACA_HANDOFF.md#existing-nonprod-rollout) for the release sequence.
