# Document control — Civora 0.5 (introduced in 0.4)

This increment adds controlled metadata, document numbering, editable registers, ordered reviews and immutable revision baselines. These are independent implementations, not native ProjectWise datasource/API compatibility, a regulated signature service, or complete feature parity.

## Standards and metadata

Open **Document control** to inspect the selected project's metadata environment, numbering configuration, reusable review templates, and exceptions in visible active records. A manager with project `manage` permission, or a workspace administrator, can change the standards. Ordinary authors cannot grant themselves that authority.

Fields support text, finite numbers, safe integers, calendar dates, choices and booleans. Values are serialized as strings for compatibility with earlier workspaces. `true` and `false` are the boolean values; an optional blank is distinct. Fields can have a required flag, default, maximum length (1–500), numeric min/max, choice list, and one of the bounded formats `any`, `code`, `uppercase`, or `email`. Arbitrary regular expressions and executable validation scripts are not accepted. Up to 40 fields and 100 options per choice field are supported.

Defaults apply when authoring or explicitly updating metadata. Changing the environment does not silently rewrite existing documents, source revisions, review context or frozen baselines. Exceptions remain visible. Required missing values cannot be concealed by a newly added default when submitting a routed review or changing workflow state. Explicitly correct the document metadata first.

Deleting a field does not rewrite retained historical evidence. New metadata edits contain the current field set; export a backup before removing a field whose current values must be retained. A field used in the numbering pattern cannot be removed until the pattern changes.

## Document numbering

A pattern contains exactly one `{seq:1}` through `{seq:9}` token, optionally `{project}`, `{discipline}`, and `{meta:field_key}`. The digit specifies minimum padding, not a maximum counter size. Example:

```text
{project}-{meta:zone}-{seq:5}
```

Allocation occurs inside the same transaction as document creation. Project counters move only forward. Numbers are compared case-insensitively and existing numbers, including recycled documents, are skipped. Failed creation does not consume a number. Two competing server requests cannot commit the same sequence: one commits and the other receives a revision conflict and must refresh/retry. Changing a pattern never renumbers existing documents.

An administrator/manager chooses whether manual document numbers remain permitted. Disallowing manual numbers also blocks changing an existing document number through the ordinary property editor. Existing manually assigned numbers are preserved.

The largest allocated sequence is 999,999,999. A next-sequence value of 1,000,000,000 represents exhaustion; subsequent automatic creation fails. If more than 10,000 occupied candidates are encountered, choose a new unused sequence explicitly. The project-wide counter is not a reset-per-zone counter, reserved-number service, or configurable document-ID scripting engine.

## Atomic metadata editing and CSV interchange

Select documents in **Documents**, then choose **Properties** or **Editable CSV**. The Document control screen also exports all visible active project documents when the project fits the 100-document batch limit. Leaving a document view clears its selection; export a selected register directly from its selection bar.

The bulk editor applies only checked properties. It previews affected documents and old/new values before committing all updates in one workspace revision and one aggregate audit event. Current permissions, checkout ownership, expected file versions and field rules are checked for every row. Any error rejects the whole batch. No source file is rewritten and no file-content revision is added by a metadata-only edit.

CSV round-trip rules:

- Keep `document_id`, `version_id`, `workspace_revision`, `number`, and `filename` unchanged. Unknown or security-related columns are rejected.
- Editable properties are title, description, discipline, due date, tags (a JSON array), and `meta:field_key` values. Bulk edits do not set workflow state, security, identity, retention or content.
- The export is UTF-8 with BOM, quoted CSV, and reversible leading-apostrophe protection for formula-like values. Preserve text IDs and protected columns in the spreadsheet editor. Import never executes formulas. A spreadsheet product may normalize data; such edits must still pass validation.
- Import is capped at 3 MiB of text, 100 documents, 60 columns, and 20,000 characters per cell. Actual domain values have tighter limits. Text patches are at most 4,000 characters, and tags at most 30 entries of 60 characters each.
- Any intervening workspace change, including an unrelated record edit, makes the register/preview stale. Export a fresh register and reapply intended edits. There is no automatic three-way spreadsheet merge.

The old read-only CSV register remains available separately. It is not the editable-register format.

## Review routes

New reviews created through the UI use ordered stages. Each stage has a name, one or more named active reviewers/managers/administrators, a quorum, and an optional deadline. A route supports 1–8 stages and up to 50 assignees per stage. Quorum must be between one and the assignee count. Stage deadlines are shown; they do not automatically reject a decision or trigger unattended escalation.

Only an assigned user in the active stage can decide. Each user can decide once per stage. Approval quorum advances to the next stage; one `Changes requested` decision stops the route immediately. Votes that arrive after a stage has advanced are rejected. Every decision includes an authenticated identity in team/local-server mode, comment, timestamp and stage ID. In the browser-local sandbox these identities are demonstration profiles, not authentication or signatures.

Route templates are project-scoped copies. Editing or deleting a template does not modify existing routes or evidence. Template dates are not copied as recurring deadlines. Review creation revalidates user roles and access for every included document.

Optional separation of duties excludes the review initiator and the authors of the pinned file revisions from every stage. An authorized project manager can replace an unvoted active-stage assignee; the replacement's role, access and separation rules are rechecked. A nonempty reason and the old/new identities are retained. Recorded votes cannot be reassigned or edited.

Routed reviews pin the file version plus controlled metadata: filename, number, title, description, discipline, due date, tags, custom attributes and logical references. A new file revision, changed metadata, recycle action or held checkout blocks new decisions and invalidates the review for publication. Folder path and workflow-state transitions are not part of the review context. Cancel the stale route and create a fresh one. Older single-stage reviews retain their version-pinned semantics and remain readable/decidable.

**My work** lists current-stage review tasks, assigned open issues/RFIs and the current user's checkouts in the selected project. It is a live computed view, not a persistent message queue, email service or background notification daemon.

## Revision baselines

Live document sets select current documents. A baseline instead retains exact version IDs, revision labels, SHA-256 hashes, original names/numbers, folder paths, workflow states, and metadata/reference snapshots at a milestone.

Choose one or more root documents and optionally include recursive logical dependencies. Missing, recycled, checked-out or inaccessible required records fail capture. Every snapshot's reference metadata must also be readable, even in root-only mode. A baseline holds at most 2,000 records, and a workspace at most 2,000 baselines. No command edits or deletes a baseline in place. This is application-level immutability, not WORM storage, cryptographic signing or protection from an administrator modifying the underlying database or restoring a backup.

Comparison against current roots/dependencies or another baseline distinguishes additions/removals, changed file bytes, version-only changes, metadata changes and unchanged records. It is not a geometric CAD/BIM diff. Current dependencies may expand or shrink; a recycled root is shown as removed.

**Export verified ZIP** reads the original pinned bytes, checks every size/hash, and enforces current download permissions. Its 90 MiB aggregate source-byte limit counts duplicate files once per exported document, not once per unique blob. A JSON manifest records original paths, exact revision identities, metadata and dependencies. ZIP filenames are sanitized under unique ordinal subfolders. Native embedded file paths are not rewritten, and the archive is not a native CAD bind/package operation. A checksum detects corruption, not authenticity.

A baseline can prepare a transmittal whose documents remain pinned to the baseline even when newer versions exist. It begins as a draft; issuing it and configuring authenticated recipient delivery remain separate operations with existing share/download rules. Revoking read access to any captured dependency removes the entire baseline from that user's read projection; partial manifests are not presented as complete evidence.

## Reference discovery

**Scan references** reads at most 4 MiB of textual source. It never opens external URLs or filesystem paths, executes content, or modifies original bytes.

Supported discovery is explicitly bounded: ASCII DXF BLOCK xrefs, IMAGEDEF and PDF/DWF/DGN underlay definitions; static SVG href/xlink:href on supported referencing elements; and OBJ `mtllib` statements. It is not an exhaustive CAD parser, DWG/DGN reader, XML/CSS evaluation engine, MTL texture resolver or package importer.

Exact source-relative project paths are preselected; filename-only suggestions, ambiguous candidates, absolute/remote paths and `xml:base` require manual resolution. Only visible records are candidates. Users confirm controlled document relationships, normally preserving existing manually assigned references. The engine rechecks references for access, source-version staleness, project boundaries and cycles. Unresolved sources remain unresolved and are not automatically downloaded.

## Reuse and acceptance

The pure module is `packages/document-control/index.js`. Separate ES modules implement CSV interchange (`register.js`), verified baseline archives (`archive.js`), and bounded reference discovery (`references.js`). `app/document-control.js` is the UI adapter; all writes go through the shared command engine and server authorization. Built independent libraries are provided for all four modules.

Run `node examples/document-control.mjs` after `npm run build`. Consult TESTING.md for actual evidence and remaining platform/provider/security qualification. None of the new screens establishes complete ProjectWise parity or independent security certification.
