> **0.8.1 update:** All workspace routes now use the Explorer shell; old appearance settings migrate once and generated HTML/JS/CSS is deployed atomically with scoped offline caches. See [INTERFACE-FIX.md](INTERFACE-FIX.md). Feature boundaries below remain unchanged.

# Explorer design — Civora 0.8

Civora's main Documents workspace now uses a compact engineering desktop rather than a dashboard-first shell. The reference is ProjectWise Explorer's publicly documented datasource tree, document register, address toolbar, menus and lower tabbed preview. All UI code, assets and styling remain independently authored. Civora is not a Bentley client and does not use Bentley branding, copied source or proprietary icons.

## Default layout

The default desktop layout has a slim Civora Explorer title/session bar; Datasource, Folder, Document, View, Tools, Window and Help menus; a standard action toolbar; an address row; a datasource tree on the left; and a detailed register above a tabbed properties pane. The former dark workspace rail is hidden by default on this page, not removed. **All workspaces** and **Window → All workspaces** expose all 25 application tools.

The tree shows the active Civora repository, Documents, projects/folders, saved searches, document sets and personal shortcuts. Yellow folder icons, plus/minus disclosure controls, connector guides, readable tooltips and blue selection make the hierarchy explicit. This does not add multiple simultaneous datasource connections, server discovery or native Bentley folders. A temporary-memory repository remains visibly marked as temporary.

The new unsaved Detailed view uses Filename, Description, Document number, Workflow state, Version and Modified columns. Desktop Compact rows are single line and approximately 30 CSS pixels high. Standard/Comfortable density and secondary descriptions remain configurable. Explicit/coarse-pointer touch sizing overrides compact geometry. Existing saved views retain their columns, filters, ordering and widths; this release does not silently rewrite them.

Status labels have coordinated light/dark text and backgrounds. Blue/slate application tokens, fine borders, restrained corner radii and system Segoe UI/Arial fallbacks replace the teal dashboard emphasis. No font files are distributed. The app manifest, favicon and browser theme color use the same original visual identity.

## Choose a layout

Open **View → Explorer appearance**, or the appearance gear at the end of the standard toolbar. Presets populate a real settings form; nothing changes until **Apply appearance** is selected.

| Preset | Result |
|---|---|
| Explorer | Compact standard commands, hidden workspace rail, bottom preview, grid lines and single-line filenames |
| Ribbon | Grouped task ribbon, workspace rail and secondary filename descriptions |
| Review | Standard toolbar, hidden rail and a right-side properties pane initially 420 CSS pixels wide |

Independent controls select standard/ribbon commands, below/right/hidden preview, row density, navigation rail, grid lines, secondary descriptions, column filters, toolbar visibility and tree visibility. Touch input preferences remain in **View → Input & responsive layout**. Light/dark appearance remains separately switchable. Existing column and page controls are retained.

These are repository/workspace/account-scoped browser preferences, not server-side configuration and not permission changes. Cancelling the dialog has no effect. Invalid stored dimensions are bounded and unknown layout keys ignored. Existing `civora-explorer-v6` preference keys are retained so a new cache version does not erase previous views. Where browser preference storage is unavailable, settings cannot be promised to survive closing the page.

**View → Reset Explorer layout** intentionally resets the local query/layout, columns and filters to the new Detailed view. It does not delete saved views or documents. Applying an appearance preset alone preserves query/column configuration.

## Properties and preview

The lower/right pane exposes Document properties, Folder properties, Attributes, File preview, Versions, Dependency viewer, Access control and administrator Audit trail. Document attributes come from the current project's configured metadata fields; false boolean values remain visible as `false`. Folder details use the selected document's actual folder even when the register is showing a project-wide result. Open this folder executes the existing navigation command.

File preview loads actual stored bytes through the existing viewer. Versions, dependencies, access and audit use the existing controlled records and authorization. No native CAD parser, Bentley property handler, or synthetic additional preview engine has been substituted. The pane caption offers bottom/right/hide controls; View can restore a hidden pane. Existing pointer and keyboard splitters remain available.

## Keyboard and touch

Menubar Left/Right/Home/End navigation, ArrowDown opening and Escape focus restoration are implemented. The tree supports Left to collapse/go to parent, Right to expand/go to first child, Up/Down/Home/End and typeahead. Collapsing the currently selected project is no longer undone during render. Preview tabs use roving tab stops with directional navigation. F6/Shift+F6 move among Explorer regions; Alt+D opens the existing validated Civora address dialog. Document list selection/Enter/context/checkout commands remain intact.

The selection strip reserves its desktop space so selecting a compact row does not move the row underneath the pointer. Double-clicking an unselected document therefore opens it reliably. Mobile retains its compact idle presentation rather than wasting the same strip height.

Phones use visible Create, Document, View and Tools commands, document cards, search, location controls, the five-action bottom dock and searchable workspace sheet. Appearance presets are usable in a responsive form. The retained image/model gestures and action alternatives continue through the same modules. Hybrid users can explicitly select Touch mode to obtain larger toolbar, tree and row targets. These tests do not establish WCAG conformance or physical iOS/Android qualification.

## Reusable API

The existing `civora-explorer.js` library adds four pure exports. No additional library bundle is required:

```js
import {
  defaultExplorerLayout, normalizeExplorerLayout,
  explorerPresentationPreset, explorerDetailView
} from './dist/lib/civora-explorer.js';

const stored = normalizeExplorerLayout({ treeWidth: 285, previewPosition: 'bottom' });
const review = explorerPresentationPreset('review', stored);
const columns = explorerDetailView('project-id', null);
console.log(defaultExplorerLayout(), review, columns);
```

These helpers have no DOM, storage, network or command-engine side effects. They are not an authentication or schema-migration API.

## Verification boundary

The release adds 10 pure Node presentation tests and 20 actual-application UI checks. The latter use MemoryRepository on an isolated browser document, real command processing, and an explicitly identified Map-backed preference-storage fixture. Real-origin browser navigation is blocked in the supplied environment. A preference round trip in that fixture is not proof of IndexedDB/localStorage persistence, cookie authentication, OAuth or installed service workers. The retained real HTTP/SQLite tests run separately. See TESTING.md for current complete results.

This is a visual and interaction refinement, not full ProjectWise feature/UI parity, native datasource compatibility, a security audit or independent usability/accessibility certification. Existing model, file-size, provider, scaling and storage limits are unchanged.

## Public design references

- Bentley, ProjectWise Explorer Window Layout: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-7A0E5E3A-1FE9-4068-C4A2-AC9F22A17A9B.html
- Bentley, Using the Preview Pane: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-EEA317D0-9663-9F84-AFF2-B15D901F7A57.html
- Bentley, Using the Address Bar and Address Links: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-2E951154-5B31-FD1B-D0E0-237F125A0774.html

References were reviewed for interaction patterns only. No external service connection is implied by their use.
