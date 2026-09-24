# Civora 0.8.1 — intermittent old-interface fix

## Reproduced code paths

The 0.8 design class was enabled only when the current route was Documents. Navigating to Overview, Local system, reviews, settings or other tools removed it and explicitly restored the old wide navigation/sidebar shell. This was not just an HTTP cache problem.

The browser also retained unversioned appearance preferences under `civora-explorer-v6`. They could restore a prior ribbon/rail when opening a different account or workspace. Finally, the multi-file HTML entry loaded CSS and modules separately; the old worker fetched those unversioned resources independently and used global `caches.match()` as its fallback. These code paths could expose an older or mixed shell. The user's deployed browser cache was not available for direct inspection.

## Corrected behavior

All 25 routes now use the same compact Explorer header and presentation rules. Tool pages have a matching workspace toolbar, address strip, project selector and individually scrolling content. Their actual forms, records, editors and actions are retained. Documents still provides the full register/tree/preview layout. Phone cards, touch interaction and the five-action bottom dock remain.

Presentation preferences now have their own schema and a new account/workspace/repository-specific key. On the first visit, the old key is imported without deleting it. Only the old chrome defaults are migrated: standard toolbar, hidden navigation rail, grid lines, and single-line filenames. Pane dimensions and position, configured columns, density, search/filter configuration, expanded nodes and recent IDs are retained subject to existing bounds. No document, shared saved view, permission, original file or database record is rewritten. After migration, an explicit Ribbon or Review selection remains persistent; it is not reset on every render.

Every deployed HTML entry contains its own complete JavaScript and stylesheet. The deterministic build ID is derived from the application, templates, styles, icons, manifest and worker template. A navigation cannot load a new stylesheet against an old app module graph. The recipient page is also bundled, but retains its separate authentication interface.

`npm start`, `npm run local`, `npm run server`, and the included platform launch scripts rebuild before starting. `index.html` and `portal.html` are now generated output; their editable templates are `app/shell.html` and `app/portal-shell.html`. Compile before publishing to another static host. Generated entry points, worker and release metadata are written by temporary-file rename rather than exposing partially written files. Publish all generated files together.

## Cache and update safety

The generated worker downloads and verifies the complete public shell before activation. The cache name is isolated by installation URL and build. Online entry navigations request fresh HTML; offline fallback reads only this installation's current build cache, never a global older-cache match. HTTP error responses are not replaced with cached sign-in screens. A partial deployment fails offline installation instead of installing mixed resources. Only the exact URLs for this installation are removed from legacy shared shell caches; other installed apps and data caches are preserved. APIs, document bytes, OAuth callbacks, recipient pages, requests with query strings and foreign URLs are not cached.

A successfully installed worker may activate without closing all tabs because application code and CSS are already embedded together. It does not reload, navigate, or hot-swap the running page. Newer builds are reported by an in-app notice and the visible version badge. Checks occur at startup, foreground/online events, and every two minutes while visible; they have a ten-second request timeout and are not a guarantee of delivery while a browser is suspended. Opening an older standalone file cannot update that file's bytes; open the newly delivered HTML instead.

Reload is an explicit action. Open dialogs, sign-in, pending command work and temporary-memory workspaces block it. No update path calls localStorage.clear, deletes a database, unregisters other service workers or resets project data. Ordinary browser reload/close is outside these guards: export a temporary-memory workspace before closing it. Use normal durable storage for retained work.

## Upgrade

Back up the authoritative data directory and stop existing writers. Replace the application/source files with 0.8.1, keep the same data directory, and start using the usual command. Reload previous tabs once. Confirm **v0.8.1** in the top bar; click it to see the build and update status. For a standalone installation, open **Civora-0.8.1.html**, not a saved copy of an earlier release. Do not clear browser site data to fix the appearance.

The one-time migration may replace a Ribbon selection made in 0.8 because those settings had no appearance schema. A deliberate new choice in View → Explorer appearance is retained thereafter. Saved register views and document data are untouched.

## Verification boundary

The release includes pure migration/update tests, executed generated-worker tests with explicit Cache/Fetch/client fixtures, real Node HTTP headers and byte/hash checks, and actual app UI tests spanning all 25 routes at desktop and phone sizes. UI checks also cover account changes, repeated navigation, cold bootstrap with an explicit preference fixture, resizing and read-only version diagnostics.

The supplied Chromium still rejects ordinary URL navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Consequently actual browser-origin IndexedDB, cache lifecycle/offline behavior, multi-tab installation, physical-device behavior and real persistence are not qualified here. The worker logic tests are not presented as real service-worker lifecycle tests. This fixes identified presentation/update paths; it does not complete ProjectWise feature parity or independently qualify security/accessibility.

## Implementation references

- `app/main.js`, `app/explorer.js`, `app/styles.css`: unified shell and persisted migration.
- `packages/explorer/index.js`: pure `migrateExplorerPreferences` contract.
- `app/updates.js`, `app/version.js`: bounded public release checks and guarded reload.
- `scripts/build.mjs`, `scripts/service-worker.template.js`, `scripts/static.mjs`: atomic build, scope-specific verified shell, HTTP policy.
- `tests/interface-consistency.test.mjs`, `tests/service-worker.test.mjs`, `tests/interface-consistency-ui.py`: regression evidence.

The lifecycle and cache design was checked against the primary browser guidance at https://web.dev/articles/service-worker-lifecycle, https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register and https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage/match. Those references explain browser behavior; they do not independently verify this implementation.
