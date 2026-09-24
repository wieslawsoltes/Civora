# Geometry, models and renditions

## Preserve the original; disclose the subset

All managed source bytes remain immutable and downloadable according to current authorization. Derived views/renditions are separate, source-version-pinned artifacts. A displayed approximation is never a replacement for the original engineering file. Unsupported-only models fail instead of yielding a fake success. Warnings accompany partial interpretations.

| Source | Built-in behavior | Main limits |
|---|---|---|
| ASCII DXF | 2D LINE, CIRCLE, ARC, LWPOLYLINE, TEXT/MTEXT, SOLID/3DFACE subset; layer visibility; vector SVG/PDF | No binary DXF, full blocks/xrefs/hatches/layouts, bulge fidelity, non-WCS interpretation, font/plot-style equivalence or complete unit semantics |
| OBJ | Polygon/group geometry, negative indices, fan triangulation | No material/texture fidelity; concave polygons can require better triangulation; units unspecified |
| STL | ASCII and binary triangle geometry | Units/materials are not inferred; not a semantic BIM format |
| GLB 2 | Embedded static triangle buffers and transforms | External buffers, required extensions, skinning and morphs rejected; textures/materials/animation not faithfully rendered |
| IFC STEP | Bounded token/reference parser; triangulated face sets, faceted BRep single-loop faces, selected straight extrusions, local placements, SI length scale and single-value properties | Not complete IFC geometry, openings/booleans, curved solids, georeferencing, assemblies or full property relationships |
| Civora mesh | Original JSON mesh interchange, `format: "civora-mesh"`, `version: 1`, units, objects, vertices, triangle indices and properties | Internal open schema, not a claim of native Bentley interchange |
| Text | Paginated vector PDF with source title, revision and hash | Helvetica/ASCII subset with substitution notice; not Office layout fidelity |
| PDF | Byte-for-byte pass-through when selected | Explicitly not a new rendering, flattening, sanitization or visual comparison |

General model admission: at most 20,000 objects, 500,000 vertices and 300,000 triangles. Source files are capped at 50 MiB; OBJ/DXF text at 25 MiB; STEP text at 40 MiB, 300,000 records and nesting depth 128. Canvas fallback renders up to 20,000 triangles. Limits are safeguards, not evidence of efficient or secure behavior on every pathological input.

## Federation and analysis

Register exact document revisions as model sources, then set an affine 4×4 transform and visibility. Models can be inspected, isolated, sectioned on Z, measured vertex-to-vertex and captured as PNG. Coordinate conventions and units must be normalized by the operator; there is no automatic project georeferencing reconciliation. The viewer is WebGL with a Canvas fallback, not a WebGPU engine. Only the fallback was exercised in this environment.

Mesh clash tests use broad-phase axis-aligned bounds followed by triangle intersections, coplanar separating-axis checks and point containment for topologically closed meshes. Runs have result and triangle-test budgets; the UI reports bounded/truncated analysis. A reported clash can open an issue prefilled with model IDs, element IDs and location.

**Clearance mode reports bounding-box candidates, not exact surface-to-surface clearance.** Open/nonmanifold geometry, incomplete parsers, numerical tolerance and model conventions affect results. Signed mesh volume is not certified quantity takeoff. Reports are client-computed and persisted, not independently recalculated by a trusted server engine or qualified for civil/structural safety decisions.

## Durable automatic jobs

On the team server, supported uploads/check-ins enqueue pinned renditions unless `CIVORA_AUTO_RENDITIONS=0`. Requested format and renderer version are part of the deduplication identity. Jobs are leased, retried up to a bounded count, resumable after expired leases and cancellable. Worker shutdown settles pending work even during early startup. Downloading completed output re-checks the source document's current download permission.

Built-in JavaScript runs one job at a time in a worker with a 256 MiB old-generation memory limit and a 60-second deadline. Local UI generation is session-local, not a durable team job. The operations database and rendition files must be backed up together.

## External native converters

`CIVORA_CONVERTERS_FILE` points to an administrator-controlled JSON file outside the web root:

```json
[
  {
    "extensions": ["ifc"],
    "format": "mesh",
    "executable": "/absolute/path/to/python",
    "args": ["/absolute/path/to/civora/server/adapters/ifc.py", "{input}", "{output}"]
  }
]
```

Executable paths must be absolute. Supported output identifiers are `mesh`, `pdf` and `svg`; mesh outputs use the Civora JSON schema. The runner substitutes file arguments directly, never through a shell, uses a private temporary directory/minimal environment, limits execution time and validates bounded output. A custom adapter can invoke an appropriately licensed native engine, but none for DGN, DWG or RVT is bundled.

`server/adapters/ifc.py` targets the public IfcOpenShell Python geometry API. Its Python syntax was checked; **IfcOpenShell could not be installed in this environment, so the adapter and native geometry output have not been executed or fidelity-qualified**. The generic external-process contract was tested with a Node fixture, including spaces/quotes and invalid-output rejection. That is not an IfcOpenShell test.

External parsers handle hostile inputs: use a dedicated least-privilege container/OS sandbox, deny unnecessary networking and filesystem access, keep dependencies patched and validate outputs independently. The subprocess wrapper by itself is not a sandbox or a security certification.

Primary technical references: buildingSMART IFC documentation, the Khronos glTF 2 specification, and https://docs.ifcopenshell.org/ifcopenshell-python/geometry_processing.html . These define formats/APIs; they do not certify Civora's subset.
