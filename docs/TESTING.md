# Verification record — Civora 0.10.0

Executed on Linux, Node.js 22.16.0, Python Playwright and supplied Chromium. This record states observed regression results, not full feature parity or independent assessment.

- **611 Node results passed**, zero failures/skips: retained 549 plus 34 controlled-rename, 17 comparison and 11 authenticated HTTP/SQLite results. Comparison includes 600 deterministic random cases checked against a separate LCS oracle; these are cases inside a test, not 600 additional test-count claims.
- **201 UI checks passed**: retained 177 plus 16 actual workbench checks and 8 explicitly delayed Blob/decoder/HTTP fixture checks. Retained interface version assertions were advanced to the new release; no behavior assertions were removed.
- **79 static HTTP checks passed**, including the new guide/app/package endpoints, private-path refusal and matching inline CSP hashes. This verifies Node HTTP responses, not browser CSP enforcement.
- **29 standalone libraries** build and **eight independent examples** execute. All JavaScript syntax is checked by `npm run check`; the exact checked-module count is in the release verification JSON.
- Extracted archive execution, output hashes and final packaging evidence are in the accompanying VERIFICATION JSON and `test-results/0.10.0` logs.

New HTTP/SQLite tests use actual sessions, HTTP original downloads, controlled uploads, preview/commit endpoints, ACL changes and server restart. They check final-name swaps, stale/hidden conflicts, no partial mutation, source hashes/identities, read-only-role rejection, post-preview revocation, correct insertion diff from downloaded bytes and persistence. Unavailable protected blob reads intentionally return 404 instead of revealing their existence.

New browser checks use the actual bundled application/command engine and MemoryRepository. Reports are genuinely downloaded and parsed; text and SVG originals are actual synthetic controlled files. Additional tests explicitly delay original Blob acquisition, text decoding and rename preview responses, including corrupt-source rejection. No fixture-authorized server write is presented as a live browser integration test. The separately executed Node server tests are real HTTP.

A fresh normal Chromium navigation probe still returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The harness uses `page.set_content` at an isolated origin with a narrowly labeled SHA-256/UUID shim and explicit storage/transport fixtures. Real-origin IndexedDB, cookie authentication in a browser, OAuth redirects, persistent folder grants, service-worker lifecycle, hardware GPU, physical iOS/Android/camera/keyboard behavior and accessibility conformance remain unqualified. All prior live-cloud/database/native-app and independent-security limits persist.

Reproduce: `npm test`; `npm run check`; `npm run build`; `node tests/static-http.mjs`; `node examples/workbench.mjs` (and seven retained `.mjs` examples); `python tests/run-ui-suite.py` with Python Playwright and Chromium. Current GUI suite logs and machine-readable summary are under `test-results/0.10.0`; older suite screenshots may retain their original historical directory labels.

---

## Historical release records (counts and versions below are not current)

# Verification record — Civora 0.9.0

Executed on Linux with Node.js 22.16.0, Python Playwright and the supplied Chromium. This is observed implementation evidence, not complete product parity, a native-CAD fidelity qualification, a load certificate, or an independent security/accessibility audit.

## Current results

| Check | Observed result | Scope |
|---|---|---|
| Node runner | **549 passed**, zero failures/skips | 475 retained + 74 new copy, navigation and real HTTP checks; 448 top-level and 101 nested results |
| UI suites | **177 passed** | 154 retained + 16 refinement + 7 explicitly simulated transport checks |
| Static HTTP | **72 passed** | Actual Node HTTP and generated inline-CSP checks, including new modules, independent bundles and refinement guide |
| Syntax | **124 JavaScript modules checked** | Parsing only; no external-provider qualification |
| Libraries | **27 independent bundles** | Two additions: controlled-copy planning/verification and permission-filtered navigation |
| Independent examples | **7 passed** | Core, local text, document control, automation, Explorer, document sets, refinements |

The UI suites were run individually during the implementation. Several long combined tool invocations exceeded the execution environment's timeout; incomplete children were rerun. The summary counts only completed passing reports/logs. It does not imply a successful unattended aggregate invocation. See `test-results/0.9.0/ui-suite-summary.json` for individual counts, modes, report timestamps and SHA-256 values.

### New checks

The pure/engine tests exercise copy authority, exact historical source selection, target metadata/numbering rules, case-insensitive names, one-revision atomic commit/rollback, selected-reference remapping, approved/held-source reset boundaries, source immutability, actor changes during hashing, corrupt/missing original rejection, byte limits and destination-only metadata projection. Source legal holds are not removed by copying; the new record is independently controlled.

Authenticated real HTTP/SQLite tests cover same-origin/authentication failures, metadata-only navigation filtered before counts, read-only copy preview, expected-revision rejection, download/share/write controls, actual binary/Unicode original bytes, historical selection after check-in, account/permission changes, atomic new records, and SQLite process restart with exact downloads.

The new UI exercises all-route command navigation, rapid close/reopen, modal/focus preservation, removable filters, dirty saved views, inspector paging and author display, actual two-document copy with references, input/stale-preview rejection, phone touch search/copy and dark appearance. The separate transport suite deliberately substitutes delayed responses to prove out-of-order query rejection, pending-selection blocking, version/query/account invalidation, and copy payload/preview binding; those fixture responses are not a browser authentication test.

### Browser and provider boundary

The fresh real-origin probe reached the test HTTP server (200) but Chromium navigation again failed with **`net::ERR_BLOCKED_BY_ADMINISTRATOR`**. Isolated `set_content` works. UI suites therefore run the actual application and MemoryRepository, with explicitly labeled crypto/preference, directory-handle or transport substitutes where needed. Screenshots contain original synthetic demonstration/test data.

These results do **not** qualify browser-origin IndexedDB, browser cookie authentication, real folder permission persistence, offline/service-worker lifecycle, live cloud OAuth, external databases/OIDC, physical iOS/Android cameras/keyboards, Windows/macOS native launchers, or hardware WebGL. Existing real Linux disk and Node HTTP tests remain in the retained suite. Search still scans whole-workspace metadata; copying is bounded, not a distributed import or native-CAD rewrite engine.

### Release archives

The release VERIFICATION JSON records fresh extraction, tests, examples, static HTTP and byte-for-byte build comparisons for the actual published ZIPs. Current source evidence is under `test-results/0.9.0`. Earlier notes below are retained historical records and their version/count statements are not current.

---

# Verification record — Civora 0.8.1

Current execution: Linux, Node.js 22.16.0, Python Playwright and supplied Chromium.

- **475 Node tests passed**, zero failures/skips: all 449 prior tests plus 26 migration, update, pending-command, build/HTTP and generated-worker checks.
- **154 UI checks passed**: retained 143 plus 11 consistency checks spanning all 25 desktop and all 25 phone routes, old preference import, cold bootstrap fixture, account switching, deliberate layouts, resizing and version controls.
- **65 static HTTP checks passed**; inline CSP hashes match the exact generated bytes. **114 JavaScript modules** pass syntax checks. **25 independent libraries** build; **six examples** execute.
- The former phone hamburger selector in the retained app harness now targets the visible All workspaces/More control. The navigation itself is still performed through the actual UI.
- New tests execute `sw.js` with explicit Cache/Fetch/client fixtures: complete hashed install, failed partial install, cache-specific fallback, scope isolation, HTTP errors, bypass of sensitive requests and preservation of unrelated caches. These are not real browser service-worker lifecycle tests.
- Fresh real-origin probe still fails with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. UI uses the actual MemoryRepository and explicit preference/transport/filesystem fixtures where labeled. Real-origin IndexedDB, real offline/multi-tab worker behavior, browser cookie flows, and physical devices remain unqualified.

Current logs and screenshots are under `test-results/0.8.1`; packaging checks are in the release VERIFICATION JSON. The older verification notes below are historical, not current test totals. See [INTERFACE-FIX.md](INTERFACE-FIX.md) for the precise behavioral change and upgrade instructions.

---

# Verification record — Civora 0.8.0

Executed on Linux with Node.js 22.16.0, Python Playwright and the supplied Chromium. This records observed checks, not full feature parity, native CAD fidelity, independent security/accessibility certification or enterprise-scale qualification.

## Release checks

| Check | Observed result | Boundary |
|---|---|---|
| Node runner | **449 passed**, zero failures/skips | 359 top-level plus 90 nested results; 10 additions to delivered 0.7 |
| JavaScript syntax | **109 modules parsed** | Parsing is not live-provider qualification |
| Build | Main/recipient HTML, shell v8, **25 independent library bundles** | Default build uses no external npm dependencies |
| Independent examples | **6 passed** | Core, local-text, document-control, automation, explorer, document-sets |
| Retained UI | **98 checks passed** | 19 app, 16 document-control, 15 local, 4 recipient, 14 automation, 5 automation transport, 18 Explorer, 7 Explorer transport |
| Mobile/touch/set UI | **19 checks passed** | Actual app/engine in memory; real Chromium touch events and explicit file input fixture |
| Model touch UI | **6 checks passed** | Actual OBJ parsing and rendered Canvas pixel changes; not GPU/physical-device qualification |
| Explorer design | **20 checks passed** | Actual app plus explicitly substituted browser preference storage |
| Total UI | **143 checks passed** | Includes explicit directory/transport fixtures; not a feature-completeness score |
| Static HTTP | **64 checks passed** | Actual Node HTTP, public assets/private paths, HEAD/POST and inline-script CSP hash consistency |
| Packaged release | Freshly extracted source/libraries retested | See release VERIFICATION JSON for execution and byte-for-byte build comparisons |

The existing app UI assertion for its former phone sidebar was updated to exercise the new searchable all-tools sheet instead; it still navigates to Documents through visible UI. The model suite now checks phone Elements/properties rather than accepting the previous hidden property panel.

## Explorer design evidence (0.8)

**10 pure presentation tests** cover independent defaults, legacy preference migration, invalid roots/unknown fields, strict booleans, bounded finite dimensions, layout presets, pure input handling, retained query schemas and 400 idempotent normalization combinations.

**20 additional UI checks** cover the seven menu groups and standard toolbar; detailed single-line columns; selection without row shifts and real double-click opening; real stored false metadata and source-folder properties; current-project collapse and keyboard navigation; tree collection disclosure; menubar opening/focus restoration; pane tabs/F6/Alt+D; appearance cancellation without writes; Ribbon and Review presets with actual dock geometry; current-account preference isolation using an explicit Map-backed localStorage fixture; pane hide/restore; reachability of all 25 tools; actual original SVG bytes; corrected dark palette; responsive content bounds at 320/390/600/740/1024/1600 pixels; explicit hybrid touch sizing; and no uncaught errors. The false field is set with the actual command engine, not by replacing the properties renderer.

The previous mobile suite now targets the visible Create/Document/View menus rather than hidden desktop ribbon controls. Local dark-mode assertions now check the actual 0.8 palette, not the retired 0.7 RGB values. These are changes to intended presentation, not removal of behavioral checks. All prior Node and UI workflows were rerun.

The new appearance test explicitly substitutes localStorage with a Map because this isolated origin denies storage. Successful preference serialization/account isolation in that fixture is **not** real-origin persistence qualification. The source/folder/metadata interactions still run through the actual application and command engine. Screenshots show the actual temporary repository and synthetic data, not native Bentley software or a mock design.

## Retained mobile/set evidence

**44 document-set domain tests** cover old and new data, 1,000-member legacy capacity, ordered live/fixed bindings, command validation and rollback, names/version conflicts, projected and authoritative permissions, role ceilings, locks/reasons/recycling, exact historical delivery, current-only review sources and malformed imported evidence. Original ZIP records are independently decoded; missing/corrupt bytes, cancellation, identity/state/definition changes and live access revocation fail safely. Fixed originals remain exportable when later check-ins occur.

**17 interaction-geometry tests** cover aspect-fit transforms, normalized coordinates, focal zoom, pan limits, invalid input, drag/tap thresholds, multipointer cancellation, pointer interruption and return-to-start movement. **11 real HTTP results** (one parent plus ten nested checks) run a temporary authenticated SQLite server and actual process restart: session/Origin, set visibility, read-versus-download, malformed requests, stale versions, manager locks, exact historical ZIP bytes, pinned delivery, revocation and restart persistence.

**19 phone/tablet checks** exercise actual menus, all 25 tools, cards/selection/sort, a real ordered set create/reorder/pin/lock/export/deliver workflow, independently decoded ZIP content, full-register preference, capture-hinted real file input, real SVG original review, Chromium multi-touch pinch, pointer-cancel safety, normalized two-tap annotations, long-press cancellation, content width across 25 routes and five viewport dimensions, dark and explicit tablet touch modes, and absence of uncaught errors. The PNG supplied through the file input is an explicit fixture, not an actual camera capture. Browser emulation may alter coarse-pointer reporting after viewport/CDP changes; the tablet check explicitly selects Touch mode rather than claiming hardware detection.

**6 model touch checks** open the original synthetic OBJ through the app's normal preview, compare rendered pixels under zoom/directional pan/orbit/pinch, reject accidental selection after drag/cancel, expose object properties through phone panels, verify landscape width and dispose the view. Canvas fallback is reported explicitly. No native CAD engine is simulated.

## Reproduce

```sh
npm run build
npm run check
npm test
node examples/core.mjs
node examples/local-text.mjs
node examples/document-control.mjs
node examples/automation.mjs
node examples/explorer.mjs
node examples/document-sets.mjs
node tests/static-http.mjs
python tests/navigation-probe.py
python tests/browser-harness.py
python tests/document-control-ui.py
python tests/local-ui-harness.py
python tests/portal-harness.py
python tests/automation-ui.py
python tests/automation-transport-ui.py
python tests/explorer-ui.py
python tests/explorer-design-ui.py
python tests/explorer-transport-ui.py
python tests/mobile-touch-ui.py
python tests/model-touch-ui.py
```

## Browser and device limitations

A fresh real-origin probe again returned HTTP 200 from Node, but Chromium URL navigation failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. UI runs load the actual standalone app in an isolated opaque-origin document and use its real MemoryRepository fallback with test SHA-256/UUID primitives. Filesystem/recipient/transport harnesses identify their additional fixtures. This does **not** establish real IndexedDB, browser cookies, Origin enforcement by browsers, service-worker lifecycle, OAuth, persistent folder permission, native camera, installation, virtual keyboard, physical safe area, pressure-sensitive pen, iOS/Android or hardware WebGL.

Real server/disk tests are distinct: they perform actual HTTP, cookie/session/Origin contract requests, SQLite/file IO, original checksums, child processes and restarts under Node/Linux. External providers/databases, native desktop platforms, high-load distributed operation and independent security/accessibility review remain outstanding. Screenshots contain only original synthetic data. Failure screenshots from development are not release evidence.

## Retained earlier test details

The following descriptions identify the earlier suites and their original increments; the current aggregate is the 449/143 result above.

## Added Explorer coverage

**49 pure/domain tests** exercise deterministic bounded configuration, invalid metadata keys/columns/operators/dates/ranges, permission projection before matching/counts, restricted ancestor and relationship protection, raw-versus-projected identity behavior, immediate/recursive/root scopes, natural order and pagination, intersected OR/quick/inline filters, grouping and metadata values. Saved-view and pin tests cover personal/shared ownership, role ceilings, exact configuration versions, revocation, duplicate names, imported-record validation and backward-readable omitted arrays.

Move tests exercise read-only preview, exact source versions/folders/global revision, single revision/audit success, source and destination access, checkout/retention guards, duplicates and name collisions, stale/no-op/cross-project/batch-limit rejection, rollback and original identity preservation. Navigation/selection/link tests cover range/toggle semantics, history branching, cloned inputs, stable IDs and directly shared documents with restricted ancestors. Notification tests cover deduplicated old/new-folder subscriptions and current-read revocation after moving.

**One actual authenticated HTTP/SQLite suite with eleven nested checks** exercises session and Origin checks, bounded query pages and authorized counts, request limits/stale revisions, shared/personal view persistence and ownership, pin isolation, side-effect-free preview, late authorization/staleness rollback, one-commit movement with exact original-byte downloads, name collisions and checkouts, live permission revocation, and real process restart. The parent plus nested results add twelve Node results. Together the new domain and HTTP results add 61 to the source archive's original 306.

**18 Explorer UI checks** run the built app with the actual MemoryRepository/reducer: default Explorer tree/ribbon/storage status; single selection and docked properties; Ctrl/Shift/select-all; keyboard focus and full inspector; real context/menu actions; columns/width/density/grouping; additive sort and drag reorder; saved inline/quick/shared views and restoration; advanced search preview; pin creation and original blob drawing preview; versions/references/access/audit; pointer/keyboard docking; back/forward/up and pasted addresses; two-document move with precisely one revision; stale cut/paste preview rejection; dark/mobile folder overlay; no uncaught page errors.

**Seven explicit transport-fixture checks** use the actual form and memory engine but substitute fetch/session/event-source responses: repository-relative move-preview URL with exact source revision, changed destinations, malformed responses, genuine concurrent command changes, matching read-only validation, closed pending forms, post-sign-in document continuation and wrong-workspace rejection. Some assertions are grouped in a single named check. They do not establish cookie, EventSource, Origin, browser networking or independent identity-provider behavior. Their screenshots are not presented as authenticated server captures.

## Retained workflow-automation coverage

**49 pure/domain/runner tests** cover strict typed and bounded condition trees, canonical string metadata, schema type changes, missing-value semantics, deterministic rule ordering, atomic reason/metadata gates, source-preview staleness and retained publication/permission checks. Notification checks cover overlapping-watch deduplication, nested folders, target removal, ownership, live permission revocation, review source references, snooze/read state, reference-only record validation, timestamp validation and bounded per-member history.

Deadline checks exercise UTC date boundaries, reminders/overdue/escalation sequencing, single-pending-voter delegation, unchanged quorum and existing decisions, policy-owner authorization, delegate eligibility, source-revision/metadata freshness, separation of duties, legacy review blocking, disabled/closed resources, and explicit blocked receipts. Runner checks include coalescing, 200-event batches, idle no-op behavior, shutdown, errors and CAS retry. Actual competing-state fixtures verify that a human approval or a policy-owner access revocation committed during a scan is not overwritten by automation.

**One real authenticated HTTP suite with 11 nested checks** starts a temporary SQLite team server. It exercises real session cookies and Origin guards, read-only rule previews, exact source-revision conflicts, personal-notification pagination/ownership/snooze and live revocation. With its timer disabled, overdue work remains untouched. After a restart with the timer enabled, the server records reminder/escalation outcomes and reassigns the pending vote **without any browser or manual automation command**. A second restart does not duplicate receipts or churn workspace revisions. Delegation still requires a real eligible human to approve; the replaced reviewer cannot vote.

**14 new UI checks** use the actual application and MemoryRepository: rule creation/edit/pause, typed conditions and assignments, denied/allowed/stale-input previews, nested-expression preservation, deadline policies, actual manual reconciliation and delegation, receipt export, notification events/read/snooze, subscription deletion/deep links and theme/mobile controls. Five separate, explicitly substituted transport checks exercise repository-relative API URLs, disabled/enabled scheduler reporting, delayed preview responses, revision conflicts and unavailable-status reporting. These five are not real browser-server connectivity checks.

## Retained document-control engine coverage

**51 pure/domain tests** exercise six field types, invalid ranges/defaults, case-insensitive numbering, monotonic counters, manual-number policy, rollback/exhaustion, and required-field publication/submission gates. Bulk checks cover one-revision commits, all-or-nothing rollback, per-document permissions, checkout ownership, stale file and metadata previews, protected fields, and strict scalar/tag/date bounds. CSV tests cover quoting, BOMs, formula-prefix protection, protected identities, malformed input, unknown columns and stale imports.

Baseline tests cover recursive dependencies and cycles, frozen file/context identity, live/baseline comparison, root-only captured-reference permissions, read projections, checked-out/recycled content rejection, exact old bytes after newer versions, current download permission, independent ZIP decoding, corrupt content, cancellation and transmittal pinning. Review tests cover stage ordering, quorum, rejection, current-assignee identity, duplicate/stale votes, separation of duties, reassignment, changed-file/metadata publication guards, legacy single-stage compatibility, and rejection of stripped snapshot context in restored data.

Reference tests cover supported ASCII DXF, static SVG and OBJ statements, visible project-relative matching, ambiguity/absolute paths, stale source revision and cycles. Adversarial SVG checks cover omitted active blocks, DTD/entity rejection, xlink precedence, xml:base warnings and repeated malformed opening tags. These tests establish the stated bounded scanner behavior, not full XML/CAD parser fidelity.

**One real HTTP suite with 13 nested tests** starts a temporary SQLite server with fresh credentials and real sessions. It checks persisted project standards, competing numbering requests (one commit and one conflict, followed by safe retry), atomic and rejected batches, metadata-preview staleness, baseline closure, scoped member grants, denied-batch rollback, active-stage reviewer authorization, changed-context publication rejection, source-pinned transmittal bytes after check-in, access revocation/projection, and restart persistence. Restart invalidates the prior session cookie as expected.

## Retained regression coverage

The original **180** Node results remain in the suite. These include core commands/revisions/workflows/access, geometry and rendition subsets, snapshot conflicts, durable operations, recipient authorization and source-pinned downloads. Original member/recipient HTTP suites include 15 and 17 nested tests; the localhost suite includes another 13.

Local filesystem coverage uses real Linux files and verifies original binary/Unicode bytes, compare-and-swap writes, overwrite history, trash/recovery, file moves, symlink/hardlink/read-only restrictions, explicit external edits, directory reopening/checkpoints, concurrent cooperating writers, exact checked-out check-in, saved conflicts, guarded imports/exports, cancellation, account/repository/workspace scoping and text codecs. The actual localhost HTTP suite covers authentication/Origin/Host constraints, private roots, a 12 MiB file request, traversal/link denial, native executable arguments without a shell, process locks, and restart persistence. Native launch uses a real Node subprocess fixture, not a CAD application.

## Browser restriction and actual UI checks

For 0.8 a newly started real local server returned HTTP 200, but normal Chromium navigation failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. `test-results/navigation-probe.json` records the observed failure and `about:blank` result. The restriction was not bypassed or changed.

The app harnesses set the generated standalone document into `about:blank`, supply SHA-256 through a Python binding because secure-context Web Crypto is absent, and disable URL history rewriting. They use the actual, visibly temporary **MemoryRepository fallback**. They do not replace the application command engine or generate a screenshot mock.

The retained 16 document-control checks interact with standards editors, numbering preview, choice/boolean/integer upload controls, a two-document bulk preview/commit, editable CSV download/import, stale-import errors, reference discovery and confirmed relationships, a two-stage template and active-stage review decisions, frozen dependency baselines, live revision comparison, verified ZIP download, and a baseline-pinned transmittal. Python's ZIP reader independently decoded the downloaded package and checked that it contained the original bytes and matching SHA-256 after a newer content revision existed. Actual theme controls and 390px layout checks cover all three new screens. Light/dark/mobile and review/baseline screenshots were visually inspected in the prior release; current Explorer, docked properties/drawing preview, dark and mobile screenshots were visually inspected for this release.

The retained 19 app checks render all 25 routes and exercise real uploads, search, checkout/check-in, comments/issues, drawing preview, preferences, cards/mobile, model selection/camera/sections/clash-to-issue, supported rendition download and access editing. The local UI's 15 checks use synthetic directory handles through the real BrowserDirectoryFS and DirectoryRepository. The portal's four checks use a clearly identified transport fixture; actual session/account authorization is separately exercised by Node HTTP tests.

## Evidence and remaining gaps

Fresh reports, logs, actual screenshots and the synthetic test's independently decoded baseline ZIP are included under `test-results/`. The release includes standalone source-archive test output, a packaging-verification JSON and artifact SHA-256 checksums. Verification is reproducible but not independent security certification.

Still unqualified here: real-origin IndexedDB and browser folder-grant persistence; File System Access permission dialogs; browser/native-editor coexistence; browser Web Locks; browser cookies, CSRF/CSP enforcement and redirects; service-worker/offline behavior; physical GPU/WebGL; Safari/Firefox and physical touch; Windows/macOS; mounted/network/removable filesystems; power-loss durability and hostile same-OS-user races; production containers and load/high availability; live OAuth/OIDC/external databases; IfcOpenShell/proprietary CAD engines; accessibility conformance; cryptographic signatures/WORM retention; and independent security assessment.

Cloud synchronization and local scanning remain app-session-bound. The local service is loopback-only. Metadata commits remain whole-workspace compare-and-swap, not a distributed database or automatic merge. The running authenticated server now reconciles enabled project deadlines without a browser. Browser-local/folder repositories still require explicit reconciliation. This is a bounded single-node timer, not an OS service, distributed scheduler, guaranteed-time notification transport or automatic approval. No email/SMS/push delivery is implemented. Read EXPLORER.md, UI-PARITY.md, WORKFLOW-AUTOMATION.md, DOCUMENT-CONTROL.md, LOCAL-SYSTEM.md and COVERAGE.md for precise functional limits.
