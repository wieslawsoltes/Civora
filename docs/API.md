# Reusable libraries and API contracts

The twenty-seven modules in `dist/lib/` are native ES modules; there is no required app framework, build tool or DOM global for the core engine. Browser repositories require browser APIs. Node examples target Node 22.13+ with native Blob/File, Web Crypto and EventTarget support. Rebuild bundles after editing source.

## Minimal independent engine

```js
import { createEmptyWorkspace, searchDocuments } from './civora-core.js';
import { MemoryRepository, WorkspaceEngine } from './civora-storage.js';

const repository = await new MemoryRepository().open();
const engine = new WorkspaceEngine(repository, 'u-admin');
await engine.initialize(createEmptyWorkspace(), new Map());
const projectId = await engine.run('project.create', {
  code: 'SITE-01', name: 'Site engineering'
});
await engine.addFile(new File(['Design note\n'], 'design-note.txt', {
  type: 'text/plain'
}), { projectId, number: 'SITE-001', title: 'Design note', revision: 'P01' });
console.log(searchDocuments(engine.state, { query: 'type:txt' }));
engine.close();
```

Choose `IndexedDBRepository('your-stable-database-name')` for a persistent local browser repository. Never use the selected local `actorId` as a security boundary; a local user controls the database and code. For authenticated team mode, log in to the same-origin server, open `HttpRepository('/api')`, and initialize an engine with the returned session's actor. The server ignores client-supplied identity.

## Core contract

`applyCommand(state, {id?, type, payload}, actorId)` returns `{state, result}`. It clones input state, resolves an active actor, validates rules, appends an audit record and increments the workspace revision. It throws `DomainError` or `ControlError` on invalid operations; both expose a stable `code` for the current release. Do not modify the input state directly in an application and then expect revision invariants to remain meaningful. `validateWorkspace(state)` checks structural and reference integrity; it does not fetch or verify blob bytes. `verifyBackup` additionally verifies archived bytes.

Use `engine.run(type, payload)` for commands and `addFile`/`checkin` for commands with content. File helpers hash the actual bytes and create content descriptors. A repository commit takes the previously observed revision and rejects stale commands. The engine serializes its own requests; a conflict refreshes state and surfaces an error rather than silently replaying user intent. Listen for `change`, `externalchange`, and `connectionerror`. Call `close()` on disposal.

| Command family | Available commands |
|---|---|
| Project | project.create, project.update, project.fields, project.workflow, project.numbering |
| Folder | folder.create, folder.update, folder.delete |
| Document | document.create, document.update, document.bulkUpdate, document.bulkMove, document.bulkCopy, document.move, document.checkout, document.release, document.checkin, document.restoreVersion, document.transition, document.references, document.delete, document.restore, document.retention |
| Discussion | comment.add, comment.resolve, markup.add, markup.resolve |
| Review | review.create, review.decide, review.cancel, review.reassign, reviewTemplate.save, reviewTemplate.remove |
| Coordination | issue.create, issue.update |
| Delivery | transmittal.create, transmittal.issue, transmittal.acknowledge |
| Collections | set.create, set.update, set.delete, search.save, search.delete |
| Frozen baselines | baseline.create |
| Scheduling | milestone.create, milestone.toggle |
| Administration | user.create, user.update, workflow.create, access.set, access.remove, group.create, group.update, group.delete |
| Model coordination | model.register, model.update, model.delete, clash.record |

The authoritative payload validation is in `packages/core/index.js`. Executable payload examples and rejection cases are in `tests/core.test.mjs` and `app/seed.js`. The command surface is version 0.6 (workspace schema 1 remains backward-readable) and not a promised stable Bentley-compatible API.

## Repository contract

Repositories expose `open`, `read`, `commit(command, actorId, expectedRevision, file?)`, `blob(sha256)`, `subscribe(listener)` and `close`. Local and memory repositories also support `initialize` and replacement; team replacement is deliberately not exposed through the browser API. `file`, when supplied internally, has `{descriptor: {blobId, hash, size, mime}, blob}`. Use `prepareFile` rather than inventing hashes.

`exportBackup(repository, state)` exports the supplied consistent metadata snapshot and referenced immutable content. `verifyBackup(input)` checks metadata structure and every original blob before yielding the verified state/files for local replacement. The caller must still get the user's informed confirmation before overwriting an existing workspace. Restoring is not merging.

## Same-origin team HTTP API

| Method and path | Purpose |
|---|---|
| GET /api/health | Basic process/database health metadata |
| GET /api/session | Session information; no active user when signed out |
| POST /api/login | Email/password login and session cookie |
| POST /api/logout | Invalidate session |
| GET /api/workspace | Authenticated permission-projected metadata snapshot |
| POST /api/commands | Apply `{command, expectedRevision, file?}` transactionally |
| GET /api/blobs/:sha256 | Download a referenced original file with authenticated access |
| GET /api/events | Authenticated SSE revision notifications |
| POST /api/admin/password | Set/reset an active member's password as administrator |
| GET /auth/oidc/start | Optional organizational identity start |
| GET /auth/oidc/callback | Optional OIDC callback |

Inspect `server/index.mjs` and `tests/server.test.mjs` for request/response fields. The command `file` transport, when present, is `{data: base64, mime}`; the server computes the checksum and matches the document descriptor. Do not put an OAuth/database credential in the workspace model. Cookies, request Origin checks and authorization are enforced by the server, not the JS engine alone. Nonadministrators receive only their permission-projected view; no implicit project/document grant exists. Original and rendition downloads independently re-check the current document ACL.

## Preview, controls and cloud snapshots

`civora-viewer.js` provides bounded preview helpers; use the exported API shown in source and call the returned disposer before replacing mounted content. Markups are version-specific normalized coordinates, not real-world CAD units. UI controls and viewers use the class names in `app/styles.css`; ship that stylesheet or provide equivalent styles.

`civora-connectors.js` implements OAuth snapshot transport; `civora-sync.js` layers session-bound immutable full-snapshot synchronization on top. This is not continuous database replication. Construct provider instances with your registered public application configuration, connect from a user gesture, and use the adapter's save/list/load operations. See CONNECTORS.md for exact provider configuration. Tokens remain in memory; cloud data is a full unencrypted workspace backup. Verify a downloaded backup before any restore.

`civora-archive.js` exports the stored-ZIP writer and CRC32. It accepts bounded in-memory entries and rejects unsafe or duplicate names. This is an uncompressed ZIP writer, not a streaming ZIP64 implementation.

## Access library

`createAccessContext(state, userId)` returns an indexed evaluator with `can(permission, scope, resourceId)` and `effective(scope, resourceId)`. `PERMISSIONS` exports the seven names. `projectWorkspace(state, userId)` produces a read projection and marks nonadministrator output as filtered. A projection must not be used as an authoritative backup or stored over the original workspace. `normalizePolicy` validates principals, scope and permission names; `authorizeCommand` enforces command-specific resource and destination checks.

An administrator can grant a project to a group through ordinary commands:

```js
const groupId = await engine.run('group.create', {
  name: 'Design reviewers', members: [existingMemberId]
});
await engine.run('access.set', {
  scope: 'project', resourceId: projectId, inherit: true,
  entries: [{principal: 'group:' + groupId,
    allow: ['read', 'download', 'review'], deny: []}]
});
```

The member's role ceiling still applies. Scope identifiers are `workspace`, `project`, `folder`, `document`; group membership is by existing active/inactive user ID as validated by the engine. Only the server-authenticated actor has authority in HTTP mode.

## Geometry and rendition libraries

`parseModel(blob, filename)` dispatches bounded OBJ/STL/GLB/IFC/Civora JSON parsing. `validateModel`, `transformModel`, `modelStats`, `readDXF` and `drawingSVG` are reusable pure geometry helpers. A Civora mesh uses `{format:'civora-mesh', version:1, units, objects, warnings}`; each object has `id`, `name`, `vertices` as coordinate triples, `triangles` as index triples and optional properties.

`renderRendition(blob, filename, {format, revision, hash})` returns a Blob and metadata for supported conversions. `textPDF` and `drawingPDF` return PDF bytes. This local library does not create a durable queue; use the team API for persistent jobs. `mountModelViewer(host, model, {onSelect})` mounts the standalone viewer; dispose its returned controller on removal. See NATIVE-CAD.md and source exports for parser and rendering boundaries.

`SnapshotSync` accepts `{engine, provider, channel, mode, intervalMs, writerId, checkpoint, onCheckpoint}`. Methods include `start`, `stop`, `tick`, `resolve`; the `status` event reports state. Providers expose `list`, `load` and `save` from the actual connectors. `mode:'two-way'` is rejected for a server repository. See SYNC.md; do not infer merge or after-close behavior from this interface.

## Additional team endpoints

All member endpoints require a valid team cookie. Writes require the exact configured Origin. Content responses are not cached. Refer to `tests/security-integration.test.mjs` for runnable protocol examples.

| Method and path | Contract |
|---|---|
| GET /api/capabilities | Server version, enabled ACL/portal and built-in/external rendition formats |
| GET /api/documents | Scoped page; `q`, `projectId`, `limit` (up to 200), `offset`, optional `revision`; stale revision returns 409 |
| GET /api/jobs | Up to 100 currently downloadable jobs from the bounded recent job scan |
| POST /api/jobs | `{documentId, versionId?, format}`; requires source write and download; returns 202 and pinned/deduplicated job |
| GET /api/jobs/:id | Current permitted job and output metadata |
| GET /api/jobs/:id/content | Completed rendition bytes, current source download permission required |
| POST /api/jobs/:id/cancel | Cancel pending/running job; write permission required |
| GET /api/deliveries | Member-visible issued recipient deliveries; requires appropriate share/download privileges |
| POST /api/deliveries | `{transmittalId, email, name?, days?}`; issued transmittal, named recipient, lifetime 1–90 days; private one-time invitation URL returned |
| POST /api/deliveries/:id/revoke | Stop future recipient access |
| GET /api/admin/operations | Administrator job/delivery/session/memory/capability statistics |
| GET /api/admin/security-events | Administrator evidence page with `after` cursor and hash-chain verification |

## Recipient endpoints

Recipient cookies do not authorize member endpoints, and member cookies do not authorize recipient endpoints. Invitation and password values must not be logged or persisted by clients.

| Method and path | Contract |
|---|---|
| GET /api/portal/session | Current recipient or null |
| POST /api/portal/enroll | `{token, password}`; one-time invitation; existing account requires its current password |
| POST /api/portal/login | `{email, password}`; separate recipient cookie |
| POST /api/portal/logout | Clear recipient session |
| GET /api/portal/deliveries | Only current recipient's enrolled, unexpired, unrevoked package manifests |
| GET /api/portal/deliveries/:id/files/:documentId | Frozen original bytes from that package; no arbitrary blob endpoint |
| POST /api/portal/deliveries/:id/acknowledge | `{note}`; returns idempotent identity/time/hash receipt |

There is no public team replacement/import endpoint, recipient account directory, email-dispatch API, shared link without recipient enrollment, or API compatibility promise with Bentley ProjectWise.


## Local filesystem API (0.3, opt-in localhost only)

All endpoints below require a normal member session and the exact configured loopback Host/Origin. Roots are startup configuration, not arbitrary client paths. An ungranted root returns 404. Relative paths must pass portable validation. Responses are not cached.

| Method/path | Contract |
|---|---|
| GET /api/local/status | Enabled mode, platform, limits, and only roots explicitly granted to the current user; absolute location is disclosed only for those roots |
| GET /api/local/roots/:id/list | `path`, `recursive=1`, optional `internal=1`; bounded enumeration, links/special entries blocked |
| GET /api/local/roots/:id/stat | `path`; ordinary file size/mtime and current SHA-256 |
| GET /api/local/roots/:id/file | `path`; original binary attachment, not rendered active content |
| GET /api/local/roots/:id/disk | Available/capacity bytes from filesystem statistics |
| POST /api/local/roots/:id/write | `{path,data,createOnly:true}` or `{path,data,expectedHash}`; base64 data, 50 MiB decoded cap; returns path/hash/size |
| POST /api/local/roots/:id/mkdir | `{path}`; create a directory hierarchy |
| POST /api/local/roots/:id/move | `{path,destination,expectedHash}`; file-only copy/verify/delete, nonexisting target |
| GET /api/local/roots/:id/trash | Visible recoverable file records |
| POST /api/local/roots/:id/trash | `{path,expectedHash}`; save original bytes and remove only reviewed source |
| POST /api/local/roots/:id/restore | `{id,destination?}`; verify content and restore without replacing a destination |
| POST /api/local/roots/:id/open | `{path,expectedHash,confirm:true}`; root/app allowlists required, fixed executable with separate arguments |
| POST /api/local/roots/:id/reveal | `{path,confirm:true}`; separate opt-in OS folder reveal |

There is no arbitrary command, executable selection, filesystem root registration, recursive deletion, unauthenticated local API, browser CORS bridge or OS permission escalation endpoint.

### Reusable local interfaces

`BrowserDirectoryFS(handle, {readOnly,id,label})` and `HttpDirectoryFS(root,base)` expose `read`, `write`, `list`, `stat`, `mkdir`, file `move`, `trash`, `trashList`, `restoreTrash`, and `close`. Writes must provide create-only intent or the expected current SHA-256. Browser permission renewal is explicit. `FolderBookmarks` stores handles where IndexedDB supports it. `DirectoryMonitor` reconciles changes only while running.

`DirectoryRepository(fs,{create,lock,pollInterval})` implements the normal workspace repository contract (`open/read/initialize/commit/blob/replace/subscribe/close`) plus `integrity/history/recover`. Browser callers normally rely on Web Locks; custom host adapters can supply an exclusive `lock(key,asyncCallback)` implementation. It must actually coordinate all cooperating writers. A trivial lock callback is not a production multi-writer lock.

`WorkingCopyManager(engine,fs)` provides `open/materialize/scan/acquire/checkin/refresh/untrack/close`. `checkin` accepts `{revision,comment,expectedLocalHash}` and sends `baseVersionId` to the core command. `refresh` requires the inspected hash and explicit `keepModified:true` to preserve/replace modified bytes. `importTree` and `exportTree` return completed/failed/cancelled reports and take a cancellation signal/progress callback.

`decodeTextFile` and `encodeTextFile` handle supported text encodings without silently replacing binary data. `collectDroppedFiles(dataTransfer,options)` must be called synchronously inside the drop handler so transient handle access is captured before awaiting traversal. See source JSDoc and executable tests for failure contracts.

`new WorkingCopyManager(engine, fs, { namespace? })` isolates its tracking index by repository, workspace, and account. Built-in adapters have automatic persistent namespaces except memory repositories, which are session-scoped. A third-party persistent adapter can supply a stable unique, nonsecret namespace. Changing the repository/account invalidates an open manager. Folder copies with identical legacy workspace IDs are covered by isolation and reopen tests.


## Document-control contracts (0.4)

The following are ordinary core commands, so they also pass through `POST /api/commands` with `expectedRevision`. Never send a projected client workspace as authority. The HTTP server supplies the actor and validates the original full state.

```js
await engine.run('project.numbering', {
  id: projectId,
  numbering: {pattern: '{project}-{seq:5}', nextSequence: 1, allowManual: false}
});
await engine.run('project.fields', {
  id: projectId,
  fields: [{key: 'level', label: 'Level', type: 'integer', min: -2, max: 20,
    required: true, defaultValue: '0'}]
});
const previewRevision = engine.state.revision;
const document = engine.state.documents.find(d => d.id === documentId);
await engine.run('document.bulkUpdate', {
  projectId, baseRevision: previewRevision,
  updates: [{id: documentId, expectedVersionId: document.versions.at(-1).id,
    patch: {title: 'Checked title', metadata: {level: '2'}}}]
});
const baselineId = await engine.run('baseline.create', {
  projectId, name: 'Issued information', description: 'Frozen dependency set',
  documentIds: [documentId], includeReferences: true
});
```

Bulk updates are limited to 100 unique documents in one project. `baseRevision` protects the reviewed metadata preview even if a caller supplies a more recent HTTP `expectedRevision`; both must match. Patch fields are title, description, discipline, dueDate, tags and metadata. The engine returns no partially applied batch, and allocation/validation failures consume no numbering sequence. `baseline.create` returns an immutable baseline ID, not a mutable live set ID. Frozen version identities may feed `transmittal.create` using `{projectId, baselineId, title, recipients, message?}` rather than `documentIds`.

A review template is saved using `{id?, projectId, name, separationOfDuties, stages:[{name,assignees:[userId],quorum}]}`. New `review.create` accepts a `templateId`, or explicit `stages` with optional `dueDate`, in addition to project/title/documentIds. A route stores its own stage definitions and exact file/metadata contexts; a later template change is not retroactive. Legacy `assignees`-only review creation remains available for backward compatibility.

For a routed decision, send `{id:reviewId, stageId, decision:'Approved'|'Changes requested', comment}`. The stage ID must be the currently active stage. `review.reassign` uses `{id:reviewId, stageId, from, to, reason}`; it does not modify an already cast vote or a closed stage. The authenticated assignee needs current review access to all source documents. Route decisions do not expose an endpoint for impersonating another user.

### Independent helpers

| Built module | Named exports / contract |
|---|---|
| civora-document-control.js | Metadata normalization/validation; numbering preview/allocation; dependency closure; snapshot capture/comparison; route normalization, pending reviewers and pinned-context checks |
| civora-editable-register.js | `metadataRegisterCSV(state, projectId, documentIds?)`; `parseRegisterCSV(source)`; `previewMetadataRegister(state, projectId, source)` returns the reviewed batch payload and changes |
| civora-baseline-archive.js | `exportBaselineArchive(state, baseline, repository, actorId, {signal?, onProgress?, maxBytes?})` returns `{zip, manifest}` with verified source bytes |
| civora-reference-discovery.js | `scanReferences(filename, text)` returns bounded findings/warnings; `resolveReferenceFindings(state, sourceId, scan)` offers visible controlled-document matches, never fetches targets |

The authoritative baseline is looked up by ID in the supplied state, not trusted from a caller-modified object. Export verifies every original SHA-256 and rechecks current download permission; HTTP blob reads additionally check the current server state. Caller cancellation and progress are supported, but the ZIP is in-memory and bounded, not a streaming ZIP64 archive.

Reference suggestions do not themselves commit links. After explicit review, use `document.references` with `{id, baseVersionId, references:[targetId]}`; the engine checks source staleness, access, project boundaries and cycles. The scanner never executes XML/scripts, opens URLs, reads arbitrary local paths or rewrites native references.

Run `node examples/document-control.mjs` for a complete built-library example. Limits, formats, default semantics, ordering and qualification are specified in DOCUMENT-CONTROL.md. Full command acceptance/rejection examples are in `tests/document-control.test.mjs` and `tests/document-control-http.test.mjs`.


## Workflow automation contracts (0.5)

`packages/automation/index.js` / `dist/lib/civora-automation.js` exports typed normalization/evaluation, due-event discovery, notification creation, command handlers and validation. The core exports `previewDocumentTransition(state, actorId, payload)` and `applyScheduledAutomation(state, exactUtcTimestamp)`. The former returns a read-only `{allowed:true, sourceRevision, documentId, from, to, metadata, tags, summary}` or throws the real domain gate. The latter returns `{state,result,changed}`; an idle scan does not advance the revision. Persist nonempty output through a trusted repository CAS transaction. Neither function authenticates an external caller by itself.

| Command | Essential payload |
|---|---|
| `workflowRule.save` | `{id?,projectId,name,enabled?,from?,to?,priority?,when?,require?,message?,requireReason?,metadata?,addTags?}` |
| `workflowRule.delete` | `{id}` |
| `automation.configure` | `{projectId,enabled?,reminderHours?,escalationHours?,escalationMode?,delegateId?,notifyUserIds?,includeIssues?,includeDocuments?}` |
| `automation.run` | `{projectId}`; exact execution time comes from the reducer/server, not payload `now` |
| `subscription.save` | `{id?,scope,resourceId,events,recursive?,enabled?}`; owner derives from current actor |
| `subscription.delete` | `{id}`; own subscription only |
| `notification.update` | `{ids,action,until?}`; own currently visible records only; read/unread/snooze/unsnooze |
| `document.transition` | Existing `{id,to,reason}` plus optional `baseRevision` binding an accepted preview |

All are ordinary `/api/commands` transactions with the usual `expectedRevision`. Failure does not partially mutate workflow metadata, stage assignments, notices, receipts or domain audit. Rule actions cannot run scripts or make review decisions.

Additional HTTP: `POST /api/workflow/preview` accepts `{id,to,reason,expectedRevision}` and returns a read-only allowed result or `{allowed:false,code,error,sourceRevision}`. Stale revision returns 409. `GET /api/notifications` supports `filter=all|unread|snoozed`, `limit=1..200`, `offset>=0` and optional exact `revision`; returns `{revision,total,unread,items,nextOffset}`. `GET /api/admin/automation` is administrator-only scheduler health, while `/api/capabilities` also reports actual scheduler status.

Complete grammar, types, limits, UTC timing, policy authority, safe delegation, receipt identity, notification events and migration caveats: [WORKFLOW-AUTOMATION.md](WORKFLOW-AUTOMATION.md). Executable independent example: `examples/automation.mjs`. Tests: `automation.test.mjs`, `automation-http.test.mjs`, `automation-ui.py`.

## Explorer library and API (0.6)

`civora-explorer.js` exports `defaultExplorerView`, `normalizeExplorerView`, `explorerColumns`, `explorerValue`, `queryExplorer`, `visibleExplorerViews`, `visibleExplorerBookmarks`, `explorerCan`, `folderPath`, `explorerSelection`, `ExplorerHistory`, `explorerLink`, `resolveExplorerLink`, limits and validation. `previewDocumentMove` is exported by core. See the executable `examples/explorer.mjs`.

```js
const config = {
  ...defaultExplorerView(projectId),
  columns: ['name', 'number', 'state', 'metadata.zone'],
  filters: [{ key: 'metadata.zone', op: 'eq', value: 'Area A' }],
  sort: [{ key: 'name', direction: 'asc' }],
};
const page = queryExplorer(engine.state, engine.actorId, config, {offset: 0, limit: 100});
await engine.run('explorerView.save', {name: 'Area A', scope: 'personal', projectId, config});
const preview = previewDocumentMove(engine.state, engine.actorId, {projectId, folderId, documentIds});
await engine.run('document.bulkMove', preview.payload);
```

View normalization rejects executable/unknown keys, unsafe metadata keys, invalid dates/ranges, duplicate columns/sorts, oversized lists and unsupported page sizes. It returns a separate configuration. The query is read-only; counts/groups/order are current-authorized matches. Pure query result includes authorized `ids` for selection; the HTTP response deliberately excludes that array.

| Command | Payload |
|---|---|
| `explorerView.save` | `projectId, name, scope: 'personal' or 'project', config`; update additionally `id, expectedVersion`; scope/project cannot change on update |
| `explorerView.remove` | `id, expectedVersion` |
| `explorerBookmark.toggle` | `scope: 'project' / 'folder' / 'document', resourceId`; identity comes from the actor/session |
| `document.bulkMove` | `projectId, folderId` (null for root), `baseRevision`, `items:[{id,versionId,folderId}]`; 1–100 distinct documents, same project |

Authenticated `POST /api/explorer/query` accepts `{expectedRevision, view: config, options?: {offset?, limit?}}` and returns `{revision,total,items,groups,offset,limit,nextOffset}`. The JSON request body is bounded to 32 KiB. Stale revisions return 409. Query results are permission-projected; the endpoint is not a SQL/document-store passthrough.

Authenticated `POST /api/explorer/move-preview` accepts `{expectedRevision, projectId, folderId, documentIds}`. An allowed result contains `{allowed:true,sourceRevision,payload}`; a blocked domain rule returns `{allowed:false,sourceRevision,code,error}`. No write is made. Client/server expectedRevision conflicts remain HTTP 409. Apply the returned payload through the normal `/api/commands` contract, which rechecks the current actor and state.

None of these endpoints accepts a trusted actor ID from the browser. Requests retain session and Origin protections. No saved view, pin, copied address or preview grants rights.

## 0.7 additions

See DOCUMENT-SETS.md for exact set command envelopes, lock/revision contracts and the authenticated `/api/sets/resolve` and `/api/sets/export` endpoints. Export accepts required workspace/definition preconditions, rechecks member download authority and returns an actual bounded ZIP. `transmittal.create` and `review.create` accept an optional set source with `expectedSetVersion`; reviews reject historical pins.

`civora-interactions.js` exports deterministic Viewport2D transforms, PointerSession bookkeeping and bindLongPress. Pointer listeners belong to viewer/UI adapters and are disposed when their view closes. Image annotations remain normalized source-revision data; drawing camera gestures do not mutate controlled documents.


## Explorer presentation helpers (0.8)

`civora-explorer.js` additionally exports `defaultExplorerLayout()`, `normalizeExplorerLayout(input)`, `explorerPresentationPreset(name, current)` and `explorerDetailView(projectId, folderId)`. These are pure presentation helpers with no storage/network/permission side effects. Preset names are `explorer`, `ribbon`, `review`; unknown names throw. Layout normalization supplies defaults, strictly reads booleans, bounds numeric dimensions and ignores unknown keys. Existing `defaultExplorerView()` and saved-query schemas remain unchanged. The app uses the detailed view only for a new local configuration or explicit reset. See EXPLORER-DESIGN.md and the independent examples/explorer.mjs.


## 0.9 navigation and controlled-copy contracts

`civora-navigation.js` exports `navigationSearch(state, actorId, options)` and text normalization/bounds. Supply `{query, projectId, scope:'project'|'workspace', kind:'all'|'document'|'folder'|'command'|'view', limit, recents, commands}`. Commands are inert `{id,label,detail?,glyph?}` descriptors, not callbacks or scripts. The search response contains `items`, per-kind `counts`, `total`, `limited`, query/category/scope. Apply the current permission projection before showing results; the function does so for authoritative input. Same-actor filtered projections are also accepted.

`civora-document-copy.js` exports `planDocumentCopy`, `verifyCopyContent`, `suggestCopyNames`, `copyFilename`, `COPY_LIMITS`, and `DocumentCopyError`. The planner takes authoritative state plus `{projectId,folderId,baseRevision,reason,copyMetadata,copyTags,referenceMode:'none'|'selected',items:[{id,versionId,name,title?,number?,metadata?}]}`. Unknown fields and client-provided file descriptors/authority are rejected. `verifyCopyContent` additionally takes an async Blob getter. This is mandatory at the application persistence boundary; it is not implicit in a pure reducer call.

Core `previewDocumentCopy(state,actorId,input)` returns `{allowed:true,sourceRevision,payload,rows}` after actual reducer validation with discarded output. It binds baseRevision to the provided authoritative state and allocates preview numbers without consuming counters. `engine.run('document.bulkCopy', preview.payload)` verifies unique original content locally, or calls the server which independently verifies. The command returns `{copied:[{sourceId,sourceVersionId,id}]}`; metadata writes still require exact workspace compare-and-swap. See `examples/refinements.mjs` and REFINEMENTS.md for precise reset/permission/size semantics.

Authenticated same-origin endpoints:

- `POST /api/explorer/quick-search`: navigation options plus `expectedRevision`; max 8 KiB request; adds response `revision`; client commands ignored.
- `POST /api/explorer/copy-preview`: copy request without baseRevision, plus `expectedRevision`; max 256 KiB; a rejected domain preview returns `{allowed:false,error,code}`. Auth/origin/revision transport errors keep their HTTP status.
- `POST /api/commands`: ordinary `{expectedRevision,command:{type:'document.bulkCopy',payload}}`, no uploaded file field. Server hashes originals, rechecks session/revision and commits one new workspace revision. Conflict or corrupt content returns 409, invalid inputs 400, unauthorized actions 403, absent session 401; more than two active copy verifications returns 429.

There is no new role, permission grant or metadata schema. Source-to-copy mapping is retained in the administrative audit; member projections do not expose the complete audit history.


## 0.10 revision comparison and atomic rename

New bundles: `civora-comparison.js` and `civora-document-rename.js`; executable usage in `examples/workbench.mjs`. Full argument/authority/bound details are in [WORKBENCH.md](WORKBENCH.md). `readVerifiedRevision` must precede report construction. `compareLines` returns a complete bounded diff or throws a limit error, never an approximate result.

Core `previewDocumentRename(state,actorId,input)` validates using authoritative state and returns `{allowed:true,sourceRevision,payload,rows}` without writing. The authenticated endpoint is `POST /api/explorer/rename-preview` with `expectedRevision,projectId,reason,items:[{id,versionId,folderId,expectedName,name}]` (128 KiB maximum request). It does not accept caller-supplied identity, content or metadata. Apply `payload` through `engine.run('document.bulkRename',payload)` or ordinary `/api/commands`; `baseRevision` and transport `expectedRevision` must still match. Final names are validated together, permitting swaps. Result: `{renamed:[{id,from,to}]}`. One aggregate audit record carries the same `renameChanges`.

Comparison has no additional HTTP authority: both original reads use the existing permission-enforced Blob endpoint. Hash comparison of two already retrieved originals does not attest a signature, native CAD semantic equivalence or ownership.
