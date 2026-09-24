# UI / UX refinements — Civora 0.10.0

The original, clean-room Explorer layout remains: compact menus/toolbar, datasource tree, register and tabbed properties, with consistent navigation across all 25 workspaces. No proprietary assets are imported.

New working interactions: direct **Compare revisions** in the Versions pane and Document menu; selectable revision pairs, split/unified content, source evidence, change/page navigation, verified report/original export, drawing wipe/overlay/side modes; **Rename selected** and Shift+F2; before/after rows, literal generation, exact preview validation and audited all-or-nothing rename.

Phone comparison opens in unified mode with a compact selector row and optional advanced controls. Rename stacks fields with a sticky confirmation footer. Light/dark styles use the existing shell variables. Existing touch model/drawing navigation, command search, saved views and all old commands remain. No page-zoom disabling, hover-only entry point or data-resetting appearance migration is introduced.

Checks include actual rendered originals, downloaded report content, stale input/response handling, late-decoder rejection, account switching and all retained UI suites. They run in an isolated memory repository with explicit delayed/transport/permission fixtures where noted; they are not physical-device, assistive-technology, live browser HTTP, or WCAG conformance certification. See WORKBENCH.md and TESTING.md.

---

## Historical release records (counts and versions below are not current)

# UI / UX refinements — Civora 0.9

The original Explorer-style tree/register/toolbar/property-pane design remains consistent across all 25 workspaces. No Bentley assets, proprietary implementation or complete interface equivalence are claimed.

New: keyboard/touch Go to anything search, current-project/all-readable scope, document/folder/view/command categories, Ctrl/Cmd+Shift+C controlled copy with exact validation, removable filter chips, saved-view dirty state, previous/next preview context, and consistent authors/version labels. Phone search is a visible 44-pixel header action; new forms stack controls and keep confirmation/Cancel reachable. See [REFINEMENTS.md](REFINEMENTS.md).

Copying is an original Civora workflow with explicit destination ACL, historical-byte/current-metadata and selected-reference semantics. It is not native ProjectWise copy API or embedded CAD-reference compatibility. Search is not a native-file content index. Accessibility and physical-device conformance remain unqualified.

---

## Retained reference-interface matrix

> **0.8.1 update:** All workspace routes now use the Explorer shell; old appearance settings migrate once and generated HTML/JS/CSS is deployed atomically with scoped offline caches. See [INTERFACE-FIX.md](INTERFACE-FIX.md). Feature boundaries below remain unchanged.

# Reference-interface coverage — Civora 0.8

This matrix records familiar interaction patterns, not pixel-perfect replication, Bentley interoperability, or complete ProjectWise feature parity. The release uses original names, icons, styles and implementation. Existing delivery/model/local tools remain present.

| Publicly described pattern | Civora 0.8 delivery | Important boundary |
|---|---|---|
| Datasource list and folder tree beside document list | Active repository under Datasources, Documents/project/folder hierarchy, yellow folders, plus/minus controls and detailed register | One active Civora workspace; no Bentley server discovery or simultaneous Bentley datasource logins |
| Document/folder properties preview below list | Docked Document/Folder/Attributes/Preview/Versions/Dependency/Access/Audit tabs; bottom/right/hidden; resizable | Independently implemented property model; not every Bentley property/plug-in tab |
| Menus, toolbars, context commands | Seven familiar menu groups, standard toolbar by default, optional task ribbon, row context menu and command links | Not native Windows toolbar customization, shell extensions or all original accelerators |
| Address bar and item links | Breadcrumbs, stable ID links, copy/paste, login continuation, back/forward/up | Civora addresses only; no `pw:` handler, Bentley URNs, OS shortcut drag or email integration |
| Configurable document display | Reordered/resized columns, metadata fields, multi-sort, grouping, row density, card view and pages | No unlimited table virtualization or every ProjectWise view setting |
| Saved searches and personal shortcuts | Versioned personal/shared view configurations, pins and scoped recent IDs | No full-text/native-file index; no automatic migration of legacy search bookmarks |
| Selection and file organization | Mouse/keyboard/ranges, properties, checkout/check-in, guarded bulk move, drag/drop and cut/paste | Controlled cross-project copy added in 0.9; still no native shell copy/link semantics, recursive folder copy/move or CAD reference rewriting |
| Design visualization and references | Existing original-file preview, stored markups, bounded model tools and explicit reference graph | Not complete Navigator/Components/native design-application integration |
| Delivery and administration | Existing reviews, baselines, recipients, automation, notifications, access, models and local systems reachable from All workspaces/Window, optional rail and existing menus | Their documented existing limitations are unchanged |

## Added appearance and interaction controls

The default desktop removes the large ribbon and dark app rail from Documents, reducing header space and matching the documented tree/list/properties arrangement more closely. Explorer/Ribbon/Review presets expose independent pane/command/density controls. Existing saved views remain intact. New default columns separate Filename and Description; selection uses blue outlines/fills, folder icons use yellow, and light/dark chrome shares a blue/slate palette.

Keyboard menubar/tree/tab navigation, retained current-project collapse, F6 regions and stable selection geometry are tested. Attributes and Folder properties show actual current records, not static visual placeholders. All twenty-five tools remain reachable. See EXPLORER-DESIGN.md for exact operations and non-goals.

## Touch and collection increment

| Interaction | Civora 0.8 | Boundary |
|---|---|---|
| Ordered document collection | Versioned Latest/fixed set members, manager lock, original ZIP and delivery | Original Civora semantics; not a Bentley native set file or access grant |
| Phone document browsing | Cards with explicit action/selection controls; optional full register | Same engine and current permissions, not all native mobile-client functions |
| Mobile tool navigation | Five-action dock and searchable 25-tool sheet; visible Create/Document/View/Tools commands | No unreachable hover-only main navigation; not a physical-device qualification |
| Drawing gestures | Pan/pinch, zoom/fit/pan buttons, two-tap box, Drawing/Notes | Image/SVG originals; no new proprietary CAD or full PDF annotation engine |
| Model gestures | Orbit/pinch/pan, directional buttons, Model/Elements properties | Bounded mesh viewer, tested Canvas fallback; not hardware/GPU qualification |
| Touch and keyboard | Larger controls, explicit input mode, dialog focus, nondrag alternatives | Not a complete WCAG, screen-reader or pen-pressure conformance assessment |
| Camera / install | Capture-hinted normal file input; browser-supplied install event | Actual camera, permissions, app installation and OS integration remain unverified |

See MOBILE-TOUCH.md and DOCUMENT-SETS.md. Phone adaptations intentionally differ from a dense desktop register rather than reducing desktop controls to unreadable touch targets.

## Public primary sources

Consulted 23 September 2026; only functional patterns are paraphrased. No vendor images or assets are bundled.

- ProjectWise Explorer window layout: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-7A0E5E3A-1FE9-4068-C4A2-AC9F22A17A9B.html
- Preview pane: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-EEA317D0-9663-9F84-AFF2-B15D901F7A57.html
- Address bar and links: https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-2E951154-5B31-FD1B-D0E0-237F125A0774.html

Real application screenshots in test-results are synthetic-data captures from the disclosed memory/fixture test environment. UI resemblance is not measured by an independent usability study or accessibility certification. Keyboard and responsive regressions establish tested interactions only.

Touch guidance: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html and https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . No conformance claim is made.
