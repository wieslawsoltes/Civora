# 0.9 touch refinement

The top-bar search has a visible touch-size phone button. The new palette supports touch selection and categories, and controlled-copy dialogs have stacked inputs and a reachable sticky validation/confirmation footer. These are browser-emulated test results, not physical-device qualification. See [REFINEMENTS.md](REFINEMENTS.md).

---

# Mobile and touch — Civora 0.7

Civora retains the familiar desktop datasource/folder tree, document register, address navigation and docked preview. The phone layout is an adaptive interface to the same engine, not a separate reduced-data app or a native ProjectWise mobile client.

## Navigation and documents

At phone widths (up to 780 CSS pixels), Files uses readable document cards by default. Each card exposes identity, state, revision and an explicit More action. Tap opens the document; enable Select to choose multiple records, or use the visible checkboxes. Sort and current-page select-all are explicit actions. Input & layout can restore the full horizontally scrollable register without changing saved document data.

The persistent five-action dock is **Files, My work, Add, Updates and More**. More opens a searchable workspace sheet containing all 25 app tools, plus project switching, account and input preferences. Desktop menus/ribbon remain; phone Home, Review & deliver and View buttons open action sheets instead of relying on hidden toolbar commands. Tree folders, saved views, controlled document sets and existing docked inspectors remain available in wider layouts.

The visible document menu works without right-click. Long press also opens nondestructive actions, but cancels when the pointer moves, scrolls, is cancelled or a second pointer starts. Releasing a long press does not also open the document underneath. Critical operations still use their existing confirmation/preview and server permission checks.

## Input and layout

Automatic input mode detects coarse pointers; users can explicitly choose touch sizing or compact pointer controls for hybrid devices. Important action buttons, model controls and inputs receive larger touch hit areas (many are at least 44 CSS pixels high). This is not a claim that every target meets a particular size or that the app conforms to WCAG.

Dialogs adapt to narrow/short viewports with scrollable bodies and accessible submit controls. Safe-area insets, `viewport-fit=cover`, dynamic viewport sizing and visualViewport resize signals are included. The viewport does not disable page zoom. Focus outlines, an app skip link, dialog labels and focus restoration are present. Reduced-motion and forced-color styles are included; screen-reader, switch-control and full accessibility conformance testing remain outstanding.

The tested layouts include 320×740, 390×844, 600×900, 740×390 and 1024×768 CSS-pixel viewports, plus a 1600-pixel desktop. Every route's content container is checked for width overflow, separately from intentional inner register/matrix scrolling. This does not qualify physical device safe areas, virtual keyboards or real orientation changes.

## Drawing review

For original image/SVG previews, one pointer pans and two pointers pinch around their midpoint. Fit, zoom-in/out and four-direction buttons provide nondrag alternatives. Keyboard arrows pan, +/- zoom and Home/0 fits. Normalized annotation coordinates remain tied to the exact source revision after zoom/pan/resize.

The two-tap box tool records opposing corners without requiring dragging. A multipointer gesture, cancelled pointer or completed pan does not become a pin/rectangle. Phone Drawing / Notes panels expose both the image and annotation list. Annotation commands still require a valid active account/workspace and current access.

These controls do not add native CAD geometry or a PDF authoring engine. Browser PDF handling and existing native-format limits remain unchanged.

## Model review

One-pointer movement orbits an imported triangular model. Two pointers pan and zoom. Explicit Pan, Fit, +/- and four directional buttons work without a multipoint gesture. The mobile Model / Elements & properties panels retain the object list, visibility controls and selected-element metadata rather than hiding those details. Fit now respects narrow aspect ratios using a conservative bounds sphere.

Tests compare actual rendered Canvas pixels before/after camera changes and dispatch Chromium touch events. They do not qualify hardware WebGL, GPU performance, pressure-sensitive pen input or native CAD semantics. No geometry is fabricated to simulate a successful native import.

## Site photographs and installation

Add → Take site photo uses an ordinary `image/*` file input with a rear-camera capture hint, followed by the normal checksum-preserving upload form. The browser/OS decides whether to launch a camera, photo library or file picker. The test selects an explicit PNG through that real file input; it does not exercise a physical camera. **Original EXIF/GPS metadata is retained**; do not assume uploads strip location or other embedded metadata.

Install app is offered only when the browser emits its install-prompt event. There is no fabricated installation state or signed native app. The existing shell service worker does not cache authenticated API data or create an offline write queue. No background upload/sync after closing the app is promised.

## Using a phone with your data

`npm start` runs the browser-local edition; `npm run local` starts the authenticated loopback filesystem edition on the machine running Node. A phone's `127.0.0.1` is the phone, not that desktop machine. Do not expose the localhost filesystem service on an insecure LAN endpoint or bypass its Host/Origin/root-grant checks.

For shared mobile access, deploy the ordinary team server behind HTTPS at its configured public origin, keep frontend and API same-origin, and apply reviewed authentication/access policies. See SECURITY.md and the supplied deployment examples. This release does not certify that deployment or issue TLS certificates. Direct folder APIs, filesystem handles, camera choices and installation differ by browser; each remains an explicitly qualified/unqualified capability, not an assumed universal feature.

## Public design references

Only original assets and source are included. Functional inspirations include Bentley's documented Explorer tree/list/menu/preview organization and W3C's guidance to offer nondrag alternatives and sufficiently large pointer targets. These references are not vendor endorsement, an independent accessibility review or a conformance claim.

- https://docs.bentley.com/LiveContent/web/ProjectWise%20Explorer%20Help-v12/en/GUID-7A0E5E3A-1FE9-4068-C4A2-AC9F22A17A9B.html
- https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

Consulted 23 September 2026. TESTING.md identifies actual engine/server work versus browser fixtures and untested physical-device behavior.
