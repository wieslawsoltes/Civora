# 0.9 refinements

The global Go to anything palette, controlled new-document copies, removable filter chips and inspector Previous/Next are documented in [REFINEMENTS.md](REFINEMENTS.md). These retain the unified shell and existing saved-view/permission controls.

---

> **0.8 design update:** Standard toolbars and the compact Datasource/Folder/Document menu shell are now the default. The ribbon and workspace rail remain optional through View → Explorer appearance. See [Explorer design](EXPLORER-DESIGN.md) for presets, current property tabs, keyboard controls and migration. All query, saved-view, permission and move contracts below remain unchanged.

# Modern Explorer — Civora 0.6

The Documents workspace now opens as a document-management Explorer: a datasource/project/folder tree on the left, a configurable register in the center and a docked, tabbed inspector. Menus, a task ribbon, context commands, address navigation and keyboard selection use familiar desktop document-management patterns. This is original browser code and artwork, not a Bentley binary, protocol client or skin. See UI-PARITY.md and PROVENANCE.md for reference sources and explicit gaps.

## Open and navigate

Run `npm run local`, use the printed loopback address and sign in with the printed initial administrator credentials. Create a project in an empty team workspace. Documents is the default page. The browser-only `npm start` edition retains original demonstration projects; local profiles are a workflow sandbox, not authentication.

The tree shows projects and nested folders in the active workspace. Project selection includes descendants by default; folder selection starts with direct children. The **Include subfolders** control changes that scope. The tree search filters visible locations. Back, Forward, Up and breadcrumb buttons navigate within the app. The datasource button opens Storage & connections; it does not log in to multiple Bentley datasources.

Single-click a row to select it and update the inspector. Double-click or press Enter to open the existing full document inspector. Ctrl/Cmd-click toggles a row; Shift-click extends a range. Up/Down, Home/End, Shift-arrow and Space work in the register. Ctrl/Cmd+A selects the current page, not all pages. F2 edits document properties, including the filename. Selections are scoped to the active project and reset when navigation or identity changes. A maximum of 100 documents can be moved or bulk-edited in one transaction.

The icon rail keeps the existing 25 application pages available. Menus and the Home / Review & deliver / View ribbon expose real commands rather than placeholder navigation. The ribbon can be collapsed. Small screens use a folder overlay and scrollable tables/toolbars rather than compressing document names to illegibility.

## Register configuration and search

**View → Columns, sorting & density** controls visible columns, order, widths, grouping and compact/standard/comfortable rows. Filename stays visible. Standard columns cover names, numbers, titles, states, revision, discipline, checkout owner, modification date/author, type, size, folder, due date and tags. Project metadata fields are also selectable.

Drag a header to reorder it. Drag its right edge to resize; focused resize handles accept arrow keys. Click a header to sort; Shift-click adds up to three sort keys. Natural filename order places `Drawing2` before `Drawing10`. Numeric metadata definitions use numeric sorting. Group counts are calculated from readable matches, not hidden documents. Groups and search operate before paging; a group can span pages.

The location search matches literal words in visible document fields and metadata. Advanced search supports up to twenty conditions with AND or OR, including equality, containment, prefix, empty checks and numeric/ISO-date ranges. No regular expressions, SQL or executable JavaScript are evaluated. Quick state/discipline filters and per-column literal filters intersect the advanced search. Search does not index original file bodies, OCR or native CAD internals.

Pages contain 50, 100, 250 or 500 rows, with 100 as the default. Paging bounds the rendered result, not the amount of workspace metadata loaded or scanned. This is not enterprise-scale indexing or infinite-scroll virtualization.

## Personal and shared views

**Save view** stores folder/recursive scope, query, advanced/quick/column filters, columns, widths, sort, grouping, density and page size. Personal views are private to their creator through normal member projections. Shared project views require project management authority and are visible only in a currently readable scope. A view is a configuration, not a copy of documents and not an access grant. The latest committed configuration version is required for edits and deletion.

Saved Explorer views are distinct from older simple search bookmarks; no older records are silently overwritten. Deleting an empty folder also removes its folder-scoped view records. Manage saved views provides open/delete; saving the current managed view updates it, while Save current as a new view creates a separate record.

Pinned projects/folders/documents are reference-only personal records in the workspace. Recent document IDs (up to thirty), expanded tree locations and unsaved layout preferences are kept in browser local preferences scoped by repository, workspace identity/creation time and account. Search terms and view configuration in those preferences can themselves be sensitive. They are not encrypted and should not be used as a secrecy boundary on a shared browser. Save a named view for deliberate, portable query restoration. Administrators and authoritative backups retain all workspace records.

## Docked properties and preview

The inspector docks below the list by default, or on the right, or can be hidden. Splitters accept pointer and keyboard resizing. Document tabs show current properties, original-file preview, revision history, explicit dependencies, effective permissions and administrator audit entries. A selected project/folder instead shows that location's properties. The existing full inspector remains available for edits, comments and additional workflows.

Previews load the actual original blob and recheck download permission. Asynchronous loads are discarded when selection, identity, repository or permission changes. Image/SVG previews include current-revision stored markups. Supported image/text/PDF/mesh behavior remains bounded by the existing viewer; the new pane is not a full native CAD navigator. Audit data remains administrator-only where the existing member projection does not provide it.

## Stable address links

**Copy link** produces a Civora `#documents?...` address containing workspace, project and optional folder/document identifiers. Paste address validates those identifiers and current read access. A document link resolves the document's current folder, so moving/renaming it does not invalidate the ID. It does not grant access, transfer files or accept Bentley `pw:` URL/URN protocols. Opening a link requires the correct application origin and workspace; a separately copied backup with the same identities is not a distinct cryptographic tenant.

The team login gate retains a pending document link and resolves it after sign-in. Choosing the separate local sandbox discards that pending team link. Wrong-workspace links produce an error. Clipboard writing requires browser support; when unavailable the application opens a manually copyable address field. URL history rewriting can also be unavailable in isolated/file contexts.

## Atomic document organization

Select documents and choose **Move**, drag them onto a folder, or use **Cut selected → Paste / preview move**. These paths all open the same destination/validation dialog. The command remains inside one project; there is no cross-project import, recursive folder move or overwrite-on-collision in this increment.

Validation runs the actual move reducer without writing. It checks all selected source revision IDs and folders, destination membership, per-resource permissions, checkout/retention rules and duplicate names. A team request is evaluated by the authenticated server, not trusted from the browser. The preview binds the workspace revision and exact source/destination. Changed inputs, delayed mismatching responses, closed dialogs, changed identity, or an intervening edit invalidate it.

Apply executes `document.bulkMove` as **one workspace revision**, with all-or-nothing rollback and one aggregate domain audit. File blobs, revision IDs, hashes and explicit document-reference IDs remain unchanged. It does not rewrite relative CAD reference paths inside source bytes; evaluate the effect on native files before reorganizing them. Relevant source- and destination-folder watchers receive deduplicated moved notices only when they retain current read access after the move.

Cut/drag payloads contain references and source version checks, never arbitrary filesystem instructions. They are bound to the active repository/account; switching identities invalidates them. External file drops keep their existing nested-import flow and are rejected if the active repository/account changes while reading the drop.

## Contracts and limits

The independent `civora-explorer.js` library supplies normalization, querying, typed columns/values, selection, navigation history, visible saved views/pins and address resolution. `examples/explorer.mjs` uses built modules without the app to create a saved view, naturally sort documents, preview/commit a two-document move, verify unchanged bytes and resolve a stable link.

Server routes are `POST /api/explorer/query` and `POST /api/explorer/move-preview`. They require an authenticated session, accepted Origin and exact `expectedRevision`. Query output excludes the library's complete match-ID array; it returns only a bounded page plus authorized totals/group counts. See API.md for request/response contracts.

Limits: 20 advanced conditions; 30 visible columns; three sort keys; 64–900 pixel column widths; at most 100 view records created by one account, 2,000 per workspace; 200 pins per account, 10,000 per workspace; 100 documents per atomic move. Existing file/import/backup limits remain unchanged.

## Verification boundary

New domain and actual HTTP/SQLite tests cover scoped queries, saved-view ownership/versioning, pin isolation, direct-document shares with restricted ancestors, invalid config, bulk-move rollback/notifications, exact original bytes and restart. Browser interactions use the actual app and memory command engine. Delayed preview and login-continuation tests use explicitly substituted transports, not real browser session cookies. Real browser-origin persistence, hardware previews, native CAD, external providers, Windows/macOS and independent security qualification remain outstanding. See TESTING.md for counts and reproducible commands.
