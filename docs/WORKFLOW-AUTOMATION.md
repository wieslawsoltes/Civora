# Workflow automation — Civora 0.5

This release adds a declarative workflow-rule engine, deadline policies, restart-safe scheduling and permission-filtered in-app notifications. It does not execute user scripts, approve information automatically, dispatch email, or supply a distributed workflow service.

## Start with a project

In **Workflow automation**, create a rule or configure the deadline policy. The original demonstration project has three sample transition rules and a **disabled** deadline policy. Fresh authenticated workspaces remain empty. Existing workspaces acquire no rules or policies merely by upgrading.

**Preview transition** evaluates the real command without saving. A successful preview shows the proposed metadata and tags. Changing an input invalidates the preview. Applying checks both the preview revision and current server revision; a concurrent edit requires another preview. The document inspector's Change state action uses this same preview. In team mode the preview is evaluated by the authenticated server, not against a client projection.

**Rules & policy** contains rule cards, pause/resume, the visual editor and deadline settings. **Due queue** lists eligible unsent events; **Execution history** lists sent, delegated and blocked outcomes and can export JSON. The UI shows actual server scheduler status, including disabled/error states, rather than assuming every connected server is running automation. Operations & security includes process-level scheduling counters and errors.

## Declarative transition rules

Rules are project-scoped. Administrators, or managers with current project `manage` permission, can create, change, pause and remove them. Existing workflow transition roles, document permissions, exclusive checkouts, legal holds, metadata validation and exact-reviewed-context publication gates remain authoritative.

```js
await engine.run('workflowRule.save', {
  projectId,
  name: 'Coordination readiness',
  enabled: true,
  from: 'Work in progress',
  to: 'Shared',
  priority: 20,
  when: { all: [
    { field: 'discipline', op: 'eq', value: 'Architecture' }
  ] },
  require: { all: [
    { field: 'metadata.handover_ready', op: 'eq', value: true },
    { field: 'tags', op: 'contains', value: 'Checked' }
  ] },
  message: 'Complete the readiness check and add the Checked tag.',
  requireReason: true,
  metadata: { suitability: 'S2' },
  addTags: ['Coordination ready']
});
```

The metadata keys above must exist in that project's schema. They are examples, not universally built-in attributes. Omit `id` to create a rule; supply its existing `id` to update. Rules cannot be moved to another project. `workflowRule.delete` accepts `{id}`. Rule configuration changes and execution commands enter the normal domain audit.

### Conditions

Use `{all:[...]}` for AND and `{any:[...]}` for OR. An empty `all` is true; an empty `any` is rejected. Leaves contain `field`, `op` and, except for existence tests, `value`.

Fields are `name`, `number`, `title`, `discipline`, `state`, `dueDate`, `tags`, `referenceCount`, `actorRole`, and `metadata.<declared-key>`. Supported operators:

| Operator | Semantics |
|---|---|
| `eq`, `ne` | Type-correct, case-sensitive equality/inequality |
| `in`, `notIn` | Membership against 1–30 typed scalar values |
| `contains` | Case-sensitive substring for text; exact tag membership for tags |
| `startsWith` | Case-sensitive text prefix |
| `gt`, `gte`, `lt`, `lte` | Finite numeric comparison; not date/string ordering |
| `exists`, `missing` | Treat undefined, null, empty string and empty lists as missing; `false` and numeric zero exist |

Missing data does not accidentally satisfy negative comparisons. Metadata's persisted representation is canonical strings. The schema-normalized leaf records `valueType`; the evaluator interprets numeric/boolean strings only for those declared types. It never coerces arbitrary text, blank strings, or script expressions. Incompatible field-type changes and removal of referenced fields are rejected while dependent rules remain configured, even if paused. Update/remove the rule first.

A rule's expression is limited to 32 nodes, depth four, and 16 members per group. Text values are bounded. Unknown fields/operators/properties, prototype properties, regex evaluation, function calls and executable source are rejected. The ordinary editor builds flat AND/OR groups; existing nested or root-leaf expressions open in a structure-preserving JSON editor. Arbitrary workflow scripting is not supported.

### Transaction and ordering

Enabled rules match project, source state, target state and their `when` expression. `*` matches any state. **All `when` and `require` predicates use the same pre-transition document and acting user.** Assignments do not change which later rules match. Rules execute in ascending priority, then identifier order; later matching assignments to the same field win. Tags are added uniquely. A rule can require a nonempty recorded reason.

All guards must pass before committing. Assignments are limited to declared metadata keys and tag additions; they cannot change identities, roles, files, permissions, reviewers or approval decisions. They require the caller's document `write` permission even when a transition only needs `publish`. The combined metadata must satisfy the schema. Publication checks the resulting metadata against the approved revision/context, so a rule cannot rewrite reviewed metadata and reuse the old approval. Any failure rolls back state, metadata, tags, notifications and audit together.

Limits: 40 rules per project, 1,000 per workspace; priority 0–1,000; at most 20 rule-added tags and 30 final document tags. There is no expression query over other documents, webhook call, arbitrary action chain, event-triggered script, time-zone calendar expression or automatic approval.

## Deadline policies and authority

One optional policy per project controls reminders, overdue reporting and review escalation:

```js
await engine.run('automation.configure', {
  projectId,
  enabled: true,
  reminderHours: 24,
  escalationHours: 48,
  escalationMode: 'notify', // or 'delegate'
  delegateId: '',          // required for delegate mode
  notifyUserIds: [coordinatorId],
  includeIssues: true,
  includeDocuments: false
});
```

The member saving the policy becomes its authority owner. Each configuration save creates a new policy version. The owner must remain active, have administrator/manager role and project `manage` access, and be able to read the affected resource and its complete pinned context when work runs. There is no fallback to a privileged synthetic administrator when authority is revoked.

The fields are bounded to 0–720 hours, at most 20 additional notification recipients. Date-only deadlines end at **23:59:59.999 UTC**. A stage's own deadline takes precedence over its parent review deadline. There are no per-user time zones, holidays, business-day calendars or guaranteed wall-clock delivery times. Scheduling uses the server clock; client command payloads cannot set it.

Before the deadline, eligible work receives one lead reminder. After it, one overdue event is recorded; review escalation becomes due after its configured delay. If the process was offline throughout the lead window, it sends the overdue event on recovery rather than a stale "due soon" reminder. Completed/cancelled reviews, resolved/closed issues and published/archived/recycled documents are excluded as appropriate. Document reminders are optional; reviews are always covered by an enabled policy. Source-stale reviews are blocked rather than issuing misleading reminders about current information.

### Notify and delegate

`notify` escalation sends an in-app record to pending reviewers, the review initiator and the configured additional coordinators, subject to current access. It makes no review decision. Overdue/reminder issue events target the assignee and creator; optional document events target the creator. Watches cover supported change events, not all scheduled-deadline events.

`delegate` is deliberately narrower than arbitrary route rewriting. It can replace **exactly one remaining pending voter** in the current staged review. The delegate must be active, have administrator/manager/reviewer role, be unassigned in that stage, and currently have project and all-document review access. Optional separation of duties still excludes the initiator and pinned revision authors. All source revisions and metadata must remain current, with no checkout/recycle invalidation.

Existing decisions, quorum and other assignees are preserved. The reassignment records original reviewer, delegate, stage, timestamp, policy reason, policy owner and `automatic:true`. It does not approve, publish, complete a stage, or reduce quorum. Legacy non-staged reviews can receive reminders but cannot be automatically delegated. Multiple remaining voters, invalid delegates, stale source context or missing authority produce a **blocked** receipt instead.

A still-authorized policy owner receives a reference-only blocked-escalation notice where the full resource remains visible. The history shows reason codes such as `OWNER_ACCESS`, `STALE_REVIEW`, `QUORUM`, `SEPARATION`, `ACCESS`, `ALREADY_ASSIGNED`, `DELEGATE` or `LEGACY`. A recorded block is not silently retried on every tick: correct the issue and explicitly save the policy again to create a fresh version and reevaluate due work.

## Server scheduling and local reconciliation

The authenticated team/localhost server runs the scheduler by default. Policies remain opt-in. Environment variables (the application does not automatically read `.env`):

```text
CIVORA_AUTOMATION=1
CIVORA_AUTOMATION_INTERVAL_MS=30000
```

Set `CIVORA_AUTOMATION=0` to disable automatic scans. Interval bounds are 250–3,600,000 milliseconds; this is a scan interval, not a service-level delivery guarantee. Scheduling works while the **server process is running**, without an open browser. It is not an installed OS service, external queue or browser background task. `Reconcile now` remains a manager-authorized explicit operation, including on a server whose timer is disabled.

Browser IndexedDB, memory and folder-workspace modes do **not** run unattended scheduling. They use the same reducer through `automation.run` with `{projectId}` when explicitly requested.

The server reads the current authoritative workspace, computes up to 200 outcomes, and commits mutations, notifications and deduplication receipts with one compare-and-swap. A concurrent workspace edit causes recomputation from fresh state; up to four immediate retries precede deferral to the next scan. Concurrent calls in one runner coalesce. Empty scans do not advance the workspace revision. Shutdown waits for an in-flight commit.

Deduplication key: policy version, resource type/id, stage, deadline and event. These receipts live in `automationLedger` in the **main workspace**, alongside normal backups/checkpoints/snapshots. Restart scans the deadlines again, but committed receipts prevent repeat delegation/delivery. A transport failure or uncommitted CAS attempt does not create a receipt. A changed policy, deadline or stage is a new scheduling identity. This is atomic application-record delivery, not exactly-once email/network-side-effect delivery.

The ledger retains at most 100,000 outcomes and does not automatically purge. The database metadata-size limit may be reached earlier. Reaching a bound stops commits with an observable error; it is not permission to discard deduplication keys under active policies. Archival/migration must be explicitly planned; no automated archival service or high-scale guarantee is provided. Personal inbox trimming does not remove ledger keys.

## Personal subscriptions and notifications

Use **Notifications → Watch this project** or **Follow changes** in a document inspector. Subscriptions support project, folder and document scope; folder watches can include descendants. Saving a scope/resource for the same member updates that watch instead of creating duplicates. Overlapping matching watches produce one recipient/event delivery.

Supported change events: document create/revise/update/move/state/recycle/restore; comment add; review start/assignment/decision/cancellation; issue create/update; issued delivery. Stage activation directly notifies pending assignees. Review initiators receive decisions; issue assignees and creators receive their relevant events. These direct assignments do not require a watch subscription.

Notification records contain identifiers and event/time/actor/read/snooze fields—not copied file content, titles, paths, emails or metadata. Rendering resolves the current resource title. Every API read, projection, update and live workspace refresh checks current membership and resource permissions, including all pinned review/delivery references. Revoked targets disappear; guessed identifiers cannot update another person's notice. Authorized access restored later can reveal retained notices again. Information already seen or exported cannot be recalled from a person's device.

The personal endpoint and UI filter to the current member even for administrators. An administrator's authoritative workspace backup still includes all records; this is not secrecy against the server/database administrator. Local profile switching remains a demonstration and offers no authentication boundary.

The UI supports unread/all/snoozed filters, 30-item pages, read/unread, one-day snooze, unsnooze, mark-page-read, subscription management and deep links to actual resources. The API supports bounded pagination with revision guards and snooze durations up to 30 days. Read/snooze mutations persist in normal workspace history. They share whole-workspace concurrency and can invalidate an open transition preview.

Limits: 100 subscriptions per member, 10,000 total; newest 1,000 notifications per member and 50,000 globally. Older notices are pruned by creation order. There are no email/SMTP, SMS, mobile push, desktop system notifications, per-event delivery acknowledgments from external systems, or notification signing.

## API and standalone library

`packages/automation/index.js` is pure ES-module code with no DOM, I/O, timers, network, eval or external package requirement. The shared core invokes it transactionally. `dist/lib/civora-automation.js` includes its dependency closure and imports without the app. `examples/automation.mjs` demonstrates a rule, subscription, read-only preview, real transition and restart-safe due-event reducer.

Server endpoints:

- `POST /api/workflow/preview`: `{id,to,reason,expectedRevision}`. Returns allowed preview or an explained domain denial; does not save. Stale expectedRevision returns HTTP 409.
- `GET /api/notifications?filter=unread&limit=50&offset=0&revision=...`: current-member, live-access-filtered records; limit 1–200. Stale pagination revision returns 409.
- `GET /api/admin/automation`: administrator-only actual timer status, last success/error and process counters.
- `GET /api/capabilities`: includes actual scheduling configuration/status. `/api/admin/operations` also includes it.

Commands: `workflowRule.save`, `workflowRule.delete`, `automation.configure`, `automation.run`, `subscription.save`, `subscription.delete`, and `notification.update`. `document.transition` accepts optional `baseRevision` to bind the user-reviewed preview in addition to the normal transport expected revision.

## Qualification

Pure-domain, actual authenticated HTTP/SQLite/restart and isolated UI tests exercise this release. The browser harness uses an opaque-origin MemoryRepository because normal URL navigation is blocked by the supplied Chromium. Server identity and scheduler behavior were tested independently through actual HTTP. Live browser-origin persistence/cookies, external identity providers, cloud/database deployments, OS background services, multi-node scale, time-service faults and independent penetration testing are not qualified. See TESTING.md and SECURITY-REVIEW.md.
