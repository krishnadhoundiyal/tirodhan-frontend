# Rider RM-P0-03 — Evidence, media and receiving-point handover

## Revision and scope

- Branch: `codex/rider-evidence-handover`.
- Implementation commit: `99d204741d49503ff1fae221145f64fa43cf22e7` (the separate documentation commit records this exact implementation).
- Exact parent/base: `216a6f2e292ef98fde3cfc5d89f628386ad6969c` on `codex/rider-pickup-execution`.
- Foundation ancestor retained: `afdcb3032f371173db8802673068996c79949a5d`.
- Backend inspected read-only at `b281e03a47d202fd8b5c3d895075aa358062c5fa` in `C:/Users/91956/Tirodhan/tirodhan`.
- Frontend implementation and tests only. No push, merge, backend edit, cloud project, deployment or cloud/native build was performed for this increment.

The independently implementable evidence, upload and handover paths are present. Live V2 execution still depends on backend-authorized shift/position context; DISCHARGE media attachment is blocked by its missing capture reference. Native capabilities and live storage integration require device acceptance; JavaScript exports do not establish native compilation.

## User journeys and authority

The Evidence tab retains collected pickup identities from confirmed execution receipts before the old receipt can be dismissed. An owned assignment read can also establish collection attribution. This is necessary because the final V1 collection removes the active assignment from the Rider read.

| Situation                                             | Mutation authority                                                          | Evidence/media behavior                                                                                                                                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy V1 collected pickup                            | Separate V1 capture and V1 handover APIs                                    | Pickup photo or muted video; handover photo registers against the returned handover event, including a REJECTED event.                                                                                                                |
| V2 routed COLLECTED pickup                            | Existing RM-P0-02 V2 PICKUP command                                         | COLLECTED creates a cargo observation, not a capture. A separate pickup-linked V1 capture is therefore appropriate after confirmed collection.                                                                                        |
| V2 next DISCHARGE                                     | V2 route-task DEPART/START/DISCHARGE only                                   | Real pickup and receiving-label scans, new photo timestamp and one measured location. DISCHARGE creates its own handover/capture; no V1 handover or replacement capture is submitted. Media is blocked without its server capture ID. |
| V2 unsuccessful STARTED pickup                        | V2 PICKUP with NOT_COLLECTED, supported failure reason and capture metadata | When `evidence_capture_id` is returned, register PHOTO directly against it. A null ID leaves a visible attachment gap; never create a second capture.                                                                                 |
| RECOVERY_REQUIRED                                     | Only the actual next DISCHARGE through V2                                   | Existing active-shift, position, custody, transfer, route receipt, timing and other server guards remain authoritative. No new pickup through this path.                                                                              |
| V1 completed/superseded assignment                    | Historical unreleased collection attribution                                | A missing/replacement active assignment does not erase an already confirmed collected pickup. Backend revalidates history and custody; any current route binding for that pickup blocks V1 handover locally.                          |
| Already validated handover                            | Retained authoritative receipt                                              | Fresh duplicate transfer is disabled. An uncertain original command replays its original identity and payload. Rejected handovers remain separate durable attempts; a new physical retry requires a new explicit action.              |
| Unknown source, revision, task, target or destination | Fail closed                                                                 | No cross-version fallback, guessed IDs, typed substitute scans, fabricated location or optimistic completion.                                                                                                                         |

V1 currently records one selected collected pickup per handover; the backend DTO supports a list. Both pickup PHOTO and VIDEO originals are supported. Operational failure/discharge originals are PHOTO only. The live UI uses in-app capture, with no gallery import or automatic upload queue. SCREEN_PREVIEW explicitly uses synthetic fixture media, scans and coordinates without native hardware or live transport. Live web/Expo Go evidence remains unavailable and directs users to a Rider development build.

## Exact contract mapping

Inspected routes: `src/tirodhan/api/routes/rider.py`, `routing_dispatch.py`, `routing_orchestration.py`, `routing_recovery.py`; services/models under `modules/evidence`, `modules/handovers`, `modules/routing_operations/execution.py`, and `modules/collection_requests/service.py`. Related integration tests for handover, capture, media and routing were inspected, not executed or changed. Architecture, domain, idempotency, data-protection and relevant ADR documents informed the implementation.

| Endpoint                                                | Request and authoritative response                                                                                                                                                                                                         | Replay/validation boundary                                                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/v1/rider/receiving-points`                        | `receiving_point_id`, `official_name`, nullable `official_identifier`, latitude/longitude, `allowed_radius_m`, version                                                                                                                     | Rider-authorized active destinations. Refresh before a fresh handover; no arbitrary ID input.                                                                                                                                             |
| POST `/v1/rider/handovers`                              | `{client_handover_id, receiving_point_id, pickup_execution_ids:[id], observed_location:{latitude,longitude}}`; response handover event ID, echoed client/point, `status`, `validation_code`, occurrence/evaluation timestamps and distance | Stable client ID and exact measured coordinates. Exact replay precedes fresh validation; fresh commands reject vehicle-bound pickups. Server geofence returns VALIDATED/WITHIN_ALLOWED_RADIUS or durable REJECTED/OUTSIDE_ALLOWED_RADIUS. |
| POST `/v1/rider/evidence-captures`                      | `{client_capture_id,target_kind:PICKUP                                                                                                                                                                                                     | HANDOVER,target_id,captured_at}`; response `evidence_capture_id` and echoed target/client/time                                                                                                                                            | Stable capture identity; aware UTC client timestamp. Pickup must be COLLECTED with historical attribution; handover must belong to the rider. Distinct captures may share a target. |
| POST `/v1/rider/media-assets`                           | `{client_media_id,evidence_capture_id,media_type,expected_content_type}`; response stable `media_asset_id`, `object_key`, original identity/type and upload metadata                                                                       | One original per capture. Exact registration replay returns current metadata. Returned binding and object key `media/<media_asset_id>` must match; the client never constructs an upload destination.                                     |
| POST `/v1/rider/media-assets/{id}/upload-authorization` | Bodyless. `{authorization,expires_at}`                                                                                                                                                                                                     | Transient authorization for the pending owned asset. No invented per-request client ID. Never persisted or logged.                                                                                                                        |
| Direct Azure Blob PUT                                   | Exact authorized HTTPS URL; binary original; `Content-Type` and `x-ms-blob-type: BlockBlob`; require HTTP 201                                                                                                                              | Inspected Azure user-delegation SAS provider. No API bearer, cookies or redirects. Only the same sealed original can retry a pending object.                                                                                              |
| POST `/v1/rider/media-assets/{id}/finalize`             | Bodyless. Authoritative media metadata with `upload_status:FINALIZED`, stored content type, size and finalization time                                                                                                                     | Natural asset identity. Server storage inspection and terminal replay; finalization does not validate evidence, validate a handover or complete a request.                                                                                |
| GET `/v2/rider/route`                                   | Existing owned route/revision/task order/source/status projection                                                                                                                                                                          | RM-P0-02 guards remain; unknown task states fail closed. No capture-reference lookup or active shift ID is present.                                                                                                                       |
| POST `/v2/rider/route-tasks` — progression              | `{client_command_id,task_id,revision_id,operation:DEPART                                                                                                                                                                                   | START}`                                                                                                                                                                                                                                   | Only the fresh next DISCHARGE task in this feature. Backend shift/position and operational guards apply.                                                                            |
| Same — DISCHARGE                                        | Common task fields plus `scanned_pickup_id`, `scanned_receiving_identifier`, `client_capture_id`, `captured_at`, latitude and longitude                                                                                                    | Returns handover `resource_id`, `handover_status`, `validation_code`; does **not** return its created evidence capture ID. Never use handover ID or client capture ID as a server capture ID.                                             |
| Same — unsuccessful PICKUP                              | Common fields, `operation:PICKUP`, `outcome:NOT_COLLECTED`, `failed_reason:CUSTOMER_UNAVAILABLE                                                                                                                                            | UNCONTACTABLE                                                                                                                                                                                                                             | ACCESS_BLOCKED`, `client_capture_id`, `captured_at`                                                                                                                                 | Regional path creates evidence in the same transaction and exposes nullable `evidence_capture_id` through the pickup reattempt. Use that reference directly; nonregional/null responses cannot attach media here. |

Server MIME/size policy remains authoritative at registration/finalization. There is no Rider policy read. The camera emits JPEG or detected MP4/QuickTime originals; mismatched signatures fail locally. A 20 MiB memory cap, 480p muted video up to 15 seconds and local GPS accuracy/freshness limits are client resource/measurement limits, not claims about backend acceptance. Backend errors do not become success or trigger different operational APIs.

## Lifecycle, concurrency and recovery

One explicit operation per rider scope is journaled before its first command POST. Its original command identity, capture identity, media identity, coordinates and timestamp are immutable for retries. Local stages (`PREPARED`, `CAPTURE`, `MEDIA`, `UPLOADING`, `FINALIZE`, etc.) describe coordinator progress only; they are not new backend operational states.

1. Capture a real original, seal it privately and durably save its command before HTTP.
2. Register/replay the capture, or use an evidence reference returned by the V2 command.
3. Persist any returned handover/capture/media receipt before the next external stage.
4. Register the stable media identity, authorize in memory and PUT the original bytes.
5. Persist upload ambiguity **before** PUT. On restart from UPLOADING/FINALIZE, try finalization first. A lost finalization response cannot cause a blind reupload. If finalization returns 409, replay registration, reconcile current asset status and retry the same original only if still pending.
6. A FINALIZED registration replay skips authorization/upload. Expired/403 authorization can reissue once per explicit attempt; no unbounded loops. Upload has a 60-second deadline and cancellation on backgrounding.
7. Only backend FINALIZED metadata establishes finalization. Delete sealed bytes/key after finalization. Receipt review also erases retained originals for rejected/gap outcomes, preserving the handover outcome in the minimal local ledger.

Identical double taps share a flight; conflicting actions receive a conflict. Stale owner callbacks cannot write or publish another rider's data. Backgrounding stops subsequent external stages, retains acknowledged receipts and requires an explicit retry. Account changes/logout serialize cleanup before any next-owner sealing/journaling. Involuntary auth expiry retains the encrypted attempt for same-owner recovery; no background synchronization platform was added.

Secure-store writes use two bounded chunk slots with a small manifest committed last. A failed inactive-slot write leaves the prior operation readable. If a write commits but its acknowledgement/cleanup fails, recovery re-reads the journal before deleting the original. Confirmed RM-P0-02 receipts remain confirmed if copying collection attribution fails; dismissal is blocked until that copying succeeds. V2 receipt recovery uses the owned route to recover task-to-pickup binding when the cache is empty, and fails closed if unavailable.

Before the sealed original and command have been committed together, an interrupted camera session cannot be safely replayed: camera cache/unreferenced ciphertext is purged on next use and the rider must recapture. No backend operation has been sent in this window. After preparation, restart resumes the exact original. If both history and the local journal are lost, there is no supported historical Rider lookup to reconstruct the prior target or attempt.

## Privacy and device boundaries

- AES-256-GCM ciphertext is stored under app-private documents using opaque UUID filenames. Its random key and minimal operation metadata reside only in device-bound, when-unlocked SecureStore. No plaintext evidence, SAS, access/refresh token, address or contact data is added to ordinary persistence.
- Camera output exists briefly in Expo's app-private temporary cache; seal/cancel/failure deletes it. Startup sweeps interrupted camera files and unrelated sealed files. Vault tests mock native crypto/filesystem ports; they verify wiring/cleanup, not OS cryptography implementation.
- One real foreground GPS measurement is taken per handover, with permission, nonmocked input, finite coordinates, accuracy at most 50 m and age at most 30 s. A 20-second acquisition deadline fails closed. No GPS trace/background tracking. The exact coordinate needed for command replay is retained in SecureStore until receipt review.
- Pending original retention is bounded at 24 hours and cleanup occurs on next app use, not while terminated. Expired originals lose their file and recovery key. Previously ambiguous uploads can still reconcile finalization without bytes; an unuploaded expired original requires Operations review, not a substituted file under the same capture.
- The minimal collected-target ledger is bounded to 64 entries/24,000 ASCII JSON characters and erased on explicit logout/account change. It is not a complete server history. Failed private-storage access does not fall back to AsyncStorage/browser storage.
- Upload host/path/HTTPS/write-only SAS shape is checked against the inspected public Azure Blob provider. Alternate storage providers/cloud suffixes require explicit adapter work. Signed URLs and raw native errors are not surfaced in logs or user errors.
- Camera plugin enables barcode reading; microphone permission/audio recording is disabled. Location permission is foreground only. No production credentials or cloud resources were created.

References for device/storage APIs: [Expo SDK 57 Camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/), [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [Azure Put Blob](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob). Implementation also checked installed SDK type declarations.

## Confirmed gaps and minimum follow-ups

1. **Active shift context / fresh telemetry:** owned route, assignment, dispatch-sync and flexible-offer Rider reads omit `shift_id`. The shift discovery found in recovery is Manager-only and is not a Rider workaround. SHIFT_CONFIRM/vehicle-position submission require an actual shift ID; route START/DEPART/PICKUP/DISCHARGE enforce active shift and fresh vehicle position. This client cannot establish those prerequisites. Minimum backend addition: expose the actor's authorized active shift identity and route/confirmation binding in an existing owned Rider context/route read, then integrate permissioned real telemetry. No fabricated shift, unrelated-record derivation or guard bypass was used. If Operations has already established valid prerequisites, the real route commands can still be submitted and judged by the backend.
2. **V2 DISCHARGE evidence reference:** execution creates HandoverEvent, EvidenceCapture and PHOTO discharge proof transactionally, but the response exposes only the handover ID/status/code; route GET has no capture ID. No supported actor-authorized Rider lookup was found. Minimum backend addition: return the already-created `evidence_capture_id` in the DISCHARGE response and exact replay, or expose an authorized lookup binding command/actor/task/handover to that capture. The frontend currently shows the real outcome and an explicit attachment gap. It does not duplicate capture or invent a reference.
3. **Real labels / rollout:** `official_identifier` comes from the authorized receiving-point master. The app reads physical QR/Code128/Code39/EAN13/DataMatrix labels and requires an exact comparison; null/missing/mismatched labels block discharge. No approved government-point label issuance/deployment was evidenced in the inspected app. Operations must approve/provide the actual existing signage/label process and actual pickup labels before device acceptance. This increment generates/attaches no labels and supplies no successful live scan substitutes.
4. **Completion visibility/history:** the completion service requires a COLLECTED pickup, pickup-linked capture and capture linked to its specific VALIDATED handover (Option B). It does not consult media existence/finalization. No Rider request-completion projection/command or historical capture/handover lookup was found. The app refetches owned assignment, route and availability after changes; it displays only supported handover/capture/media facts and never sets or infers request COMPLETED. Completion reconciliation requires an authorized projection (and any backend completion orchestration) to be available. Lost-device/historical discovery likewise needs a supported authorized read.
5. **Live native/storage acceptance:** a new Rider development binary must incorporate Camera/Location/FileSystem configuration. Validate actual camera failure/cancellation, muted video, scans, GPS denial/accuracy, background/kill/restart, secure-store/file lifecycle and a real configured Blob authorization/upload/finalize journey. Backend MIME/size policy must permit captured formats; production media retention/label rollout still needs the existing product/privacy approval process.

## Dependency changes

Installed with the existing pnpm 11.25.0 through Expo tooling:

`pnpm --filter @tirodhan/rider-mobile exec expo install expo-camera expo-file-system expo-location --pnpm`

| Rider direct dependency | Added specifier / resolved version                    |
| ----------------------- | ----------------------------------------------------- |
| expo-camera             | `~57.0.6` / `57.0.6`                                  |
| expo-file-system        | `~57.0.7` / `57.0.7` (already available transitively) |
| expo-location           | `~57.0.22` / `57.0.22`                                |

Rider Expo stays `57.0.31`, React Native `0.86.3`, React `19.2.3`. Existing Expo Crypto supplies AES; no additional crypto package. Normal pnpm resolution deduplicated the existing Customer optional peer `@expo/metro-runtime` from `57.0.16` to the already-used `57.0.17`; Customer direct dependency specifiers/versions did not change. Added camera web transitive packages: `barcode-detector@3.2.3`, `zxing-wasm@3.1.6`, `@types/emscripten@1.41.6`, `type-fest@5.10.0`, `tagged-tag@1.0.0`. No SDK major migration, security-policy bypass, package exclusions or CI weakening.

## Validation

Validation date: 2026-10-23. Node 24.19.0, pnpm 11.25.0. Detailed local logs/artifacts are ignored under `.local/rm-p0-03-*`.

| Check                                                                     | Actual result                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` with strict release-age security enabled | PASS; lockfile supply-chain policies verified, no resolution drift.                                                    |
| Rider TypeScript                                                          | PASS.                                                                                                                  |
| Rider ESLint, `--max-warnings 0`                                          | PASS.                                                                                                                  |
| Prettier Rider/lockfile/report                                            | PASS.                                                                                                                  |
| Rider Jest                                                                | PASS, 164 tests / 12 suites (66 new tests; 98 original tests retained), no skips.                                      |
| Expo Doctor                                                               | PASS, 21/21. First attempt's config-schema network request failed TLS; one unchanged retry passed. No checks disabled. |
| Rider LIVE exports, `expo export --platform all --max-workers 2`          | PASS: Android/iOS Hermes bundles and web bundles/index. Local output `.local/rm-p0-03-export`; no deployment.          |
| Customer TypeScript regression                                            | PASS.                                                                                                                  |
| Customer Jest regression                                                  | PASS, 98 tests / 14 suites.                                                                                            |
| Native Android/iOS compilation for Rider RM-P0-03                         | NOT RUN; not established by exports. No cloud build initiated.                                                         |
| Real device, real physical scans/GPS, live Azure/backend E2E              | NOT RUN; mocked ports/fixtures are not device or production acceptance.                                                |

The new tests exercise V1/V2 selection, retained attribution, duplicate/conflicting handover, ownership, invalid point/scan/order/revision/replacement, server geofence rejection, shift guard rejection, pre-POST storage failure/ambiguous commit, finalization response loss, partial upload/restart, bounded reauthorization, already-finalized originals, account expiry/stale callbacks/backgrounding, corrupt private state, expiry cleanup, camera cache/cipher cleanup, exact DTOs, bodyless media endpoints, URL/header isolation, upload deadline, unusable GPS, secure-slot failure and isolated screen/preview composition.

## Changed-file inventory

All paths below are relative to this frontend repository; existing RM-P0-01/RM-P0-02 behavior remains covered by regression tests.

- `apps/rider-mobile/app.config.ts`: Camera/Location permission/config plugins.
- `apps/rider-mobile/README.md`: field journeys and remaining integration prerequisites.
- `apps/rider-mobile/package.json`, `pnpm-lock.yaml`: SDK-compatible device dependencies and normal pnpm resolution.
- `apps/rider-mobile/app/(rider)/_layout.tsx`, `app/(rider)/evidence.tsx`: Evidence tab/route.
- `apps/rider-mobile/src/api/evidence-client.ts`: exact receiving/handover/capture/media/V2 DTO adapter.
- `apps/rider-mobile/src/api/errors.ts`: routed-failure evidence guidance.
- `apps/rider-mobile/src/features/Assignment.tsx`: field evidence entry.
- `apps/rider-mobile/src/features/execution/service.ts`: confirmed receipt attribution hook without rewriting confirmed backend outcomes.
- `apps/rider-mobile/src/features/fixtures.ts`: isolated discharge/failure fixture progression.
- `apps/rider-mobile/src/features/evidence/contracts.ts`: coordinator/receipt/port types and next-task context.
- `apps/rider-mobile/src/features/evidence/service.ts`: authority, durable sequencing, replay and recovery.
- `apps/rider-mobile/src/features/evidence/store.ts`: strict private state decoding/serialized changes.
- `apps/rider-mobile/src/session/evidence.ts`: device-bound chunked secure journal.
- `apps/rider-mobile/src/features/evidence/vault.ts`: sealed private originals and cleanup.
- `apps/rider-mobile/src/features/evidence/upload.ts`: bounded isolated Azure binary PUT.
- `apps/rider-mobile/src/features/evidence/location.ts`: real measured foreground GPS boundary.
- `apps/rider-mobile/src/features/evidence/CaptureSheet.tsx`: camera/video/managed-label capture.
- `apps/rider-mobile/src/features/evidence/EvidenceScreen.tsx`: confirmation, destination, scan, receipt and recovery UI.
- `apps/rider-mobile/src/features/evidence/fixtures.ts`: fixture API/vault/uploader without live fallback.
- `apps/rider-mobile/src/runtime.ts`: scoped live/fixture composition, cleanup barrier and attribution bridge.
- `apps/rider-mobile/src/test/evidence.test.ts`: adversarial coordinator/recovery tests.
- `apps/rider-mobile/src/test/evidence-ports.test.ts`: DTO, upload, GPS and secure journal tests.
- `apps/rider-mobile/src/test/evidence-vault.test.ts`: mocked native vault lifecycle tests.
- `apps/rider-mobile/src/test/evidence-screens.test.tsx`: actual screen gates and Expo Go/preview isolation tests.
- `apps/rider-mobile/src/test/execution-runtime.test.ts`: real preview composition with final-collection attribution and handover.
- `docs/RIDER_EVIDENCE_HANDOVER_REPORT.md`: this report.
