# 0.9 review additions — not an independent assessment

Review `packages/document-copy`, `packages/navigation`, their UI adapters, access checks and server endpoints. Copy intentionally changes the audience of selected content by creating new records under the destination policy. Cross-project source share + source download + destination write + role ceilings are enforced. Verify intended same-project copying policy in the deployment threat model. Sources remain held/locked if originally so; destination records do not inherit source approvals, policies or holds.

Byte verification is sequential, capped, de-duplicated and performed before compare-and-swap. The server rechecks session/revision after verification; all-or-nothing numbering/creation and current ACL projection are regression-tested. A raw pure reducer call cannot verify file content. Quick navigation counts are projected before results; commands are a local inert registry, not code obtained from a server. Async UI result/input/account binding is tested with labeled delayed-response fixtures.

Tests are internal regression evidence, not penetration testing, formal proof, browser-origin qualification or an external security audit. Physical OS/database/provider and high-availability limitations remain.

---

# Independent security review handoff

**No independent assessment has been performed.** This document is a handoff, not a passed audit, attestation, vulnerability-free claim or compliance certificate. The author-run regression tests in TESTING.md are separate evidence.

## Review scope

Review both member and recipient authentication; ACL inheritance/role ceilings and projection; all content and metadata paths; command authorization; invitations and credential races; OAuth popup/PKCE/origin handling; optional OIDC validation; main and operations database transactions; worker/native parser boundaries; backup/sync import trust; static serving/CSP; deployment secrets/filesystem; dependency supply chain and operational recovery.

## Explicit trust boundaries

Browser-local owners are trusted with their complete local workspace. Team administrators retain recovery access and may create external deliveries. Database/filesystem administrators can alter originals/evidence and recompute hash chains. External providers control stored snapshot content and access policy. Invitation holders can establish recipient credentials. Native converter executables are administrator-configured and not sandboxed by the subprocess wrapper.

## Required independent exercises

Test direct-object-reference and relationship leaks across project/folder/document ACLs; denied downloads through hashes, old revisions, previews, renditions, transmittals and model routes; policy/group changes during requests; side channels in search counts/revisions/SSE; session fixation, logout/revocation and restart; invitation replay/races, existing-recipient enrollment and expiry; Origin/CSRF, XSS through metadata/SVG/PDF/filenames/receipts; parser resource exhaustion; native converter filesystem/network behavior; sync tampering, deletions and concurrency; credential/backup leakage; external DB TLS/transactions; live OAuth/OIDC tenant and callback behavior.

Run authorized manual penetration testing and automated tooling against synthetic data in an isolated deployment. Test every supported real browser, TLS proxy, cookie policy, security header and service-worker interaction. Perform load/fault-injection, disk-full/interrupted-save, backup-restore and operational response exercises. Record findings, severity, reproducible evidence, fixes and independent retest results.

## Known residual constraints, not a complete vulnerability list

Single-node identity/state; whole-workspace snapshots and global CAS; no true multi-tenancy; no attribute ACL; no independent email proofing/MFA/recovery; no malicious-provider snapshot signatures; no malware scanning/DLP; no OS sandbox for native tools; no externally anchored/WORM audit; no certified CAD validation; limited parser/adversarial coverage; no live external-service or navigated-browser qualification in this environment.

Do not mark a requirement passed because its UI exists or its regression test uses a fixture. Acceptance should identify the exact deployment, build, reviewer independence, test population, findings and retest evidence.


## Added local-system review scope (0.3)

Independently review browser permission renewal, persisted capabilities, forged/malformed working indexes and checkpoint data, same-origin/cross-origin write coordination, root grants versus document ACLs and previously downloaded copies; loopback/DNS-rebinding/CSRF, multipart/encoding/resource limits; canonical-path/root replacement, junctions/reparse points/hardlinks/symlinks/special files; native executable/config ownership, extension allowlists and argument separation; concurrent external writes, failed rename/create/link and interrupted trash/restore; cross-host lock recovery; private-data and backup exposure; OS app macros/network behavior and endpoint isolation.

Author-run Linux HTTP/disk and fixture UI checks are not independent assessment, native Windows/macOS qualification or OS race-proofing. Verify real browser-origin sessions, directory capabilities/locks, filesystem-specific semantics, disk exhaustion, abrupt power/process loss, application upgrades and recovery with controlled synthetic files. Do not mark an unsupported filesystem path qualified because a Linux temporary directory test passed.


## Document-control additions (0.4)

Review all bulk-property and register paths for per-document authorization, atomic rollback, scalar/length validation and preview/version races. Test unsafe spreadsheet content in the actual spreadsheet products used by the deployment; escaping and validation are not an assertion of universal spreadsheet safety. Review numbering collision/exhaustion under production concurrency.

Exercise future-stage/double-vote races, template-copy semantics, inactive/revoked assignees, separation-of-duties reassignment, changed metadata/versions/checkout publication gates, and legacy-review behavior. Test hidden historical reference leakage through baselines/routes/transmittals, original-version exports after access changes, snapshot validation on restored backups, and archive naming/limits. Baselines and audit evidence are application-level records, not WORM or externally signed records.

Reference scanners never fetch external resources. They are bounded format subsets, not a general secure native-parser boundary or a malware scanner. Unit cases include malformed repeated SVG openings; this is not a comprehensive adversarial parser assessment. Review every supported browser/real origin and external integration separately.


## Workflow automation review handoff (0.5)

Review `packages/automation/index.js`, `server/automation.mjs`, transition/preview hooks, projection hooks and the new HTTP endpoints. No independent assessment has been performed. Focus on rule complexity/type coercion, all-path transition enforcement, immutable reviewed metadata, current owner/delegate rights, CAS interleavings with decisions/revocation, stale preview responses, reference-only notice schemas and full-context projection, snooze/read ownership, notification/ledger capacity, shutdown failure, clock skew, historical backup replay and operator policy re-versioning.

The tests include deterministic human-decision/owner-revocation CAS races and real server restart/deduplication. Live-provider/cross-browser/time-service/multi-node/hostile-OS tests remain separate. There is no arbitrary-script engine, external email/push channel, independent signature, or automatic approval to certify. Confirm that deployment backups preserve receipt history and that administrators understand policy edits can reenable a fresh due-event identity.

## Explorer read and organization surface (0.6)

Review `/api/explorer/query`, move-preview, saved-view/pin commands, stable links, inline previews and document.bulkMove. Recheck authorization before returning counts, groups, ordering, ancestors, references and file bytes. A directly shared document must not expose an unreadable folder name or sibling IDs. Shared view configuration and personal pin records are not access grants. Administrative authoritative state/backups still include all member records.

Bulk movement must stay all-or-nothing across permission/lock/retention/name-collision failures, with immutable original bytes and exact source versions. Preview is not authority: the server repeats the full rule set at commit. Tests cover delayed/wrong client responses and revocation; client response-binding tests use explicit transports, distinct from actual HTTP session tests. Source-folder watch delivery is still checked against the destination's current read permission.

Browser preferences and URL history may contain IDs, search terms and filters. They are account/repository-scoped for usability, not encrypted, secret from a machine owner or remotely erasable. Copying a valid address never grants read rights. Local sandbox profile switching is not authentication. The sign-in continuation preserves a requested link but checks workspace/authorization after connecting. Real-origin cookies, stored history, IndexedDB, service-worker cache interaction and native platform behavior still need independent testing.

Paging limits response/DOM size, not the complete metadata snapshot scan. Evaluate CPU/memory, document counts, folder depths and concurrent edits under production-sized inputs before making capacity claims. No penetration test, accessibility certification, native CAD qualification or independent security review was performed for this increment.

## Additional 0.7 review targets — not externally qualified

Review set definition tampering, frozen-source validation, manager unlock authority, concurrent live export changes, revocation before response emission, archive resource limits and ZIP filename handling. Independently test downloads through actual browsers/proxies, request cancellation and memory pressure. Existing Node tests and independent ZIP decoders are regression evidence, not a penetration test.

Test physical iOS/Android and hybrid devices, pointer cancellation, screen readers, keyboard-only use, magnification, virtual keyboards, camera metadata consent and device installation. Test the HTTPS team origin separately from the loopback-only filesystem service. Do not claim unrestricted mobile disk access or confidentiality from the owner of a browser-local database.


## 0.10 review handoff additions

New rename endpoint reuses session/Origin protections, bounded request parsing and exact-state compare-and-swap. Active-role ceiling, every-source write gate, extension preservation, holds/checkout/archive checks and final-state collision validation precede mutation. Generic hidden collisions prevent ID/title disclosure but still expose filename unavailability as a uniqueness oracle; assess this for your threat model. Rename is a metadata operation, not an OS/path-write API.

Comparison verifies both recorded SHA-256/size descriptors, escapes all text, renders SVG through an image Blob URL and revokes URLs on close/reload. Identity/stale-response/late-decode guards are regression-tested. Already read/exported data cannot be recalled. Live browser disconnect/revocation behavior still depends on server events/refresh and is not independently qualified. Same-scale image decoding is browser-native and the 40MP bound is post-decode, not a hardened hostile-file pipeline. JSON text reports contain source content and are unsigned. Pure report serializers rely on caller verification; do not expose them as attestation services.

No external assessor, penetration test, physical-device audit or high-availability/security certification was performed for this release.
