#!/usr/bin/env python3
"""Optional IfcOpenShell adapter. Install ifcopenshell==0.8.5 separately.
No copied Bentley/Autodesk code. Adapter outputs world-space SI metre meshes.
"""
import json, sys
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element

def convert(source, destination):
    model = ifcopenshell.open(source)
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    objects, warnings, vertices_count, faces_count = [], [], 0, 0
    for product in model.by_type('IfcProduct'):
        if not product.Representation:
            continue
        try:
            shape = ifcopenshell.geom.create_shape(settings, product)
            mesh = shape.geometry
            vertices = [list(mesh.verts[i:i+3]) for i in range(0, len(mesh.verts), 3)]
            triangles = [list(mesh.faces[i:i+3]) for i in range(0, len(mesh.faces), 3)]
            vertices_count += len(vertices)
            faces_count += len(triangles)
            if vertices_count > 500000 or faces_count > 300000:
                raise OverflowError('Civora mesh size limit exceeded')
            if not vertices:
                continue
            psets = ifcopenshell.util.element.get_psets(product)
            objects.append({'id':str(product.id()),'globalId':product.GlobalId,
                'name':product.Name or product.is_a(),'type':product.is_a(),
                'vertices':vertices,'triangles':triangles,'properties':psets})
        except OverflowError:
            raise
        except Exception as exc:
            warnings.append(f'{product.id()} {product.is_a()}: {str(exc)[:250]}')
    if not objects:
        raise ValueError('No IFC geometry was converted')
    with open(destination, 'w', encoding='utf-8') as handle:
        json.dump({'format':'civora-mesh','version':1,'sourceFormat':'IFC / IfcOpenShell',
            'units':'m','objects':objects,'warnings':warnings},handle,allow_nan=False)
if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: ifc.py INPUT.ifc OUTPUT.json')
    convert(sys.argv[1],sys.argv[2])
