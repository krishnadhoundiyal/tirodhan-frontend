# Tirodhan Rider Mobile

Independent Rider binary in the frontend monorepo. This app does not import
Customer Mobile implementation source or enable a Rider role inside Customer.

Use the declared pnpm 11.25.0 and Node >=22.13 (validated with Node 24.19.0).
Install from the repository root:

```powershell
pnpm install --frozen-lockfile
```

For a native live session, configure `EXPO_PUBLIC_RIDER_API_BASE_URL` with the
existing APIM/backend HTTPS URL and `EXPO_PUBLIC_RIDER_MODE=LIVE`. Public environment
variables must never contain credentials. Refresh credentials are native-only,
stored under a Rider-specific OS SecureStore key; access JWTs stay in memory.

```powershell
pnpm dev:rider
```

For Expo Go development fixtures (no live calls, OTP or secure storage):

```powershell
$env:EXPO_PUBLIC_RIDER_MODE='SCREEN_PREVIEW'
pnpm dev:rider:go
```

Web supports fixture previews; live web authentication is deliberately unavailable
because ordinary browser storage is not the approved mobile credential store.
Release builds reject SCREEN_PREVIEW. Account provides labelled fixture scenarios:
offers, active work, empty, expired, conflict and network failure.

Navigation: sign-in/OTP and Rider admission -> Home/availability, Offers, Active
Assignment/route, Evidence/handover, Account/logout. Direct operational routes enforce the same
principal admission gate. CUSTOMER/MANAGER alone cannot enter.

```powershell
pnpm typecheck:rider
pnpm lint:rider
pnpm test:rider
pnpm doctor:rider
pnpm --filter @tirodhan/rider-mobile export
```

The Rider GitHub Actions workflow runs these checks independently and exports
Android/iOS/web bundles. Existing Customer commands and workflow are preserved.
The unlinked Rider `eas.json` contains only independent development/preview profiles.
Native build/release remains an explicit operator action after approved Rider
project registration and signing setup; no Rider cloud project, signing credential,
production bundle registration, deployment or release has been created.

RM-P0-02 extends Active Assignment with assignment start, pickup outcome confirmation,
incidents, ordered V2 route progression, route receipt and vehicle issues. Commands
are sealed in Rider-specific SecureStore before submission and interrupted commands
are recovered explicitly with the original ID/payload. No timeout is treated as
pickup success. Account adds `execution-v1`, `execution-v2` and `execution-recovery`
fixtures; switching fixtures resets only the isolated development command store.

V1 and V2 are selected from the actual assignment source and matching authoritative
reads. V2 is never sent through V1 pickup endpoints. Fresh vehicle telemetry requires
a shift ID not exposed by current Rider reads. See the
[execution authority and recovery report](../../docs/RIDER_PICKUP_EXECUTION_REPORT.md).

RM-P0-03 adds private camera photo/muted video evidence, authorized receiving points,
V1 handover and V2 discharge/failure flows, managed-label scanning, real foreground
GPS, direct authorized Blob upload and server finalization. Explicit recovery keeps
the original IDs and encrypted bytes; SCREEN_PREVIEW uses isolated fixtures and live
Expo Go evidence requires a development binary. V2 DISCHARGE media remains blocked
because the response omits its server-created capture ID. Shift discovery, actual
approved labels and native/device acceptance remain prerequisites. No local upload
or SDK event establishes request completion. See the
[evidence and handover report](../../docs/RIDER_EVIDENCE_HANDOVER_REPORT.md).

Native FCM assignment/route notifications are **not configured**. Refresh on focus,
foreground return and explicit Refresh is a recovery mechanism, not a substitute
for asynchronous delivery. Do not send Expo push tokens or raw APNs tokens to the
FCM registration API. See the [contract and validation report](../../docs/RIDER_MOBILE_FOUNDATION_REPORT.md)
for endpoints, sensitive data rules and integration prerequisites.
