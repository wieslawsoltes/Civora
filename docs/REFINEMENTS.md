# Civora 0.9 — Explorer refinements and controlled copies

This release builds on the delivered 0.8.1 source; it retains the unified Explorer shell, atomic generated applications, per-build/per-installation shell cache, server authentication and all existing document/local/model/recipient tools. It adds no native Bentley datasource connectivity and makes no complete ProjectWise parity claim.

## Go to anything

Open the top-bar search button or press **Ctrl/Cmd+K** from any workspace. Search documents, folders, personal/shared saved views, or the app's own commands. Select a category and current-project/all-readable-projects scope. Use `>` to search commands, arrows to select, and Enter to open. Example: `> appearance`, `> open reviews`, `tag:handover`, or a document name/number. Search is metadata-only: original file text and native CAD content are not indexed.

The interface and keyboard registry cover all 25 workspaces. Opening a command uses the actual existing dialog or navigation handler; the search box cannot execute code. It refuses to replace an existing modal form. Recent document IDs are local navigation preferences, not access grants. Results never bypass normal source-resource access. Empty search promotes readable recent documents and a small selection of other categories; counts represent all readable matches, while the shown subset is bounded.

The pure navigation library applies the permission projection before calculating results/counts. Bounds are 240 query characters, 80 results per library call (60 in the UI), 30 recent IDs and 100 inert command descriptors. Current server search still loads/scans whole-workspace metadata; this is not a full-text index or enterprise-scale search service.

Team search uses authenticated `POST /api/explorer/quick-search`, an expected workspace revision and the repository's own base URL. The server ignores any caller-supplied command list. UI query changes, scope changes, workspace/account changes and closing invalidate outstanding responses. Enter/click cannot activate stale results while new results are pending. A returned query/scope/revision mismatch is rejected. Network failure offers explicit Refresh rather than switching to an unscoped local index.

## Controlled copies

Select up to 100 documents and choose **Document → Copy as new documents**, the selection bar's **Copy**, a document action sheet, the inspector's copy button, or Ctrl/Cmd+Shift+C outside a text input. Normal Ctrl/Cmd+C is not intercepted. The copy editor is shared between desktop and phone.

Choose the destination project/folder, exact stored source versions, new filenames/titles, matching metadata/tags, relationship policy and required reason. Suggest available names proposes deterministic case-insensitive ` - copy` suffixes while preserving extensions. Suggestions use only the readable register and are not reservations. Authoritative validation checks all destination names, including those hidden from the caller. Destination metadata overrides can set common values for the complete batch, including canonical boolean false and required numbering values.

**Validate copy** runs the real reducer on discarded state. It reports allocated destination numbers, source versions, current metadata and omitted/remapped relationships. No file, numbering counter or workspace record changes during preview. Any changed input invalidates that preview. A later workspace revision requires fresh validation; the final command independently repeats every policy, metadata and naming check. A successful batch commits exactly one workspace revision and one aggregate administrative audit entry.

The application-level engine and authenticated server verify each unique source Blob's size and SHA-256 hash before commit. Originals are content-addressed and reused rather than uploaded/duplicated. Limits: **100 source documents**, **50 MiB per file**, **250 MiB of unique source content per batch**, **500-character reason** and **240-character filename**. Verification reads and hashes one file at a time; the server permits two concurrent verification tasks. Missing/corrupt content aborts the batch. The server rechecks the session and revision after verification; store compare-and-swap protects the final write. These checks are not an independent security qualification.

### What a copy is—and is not

Copies have new document/version IDs, a newly allocated destination number and one new **P01 / Work in progress** revision. They inherit **destination ACLs**, not the source's explicit grants. They do not inherit approvals, review decisions, checkout, legal hold, due dates, prior revision history, issued deliveries, model registrations, markups or working-copy mappings. Existing sources and their constraints remain untouched. The administrative audit contains the source-to-copy ID/version mapping; newly copied records do not expose source links to destination-only readers.

An active author/manager/admin needs source download and destination write authority. **Cross-project copying additionally requires source share permission**, subject to existing role ceilings. There is no implicit permission grant. Copying makes selected content and metadata available under the target location's policy; the user must choose that target deliberately. Local profile switching remains a sandbox, not authentication.

Historical selection means historical **bytes**, but the description, metadata, tags and explicit relationships come from the **current source record** unless edited in the form. This distinction is visible in the editor. A checked-out source copies its selected committed version, not unsaved external-editor changes. An approved/published source becomes fresh work in progress, not a duplicate approval.

Relationship mode `selected` remaps only direct Civora reference IDs whose source documents are in the same batch. Unselected references are counted and omitted; `none` omits all relationships. No implicit dependency traversal/import, native DGN/DWG/RVT reference-path rewrite, external hyperlink rewrite, or file conversion occurs.

The reusable pure reducer/preview deals with metadata only. Integrators must use `WorkspaceEngine.run` or call `verifyCopyContent` before a compare-and-swap commit; calling the pure reducer directly cannot verify file bytes. See `examples/refinements.mjs`.

## Explorer polish

Active search, state/discipline, advanced conditions, column filters and special collection scopes appear as removable chips. **Clear filters preserves columns, sort, density and folder scope** instead of resetting the register layout. A saved-view badge indicates unsaved filter/layout differences; neither operation edits a shared saved definition without its normal save command.

A context strip identifies the selected document/revision and offers Previous/Next within the currently loaded page, plus direct copying. Browsing preserves the chosen inspector tab and a multi-selection batch. Revision rows now use the actual stored `createdBy` author. Footer, top-bar and coverage-dialog versions all use the shared release identity, eliminating residual hard-coded older labels.

The palette and copy form reuse Explorer theme variables, have coordinated dark appearance and visible focus states. Phone layouts stack inputs, retain a reachable sticky action footer, permit scrolling within large results/batches and use touch-size controls. Native page zoom remains enabled. Browser-emulated touch checks are not physical iOS/Android, virtual-keyboard or accessibility conformance qualification.

## Verification and upgrade

See [TESTING.md](TESTING.md) for actual executions and [UPGRADE.md](UPGRADE.md) for rollout. Do not clear site data to adopt this UI; it may contain the local workspace. No new schema table or permission migration is needed. Old clients cannot issue the new copy command and must be reloaded with the matching server/build. All prior native CAD, live-provider, distributed-scale, independent security and device-qualification boundaries remain.
