# Operations and deployment

## Supported deployment model

One Node.js application process, one workspace, one private data directory. Default SQLite works without npm downloads. Optional external metadata/blob backends do not remove the local SQLite operations database or the in-memory member sessions/rate limits/OIDC state. **Do not deploy active-active replicas.**

The admin **Operations & security** page exposes memory/uptime, jobs, sessions/connections, delivery counts, rendition capabilities and paginated security evidence. `/api/documents` provides permission-filtered pages with revision guards. It still scans whole metadata; the interactive app still loads its projected snapshot. No production-scale capacity claim follows from these controls.

## Persistent state

| Item | Contents |
|---|---|
| Main repository | Workspace metadata, domain audit and original blobs; SQLite by default or selected external DB |
| `accounts.json` | Salted member credentials, private filesystem permissions |
| `operations.sqlite` and WAL/SHM during use | Jobs, deliveries, recipient credentials/sessions and hash-chained security events |
| `renditions/` | Completed rendition bytes and transient converter working directories |

Stop the service for the simplest coordinated backup/restore. Include main DB, original blobs and the entire private directory at a consistent point. Do not expose backups through the static server. Restore into an isolated environment, then verify source/rendition hashes, job states, delivery revocation, receipts and administrator access. No automated backup scheduler, disaster-recovery runbook execution or restore-time objective was qualified here.

## Bounds

Source file 50 MiB; command JSON transport 72 MiB; concurrent declared request-body reservation 160 MiB. Request timeout 120 seconds, header timeout 15 seconds, at most 100 headers, 256 connections. SSE is capped at 200 total and 10/member with backpressure handling. Job output is limited to 50 MiB; one worker, 60-second timeout, bounded retry and lease recovery. SQL metadata 32 MiB; MongoDB metadata 12 MiB. These are defensive bounds, not recommended production operating targets.

Jobs are persisted/deduplicated by pinned input and renderer version. An interrupted job is recovered after lease expiry; failed attempts eventually stop. Cancelled jobs cannot late-complete. Graceful shutdown terminates active converters/workers and settles early-start worker promises. Server restart signs team members out; recipient sessions persist only until their own expiry. The audit chain is not externally anchored or immutable to the database administrator.

## Reverse proxy and container examples

Use HTTPS and the exact `CIVORA_PUBLIC_ORIGIN`, forward API and static UI to the same application, preserve Origin, disable proxy buffering for `/api/events`, and set appropriate upload/timeouts. Do not replace the app's static allowlist with a directory-wide file server. Only trust a reviewed reverse-proxy configuration.

The included `Dockerfile` and `compose.example.yaml` are deployment examples: nonroot user, private data volume, read-only image filesystem, dropped capabilities and no-new-privileges. They were **not built or run** in this environment and do not include a TLS proxy, secret manager, external DB drivers or native CAD engines. Review/pin a maintained base-image digest and dependencies before deployment; the example is not a hardened-production certification.

The server reads process environment and does not auto-load `.env`. The example Compose file passes selected environment variables explicitly. Keep secrets out of source control and shell history. Native engines need a separately reviewed isolation policy; a generic application container alone is not a safe converter farm.

## Scale work still required

Normalized per-record authorization-aware querying and search indexes; object-storage streaming/multipart uploads; shared durable sessions/rate limits; distributed leases/jobs; horizontal identity routing; tenant isolation; signed/external audit anchoring; production load/fault-injection and recovery qualification. None is represented as completed by the paginated endpoint or operations dashboard.


## Deadline scheduler (0.5)

The team/localhost process enables its timer by default; projects must explicitly opt in. `CIVORA_AUTOMATION=0` disables it. `CIVORA_AUTOMATION_INTERVAL_MS` defaults to 30,000 ms and accepts 250–3,600,000. The foreground process must remain running; no OS service is installed. Browser-local and folder repositories only reconcile on explicit request.

Policy, subscriptions, personal notices and `automationLedger` reside in the main workspace, not the rendition job table. Each scan attempts at most 200 due outcomes. It recomputes after CAS conflicts, coalesces overlap and leaves idle workspace revisions untouched. Successful and blocked receipts persist; blocked work requires correction and explicit policy re-versioning before retry. Counts in `/api/admin/automation` and Operations & security are for the current process; the workspace history persists across restarts.

Observe last success/error, pending count, blocks and workspace metadata size. The 100,000-receipt ceiling is not a tested capacity target; the 32/12 MiB metadata bounds may arrive earlier. Do not discard deduplication keys under active policies. A restored historical backup lacks subsequent receipts and can replay its still-due work. Coordinate stopped-service backups and rehearse restore behavior. External message delivery, automatic ledger archival, HA/distributed execution, availability guarantees and production timing qualification remain absent. See WORKFLOW-AUTOMATION.md.
