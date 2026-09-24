> **0.8.1 update:** All workspace routes now use the Explorer shell; old appearance settings migrate once and generated HTML/JS/CSS is deployed atomically with scoped offline caches. See [INTERFACE-FIX.md](INTERFACE-FIX.md). Feature boundaries below remain unchanged.

# Architecture — Civora 0.8.0

## Transaction and storage boundary

A UI action becomes a `{type, payload}` command. The pure core engine resolves an active actor, applies role ceilings and hierarchical authorization, clones and validates workspace state, enforces business rules, increments a global revision and appends a domain audit entry. Rejected commands do not mutate their input. `WorkspaceEngine` serializes commands from one UI instance; repositories use `expectedRevision` compare-and-swap to reject stale updates, not silently replay them.

Original files are immutable SHA-256-addressed blobs. Revisions have separate IDs, labels and metadata; restoration creates another revision. Reviews, model registrations, rendition inputs and transmittals pin source version IDs and hashes. Document sets remain live collections. A successful metadata commit is not reported as failed merely because a later automatic-rendition enqueue fails; operational failures are surfaced separately.

The singleton metadata snapshot deliberately remains the source of truth. This is coarse optimistic concurrency, not a CRDT, normalized enterprise data store or automatic distributed merge.

## Modules

| Module | Responsibility |
|---|---|
| explorer | Pure view normalization, access-filtered query/values, personal/shared view and pin commands, navigation/selection/link models |
| core | Pure commands, business validation, model/search helpers; no DOM or database |
| access | Pure policy validation/evaluation, command authorization and safe read projection |
| storage | IndexedDB, memory and HTTP repositories; file preparation, verified backups; archive helper |
| engineering | Bounded source parsers, meshes, transforms, geometric statistics and clash tests |
| renditions | Dependency-free PDF/SVG/mesh generation for the supported subset |
| sync | Session-bound immutable snapshot DAG and explicit conflict resolution |
| model-viewer | WebGL display and bounded Canvas fallback; selection, section and measurement |
| viewer | Document previews, text differences, image markup and original bounded OBJ preview |
| connectors | Google/Microsoft/Dropbox OAuth and immutable cloud snapshot transport |
| controls | Original icons, safe HTML utilities, dialogs, formatting and UI primitives |
| app | Twenty-five-page composition, feature workspaces, forms, original synthetic fixtures |

The twenty-two library bundles include `archive` as a separate entrypoint from storage. Bundles contain their own dependency closures; source-level imports share modules. The deterministic build rejects unsupported/external import syntax and uses neither `eval` nor dynamic source compilation.

## Identity and read projection

The team service derives identity only from a valid session. Client-supplied actor IDs are ignored. ACLs cover workspace, project, nested folder and document scopes. A selected local profile is only a simulation: the local database owner can change it and has all underlying bytes.

Before returning team state, the server projects it through the signed-in member's policy context. Hidden documents, associated references/reviews/model sources and related records are removed. Restricted ancestor shells preserve navigability for direct document grants without disclosing project metadata. The full audit log is administrator-only. File and rendition downloads independently check current authorization, so possessing a hash/job ID is insufficient.

SSE is scoped invalidation, not operation streaming or collaborative presence. A fingerprint of the projected view suppresses notifications for hidden-only changes. Session activity and permission are checked when notifying and periodically. Global revisions and timing are not a full covert-channel-resistant protocol.

## Durable operations

`server/operations.mjs` adds a private SQLite sidecar for rendition jobs, recipient accounts, deliveries, recipient sessions and chained security events. It uses transactions, WAL and full synchronization. The sidecar is required even when the main repository uses an external database: this edition is single-node.

One leased rendition runs at a time. Built-in parsers run in a memory-bounded worker thread with a deadline. Native adapters run without a shell, in private temporary directories, with bounded outputs and timeout; they are not an OS sandbox. Outputs are stored separately from originals. Missing/failed source processing is explicit, not replaced with a fake successful thumbnail. Restart recovers expired leases; repeated failure reaches a final failed status.

Recipient delivery data lives outside the member workspace and uses a separate session cookie. Enrollment consumes a hashed invitation once. Reads check recipient, expiry and revocation each time and return only the frozen package. Receipts record the authenticated account, source hashes and server time but are not qualified signatures.

## Sync is separate from live team storage

Provider connections transport append-only full backups. The sync engine compares canonical workspace fingerprints and parent-linked immutable snapshots. It stops on divergent heads rather than choosing a winner. Explicit user resolution preserves old snapshots and joins their history. Incoming browser replacement is allowed only for local repositories, with checksum validation and revision CAS. Team servers allow outgoing backup only.

Tokens are memory-only. Periodic sync exists while the app is open and authorized; it is not a server daemon, a service-worker background transfer or incremental record replication.

## Storage and limits

IndexedDB stores a root record plus blobs in a single transaction; BroadcastChannel invalidates peers. SQLite and optional SQL adapters serialize state writes transactionally. MongoDB uses CAS metadata plus GridFS, with possible unreferenced blobs after interruption and no automatic collector. External drivers have not been live-qualified.

The paginated document API filters authorized rows and guards a revision cursor, but currently scans the whole metadata snapshot. The UI also holds its projected snapshot in memory. Jobs, request limits and pagination do not make the architecture horizontally scalable. Shared identity/session state, distributed jobs, normalized querying, streaming object storage and production load qualification remain separate work.


## Local filesystem and working-copy boundary (0.3)

`packages/filesystem/index.js` defines the browser-granted and HTTP-root filesystem adapters, portable paths, byte hashes, handle bookmarks and reconciliation monitor. `repository.js` adds immutable disk-folder checkpoints; `working-copies.js` adds per-workspace/account linkage and checked export/import/check-in; `text.js` retains supported encoding/BOM/newlines; `drop.js` captures transient drop capabilities and drains directory batches. Five additional independent bundles expose these entrypoints.

A working copy is not a mutable original. The controlled revision is immutable; edits outside the repository need explicit check-in. The link records source version ID and content hash. Native edits, remote revisions and account changes are checked independently. Failed/missing/revoked copies are reported, not silently reused. A permitted filesystem grant is distinct from current domain permission; previously downloaded OS bytes cannot be remotely revoked.

`server/local-filesystem.mjs` enforces a canonical root with ordinary-file checks, serialized operations, no-clobber creation, replacement archives and expected hashes. `server/local-system.mjs` enforces exact loopback origin/session/root grant and fixed executable arguments. `scripts/local.mjs` reuses the existing SQLite/member server rather than making a second unauthenticated backend. Root configurations are trusted startup inputs, not client-supplied arbitrary paths.

Disk folders are capability/OS-controlled storage, not a new server trust boundary. The directory repository uses origin-scoped Web Locks and a final guarded HEAD update; it does not claim an atomic OS CAS against an independent native writer. Native roots use a same-host ownership lock for cooperating processes; the root adapter cannot sandbox hostile OS processes. Detailed limits, backup coverage and platform qualification are in LOCAL-SYSTEM.md.


## 0.4 module boundaries

`packages/document-control/index.js` is a pure module: metadata/numbering normalization, frozen record capture/comparison and ordered review logic. It does not import core/access/storage and therefore introduces no dependency cycle. Core imports it for authorized command execution and full-state validation. Access control filters baselines/templates/routes and checks new commands before mutations.

`register.js` is pure bounded CSV interchange. `references.js` is pure bounded discovery/resolution over a caller-supplied access-filtered state. `archive.js` explicitly depends on storage/access to verify current download authority and SHA-256 bytes before creating a baseline ZIP. `app/document-control.js` handles DOM, dialogs and previews; it never writes around the command engine.

Bulk updates stage ordinary property commands against a cloned workspace, then publish just the final document list with one outer revision and aggregate audit event. This favors reuse of validation/authorization over large-batch throughput. It remains bounded to 100 records; whole-state cloning/CAS is not a normalized enterprise query/update store.

New optional workspace collections are `baselines` and `reviewTemplates`. Rich project fields, numbering settings and staged review properties are optional additions to schema 1. Backward reading of old data is tested; editing new records through old client builds is not supported. Twenty independent library bundles are emitted; each includes its dependency closure.


## 0.5 workflow and notification boundaries

`packages/automation/index.js` is a pure engine importing authorization and document-control helpers, never DOM/network/timers. Core imports it for transition predicates/actions, new commands, validation and reference-only notification creation. The source dependency graph remains acyclic. The 21st standalone bundle includes its dependency closure. `app/automation.js` owns UI/editor/preview interactions; authoritative HTTP preview goes through the current repository base URL and actual server identity.

`server/automation.mjs` owns only scheduling/orchestration: bounded timers, single-process coalescing, authoritative read, pure computation, CAS save, notification/invalidation callback and error telemetry. Effects and deduplication receipts commit together inside the existing workspace. No message broker, second identity source, approval robot, distributed lease service or external transport is invented. Empty scans are read-only. CAS conflicts re-evaluate current source and authority, including a human decision or revoked owner winning the race.

Workflow predicates use pre-transition state; bounded assignments merge in stable priority/identifier order. Publication checks the final metadata against reviewed context. Notification production shares the originating command transaction; notices resolve live metadata only after read-time authorization. The access cache is explicitly invalidated around state mutation/validation so a previous authorization snapshot cannot mask changed ACLs. Admin authoritative state remains complete; member projections and personal endpoints filter notifications/subscriptions and managed configuration.

New optional arrays are `workflowRules`, `automationPolicies`, `subscriptions`, `notifications` and `automationLedger`. They participate in existing backup/folder-checkpoint/sync serialization. Whole-workspace size/concurrency limits remain; an indexed notification endpoint is not claimed. Detailed current contracts are in WORKFLOW-AUTOMATION.md.

## Explorer presentation and read contract (0.6)

`app/explorer.js` is a replaceable presentation controller. It delegates writes to WorkspaceEngine and retains the main app's document/review/local commands. Delegated DOM handlers are scoped by an AbortController; preview handles are destroyed and asynchronous tickets discarded at rerender/identity change. Layout and recent-ID preferences are separately scoped by repository, workspace identity/creation and account.

`packages/explorer` can query an authoritative state or the actor's matching projection. Nonadministrator raw inputs are projected first, removing restricted ancestor details and hidden relationships before search, counts or returned items. Server `/api/explorer/query` applies the session actor and expectedRevision, exposes bounded items, and omits the pure library's full match-ID array. It is a metadata scan over the existing snapshot, not a new normalized index.

Saved view/pin commands enter the same validation/audit/CAS transaction as other records. Shared configurations require project management; personal records remain owner-scoped in member projections. Administrators and authoritative backups retain full records.

`previewDocumentMove` constructs exact source-version/folder items and dry-runs `document.bulkMove`. Commit validates the expected global revision and each normal document.move rule against a staged clone, then returns only the final document array in one outer command. Nested intermediate mutations never reach the repository. An aggregate audit and deduplicated current-access-checked source/destination watch events are produced at the outer revision. Bytes and revision graphs are untouched.

## 0.7 modules

`packages/document-sets` owns ordered revision bindings, definition validation, access-aware resolution and original package construction. Core/access integrate its mutations/projection contracts. The server exposes authenticated resolve/export; the local engine uses the same source library. `app/document-sets.js` is the responsive collection workspace. `packages/interactions` separates camera geometry and pointer state from DOM adapters. `app/mobile.js` owns navigation/input presentation, without inventing a second database or authentication model. Image/model viewers register and dispose their own input handlers. All modules build independently with their dependency closures; shared source imports avoid duplicate bundles when composing an application.


## 0.8 presentation refinement

The existing `packages/explorer` module owns pure, bounded layout normalization, visual presets and the new Detailed view defaults. `app/explorer.js` remains the integration boundary for menus, datasource disclosure, properties, commands and personal layout persistence. Presentation uses the same active account/repository identity key and does not update workspace state when preferences change. Existing saved-query contracts remain intact. The standard toolbar and grouped ribbon call the same authorized command handlers; mobile menus retain those actions rather than duplicating a separate mobile domain engine. Styles are original CSS using system fonts, not a copied native toolkit or external component framework. No backend data or security architecture was replaced in this increment.
