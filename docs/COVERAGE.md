# Feature coverage — Civora 0.10.0

This is an executable increment, not a claim of full ProjectWise parity. Exact contracts and limitations: [WORKBENCH.md](WORKBENCH.md).

| Area | Delivered behavior and boundary |
|---|---|
| Revision comparison | Both original sizes/hashes verified before display; bounded insertion-aware UTF-8/UTF-16 text diff, full-result JSON, line/change navigation. No semantic binary/CAD or historical metadata inference. |
| Drawing comparison | Original SVG/raster wipe, opacity overlay and side views; same-scale top-left alignment. No automatic registration/pixel classification; animated images unsynchronized. |
| Batch rename | 1–100 same-project sources, required reason, final-name collision analysis including swaps, current-version/permission gates, one audit/transaction; no OS/CAD path rewrite. |
| Review preservation | Recorded decisions retained; staged filename context blocks reusing an old approval for later publish. Already published records are not automatically demoted. |
| UI | Direct Versions/Document entry points, Shift+F2, dark/light responsive dialogs, phone options collapse and sticky rename footer; unified shell remains on 25 workspaces. |
| Verification | 611 Node, 201 UI, 79 static HTTP checks; 29 libraries, eight examples. UI includes explicit fixtures, not physical-device/live-browser qualification. |

All retained subsystem limits below remain. Global optimistic workspace revisions, whole-metadata storage, live-provider gaps, native CAD, external notifications, HA and independent security assessment are unchanged.

---

## Historical release records (counts and versions below are not current)

# Feature coverage — Civora 0.9.0

**Complete ProjectWise parity is not delivered or qualified.** This release adds functioning, bounded document-management and UI capabilities to 0.8.1. Older sections below describe retained subsystems, not changed qualification claims.

| Capability | Delivered behavior / boundary |
|---|---|
| Universal navigation | Search readable documents/folders/views and inert app commands. Scoped counts, keyboard and phone entry, async reply binding. Metadata-only scan; no native file-content or full-text index. |
| Controlled copies | Same- or cross-project 1–100 document transaction, exact stored versions, size/SHA-256 verification, destination naming/metadata/numbering/ACL, P01 WIP reset and selected-ID reference remapping. Cross-project share required. No native CAD rewriting, implicit dependency import, copied approvals/history/locks, or new permission grants. |
| Copy limits | 50 MiB/file; 250 MiB unique bytes/batch; two concurrent server verifications. Content addressed originals reused. Pure reducer cannot verify bytes; use the engine/server or explicit verification and CAS. |
| Refined document register | Active filter chips, unsaved-view marker, layout-preserving filter reset, tab-preserving previous/next inspector, corrected revision author and shared release labels. Current-page browsing, not whole-dataset virtualized navigation. |
| Mobile/dark UI | Touch-visible search, stacked copy fields, sticky confirmation, themed results. Browser-emulated layout/pointers only; not physical-device or accessibility-conformance qualification. |
| Verification | 549 Node results, 177 UI checks (including explicit transport/directory fixtures), 72 direct HTTP checks, 27 libraries and seven examples. See TESTING.md. |

Detailed new contracts: [REFINEMENTS.md](REFINEMENTS.md). Retained subsystem ledger follows.

---

> **0.8.1 update:** All workspace routes now use the Explorer shell; old appearance settings migrate once and generated HTML/JS/CSS is deployed atomically with scoped offline caches. See [INTERFACE-FIX.md](INTERFACE-FIX.md). Feature boundaries below remain unchanged.

# Feature coverage — Civora 0.8.0

**Complete feature-for-feature ProjectWise parity is not delivered or qualified.** This ledger describes executable behavior and explicit gaps; adapters and test doubles are not native-application or live-service qualification.

“Implemented” means a working subsystem exists, not that every production case has been certified. “Partial” identifies bounded formats/semantics. “Integration, unverified” means actual integration code exists but the named external dependency was not exercised. The actual verification record is in TESTING.md.

## Explorer design refinement (0.8)

| Capability | Delivered / boundary |
|---|---|
| Familiar desktop shell | Compact standard toolbar, original seven-menu organization, hierarchical datasource tree, yellow folders and blue selection. One active Civora repository; not Bentley server discovery, branded assets or native datasource compatibility. |
| Personal appearance | Explorer/Ribbon/Review presets, pane placement, density, rail, grid lines and secondary descriptions. Browser/account scoped; does not overwrite shared saved views or grant permissions. |
| Property panes | Actual current metadata Attributes and selected-source Folder properties, retained actual-byte preview/version/reference/access/audit tabs. Existing native format and permission boundaries remain. |
| Keyboard reliability | Menubar/tree/tab navigation, F6 regions, Alt+D address dialog, stable selection strip and retained current-project collapse. Not all native Windows accelerators, screen-reader certification or accessibility conformance. |
| Phone and touch | Visible command menus, cards, five-action dock, responsive settings and large explicit-touch targets; retained drawing/model gestures. Physical devices and real-origin persistence remain unqualified. |
| Verification | 10 added pure Node tests and 20 new actual-app/explicit-preference-fixture UI checks. See TESTING.md; fixtures are not claims of live browser authentication or storage. |

## Controlled sets and mobile/touch (0.7)

| Capability | Delivered / boundary |
|---|---|
| Ordered sets | Latest/fixed members, reasoned lock/unlock, frozen descriptors, all-member read filtering and definition CAS. Not native Bentley set interoperability, WORM or digital signing. |
| Original package export | Current download authority, independently checked hashes, guarded concurrent changes, manifest, exact-source transmittal. 1,000 members, 90 MiB, two concurrent server exports; no ZIP64/streaming multi-GB packages. |
| Phone Explorer | Adaptive cards/full register, five-action dock, all 25 tools, explicit actions/sort/selection and active phone ribbon menus. No separate offline authenticated database or queued writes. |
| Image touch review | Real pan/pinch, explicit pan/zoom/fit, normalized annotations, two-tap rectangles, Drawing/Notes panels. Existing file-format boundaries remain. |
| Model touch review | Orbit/pan/pinch, directional controls, fit correction, accessible element/property panel. Actual Canvas pixels tested; native/GPU fidelity not established. |
| Device features | Coarse/manual touch mode, safe-area/viewport sizing, capture-hinted file input, conditional install prompt. Physical iOS/Android, pen hardware, camera, keyboards and installation not exercised. |
| Reusable modules | Added document-sets, document-set-archive and interactions: 25 independently bundled modules. Qualification is limited to the documented tests. |


## New Explorer delivery (0.6)

| Capability | Delivered behavior and boundary |
|---|---|
| Familiar modern workspace | Tree/list/address/menu/ribbon/context commands and bottom/right tabbed inspector; 25 routes retained. Original browser implementation, not pixel-perfect or native ProjectWise UI/API parity. |
| Configurable register | Metadata columns, visible/order/width controls, drag headers, keyboard resizing, three-key natural/typed sorting, groups, quick/inline/advanced literal search and page size up to 500. No full-text content index, unlimited virtualization or load certification. |
| Views and shortcuts | Personal/shared versioned view configurations; reference-only personal pins; account/repository-scoped local recents/layouts. Does not grant access or hide authoritative records from administrators. |
| Secure query surface | Permission projection before matching/counting/paging, bounded server page, no full hidden-ID result. Backend still loads and scans the whole workspace. |
| Atomic moves | Up to 100 documents, read-only real reducer preview, exact sources/destination/revision, one commit, rollback, unchanged original bytes and permission-filtered notices. Same-project documents only; no recursive/cross-project move or native CAD reference rewriting. |
| Address continuity | ID-based location after move/rename, pasted links, pending link after sign-in, denied wrong-workspace/permission targets. Civora links only; no Bentley URL/URN protocol or native shell handler. |
| Docked previews | Existing actual-blob viewer with revision markups, properties, versions, references, effective access and administrator audit. Existing parser/viewer limits remain; not native CAD qualification. |

See EXPLORER.md, UI-PARITY.md and TESTING.md for exact scope, limits and evidence.

## New workflow automation delivery (0.5)

| Capability | Delivered behavior and boundary |
|---|---|
| Conditional transition control | Typed, bounded AND/OR predicates; required reasons; deterministic metadata/tag assignments; project management scope; exact-current permissions/locks/publication gates. No arbitrary executable workflow scripting or automatic approval. |
| Transition preview | Actual server/local command evaluation without saving; exact form inputs and workspace revision must remain current. Not a reservation, lock lease or promise that a future transition will still succeed. |
| Deadline reminders | Optional per-project lead/overdue policies for reviews, issues and documents, server UTC deadlines and owner-access checks. In-app notices only; no email, SMS, holidays or per-user business calendars. |
| Overdue escalation | Notify or replace one remaining pending voter with a currently eligible delegate, retaining quorum/decisions and separation of duties. Legacy routes/multiple pending voters/stale sources are not automatically reassigned. |
| Unattended execution | Running authenticated server scans, CAS-recomputes, records successful/blocked outcomes and durable keys, resumes after restart and leaves idle revisions unchanged. Browser-local/folder editions reconcile explicitly. No installed OS service or distributed scheduler. |
| Subscriptions and inbox | Project/folder/document scopes, overlapping-watch deduplication, reference-only notices, live authorization, read/unread/snooze, bounded pagination and deep links. Not secret from administrators, externally signed or permanently retained. |
| UI and evidence | Workflow automation and Notifications, rule/policy editor, due queue/history export, source-bound previews and actual scheduler health. Tests include real server restarts and isolated browser controls; not external qualification. |

See WORKFLOW-AUTOMATION.md for conditions, policy authority, receipt keys, API, limits, clock behavior and explicit non-goals.

## Document-control delivery retained from 0.4

| Capability | Delivered behavior and boundary |
|---|---|
| Typed metadata environments | Six types, defaults, bounded formats, choices/ranges/lengths, exception inspector. Existing records are not silently migrated. No executable validation scripts or attribute-level ACLs. |
| Document numbering | Atomic monotonic project-wide sequence, configurable tokens, duplicate skipping, manual-number policy. No reserved blocks, sequence partitions, native naming service, or renumber-all operation. |
| Bulk metadata / editable register | Up to 100 records, exact-version and whole-workspace preview checks, all-or-nothing save, CSV validation and before/after UI. No XLSX-native interchange, content upload batch transaction or automatic merge. |
| Staged review routes | 1–8 ordered stages, quorum, active-stage decisions, templates, optional initiator/author exclusion, reasoned reassignment, metadata+version publication gate, computed inbox. Declarative transition rules and guarded unattended escalation are added in 0.5; no arbitrary scripts, email delivery or electronic-signature qualification. |
| Revision baselines | Frozen exact versions and metadata, optional dependency closure, explicit diff, verified original ZIP, baseline-pinned transmittals. Current access required. No WORM/signature, native embedded-path rewriting, geometric diff, or unbounded archives. |
| Reference discovery | Bounded textual DXF/SVG/OBJ scanners, path candidates, user confirmation, source-version checks. No automatic remote retrieval or exhaustive proprietary/native reference fidelity. |
| UI | Document control, Revision baselines and My work; rich metadata controls, selection/bulk/CSV actions, mixed select-all state, dark/mobile layouts. Not full accessibility/cross-browser certification. |

Detailed contracts, limits and examples are in DOCUMENT-CONTROL.md and API.md.

## Requested remaining areas

| Requested area | Status | Delivered | Still outside the implementation/qualification |
|---|---|---|---|
| Native CAD/BIM fidelity | Partial; external adapter unverified | Bounded ASCII DXF 2D, OBJ, STL, static embedded GLB, IFC subset; original bytes preserved; explicit warnings; external converter process contract; IfcOpenShell adapter source | No bundled DGN/DWG/RVT engine, complete IFC semantics, native CAD authoring, certified opening/booleans, full fonts/materials/textures, proprietary round-trip or native application equivalence |
| Automated renditions | Implemented for bounded formats | Upload/check-in auto-enqueue; source-pinned jobs, retry/lease/restart, cancellation/dedup; text PDF, DXF vector PDF/SVG, triangle meshes, explicitly labeled PDF pass-through | No proprietary CAD rendition engines, Office fidelity, distributed render farm, certified plot styles, signed deliverables or OS sandbox for external tools |
| Federated-model analysis | Partial | Version-pinned sources, affine transforms, merged geometry, element metadata, visibility/isolation, sections, measurements, triangle intersection and closed-solid containment, issue handoff | No full civil rules, structural analysis, exact clearance geometry, certified quantity takeoff, advanced Boolean solid engine, automatic georeferencing/unit reconciliation or large-scene streaming |
| Fine-grained permissions | Implemented for listed resources | Default-deny workspace/project/folder/document policies; groups/users/roles; inheritance and explicit denies; role ceilings; projected API state and file/rendition checks; scoped SSE | No attribute-level security, external policy engine, tenant isolation, separate deny-all-administrator control or complete timing-side-channel concealment |
| Authenticated recipient portal | Implemented | Independent recipient credentials/cookies, one-time invitation enrollment, named issued packages, pinned original downloads, identity-linked receipt, expiry/revocation | No email sending/address verification, MFA, recovery, qualified digital signature or legal delivery certification |
| Continuous cloud synchronization | Implemented session-bound algorithm; providers unverified | Repeated full immutable snapshots while open/authorized, history DAG, checksums, conflict stop and explicit resolution, reauthorization/retry/pause, outgoing-only team mode | Not background after close, incremental transfer, automatic record merge, CRDT, browser replacement of team DB, malicious-provider signature protection or live-account qualification |
| Enterprise-scale operation | Partial operational foundation | Durable single-node operations store, bounded worker, indexed jobs, filtered pagination API, memory/connection/request limits, transactional workflow scheduler with persistent receipts, operations UI and evidence records | Whole-workspace metadata and global CAS remain; no normalized scalable query store, HA, shared sessions/rates, distributed jobs, streaming multi-GB files, tenant isolation or production load qualification |
| Independent security qualification | Not performed | Threat/boundary documentation, security-oriented regression tests, CSP/static allowlist, credential/session isolation, audit hash chain and review checklist | No external auditor, penetration-test attestation, certification, compliance declaration, formal verification or complete vulnerability assessment |

## Local system additions

| Capability | Status and boundary |
|---|---|
| Localhost filesystem companion | Implemented: real member authentication, exact loopback Host/Origin, explicit root/user grants, read-only roots, reserved files, safe path/link checks, real disk and restart tests. No LAN/public filesystem gateway. |
| Browser directory access | Implemented: user-granted read/write or read-only handles, optional bookmarks/reconnect, disconnection and permission errors. Actual browser permission/handle persistence unqualified. |
| Folder workspace repository | Implemented: original blobs, immutable verified checkpoints, guarded HEAD, integrity and explicit monotonic recovery. Requires one cooperating browser origin and Web Locks for writing. No cross-host folder database. |
| Native working copies | Implemented: checkout/export, repository/workspace/account-scoped ledger, hash/revision conflict detection, explicit preserved refresh/check-in/unlink. No auto-check-in or recall of downloaded bytes. |
| Native application opening | Implemented: manually configured absolute executable/extension allowlist, separate arguments, no shell, confirmation/hash checks; tested with an actual fixture subprocess. Windows/macOS GUI apps and proprietary CAD integration unqualified. |
| Folder import and original export | Implemented: nested file paths, bounded modern/legacy directory drops, partial/cancel reports, pinned revision manifest and ZIP. Empty directories alone, whole-tree atomicity, ZIP64 and multi-GB streaming absent. |
| Local file operations | Implemented: explorer, folder/file creation, bounded BOM-aware text edit, file copy/verify/move, own recoverable trash/restore. Recursive folder rename/removal and OS recycle-bin integration absent. |
| Change reconciliation | Implemented while the app is open: repeated hash scans with pause/error handling. Not an OS daemon, guaranteed real-time watcher or background sync after close. |
| Mounted/removable/network roots | Configurable OS directory paths; unqualified. No-clobber native creation requires hard links and fails safely on unsupported filesystems. No native SMB client or shared multi-host writable workspace. |
| Desktop delivery | Windows/macOS/Linux launch scripts and local setup guide; not signed installers, OS-service installation, Finder/Explorer extensions or fleet management. |

## Document and project functions retained

| Capability | Status and boundary |
|---|---|
| Projects, templates and hierarchy | Implemented; one workspace per repository/server; no native Bentley datasource import |
| Upload and original files | Implemented; actual bytes, SHA-256 content addresses, 50 MiB per-file bound |
| Revision control | Implemented; checkout/check-in, immutable history, restoration as a new revision; no native design application checkout plug-in |
| Information environment | Implemented; typed metadata/constraints, numbering, atomic bulk/CSV, tags, structured search, filters and saved searches; not enterprise full-text/OCR indexing |
| Reviews and approvals | Implemented; legacy single-stage and ordered/quorum routes, templates, pinned versions/metadata, reasoned reassignment, cancellation and publication gates; no signed regulated approval |
| References | Implemented explicit dependency graph, transitive traversal, cycle and deletion checks; bounded textual DXF/SVG/OBJ discovery; not exhaustive CAD automatic reference extraction/resolution |
| Issues and RFIs | Implemented ownership, dates, status, replies, views and clash-to-issue prefill; clash calculations are client-computed, not server-certified evidence |
| Markups and previews | Image/SVG pins/rectangles and text workflows implemented; browser PDF embed; bounded image/text comparisons, not native CAD differences |
| Document sets | Implemented live membership; separately frozen baselines retain exact delivery records |
| Transmittals | Implemented immutable manifest and original-file ZIP; original manual receipt evidence remains distinct from new portal-account receipts |
| Scheduling and metrics | Implemented milestones, calendar, counts and activity views; no schedule simulation or certified earned-value system |
| Retention/recycle | Application-enforced retention/hold/recycle flags; not WORM, certified records disposition or legal preservation |
| Team identity | Implemented password identity and server ACLs; optional OIDC integration unverified; no SCIM/SAML/MFA management |
| UI | Twenty-five working screens, model/permission/portal/sync/operations additions, responsive layouts, compact mode and themes; no full accessibility or cross-browser certification |

## Storage, reuse and deployment

| Component | Implementation and qualification |
|---|---|
| Memory and backup integrity | Real implementation; unit and isolated UI tests passed |
| IndexedDB/BroadcastChannel/service worker | Real implementation; not tested on a permitted browser origin in this environment |
| SQLite team repository | Real HTTP, checksum, concurrency and restart tests passed |
| PostgreSQL, MySQL/MariaDB, SQL Server/Azure SQL, MongoDB/Atlas | Implemented adapters; no live database services exercised |
| Google Drive, OneDrive/SharePoint, Dropbox | Implemented OAuth/storage adapters; no live registered account flow exercised |
| External renderer process | Real subprocess protocol tested with Node fixture; IfcOpenShell and proprietary engines unqualified |
| Model viewer | WebGL implementation plus bounded Canvas fallback; only fallback exercised here |
| Libraries/build | Twenty-one independently bundled ES modules, app and portal HTML; independent core, local-text, document-control and automation examples passed |
| Production deployment | Documentation and container examples, not built/deployed/load-tested or independently reviewed |

See UPGRADE.md before upgrading an existing database. For a 0.1 team database: missing policies intentionally deny nonadministrators until grants are configured. The synthetic demo includes broad explicit grants for evaluation; it is not a production access template.
