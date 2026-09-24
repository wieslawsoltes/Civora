# Security boundaries — Civora 0.7.0

**This is an implemented security boundary plus tested controls, not an independent security audit or a production certification.** See TESTING.md for executed checks and SECURITY-REVIEW.md for outstanding acceptance work.

## Local mode is not authentication

The browser owner controls JavaScript, the selected local profile and IndexedDB contents. Local ACL simulation helps evaluate workflows but cannot protect data from that same owner. Browser backups are unencrypted JSON with original content. Temporary memory mode loses state on close. Do not distribute a confidential complete backup to an untrusted person and rely on the local picker to restrict it.

## Team authorization

The server derives an active identity from its own cookie session, ignores a supplied actor ID and independently validates every command and content request. Newly added members receive no project/document access by default. Explicit policies grant seven permissions: `read`, `download`, `write`, `review`, `publish`, `share`, `manage`.

Policies apply at workspace/project/folder/document level to users, groups, roles or all members. Inherited denies prevail over inherited allows; `inherit:false` starts a new policy inheritance chain and clears previous allows and denies. Role ceilings still apply. Without read, other effective permissions are empty. Active administrators have a deliberate recovery bypass; database administrators are trusted.

Server metadata is projected, including related references, reviews and model records. A direct document grant returns restricted ancestor shells, not sibling documents or project details. The full domain audit is restricted to administrators. Original bytes, job outputs and recipient packages have independent current-request checks. A hidden hash is not an access token.

A policy change blocks subsequent reads/downloads. It cannot recall bytes a member or recipient already downloaded or copied. Global workspace revision numbers and some timing remain visible; this is not complete traffic-analysis protection. There are no attribute ACLs or multi-tenant security partitions.

## Credentials and sessions

Team passwords use salted scrypt hashes in private `accounts.json`; team session tokens are memory-only with bounded lifetime and restart sign-out. Cookies are HttpOnly, SameSite=Strict and Secure when the configured public origin is HTTPS. Login attempts are bounded. Password changes invalidate other sessions for that member. OIDC is optional and requires an existing active member and verified email; its external provider path remains unqualified.

Recipient credentials and hashed session tokens are in private `operations.sqlite`. A separate portal cookie uses `/api/portal`; it does not grant member API access. Recipient sessions last four hours and survive restart until expiry. Invitations are one-time bearer secrets stored only as hashes, scoped to a named delivery and passed in a URL fragment that the portal clears. Enrollment is transactional to resist password-reset/invitation races.

Invitation possession establishes control of the invitation, not independent proof of an email address or legal identity. Deliver invitations privately. No mail dispatch, MFA, self-service recovery, signed receipt or independent recipient identity proofing is included.

## Request and content defenses

Writes require the exact configured Origin; API CORS is not enabled. Frontend and API should share the configured origin. The server does not infer public authority from untrusted forwarded headers. Uploaded bytes are hashed on the server and matched against the declared descriptor. CAS guards stale writes. Bodies, connections, headers, SSE fanout, parser sizes and jobs are bounded.

Static serving is explicitly allowlisted; private data, converter configuration, environment files and server modules are not exposed. HTML responses carry a restrictive CSP with hashes for generated inline scripts, plus no-sniff, referrer and frame restrictions. Google identity requires narrowly permitted external endpoints. Inline styles remain allowed by the current UI. Actual deployment/browser CSP compatibility has not been qualified here.

User text is escaped or assigned through textContent. Uploaded SVG is displayed as an image, not inserted as application markup. Browser PDF viewers and all parsing paths still require adversarial testing. Built-in renditions use worker limits; native subprocesses do **not** constitute an operating-system sandbox. Isolate untrusted native converters with a reviewed container/OS policy and least privilege before use.

## Evidence and operational trust

Security events include sign-in failures/success, sign-out, password administration, workspace commands, rendition outcomes and recipient delivery actions. SHA-256 chaining can detect modified evidence unless the attacker rewrites the chain. A database administrator can recompute it; there is no external anchor, signature or WORM retention. This is not a complete SIEM, read-event audit, eDiscovery or regulatory chain of custody.

Application retention/holds are editable under their domain rules and are not immutable legal preservation. There is no encryption key service, end-to-end encryption, antivirus/DLP scanner, account recovery or security certification. HTTPS, storage encryption, secret management, provider access policies and backups are deployment responsibilities.

Member sessions/rate limits/OIDC pending state remain single-process. Operations SQLite is node-local even with an external main database. Do not run active-active replicas. Back up `accounts.json`, main metadata+blobs, `operations.sqlite` and rendition outputs consistently with the service stopped or a verified coordinated backup procedure.

## Deployment decision

Before confidential production use: review the exact policies and demo grants; use HTTPS; configure identity and recipient proofing appropriate to your risk; isolate converters; restore-test complete backups; exercise real-browser cookies, revocation, storage and OAuth; run malicious input and load testing; commission independent application/infrastructure security assessment. No checklist item is represented as completed merely because it is documented.


## Local system boundary (0.3)

Local filesystem mode is off in the ordinary server and opt-in in the loopback launcher. It uses real member sessions and exact peer/Host/Origin checks, read-only flags and explicit per-root user grants. Root configuration and native executable configuration are trusted administrator files. No caller-supplied executable or shell command is accepted. A root grant authorizes its existing bytes independently of later controlled-document ACL changes; downloaded local copies cannot be recalled. Separate per-user roots are recommended.

Browser directory handles are explicit capabilities, not OS authentication or encryption. Anyone with OS access to `.civora` data can inspect/change it. Same-origin Web Locks coordinate cooperating tabs only. The Node adapter refuses traversal, symlinks, hardlinked ordinary files and special files, but is not a sandbox against another hostile process running as its OS user. Stronger OS isolation, native-app content safety, drive encryption, endpoint security and backup ACLs are deployment responsibilities.

The write path uses staging, no-clobber creation, expected hashes and retained originals. It cannot promise atomic compare-and-swap against an external OS writer between final verification and replacement. Failed file moves may leave a duplicate, never an intentional destructive fallback. Mounted/removable/network drive behavior and power-loss durability remain unqualified. See LOCAL-SYSTEM.md and the security-review handoff before deployment.


## Document-control additions (0.4)

Review all bulk-property and register paths for per-document authorization, atomic rollback, scalar/length validation and preview/version races. Test unsafe spreadsheet content in the actual spreadsheet products used by the deployment; escaping and validation are not an assertion of universal spreadsheet safety. Review numbering collision/exhaustion under production concurrency.

Exercise future-stage/double-vote races, template-copy semantics, inactive/revoked assignees, separation-of-duties reassignment, changed metadata/versions/checkout publication gates, and legacy-review behavior. Test hidden historical reference leakage through baselines/routes/transmittals, original-version exports after access changes, snapshot validation on restored backups, and archive naming/limits. Baselines and audit evidence are application-level records, not WORM or externally signed records.

Reference scanners never fetch external resources. They are bounded format subsets, not a general secure native-parser boundary or a malware scanner. Unit cases include malformed repeated SVG openings; this is not a comprehensive adversarial parser assessment. Review every supported browser/real origin and external integration separately.


## Workflow automation and in-app notices (0.5)

Rules are declarative bounded data, not sandboxed JavaScript. Unknown properties/operators, prototype properties, regex/program execution and incompatible schema types are rejected. Every actual transition still checks role, scope, lock/hold, required metadata and exact-current approval after assignments. Failure explanations are visible to authorized transition requesters; do not put secrets in rule names/messages. Preview is not a grant, lock or future authorization guarantee.

The scheduler never elevates a revoked policy owner to a synthetic administrator. Current authority, full pinned source access, review freshness, delegate eligibility and separation of duties are checked inside the computation that must win CAS. Existing decisions and quorum are preserved; multiple pending voters are not silently collapsed. The server supplies time; injected clocks exist only in pure runner tests. The host clock and authorized configuration remain trusted inputs. There is no independent trusted timestamp or business-calendar service.

Notification records contain references rather than duplicated document content. Read-time permissions include every pinned review/delivery reference. Another member's notification cannot be updated by guessing its ID, including through an ordinary administrator notification-update command. Administrator authoritative backups still include all records; this is privacy between members, not secrecy against administrators. Native/local storage profiles still provide no authentication boundary.

Receipts, stage changes and notices commit atomically with the authoritative workspace. Restarts deduplicate committed work; concurrent human decisions/ACL changes force recomputation. There is no external-message delivery, so no claim of exactly-once email/push. Old inbox entries are trimmed but ledger keys remain. Backup rollback rewinds scheduling knowledge; replay of post-backup outcomes must be considered during disaster recovery. Policies intentionally re-version on save and can redeliver due events after explicit reconfiguration.

Regression tests cover guards, untrusted conditions, imports, notice visibility/ownership, scheduler capacity, CAS races, current metadata, source/owner revocation and actual HTTP/restart. They are not a penetration test, security certification, formal proof, production load test or independent review.

## Explorer read and organization surface (0.6)

Review `/api/explorer/query`, move-preview, saved-view/pin commands, stable links, inline previews and document.bulkMove. Recheck authorization before returning counts, groups, ordering, ancestors, references and file bytes. A directly shared document must not expose an unreadable folder name or sibling IDs. Shared view configuration and personal pin records are not access grants. Administrative authoritative state/backups still include all member records.

Bulk movement must stay all-or-nothing across permission/lock/retention/name-collision failures, with immutable original bytes and exact source versions. Preview is not authority: the server repeats the full rule set at commit. Tests cover delayed/wrong client responses and revocation; client response-binding tests use explicit transports, distinct from actual HTTP session tests. Source-folder watch delivery is still checked against the destination's current read permission.

Browser preferences and URL history may contain IDs, search terms and filters. They are account/repository-scoped for usability, not encrypted, secret from a machine owner or remotely erasable. Copying a valid address never grants read rights. Local sandbox profile switching is not authentication. The sign-in continuation preserves a requested link but checks workspace/authorization after connecting. Real-origin cookies, stored history, IndexedDB, service-worker cache interaction and native platform behavior still need independent testing.

Paging limits response/DOM size, not the complete metadata snapshot scan. Evaluate CPU/memory, document counts, folder depths and concurrent edits under production-sized inputs before making capacity claims. No penetration test, accessibility certification, native CAD qualification or independent security review was performed for this increment.

## 0.7 document sets and device inputs

Sets never grant access: project and every member read are required to expose them, with stronger live checks on originals/delivery. Lock/unlock requires explicit project management and a recorded reason. Locks and hashes are application evidence, not cryptographic signing or independent retention. Export rechecks current rights during asynchronous reads and before response delivery; two concurrent jobs and 90 MiB content limits bound but do not eliminate memory/CPU denial-of-service risks. No new public external-fetch capability was introduced.

Camera/file inputs preserve originals, including possible embedded GPS/EXIF. Phone local profiles remain untrusted workflow simulations, not authentication. The localhost filesystem boundary must not be exposed just to make a phone connect. Mobile browser permissions, safe areas, virtual keyboards, shell installation and accessibility remain unqualified.
