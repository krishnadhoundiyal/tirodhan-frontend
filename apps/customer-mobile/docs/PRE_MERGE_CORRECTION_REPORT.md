# Customer Mobile pre-merge correction report

Correction pass: 2026-10-09. Only the requested privacy, capability, pagination, cache, copy and contract corrections were made. Architecture beyond these requested corrections changed: **NO**. No dependencies or networking infrastructure were added; HTTP remains ordinary `fetch()`.

1. **Branch:** `codex/customer-mobile-production`.
2. **Commit:** This report is included in the local correction commit. The delivery message supplies its exact SHA; retrieve it with `git log -1 --format=%H`. No push or merge was performed.
3. **Base SHA:** `d270c976466f84d1acfae6fd4c1d6055e77e8054`.
4. **Files changed:** 20 files, all within `apps/customer-mobile`. Full paths relative to that app are listed below. No other app, root configuration, manifest or lockfile changed.
5. **Address search:** Typed search trims and passes text directly to `geocodeAsync`, then resolves the returned pin. It never calls foreground permission or device-position APIs. Only explicit Use current location requests permission and reads the device position. Denial leaves text search, saved addresses and manual entry usable.
6. **Cancellation UI:** A destructive action requires both authoritative `cancellation.allowed` and the deployed `cancellationCompensation` capability. Modal confirmation also respects eligibility. The repository gate and single cancellation command remain intact. Development previews require the explicit capability to inspect cancellation fixtures.
7. **Journey contract:** Removed the unused standalone journey client method, capability and proposed endpoint. `JourneyDto` remains embedded in collection detail and refreshes through the existing detail lifecycle. Canonical contracts and backend gaps now describe this V1 projection.
8. **Cursor expiry:** A next-page 409 `CURSOR_EXPIRED` resets the exact owner's active/history or notification infinite query, discards every old page, and requests page one with a null cursor. Network/5xx next-page failures preserve the chain and retry the same cursor. Notification error retry now distinguishes first-page and next-page failures.
9. **Financial queries:** Payment and refund queries seed from the detail snapshot and its actual query-update timestamp. Normal freshness, independent payment/refund polling, manual refetch and backend authority remain unchanged. Existing financial cache data is not overwritten by subsequent detail renders.
10. **Hero indicator:** Removed the four static dots from the single Home hero. No extra panels or artwork were introduced.
11. **Error boundary:** Copy now reads: “We couldn’t display this screen. Any information already confirmed by Tirodhan remains unchanged.” Reviewed in the root layout source; no artificial runtime crash was introduced for browser QA.
12. **Backend verification SHA:** Read-only remote-main verification at `afa140012db29ec0e83c25f3ff378765a7fe7b88`. Auth, address, serviceability, collection-request and payment routes, customer/payment models and cancellation logic were reread at that revision. Complete comparisons from local verification `302c272d902b0adedb2cbf5b0a965f23c3f07673` through review `4994089a0bd5f7317bba1ab49cdfb8d4cec0241a` to current main show only destroy workflow/validation/tests and a testing-strategy document; application API/domain sources are unchanged. The local backend was not fetched or checked out.
13. **Tests:** Added 13 regression cases: three address privacy/manual-fallback cases, two compensation-gate cases, one financial-seeding/independent-refresh case and seven pagination expiry/ordinary-retry cases. The existing server-ineligible cancellation test remains. Product tests schedule query notifications as microtasks within async test actions and await settled queries/mutations before cleanup; the default scheduler is restored afterward.
14. **Validation:** Frozen install, root typecheck, lint, format check and tests passed (98 tests, 14 suites). Expo Doctor passed 21/21 checks on retry after a transient Expo API TLS failure. Customer Mobile Android export passed with two Metro workers. Browser preview at 390×844 passed typed-search permission counters, explicit permission denial/manual entry, capability-disabled cancellation, history fixture load-more and absence of false hero dots, with zero page errors. Cursor expiry and capability-enabled behavior are covered by automated query/screen tests. Web geocoding returned no result and retained the safe manual fallback; browser QA does not establish native geocoding or native-device acceptance. **No native-device validation is claimed.**
15. **Backend workspace unchanged:** `C:\Users\91956\Tirodhan\tirodhan` remains clean at `302c272d902b0adedb2cbf5b0a965f23c3f07673`. No backend file or Git state was changed. Frontend scope and whitespace were checked before the local commit.

## Changed files

- `README.md`
- `app/_layout.tsx`
- `docs/BACKEND_GAPS.md`
- `docs/CUSTOMER_MOBILE_BACKEND_CONTRACTS.md`
- `docs/IMPLEMENTATION_REPORT.md`
- `docs/PRE_MERGE_CORRECTION_REPORT.md`
- `src/api/capabilities.ts`
- `src/api/contracts.ts`
- `src/api/customer-client.ts`
- `src/api/errors.ts`
- `src/features/addresses/AddressScreen.tsx`
- `src/features/collection/CollectionDetailScreen.tsx`
- `src/features/collection/FinancialSection.tsx`
- `src/features/collection/queries.ts`
- `src/features/home/HomeScreen.tsx`
- `src/lib/runtime.ts`
- `src/notifications/NotificationScreen.tsx`
- `src/test/address-screen.test.tsx`
- `src/test/pagination-recovery.test.tsx`
- `src/test/product-screens.test.tsx`

Local validation/browser logs and captures remain ignored under `.local/qa/premerge-*`; generated exports remain ignored. Live backend rollout and native acceptance retain the prior completion pass's deployment requirements.
