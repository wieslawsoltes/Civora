# Civora 0.10 — revision workbench and controlled filenames

**Browser demo:** [Open Civora](https://wieslawsoltes.github.io/Civora/) · **Source:** [wieslawsoltes/Civora](https://github.com/wieslawsoltes/Civora) · [Deployment guide](docs/GITHUB-PAGES.md)

The public demo is browser-local. Authenticated team databases, recipients, background workers, and native filesystem access require the included server; GitHub Pages does not run them.

An independently authored engineering document-management and project-delivery application in plain HTML, CSS and JavaScript. Includes browser-local storage, folder-backed workspaces, an authenticated localhost/team server, reusable libraries and optional cloud/database adapters.

**This is not complete ProjectWise parity, a native CAD engine, or an independently security-qualified product.** See [coverage](docs/COVERAGE.md) and the [verification record](docs/TESTING.md).

## Start locally

Requires Node.js 22.13+. No npm installation is needed for the default local/SQLite edition.

```sh
npm run local
```

Open the printed address, normally **http://127.0.0.1:8787**, sign in as **admin@civora.local** using the initial password printed in the terminal, and open **Documents** or **Local system**. Existing credentials are retained on restart. The server starts empty; create a project and import your files. Default storage is `data-local/`, with an administrator-only root at `data-local/local-files/`.

```sh
npm run local -- --data "/absolute/path/to/private-data" --files "/absolute/path/to/working-files" --open
```

Windows/macOS/Linux launch scripts are included: `start-local.cmd`, `start-local.command`, `start-local.sh`. These require Node and run a foreground service; they are not installers or a background OS service. Use the exact printed loopback address. Local integration is deliberately not exposed to a LAN or arbitrary browser origin.

For browser-only/IndexedDB storage, run `npm start` and open **http://127.0.0.1:8080**. Compatible browsers can connect a granted folder and create/open a `.civora` workspace there. The self-contained app is `dist/civora.html`; serve it on localhost/HTTPS for reliable secure APIs instead of relying on a file URL. Temporary-memory mode is explicitly labeled when durable browser storage is unavailable.

For the ordinary authenticated team edition without filesystem endpoints, run `npm run server`. Production/network hosting has additional requirements; see [security](docs/SECURITY.md).

## New in 0.10

**Revision workbench.** Compare exact stored originals with actual size/hash verification, insertion-aware text alignment, change navigation, unified/split views, 120-row paging and evidence export. SVG/raster revisions have same-scale wipe/opacity/side views. Unsupported or oversized formats get an explicit hash/size-only result, not fabricated semantic comparisons. Phone layout defaults to unified text with compact revision controls and expandable options.

**Controlled filename batches.** Literal generators, per-row edits and a reasoned before/after preview feed one all-or-nothing rename transaction. Final-state collision validation supports name swaps, enforces source permissions/current versions and preserves extensions, IDs and original bytes. Renames are audited per source and invalidate current staged-review context where appropriate. Local working filenames and native CAD paths are not rewritten.

**Everyday UI reliability.** Compare is directly available from Versions and the phone Document menu. Shift+F2 opens Rename; existing F2 properties remains. Dialogs discard stale reads/previews, close or clear on account changes, preserve page zoom, and match dark/light Explorer appearance. All existing workspaces and the unified shell/cache fix remain.

Current verification: **611 Node tests**, **201 UI checks**, **79 static HTTP checks**, **29 standalone libraries**, **eight executable examples**. See [the workbench guide](docs/WORKBENCH.md), [testing](docs/TESTING.md), and [upgrade instructions](docs/UPGRADE.md). Normal browser navigation remains blocked in the test environment; isolated UI and explicitly labeled fixtures are not live browser-origin/device qualification.

## Retained from 0.9


**Faster navigation.** The universal **Go to anything** switcher (Ctrl/Cmd+K or the visible phone search button) finds readable documents, folders, saved views and commands from any workspace. Includes typed categories/scopes, recent IDs, keyboard selection, literal/qualified metadata search and stale-response protection. It does not index original file contents.

**Controlled copying.** Select 1–100 documents and use **Copy as new documents**. Preview exact stored revisions, destination filenames/numbers, metadata and selected-reference remapping before one verified transaction. Copies inherit destination access and start P01 / Work in progress; approvals, locks and history are not copied. Cross-project copying requires source share authority. Missing/corrupt originals and stale previews abort the batch. The original content is not modified, converted or natively reference-rewritten.

**Explorer polish.** Removable filter chips, unsaved-view indicators, layout-preserving Clear filters, previous/next inspector controls, correct revision authors and shared version labels. New dialogs use coordinated dark/touch presentation and sticky copy confirmation controls. The unified 0.8.1 shell/cache fix is retained across all 25 screens.

Historical 0.9 verification: **549 Node tests**, **177 UI checks**, **72 static HTTP checks**, **27 standalone libraries** and **seven executable examples**. Browser checks use the actual app in an isolated memory repository and explicitly labeled storage/transport fixtures; normal Chromium navigation remains blocked. See [the refinement guide](docs/REFINEMENTS.md), [testing](docs/TESTING.md) and [upgrade instructions](docs/UPGRADE.md).

## Retained fix from 0.8.1


The Explorer shell no longer disappears when switching away from Documents. All 25 pages share the new header, workspace navigation, chrome and mobile layout. Historical appearance settings migrate once without rewriting documents or saved views; intentional new Ribbon/Review choices persist.

HTML, styles and code ship together as an atomic build. Startup commands rebuild automatically, the offline cache is scope/build-specific, and the version badge reports the actual loaded build. Updates never automatically reload active work or clear site data. A temporary-memory workspace must be exported before it is closed. See [the fix and upgrade guide](docs/INTERFACE-FIX.md).

The 0.8.1 regression suite had **475 Node tests**, **154 UI checks**, **65 static HTTP checks**, 25 independent libraries and six runnable examples. The browser qualification boundary remains explicit in [TESTING](docs/TESTING.md).

## Retained from 0.8

**Explorer-first visual design.** A compact standard toolbar, Datasource/Folder/Document/View/Tools/Window/Help menus, yellow-folder datasource hierarchy, blue selection, separate filename/description columns and lower tabbed properties replace the tall default ribbon/dark rail. All 25 tools remain reachable from All workspaces. The former ribbon remains optional.

**Three appearance presets.** View → Explorer appearance offers Explorer, Ribbon and Review, with independent command, docking, density, grid-line and rail controls. Preferences remain browser/account scoped; existing saved views are not rewritten. True metadata Attributes and selected-source Folder properties are available beside the existing preview/version/reference/access tabs.

**Interaction reliability.** Fixed selection-induced row shifts that interrupted double-clicks and selected-project auto-expansion that defeated tree collapse. Added keyboard menubar/tree/tab navigation and F6 regions, with focus restoration. Phones keep cards, touch action sheets, bottom navigation and model/drawing gestures; explicit Touch mode overrides compact targets.

The 0.8 release included **449 Node tests**, **143 UI checks**, 25 independent bundles and six examples. See [Explorer design](docs/EXPLORER-DESIGN.md), [UI coverage](docs/UI-PARITY.md) and [testing](docs/TESTING.md) for the exact scope and the opaque-origin/explicit-fixture browser test boundary. This is not full ProjectWise UI parity or independent accessibility qualification.

## Retained from 0.7

**Touch-first Explorer.** Adaptive phone cards, explicit selection/sort/action sheets, a five-action dock and searchable access to all 25 screens. Desktop tree/register/ribbon/preview workflows remain intact. Coarse-pointer detection plus explicit input preferences, responsive dialogs, safe-area sizing, focus restoration, dark appearance and a full-table option support mixed desktop/tablet/phone use.

**Drawing and model touch review.** Actual image/SVG pan/pinch, Fit/zoom/pan buttons, two-tap revision-linked rectangles and separate Drawing/Notes panels. Models support orbit, pinch, explicit pan/directional controls, aspect-aware fit, and mobile Elements/properties access. Gesture cancellation never silently becomes an annotation or selection. Site photo input routes through the ordinary uploader; real camera/OS permission behavior remains unqualified.

**Controlled document sets.** Ordered Latest/fixed revision members, versioned edits, explicit reorder/pin controls, reasoned manager lock/unlock, frozen names/paths/revisions, current-read-filtered visibility, original recycling guards, verified original-file ZIPs and exact-source delivery drafts. Sets grant no access. Legacy one-thousand-member sets retain their capacity. Packages are bounded to 90 MiB and two concurrent server exports.

Start with [Mobile & touch](docs/MOBILE-TOUCH.md), [Controlled document sets](docs/DOCUMENT-SETS.md) and [UI coverage](docs/UI-PARITY.md). This is not full feature/UI parity, a native mobile app, an offline team-edit queue or independent accessibility qualification.

## Retained from 0.6

**Modern Explorer UI.** Documents is now the default page: datasource/project/folder tree, menu and task ribbon, breadcrumb/address navigation, row context menus, keyboard/range selection and a tabbed inspector docked below or beside the register. Columns support resizing, drag ordering, metadata values, three-key sorting, grouping, inline filters, row density and bounded pages. All 25 application pages remain accessible through the rail and menus; light/dark/mobile layouts are included.

**Saved views and shortcuts.** Personal/shared versioned configurations retain folder scope, advanced/quick/column filters, columns, widths, grouping and sorting. Pins reference current resources without granting access. Stable Civora links resolve a document's current location after moves and can continue through the team sign-in gate. Recent IDs/layout preferences are repository/workspace/account-scoped; authoritative backups remain administrator-visible.

**Scoped search and transactional organization.** Queries apply current permissions before matching, counts, grouping, sorting and paging. The authenticated API exposes bounded pages, not a hidden ID catalog. One-to-100-document moves use read-only validation followed by one all-or-nothing commit, retaining exact file bytes and revision IDs. Drag/drop and cut/paste share this path. Stale requests, changed destinations, unauthorized sources, duplicate names and locked documents fail without partial moves. Source/destination watches produce deduplicated notices subject to current access.

Start with [Revision workbench](docs/WORKBENCH.md), [Modern Explorer](docs/EXPLORER.md) and the [reference-interface matrix](docs/UI-PARITY.md). This is not a native ProjectWise datasource client or pixel-perfect/full feature parity. No source CAD reference path is rewritten by a move.

## Retained from 0.5

**Conditional workflow rules.** Project-scoped typed AND/OR predicates, required reasons, deterministic metadata/tag assignments, pause/resume, and a visual editor with structure-preserving nested-expression editing. The server applies existing permissions, locks and approval gates; rules cannot execute scripts or approve information. Read-only transition previews bind the exact inputs and workspace revision, then use the same real command to commit.

**Unattended deadline handling.** Optional project policies for reminders, overdue records and guarded delegation of one remaining review voter. The running team/localhost server scans without an open browser; policy authority, current source context, delegate access, separation of duties and unchanged quorum are rechecked. Outcomes and deduplication keys commit with the workspace, survive restart and record blocked work. Idle scans do not change revisions. Browser-local/folder workspaces reconcile explicitly.

**Personal notification center.** Project/folder/document subscriptions, event filters, current-permission projection, read/unread, snooze, pagination and deep links. Notices store reference-only records rather than copied document content. Delivery is in-app only; there is no SMTP/email, SMS or external push.

**Interface and operations.** Two additional workspaces, rule/policy editor, transition-result preview, due queue, exported execution history, actual server scheduler status and operational errors. Light/dark/mobile interactions retain the existing delivery and local-system workflows.

Start with [Workflow automation](docs/WORKFLOW-AUTOMATION.md). Existing workspaces receive no new rules/policies automatically. The fresh browser demonstration has original sample rules and a disabled deadline policy.

## Retained from 0.4

**Document control.** Six metadata types, choice/default/format/range constraints, a quality-exception view, atomic monotonic numbering, and a 100-document bulk editor with before/after previews. Editable CSV round trips preserve protected IDs and reject stale or invalid batches without partial writes.

**Ordered approvals.** Reusable templates, up to eight named stages, per-stage quorum and deadlines, separation of duties, reasoned reassignment, immutable decisions, and current-stage task inbox. Routed approvals pin both original file revisions and controlled metadata; changing either blocks reuse for publication. Legacy single-stage reviews remain available.

**Frozen baselines.** Exact source revisions, optional recursive dependencies, immutable metadata snapshots, current/baseline comparisons, checked original-file ZIPs, and baseline-pinned transmittals. These are application-level records, not signed/WORM-certified archives or native CAD bind operations.

**Bounded reference discovery.** ASCII DXF xrefs/images/underlays, static SVG links and OBJ material-library statements. Exact path matches are previewed; the user confirms controlled relationships. No external path is opened, source file rewritten or unavailable native parser implied.

**Interface.** Three new screens: Document control, Revision baselines, and My work. Metadata upload controls now support choices, booleans and numeric bounds; the document selection bar offers bulk properties, editable CSV and baselines. Select-all reflects selection accurately, including mixed state. Light/dark/mobile layouts are tested.

Start with [Document control](docs/DOCUMENT-CONTROL.md). The local-system capabilities from 0.3 remain included.

## Local system (introduced in 0.3)

**Local system workspace.** Scoped folder locations, explorer/search/pagination, nested folder import and drag-and-drop, original-file export with manifest, project ZIP export, Unicode filenames, local file inspection, byte-preserving text editing, file rename/move, recoverable trash, read-only connections, and folder permission errors.

**Controlled working copies.** Verified export, exclusive checkout, repository/workspace/account-scoped indexes, local/remote change detection, explicit refresh with preservation of conflicting edits, hash/revision/permission-checked check-in, and native application launching through an administrator-owned executable allowlist. Native opening is opt-in, has no shell and is separate from proprietary CAD integration.

**Disk-backed workspaces.** Immutable metadata checkpoints and original blobs, guarded HEAD updates, integrity checks, explicit checkpoint recovery, remembered browser folder handles where supported, and restart-tested localhost SQLite/files. Folder profiles remain a local workflow sandbox, not OS authentication.

**Local security controls.** Exact loopback Host/Origin and sessions, explicit root user grants, read-only roots, reserved control files, traversal/link/special-file protections, guarded writes, process/host ownership locks and security-event recording. Root grants expose all files in that root; they do not make previously exported files remotely revocable.

## Existing delivery features retained

Projects/templates/folders, metadata and search; controlled immutable revisions; reviews and exact-current-revision approvals; explicit document references; comments, issues and RFIs; document sets; revision-pinned transmittals and recipient deliveries; image/text/PDF previews; bounded model parsing/federation/clashes; durable supported-format renditions; ACL groups/inheritance and effective access; session-bound cloud snapshots; operational views and original synthetic demonstration data.

The interface now has **twenty-five pages**, with responsive layouts, compact mode and light/dark themes.

## Storage and identity

| Option | Status |
|---|---|
| Memory fallback / IndexedDB | Implemented. Memory tested; real-origin IndexedDB remains unqualified here. |
| Browser folder repository | Implemented. Actual Node-backed disk format and API/UI fixtures tested; real browser folder-grant persistence unqualified. |
| SQLite / localhost | Actual HTTP, authentication, byte integrity, concurrency and restart tests pass. |
| PostgreSQL, MySQL/MariaDB, SQL Server/Azure SQL, MongoDB/Atlas | Optional adapters; live services not exercised. |
| Google Drive, OneDrive/SharePoint, Dropbox | OAuth snapshot backup/sync adapters; live account flows not exercised. |

Local profile switching is not authentication. Real team/localhost sign-in derives identity from a server session. New members have neither implicit document access nor implicit local root access. Team administrators retain the documented document-ACL recovery bypass; root configuration still requires their explicit user ID.

## Build and tests

```sh
npm run check
npm test
npm run build
node tests/static-http.mjs
node examples/workbench.mjs
```

**611 Node tests pass**, including actual authenticated HTTP/SQLite, local disk and restart tests. Eight independent `.mjs` examples exercise the built libraries without an application shell. Optional Python/Playwright harnesses run **201 UI checks** across all retained/new suites:

```sh
python tests/run-ui-suite.py
```

The environment blocks Chromium URL navigation. UI checks use the real application in an isolated memory repository with explicitly identified directory/transport/delay fixtures, not real-origin permission prompts, browser cookies or mounted drives. See [exact evidence and gaps](docs/TESTING.md).

## Reusable libraries

`npm run build` creates **29 independent ES modules** in `dist/lib`, each with its dependency closure. New in 0.10: `civora-comparison.js` and `civora-document-rename.js`. Retained modules include core, storage, archive, access, engineering, renditions, sync, model-viewer, viewer, connectors, controls, filesystem, folder-workspace, working-copies, local-text, folder-drop, document-control, editable-register, baseline-archive, reference-discovery, automation, explorer, document-sets, document-set-archive, interactions, document-copy and navigation. Source modules can instead share dependencies when imported from `packages/`.

Eight independent executable examples: `core.mjs`, `local-text.mjs`, `document-control.mjs`, `automation.mjs`, `explorer.mjs`, `document-sets.mjs`, `refinements.mjs` and `workbench.mjs`. `examples/local-folder.html` demonstrates a browser directory repository; the localhost implementation is in `server/local-filesystem.mjs`, `server/local-system.mjs` and `scripts/local.mjs`.

## Documentation

Start with [Revision workbench](docs/WORKBENCH.md), [Modern Explorer](docs/EXPLORER.md), [Workflow automation](docs/WORKFLOW-AUTOMATION.md), [Document control](docs/DOCUMENT-CONTROL.md), [Local system](docs/LOCAL-SYSTEM.md) and [Upgrade](docs/UPGRADE.md). The [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [databases](docs/DATABASES.md), [OAuth connectors](docs/CONNECTORS.md), [native-CAD boundaries](docs/NATIVE-CAD.md), [sync](docs/SYNC.md), [portal](docs/PORTAL.md), [operations](docs/OPERATIONS.md), [coverage](docs/COVERAGE.md), [security](docs/SECURITY.md) and [independent-review handoff](docs/SECURITY-REVIEW.md) separate implementation from qualification.

## Boundaries

Local files remain bounded to 50 MiB, text editing to 2 MiB, and imports to 5,000 files per batch. Native root creation needs hard-link support; unsupported filesystems fail safely. Recursive folder rename/deletion, signed desktop installers, Explorer/Finder shell extensions, OS-service installation, multi-host folder writing, full native CAD round-trip, enterprise-scale/HA operation, real external-provider qualification and independent security assessment are not included. Native Windows/macOS and mounted network/removable drives still require testing.

MIT license for this original source. No Bentley source, binaries, SDK, logos/artwork or proprietary CAD engines are bundled. [Provenance](docs/PROVENANCE.md) explains the independent implementation and its limits.
