# Controlled document sets — Civora 0.7

An ordered set is a collection of references to existing project documents, not a folder, copied content, a CAD bind operation, a legal hold or an access grant. The redesigned Document sets workspace is reachable from the Explorer tree and all-tools navigation. Select documents, then create a set from the selection bar or phone Add menu.

## Bindings and definition control

A member is `{documentId, versionId}`. `versionId:null` means Latest: resolve the current original revision when opening, exporting or preparing delivery. A non-null version selects that immutable original explicitly. A fixed member shows when a newer revision exists. Ordering is significant; the editor exposes Move up / Move down as alternatives to dragging. Pin current and Use latest can change all member bindings explicitly.

Create/update operations enforce project write, every member's read permission, same-project membership, distinct members, valid revision IDs and project-unique names. Role ceilings still apply. Up to **1,000 members** are supported, retaining the capacity of old `documentIds` sets. New creation is bounded to **2,000 sets per project**. These are input limits, not large-project performance qualification. Empty editable sets are allowed but cannot be locked, delivered or exported.

Definition versions start at 1; update, lock and unlock advance the version. Update/delete/lock/unlock require `expectedVersion`. Ordinary workspace optimistic concurrency still applies. Commands either succeed completely or leave the prior workspace intact. `documentIds` remains an ordered compatibility index alongside the new members array; import validation rejects disagreement between them.

Older sets containing only `documentIds` remain readable as ordered Latest bindings, with implicit definition version 1. They acquire explicit bindings on editing or locking. Upgrade does not pin them or freeze their originals automatically. Do not use pre-0.7 clients to edit new set definitions.

## Manager lock

Lock & pin requires an active manager/administrator role, current project manage permission, full read access, a nonempty set, no checked-out member and a recorded reason. It pins every selected revision and freezes its name, number, title, path, size and content hash. The definition becomes read-only. Later check-ins and document moves/renames do not substitute those frozen descriptors or bytes.

Normal document recycling is blocked while a locked set references it. An authorized manager can explicitly unlock the set with a reason. Unlocking is audited and retains fixed revision bindings; it does not reset them to Latest or alter already prepared deliveries. Deleting an unlocked set removes only the collection, never source documents or issued packages. This is application-enforced control; it is not a cryptographic signature, WORM storage or protection from a trusted database administrator.

## Visibility and current access

A set is visible only when the account can read its project and **every member**. A restricted member hides the entire set rather than leaking an inaccessible name or count. Direct document sharing alone does not grant the containing project or set. The server independently enforces these checks; the local UI uses the same effective-access model, not an alternative authentication system.

Reading a set does not imply download/share/review authority. Original ZIP export requires current download permission for every member. Delivery and reviews retain their existing command-level role and document permissions. Reviews from a set require current revisions; a set pinning older originals cannot silently approve the current documents. This release's visible set delivery action prepares transmittals; the review-from-set contract is also exposed through the engine API.

Recycled members in an unlocked set are shown as unavailable. Export, delivery and locking reject them. Restore the original or edit the set to remove that reference.

## Verified original-file package

Export ZIP produces `manifest.json` plus `documents/0001/<safe-name>`, `documents/0002/<safe-name>`, etc., preserving membership order and avoiding collisions. The manifest records workspace/set/definition IDs, selected versions, original paths, names, hashes and sizes. Sanitization affects the archive filename, not the original blob.

Every original is checked against its stored size and SHA-256. Access, workspace, set version and selected live revisions are rechecked around asynchronous reads and after ZIP construction. Corrupt/missing bytes, cancellation, revoked rights, changed set definitions or changed live selections abort the export. A newer check-in does not invalidate an export deliberately bound to a fixed revision. Unrelated workspace work may continue.

The package limit is **90 MiB of selected file content**, with the existing **50 MiB individual upload** limit. Archives are buffered STORE ZIPs, not streaming ZIP64 or multi-gigabyte transfer. The team server allows two concurrent set exports per process. Already downloaded bytes cannot be recalled. SHA-256 verifies integrity against the trusted workspace; it does not establish authenticity or authorship.

The separate Manifest action exports descriptors only. It is not evidence that original bytes were downloaded and verified. Treat either manifest as confidential project metadata.

## API

All member HTTP requests use the existing authenticated session and configured same-origin checks. No actor ID or token in a set link grants permission.

- `POST /api/sets/resolve`: `{id, expectedRevision, expectedVersion?}`; resolves readable members without mutation. `expectedRevision` must match the authoritative workspace.
- `POST /api/sets/export`: `{id, expectedRevision, expectedVersion}`; returns `application/zip` with no-store/no-sniff and current content authorization.
- Commands through `/api/commands`: `set.create`, `set.update`, `set.lock`, `set.unlock`, `set.delete`; normal command request envelope still applies.
- `transmittal.create`: supply `projectId`, `setId`, `expectedSetVersion` and ordinary delivery fields. The server creates immutable source descriptors and source-set provenance. Do not supply a conflicting baseline source.
- `review.create`: optional `setId`, `expectedSetVersion`; rejects historical member pins. Standard reviewer/route validation remains authoritative.

Local packages export `resolveDocumentSet`, `visibleDocumentSets`, `setMembers`, `setVersion`, `snapshotDocumentSet`, command/import validation and `exportDocumentSetArchive`. The archive function requires a live state getter and returns `{zip, manifest}`. Run `node examples/document-sets.mjs` after building for an independent example without the application shell.

## Qualification

Domain tests, actual authenticated HTTP/SQLite tests and process restarts cover the stated contracts. ZIP local records are independently decoded in Node and Python; checksums are compared to the original content. Phone UI tests use the actual engine in an isolated memory repository. Real-origin browser download behavior, physical devices, high-volume archives and independent security assessment remain unqualified. See TESTING.md and SECURITY-REVIEW.md.
