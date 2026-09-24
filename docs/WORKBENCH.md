# Revision workbench and controlled filenames — Civora 0.10.0

This increment refines the existing Explorer rather than introducing another shell. All 25 workspaces retain their compact header, menus, datasource tree, mobile navigation and selectable appearance. Two reusable modules add read-only original-content comparison and transaction planning for filename changes. This is not complete ProjectWise/native-CAD parity or external security, device or accessibility qualification.

## Compare exact stored revisions

Select a document with at least two revisions, then choose **Document → Compare revisions**, the Versions pane's **Compare revisions** button, or the existing full inspector Compare action. On phones, use the visible Document command menu. Download permission is required; metadata read access alone is insufficient. Choose baseline and target independently, swap them, or reload. The current filename identifies the document; it is not represented as a historic filename snapshot.

Both originals are retrieved from the repository and checked against their recorded sizes and SHA-256 hashes before content is shown. Missing, corrupt, oversized or unavailable originals clear the comparison and disable export. Same-hash source revisions still have each descriptor checked. Comparing does not create a workspace revision, check out a document or change any content. Identity, repository, access and workspace changes discard or reload the view; stale fetches and even delayed text decoding cannot overwrite a newer pair. This is UI invalidation, not recall of information already read or downloaded. The server checks every actual original-file request separately. Without a server refresh/event, an already displayed local snapshot cannot know about a remote permission change.

### Text differences

The workbench uses an insertion-aware Myers line edit script rather than matching lines by position. It shows added/removed counts, aligned original line numbers, change blocks, previous/next change, side-by-side or unified layout, changes-only filtering and line wrapping. Changes use explicit plus/minus markers, not only color. Only 120 aligned rows are rendered at a time; page and change navigation traverse the complete computed result. The JSON report is not truncated to the visible page.

Spaces/tabs can be ignored explicitly. Line endings are ignored by default; the Source evidence tab still reports LF, CRLF and CR counts and original hashes, and the option can be disabled. Counts of ignored *lines* are distinct from character counts. An exact byte difference due to BOM, encoding or newline conventions is never presented as byte identity merely because the normalized diff is empty. Missing final newlines are identified. Blank revisions remain valid content.

Supported text extensions: txt, md, csv, json, xml, obj, mtl, log, js, css, html, yaml, yml, dxf, ini and sql. This is literal text, not code execution or semantic DXF/HTML parsing. UTF-8 and BOM-marked UTF-16LE/BE are decoded strictly; unsupported encodings and binary controls fall back to verified-source evidence, not a guessed string. Text is HTML-escaped before display.

Limits: 2 MiB per original text Blob, 20,000 lines per revision, at most 1,024 edit-search depths and 4,000,000 search work units. Pure `compareLines` additionally bounds each JavaScript input string to 2,097,152 UTF-16 code units; callers handling encoded files must use the Blob decoder's byte bound. Common prefixes/suffixes and wholly inserted/deleted middle ranges are resolved directly, so those simple cases may exceed 1,024 inserted/deleted lines without needing the bounded edit search. When a hard comparison limit is reached there is no positional fallback, approximate answer or silently truncated diff: only source evidence with an explicit warning is exported.

### Drawings and raster images

SVG, PNG, JPEG, WebP, GIF and BMP originals can be displayed as **Wipe**, **Opacity overlay**, or **Side by side**, with Fit width and 50–300% scale options. Native range controls accept keyboard arrows and pointer input. Images use the same pixel scale and top-left alignment; unequal dimensions produce blank margins. There is no automatic registration, pixel classification or semantic drawing comparison. Animated images are not frame synchronized. SVG is loaded as an image from original bytes, never injected as an HTML/SVG document into the UI.

The viewer refuses decoded dimensions above 40 megapixels. This is a post-decode display bound, not a sandboxed or independently hardened image decoder, and it does not prevent every memory spike from hostile images. Original file verification is bounded to 50 MiB per source. PDF, DWG, DGN, RVT and other unsupported/binary types receive hash/size evidence only in this comparison (the separate existing preview/rendition tools are unchanged).

### Evidence and exports

Source evidence includes actual revision IDs, labels, hashes, sizes, creation authors/times and revision comments. Downloads return the chosen original bytes under the current document's filename. The JSON report records current document identity, the two immutable version descriptors, verified byte identity/difference, chosen normalization options, all computed text rows, and decoding information or an explicit unsupported/limit warning. Visual comparison reports describe image dimensions/alignment; they are not a generated pixel-difference result or a saved slider screenshot.

Reports contain source text when a text comparison succeeds and should be handled like document exports. They are ordinary unsigned files, not digital signatures, WORM archives, certified technical checks or historic metadata snapshots. In the standalone API, `comparisonReport` is a serializer: its `verified` marker is a caller contract. Integrators must first use `readVerifiedRevision` on both descriptors rather than serializing arbitrary unverified descriptors.

## Rename controlled documents

Select **1–100 active documents in one project**, then use **Document → Rename selected**, the selection bar's **Rename** action, or **Shift+F2** outside an input. F2 retains the original properties action. Phone users use the same visible Document menu. The editor lists original filename, document number and folder beside each proposed filename.

The literal generator supports `{name}` (original stem), `{number}` and `{seq}` or `{seq:1}` through `{seq:9}`. Sequence starts at one by default; the library also accepts a positive step. Find/replace is literal and operates on the original stem. Generation always starts from captured originals and the selected order, never a previous generated result. The original extension is appended. Individual generated names remain editable. Patterns are not regular expressions or scripts.

A reason of 1–500 characters is mandatory. **Validate names** checks the exact source names, current version IDs, folders and workspace revision, plus every final name. It performs no write. Changing fields, account, repository, permissions or workspace revision invalidates the approved preview. Applying calls the normal authenticated/compare-and-swap command path and rechecks all gates. A delayed or mismatching preview cannot enable the confirmation button.

An active author/manager/administrator role and write access to every document are required. Foreign checkouts, legal holds, archives and recycled records are rejected. Names are 1–240 characters after trimming, with no path separators, control bytes or dot paths. The extension must remain equal ignoring case. These are logical workspace filenames: this is not exhaustive Windows/macOS/network-filesystem basename qualification. For deliberate extension changes the existing properties editor remains separate.

All final filenames are checked case-insensitively within their folders, including unreadable occupied names, before anything commits. Hidden conflicts use a generic message rather than disclosing a hidden document's ID/title. As with any uniqueness validation, success/failure still reveals that a proposed logical name is unavailable. Final-state analysis supports swaps and cycles without temporary names. The batch creates **one workspace revision and one aggregate audit entry**, with a per-document from/to mapping. The administrator's document audit pane includes that mapping's aggregate entry. Unchanged rows are checked but are not stamped or reported as renamed.

Stable document IDs, numbers, content hashes, all stored revisions, folder assignments, metadata, explicit relationship IDs and access policies remain unchanged. Rename emits the ordinary document-updated subscription event. It does **not** rewrite native CAD paths, external hyperlinks, browser downloads or managed local working filenames, and it does not create/revoke operating-system access. There is no automatic cross-system rename synchronization or special batch Undo. A reverse rename is a new validated/audited command.

Staged review context includes filenames: changing a filename makes an old staged approval unsuitable for a later publish transition, while its historical decision evidence remains intact. An already published state is not automatically demoted. Previously frozen baselines, locked-set records and issued deliveries retain their captured names. Legacy content-only reviews retain their documented older contract; this release does not silently upgrade their evidence model.

## Mobile and appearance

The new dialogs use the existing light/dark Explorer theme. On phones, revision selectors remain on one row, comparison defaults to unified text, extra options collapse behind a visible button, source evidence stacks vertically, and rename fields stack above a sticky confirmation footer. Inputs remain zoom-friendly and no viewport setting disables page zoom. New commands remain accessible without keyboard shortcuts or hover. Browser-emulated checks do not qualify physical iOS/Android, on-screen keyboards, assistive technology or every pointer/device configuration.

## Independent modules and verification

`civora-comparison.js` exports limits/errors, kind detection, strict decoding, checksum-verified reads, newline counts, `compareLines` and report serialization. `civora-document-rename.js` exports limits/errors, filename validation/splitting, literal proposals and `planDocumentRename`. Core exports `previewDocumentRename`. The planner requires authoritative state, not a permission-filtered projection; a caller must commit with compare-and-swap. `WorkspaceEngine.run` and the authenticated server implement that boundary. See `examples/workbench.mjs`.

`POST /api/explorer/rename-preview` accepts a maximum 128 KiB JSON request. Required fields: `expectedRevision`, `projectId`, `reason`, `items:[{id,versionId,folderId,expectedName,name}]`. Successful responses contain `allowed`, `sourceRevision`, exact normalized `payload` and `rows`. Domain rejection returns `allowed:false`; authentication/origin/revision transport errors retain HTTP 401/403/409. Apply using `POST /api/commands` with the usual envelope, type `document.bulkRename`, and returned payload (including `baseRevision`). No client actor ID, file bytes, metadata or permissions are accepted in a rename payload. There is no new remote diff endpoint; comparison uses the existing authorized original-file reads.

See [TESTING.md](TESTING.md) for actual executions and [UPGRADE.md](UPGRADE.md) for rollout. Native fidelity, session-bound cloud snapshot behavior, whole-workspace metadata scalability, single-node operation and independent security qualification are not changed by this increment.
