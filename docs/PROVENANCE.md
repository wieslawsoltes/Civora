# Independent implementation record

Date: 23 September 2026. Product name: Civora. Version: 0.9.0.

The implementation was authored independently for a browser-based engineering document and delivery workspace using publicly documented functional categories. No Bentley ProjectWise source code, proprietary SDK, executable, reverse-engineered binary, logo, icon, or original product screenshot is included. The visual design, icons, project data, SVG demonstration drawings, OBJ massing geometry, text files, and source implementation in this archive were authored for this project.

The synthetic Northline/Riverside/Eastwater projects are not customer projects. Names and example.test contacts are demonstration data. Drawings are explicitly labeled synthetic and not for construction. The package does not claim compatibility with proprietary native Bentley project stores or every ProjectWise API.

“Independent” here describes this implementation's provenance. It is not a third-party legal certification, trademark clearance, or a claim that a formally segregated multi-team clean-room protocol was audited. The Bentley and ProjectWise names are used only to identify the user's requested reference product; no affiliation or endorsement is asserted.

## Public functional reference

Bentley ProjectWise product documentation describes governed engineering delivery, design integration, managed workspaces, reference-file management, reviews, deliverables, digital-twin/model-related capabilities, and adjacent engineering validation services:

https://www.bentley.com/products/projectwise/

Those categories informed the scope ledger. Only the independently implemented subset in COVERAGE.md is delivered. The existence of a Bentley feature is not evidence of a matching Civora implementation.

## Technical primary references

Provider/OAuth documentation is listed in CONNECTORS.md. Server implementation also consulted public Node SQLite documentation, node-postgres documentation, mysql2 documentation, and jose JWT verification documentation. The default local/SQLite source does not embed these optional third-party libraries. Installing an optional package brings that package's own license and maintenance/security requirements.

- https://nodejs.org/api/sqlite.html
- https://node-postgres.com/
- https://sidorares.github.io/node-mysql2/docs
- https://github.com/panva/jose

## Original artifacts and source

`app/seed.js` contains original synthetic material and populates it through real core commands; no binary fixture is disguised as a native DGN/DWG/RVT file. UI screenshots are captures of this app's actual isolated-memory test run, not concept artwork or a screenshot of ProjectWise.

## 0.2 additions

`app/seed-models.js` supplies independently authored structural/services mesh geometry and an ASCII DXF grid drawing. These are synthetic, not extracted vendor models or construction deliverables. Geometry parsers, PDF generation, ACLs, sync, model viewer and recipient/job code were authored for this project. Eleven library bundles are MIT-licensed original source; optional native engines and packages retain their separate licenses.

Additional public technical references include the OWASP Authorization Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), buildingSMART IFC documentation, Khronos glTF 2 specification and IfcOpenShell geometry API (https://docs.ifcopenshell.org/ifcopenshell-python/geometry_processing.html). These informed format/security design; they do not imply endorsement or an independent qualification.

The main UI screenshots use the actual memory/Canvas test mode. The separately named recipient component screenshot uses explicit fixture transport. The generated drawing PDF is produced by the delivered renderer. External-converter fixture tests are not represented as native-engine fidelity tests.


## 0.3 local-system additions

The filesystem adapters, checkpoint repository, working-copy protocol, drop traversal, text codec, localhost launcher/security boundary and local UI were independently authored in this increment. The 0.3 standalone browser/recipient modules total sixteen. No native CAD engine or OS binary is bundled. Native launcher tests use a specifically authored Node fixture, not a vendor application.

Local UI screenshots are captures of the actual application with an explicitly identified in-memory folder-handle/Web Locks fixture. They are not photographs of a customer workstation or evidence of a real browser permission grant. Actual disk, HTTP and subprocess behavior is separately exercised by the Node tests. The synthetic Harbor Exchange working-folder content exists only for this UI test; it is not customer data.

Primary local API references: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access , https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker and https://nodejs.org/api/fs.html .


## 0.4 document-control additions

The metadata/numbering/review/baseline domain module, editable CSV, checked baseline export, bounded reference scanners and UI were independently authored. New demonstration routes, standards and baselines are built through actual commands in app/seed.js. They are not customer deliveries or a vendor workspace extraction.

Public reference for static SVG linkage semantics: https://www.w3.org/TR/SVG2/linking.html . Only the documented scanner subset is implemented; the app does not execute linked content or implement arbitrary SVG/CSS/XML evaluation. None of these references constitutes external qualification or product endorsement.


## 0.5 workflow-automation additions

The declarative rule/notification module, scheduling runner, scoped HTTP endpoints, editor/notification UI, original demo policies and test fixtures were independently authored. No ProjectWise Rules Engine code, private API, native executable, vendor asset or workflow export was copied. The feature ledger distinguishes these bounded semantics from complete ProjectWise workflow parity.

Public functional reference consulted: Bentley **Working with Workflows and States**, ProjectWise Administrator Help. Public technical reference: Node.js timer lifecycle/`unref` documentation.

- https://docs.bentley.com/LiveContent/web/ProjectWise%20Administrator%20Help-v11/en/GUID-FCE60D0A-172E-356D-7190-EB4ECB1F4ABF.html
- https://nodejs.org/api/timers.html

Screenshots are actual application output from the explicitly documented memory-repository UI harness. They are not native ProjectWise screenshots, customer content, normal-origin browser authentication evidence or external security qualification. Actual authentication, unattended execution and restart tests use a separate temporary SQLite/HTTP server.

## Explorer reference study (0.6)

The public Bentley Explorer layout, preview-pane and address-bar help topics listed with complete URLs in UI-PARITY.md informed the general tree/list/menu/preview/address interaction patterns. Civora's browser controller, declarative views, transactional moves, HTML/CSS, icons and screenshots were authored independently. Public product documentation was not treated as executable code, a source of proprietary assets, or proof that the corresponding native behavior exists here.

The released screenshots show the actual Civora application with original synthetic data. Memory/transport fixtures are expressly distinguished from authenticated server qualification in TESTING.md. The implementation is not a formally audited segregated clean-room project and does not claim affiliation, native datasource compatibility or complete UI/feature parity.


## Explorer design refinement (0.8)

Reviewed the same public Bentley Window Layout / Preview Pane documentation and its public screenshot for menu/tree/list/properties arrangement. Added original compact standard-toolbar markup, yellow-folder/blue-selection CSS, app identity assets, appearance presets and keyboard navigation. No Bentley artwork, font files, proprietary source, native binaries or private schemas were imported. The standalone HTML, CSS and 25 library bundles are built from the delivered sources. Test screenshots are captures of the implemented Civora app and original synthetic fixtures, not screenshots relabeled from another product. The 0.8 guide EXPLORER-DESIGN.md provides public reference URLs and explicit UI/native-compatibility boundaries.


## 0.9 continuation

Continued from the supplied Civora 0.8.1 source archive. Added original quick navigation, controlled-copy semantics and Explorer/touch refinements. Reused only this project's existing code, assets and synthetic examples. The public Bentley Explorer window-layout documentation was reviewed to maintain the familiar tree/register/preview pattern; no original Bentley screenshots/assets are redistributed.
