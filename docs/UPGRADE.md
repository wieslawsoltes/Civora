# Upgrade to Civora 0.10.0

Back up the complete authoritative data directory and any local working roots with writers stopped. For browser-only data, export a complete workspace backup first. Retain the same data paths, replace application/server files, deploy the generated entries/worker/manifest/release together and reload editing clients. Confirm **v0.10.0** in the top bar. `npm run local`, `npm start` and `npm run server` rebuild matching generated assets automatically. Node.js 22.13 or later is required for the default local/SQLite edition, with no npm dependency installation.

**Do not clear browser site data**; it may hold your originals. A new standalone filename is a new artifact, not an automatic migration from an older downloaded HTML file. Use a served stable origin or an explicit workspace backup/restore when changing storage context. The existing update panel never force-reloads active work, and temporary-memory work must be exported before closing. No service-worker lifecycle qualification is implied.

There is no automatic schema, grant, file rename or database migration in this increment. Existing documents, layout preferences, review routes, saved views, working copies and policies are retained. Batch rename is opt-in and requires a matching UI/server build with `document.bulkRename` and its preview endpoint. Renaming changes controlled names, not OS working filenames or paths inside CAD originals. Staged approvals may require re-review after filenames change; frozen issue/delivery records are not rewritten. See [WORKBENCH.md](WORKBENCH.md).

Do not mix editing builds. For rollback, stop writers and restore matching pre-upgrade data/code together; do not delete new audit fields from live metadata. Restoration also restores the older automation/delivery receipt history. Native CAD/providers, remote scaling, real-origin browser authentication/storage, physical devices and independent security remain outside this release's new qualification.

---

## Historical release records (counts and versions below are not current)

# Upgrade to Civora 0.9.0

Back up the complete authoritative data directory and local working roots with writers stopped. Replace application/server files, keep the same data paths and run the normal startup command. Deploy generated HTML, `release.json`, manifest/icon and worker together, then reload editing clients and verify **v0.9.0**. Startup commands build the atomic assets automatically. **Do not clear browser site data**: it may contain your local documents.

No automatic document/schema migration, ACL grant, database change or historical rewrite is introduced. Copy is a new opt-in command. Existing saved views, layout preferences, 0.8.1 appearance migration, controlled sets, review routes and local working mappings are retained. Copies create new normal records; they do not update originals or carry prior source approval/hold/checkout authority. Use a deliberate destination because copies inherit its ACL.

The footer and Help/coverage panel now use the same release identity as the top bar. The offline shell remains installation/build-scoped; no old UI reset, forced reload or storage clearing is used. Choose the new standalone HTML rather than an older downloaded file when using a standalone edition. The update panel blocks a destructive reload of temporary-memory data.

New endpoints and command require matching 0.9 server/UI. Older clients do not know `document.bulkCopy`. Do not mix editing builds. For rollback, stop writers and restore a complete pre-upgrade backup with its matching previous code; do not delete metadata fields or manipulate counters. Restored backups retain their earlier notification/deadline receipt boundary.

See [REFINEMENTS.md](REFINEMENTS.md) for copy limits and current-versus-historical metadata semantics, and [TESTING.md](TESTING.md) for executed checks. Native CAD fidelity, external providers, real-origin browser persistence, physical devices and independent security/scale qualification are not expanded by this release.

---

## Historical upgrade notes

# Upgrade to Civora 0.8.1

Back up the existing authoritative data directory, stop writers, replace application files and restart using the same storage path. The startup command rebuilds the generated entries. Reload existing tabs once and verify **v0.8.1** in the top bar. Standalone users must open the new HTML file rather than an older saved copy. **Do not clear browser site data**: it may contain the actual local workspace.

All 25 routes now share one Explorer shell. Old appearance preferences are imported once into `civora-explorer-ui` schema 1 while preserving register configurations and pane sizes; the historical preference key is retained. An older explicit Ribbon selection migrates to Explorer once, after which deliberate Ribbon/Review choices persist. No workspace schema, permission or document migration is introduced.

The offline cache is now named by install scope and deterministic build, not a manually maintained v8 suffix. Entries from historical caches are cleaned only for the current installation's exact public shell URLs. Current code does not clear IndexedDB, localStorage or another app's cache. Normal browser-origin cache behavior is not qualified in this release environment.

`index.html` and `portal.html` are generated, self-contained entries. Edit `app/shell.html`, `app/portal-shell.html`, modules or styles, then build before external/static deployment. Deploy the generated HTML, worker, manifest, icon and `release.json` together. Runtime updates display a notice; they do not force-reload work. See [INTERFACE-FIX.md](INTERFACE-FIX.md).

---

## Historical upgrade notes (their version/cache statements are not current)

# Upgrade to Civora 0.8

Back up the complete authoritative data directory and any separate working roots with writers stopped. Deploy the application/server modules and generated assets together, restart, and reload every editing tab. The current shell cache is **civora-shell-v8**. No workspace schema migration, permission grant, new database, native converter or background OS service is introduced in 0.8.

The new default Documents shell uses a standard toolbar, familiar menu groups and a hidden navigation rail. **All workspaces** still exposes all 25 screens. **View → Explorer appearance** selects Explorer, Ribbon or Review and independent presentation options. Existing saved-view records and local columns/filters are retained. Existing `civora-explorer-v6` preference identities remain intentionally unchanged; the suffix is a preference-format compatibility key, not the shell cache version.

Applying an appearance preset does not reset columns/filters or modify server data. To explicitly adopt the new six-column Detailed view, use **View → Reset Explorer layout**; this resets local presentation and query state, not saved views or originals. Invalid stored dimensions are clamped and unknown appearance fields ignored. Local profile switching remains a sandbox, not authentication.

Touch mode still overrides compact target sizing. Phone cards, bottom navigation, file/drawing/model workflows, local root restrictions and team authentication remain. UI changes do not add native ProjectWise connectivity, full CAD fidelity, hardware/device qualification or independent accessibility/security assessment.

The previous upgrade notes below are historical. Their cache numbers describe those releases; **v8 is current**. All 0.7 lock, revision and package safeguards still apply. Rollback uses matching older code and its pre-upgrade backup, not deletion of current metadata fields.

See EXPLORER-DESIGN.md for settings and TESTING.md for executed checks.

---

# Upgrade to Civora 0.7

Back up the complete authoritative data directory, original blobs, credentials, operations/renditions and any uncontrolled working roots with writers stopped. Keep code and backup together for rollback. Deploy every application/server module and generated asset together; reload every editing tab. Shell cache is **civora-shell-v7**. Do not run old clients against 0.7 set records: old code does not enforce their locks/version preconditions.

Existing schema-1 workspaces, project access, originals, revisions, review routes, automation and local working-copy records remain. Older `documentIds` sets resolve as ordered Latest memberships with implicit definition version 1; their previous 1,000-member capacity is retained. Editing/locking explicitly adds new bindings. No existing collection is automatically locked, pinned, granted to another member, or converted into an issued delivery.

Phone cards and automatic input sizing are presentation changes. The optional full register and existing desktop saved views remain. Camera inputs preserve original embedded metadata. Install prompts are browser-dependent and do not imply offline team editing or a signed application.

A local launcher binds the computer's loopback interface; it is not a mobile LAN filesystem service. Use a reviewed HTTPS deployment of the ordinary team edition for shared mobile use; never bypass local root or Host/Origin restrictions. See MOBILE-TOUCH.md and SECURITY.md.

Set ZIP export is buffered and bounded, and still requires live access to every original. A manager lock is reversible through an audited explicit command; it is not a legal hold or signed archive. Restoring older backups restores older locks, definition versions and deadline receipts. Rollback requires the matching pre-upgrade code and state, not deleting new fields from current records.

The older upgrade notes below are retained as historical steps, including prior cache numbers. The current cache is v7.

# Upgrading to Civora 0.6

## From 0.5: modern Explorer and controlled organization

Back up the complete workspace/private server directory and separate working roots, stop the existing service, deploy/rebuild all assets and restart on the chosen existing data directory. Reload every tab. The generated shell cache is now **6**; do not mix older clients/server modules with 0.6. Rollback requires matching old code and a pre-upgrade backup, not deleting unfamiliar fields.

Schema 1 remains backward-readable. New optional arrays are `explorerViews` and `explorerBookmarks`; malformed replacement types or invalid records are rejected. They contain saved configurations and reference-only pins, not file copies. Existing documents, source revisions, ACLs, reviews, automation policies/receipts, recipient records, working copies and baselines are retained. No access grants or new workflow policies are automatically added.

Documents is now the default page. Single click selects and updates the docked inspector; double click/Enter opens the full inspector. The old dashboard is still Overview. Explorer view records are separate from legacy savedSearches. Old search bookmarks remain present; a legacy query is not silently converted into a full column/filter view. Use Save view for that new configuration.

Local layout/expanded-tree/recent-ID preferences use a new repository/workspace/account-scoped key. Those preferences can contain search/filter values and are not an encrypted local store. Team saved views and pins are included in administrative backups. Revoking access removes them from normal member projections but does not recall prior exports or clear another person's browser history.

Bulk moves are opt-in, previewed and limited to 100 documents in one project. They preserve source bytes and identifiers rather than rewriting native CAD reference paths. Retest native relationships before using a moved set in a design application. Atomic rejection creates no successful prefix. An old preview cannot be reused after another workspace write.

No mandatory schema migration CLI, external provider, signed installer, new port or background OS service is introduced. See EXPLORER.md and SECURITY.md for restrictions and verification.

## From 0.4: workflow rules, scheduling and notifications

Back up the full workspace, private server directory and any separate local working roots. Deploy all application and server modules together, rebuild, stop the old server and restart on the selected existing data directory. Reload every editing tab; the service-worker cache is now **5**. Do not mix 0.4 code with 0.5 records. Browser-local profiles are still a sandbox, not authentication.

Workspace schema 1 remains backward-readable. The new optional arrays are `workflowRules`, `automationPolicies`, `subscriptions`, `notifications` and `automationLedger`. Old authoritative states may omit them; malformed replacement types are rejected. Arrays appear when commands need them or the server performs a nonempty reconciliation. Existing files, revisions, metadata, baselines, routes, ACLs, root grants and working-copy ledgers are retained.

**Existing projects receive no transition rules or enabled deadline policies automatically.** New demonstration workspaces use original sample rules and a disabled deadline policy. Real administrators/managers configure each project's behavior explicitly. Assignment notices are created for new relevant actions, not backfilled for all historical actions.

The team/localhost server scheduler is enabled by default, but only enabled project policies produce outcomes. `CIVORA_AUTOMATION=0` disables automatic scans; `CIVORA_AUTOMATION_INTERVAL_MS` sets a bounded interval (default 30,000 ms). Existing due policies can run on restart. Date-only deadlines use end-of-day UTC, not the user's local time. Confirm policy ownership, reviewer grants, deadline interpretation and operational limits before enabling delegation. The server runs in its process, not as an automatically installed OS service.

Each policy save creates a new version and permits fresh receipts for currently due work. A recorded blocked action is not retried automatically forever; correct it and explicitly save the policy to reevaluate. Rule assignment and preview changes never bypass exact-reviewed-context publication, live permissions or checkout locks.

Main workspace backups/checkpoints/cloud snapshots now include notices, watches, rules and the deduplication ledger. **Do not clear committed receipt keys under active policies.** Restoring a historical backup necessarily restores its historical read status and scheduling knowledge; outcomes after that backup are absent and may run again against that restored state. The stopped-service full-directory backup procedure still applies to files, accounts, operations and renditions. Admin backups remain authoritative and include all members' in-app records.

Rollback requires the old code **and a matching pre-upgrade backup**. Earlier code does not enforce new transition rules or understand new records; merely changing package version or deleting the new arrays is not a safe downgrade. A browser IndexedDB/folder state is not protected against somebody controlling its local files.

See WORKFLOW-AUTOMATION.md, SECURITY.md and TESTING.md for exact behavior, limits and qualification.

## Earlier upgrade to Civora 0.4


## From 0.3: controlled delivery additions

Back up the full workspace and private data/working roots before upgrading. Deploy all app/package modules and the generated service worker together. The cache version is now **4**. Reload existing tabs before editing; old clients do not understand routed-stage decisions or richer metadata types. Do not run mixed client versions against the same writable workspace.

Schema version 1 remains readable. `baselines` and `reviewTemplates` are optional on older authoritative workspaces and created when first needed. Missing numbering configuration uses a monotonic default project sequence, skipping previously assigned numbers including recycled records. Existing numbers, originals, revisions, access policies and local working-copy ledgers are retained. Custom numbering is opt-in on existing projects.

Legacy single-stage reviews remain readable and use their original version-pinned semantics. New UI-created reviews use staged routes with pinned metadata. Decisions now reject held checkouts as well as newer/recycled sources. New defaults do not repair existing missing required attributes at a workflow or routed-review gate: save corrected metadata explicitly. Existing drafts/reviews are not automatically converted or reapproved.

Frozen baselines and template copies are retained in normal workspace backups/sync snapshots. They do not replace private-server/operations databases or arbitrary local working-root backups. Rollback requires the old code **and its pre-upgrade backup**: old clients may reject or mishandle 0.4 metadata/review records even though the workspace schema number remains 1. Do not edit new state with old code.

Number counters never move backward. Turning off manual numbers does not renumber older documents; it prevents manual number overrides on subsequent creates/edits. New read projections hide an entire frozen baseline or routed record when required historical dependency references are inaccessible. No new blanket document access, local-root grant, native launcher or cloud connection is enabled.

See DOCUMENT-CONTROL.md for batch/CSV limits, review context, baseline semantics and scanning boundaries.

## Earlier upgrade to Civora 0.3

## From 0.2: local integration is opt-in

Back up before changing code. Existing IndexedDB/team workspace schema and original versions remain readable. No filesystem roots, native apps, root grants or desktop services are silently enabled by the upgrade. `npm run server` retains ordinary team behavior. Use `npm run local` to opt into loopback-only integration with real sign-in.

`npm run local` defaults to **data-local/**, not the ordinary server's **data/**. To use an existing SQLite workspace, stop its old server and pass the existing directory explicitly: `npm run local -- --data "/path/to/existing/data"`. Do not run two server processes against one data directory. The local launcher deliberately selects SQLite; it is not an automatic conversion from an external database.

The first local-system startup creates an administrator-only `local-files/` root inside that data directory unless another root is configured. Existing members do not acquire filesystem grants. Choose user-specific roots and review every root's scope. Granting a root exposes its bytes independently of document ACLs; already exported copies cannot be recalled. Native launching/reveal are disabled until explicitly configured.

Existing browser workspaces are not moved automatically. Use **Local system → Workspace on disk → Copy current workspace to disk**, or open an existing `.civora` folder workspace. Writable direct-folder workspaces require a compatible browser and cooperative Web Locks. Team repository copying to a browser folder is blocked; export authorized documents explicitly.

Backups must now also include selected working roots, `.civora-work/`, `.civora-trash/`, direct-folder workspaces and trusted root/application configuration. Ordinary workspace exports/cloud snapshots do not include uncontrolled local edits or arbitrary native sidecars. Stop writers before taking a filesystem backup; see LOCAL-SYSTEM.md.

New check-ins may include `baseVersionId` to reject an obsolete working copy at the domain/server boundary. Older clients without it still use global revision and checkout checks, but lack the new native-working-copy review contract. Deploy all static assets together and reload stale clients before editing. The generated service-worker shell cache is now **version 3**; API responses and local file bytes are never included in its cache list.

The native root ownership lock includes PID and host. After an unclean shutdown, review it and use `--recover-locks` only after the old process is absent. Cross-host/unknown locks are not automatically removed. Do not share a writable folder repository among multiple machines/origins.

## Earlier upgrade: 0.1 to 0.2 (retained access changes)

## Back up before changing code

Stop the team service and take a consistent backup of the main database, all original blobs and the entire private data directory. Protect credential files. Keep the old binary/source and backup together so rollback restores both code and state. Do not copy a live SQLite main file alone and assume WAL contents were captured.

0.2 creates `operations.sqlite` and a `renditions/` directory under `CIVORA_DATA_DIR`. After upgrading, these are part of your backup along with `accounts.json` and the main repository. External database deployments still require the private sidecar and files; backing up only PostgreSQL/MongoDB/etc. is insufficient.

## Access changes intentionally

Workspace schema version 1 remains readable; the new `accessPolicies`, `groups`, `models` and `clashRuns` collections are optional on old state and initialized by new commands. **Missing ACLs mean no implicit nonadministrator access.** This is intentional: the old team-wide read behavior is not preserved as a hidden compatibility grant.

Sign in as an existing active administrator. Administrators retain a recovery bypass. In **People & access**, create groups and explicit project/folder/document grants. Use the effective-permission inspector for each role. Test from a real separate member session, including the original-file and rendition download endpoints; do not rely only on hiding navigation controls.

The synthetic demo includes broad explicit evaluation grants. Do not seed a production database with the demo or copy its policy unchanged. If your old database contains synthetic members, disable or remove them and inspect all group/policy membership before use.

## Local workspaces and caches

A server restart clears member sessions; sign in again. Existing local databases are retained, not reseeded. The new structural/services/DXF demo appears only in a fresh local database or a new explicitly seeded server. Export before replacing a local workspace.

Rebuild and deploy the whole static application together, including `app/seed-models.js`, `sw.js`, modules and stylesheet; do not mix old and new bundles. The 0.2 shell cache was version 2; 0.3 uses version 3. A stale client should reload before editing. The standalone file includes its code and does not require a separate build at runtime.

Local profile selection remains a sandbox and is now labeled more clearly. Opening the application on a team server detects the real API and shows a real sign-in gate. The optional separate local sandbox does not copy team content automatically.

## New capabilities are separate stores

Automatic renditions enqueue for supported uploads/check-ins after the upgrade; old originals are not silently rewritten or bulk-rerendered. Use Rendition studio to request old revisions explicitly. Recipient invitations are created from issued transmittals and delivered by your own channel. Existing manual transmittal receipts do not become authenticated portal receipts.

Cloud sync is opt-in. The first mismatch between unrelated workspaces requires an explicit resolution choice. Do not use incoming browser synchronization to restore or merge a live team database; it is blocked by design. Team restores remain offline administrator-controlled operations.

Newly created 0.3 workspaces receive unique workspace IDs. Existing workspace IDs are preserved. Local working-copy ledgers are also scoped by repository identity, so a copy of a workspace in another repository does not implicitly adopt the original repository's tracked files.
