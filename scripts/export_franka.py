"""Export the Apache-2.0 PyBullet Panda visuals and joint hierarchy to a GLB.

Usage: python scripts/export_franka.py /path/to/pybullet_data/franka_panda
Requires numpy and trimesh. Only visual meshes, materials and joints are exported;
source comments, paths, collision shapes and inertial data are omitted.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
import trimesh
from trimesh.transformations import euler_matrix


def transform(origin):
    attrs = origin.attrib if origin is not None else {}
    matrix = euler_matrix(*map(float, attrs.get('rpy', '0 0 0').split()))
    matrix[:3, 3] = list(map(float, attrs.get('xyz', '0 0 0').split()))
    return matrix


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--compress', action='store_true', help='Use npx gltfpack to meshopt-compress the model (Node >= 18)')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parents[1] / 'static/models'
    source = args.source / 'panda.urdf'
    root = ET.parse(source).getroot()
    scene = trimesh.Scene(base_frame='Panda')
    specs = {}
    children = set()
    for joint in root.findall('joint'):
        parent = joint.find('parent').get('link')
        child = joint.find('child').get('link')
        children.add(child)
        name = joint.get('name')
        scene.graph.update(frame_from=parent, frame_to=name, matrix=transform(joint.find('origin')))
        scene.graph.update(frame_from=name, frame_to=child, matrix=np.eye(4))
        if joint.get('type') != 'fixed':
            limit = joint.find('limit')
            specs[name] = dict(name=name, type=joint.get('type'),
                axis=list(map(float, joint.find('axis').get('xyz').split())),
                lower=float(limit.get('lower')), upper=float(limit.get('upper')))
    for link in root.findall('link'):
        name = link.get('name')
        if name not in children:
            scene.graph.update(frame_from='Panda', frame_to=name, matrix=euler_matrix(-np.pi / 2, 0, 0))
        for i, visual in enumerate(link.findall('visual')):
            mesh = visual.find('geometry/mesh')
            filename = args.source / mesh.get('filename').removeprefix('package://')
            loaded = trimesh.load(filename, force='scene', process=False)
            for k, (geom_name, geometry) in enumerate(loaded.geometry.items()):
                geometry.metadata.clear()
                # Embed only the mesh material; no source file paths or image metadata.
                if hasattr(geometry.visual, 'material'):
                    mat = geometry.visual.material
                    mat.name = f'{name}_material_{k}'
                    if getattr(mat, 'image', None):
                        mat.image.info.clear()
                scene.add_geometry(geometry, node_name=f'{name}_visual_{i}_{k}',
                    geom_name=f'{name}_mesh_{i}_{k}', parent_node_name=name,
                    transform=transform(visual.find('origin')))
    def clean(tree):
        tree['asset'] = {'version': '2.0', 'generator': 'Panda visual model export',
            'copyright': 'Panda model from PyBullet (Apache-2.0); see franka-LICENSE.txt and franka-NOTICE.txt'}
        for node in tree['nodes']:
            if node.get('name') in specs:
                node['extras'] = {'joint': specs[node['name']]}
    output = directory / 'franka.glb'
    output.write_bytes(trimesh.exchange.gltf.export_glb(scene, tree_postprocessor=clean))
    if args.compress:
        with tempfile.TemporaryDirectory() as temp:
            packed = Path(temp) / 'franka.glb'
            subprocess.run(['npx', '--yes', 'gltfpack', '-i', str(output), '-o', str(packed), '-cc', '-kn', '-ke'], check=True)
            output.write_bytes(packed.read_bytes())
    (directory / 'franka-LICENSE.txt').write_bytes((args.source / 'LICENSE.txt').read_bytes())
    (directory / 'franka-NOTICE.txt').write_text(
        'Franka Panda model\n\n'
        'Source: https://github.com/bulletphysics/bullet3/tree/master/examples/pybullet/gym/pybullet_data/franka_panda\n'
        'License: Apache License 2.0 (see franka-LICENSE.txt).\n\n'
        'Modified for this website: visual meshes and materials were converted to a\n'
        'self-contained glTF binary, the URDF joint hierarchy was retained, and\n'
        'collision and inertial data were omitted. Coordinates were changed to Y-up.\n')
    manifest_path = directory / 'sources.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['franka_robot'] = {
        'source': 'PyBullet franka_panda/panda.urdf',
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'license': 'Apache-2.0', 'output': 'static/models/franka.glb',
        'generator': 'scripts/export_franka.py' + (' + gltfpack' if args.compress else ''),
        'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'bytes': output.stat().st_size,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{output.name}: {output.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
