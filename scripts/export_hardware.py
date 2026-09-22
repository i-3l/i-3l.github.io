#!/usr/bin/env python3
"""Export the JoyLo+ URDF/STL assemblies to self-contained glTF 2.0 binaries.

Uses only Python's standard library. Colors, joint origins, axes, and limits
are preserved. Positions use 16-bit quantization within each mesh's bounds,
and normals use signed 8-bit quantization. Triangles are not simplified.
Collision and inertial data are not exported.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET


def numbers(value):
    return [float(v) for v in value.split()]


def rotation(rpy):
    r, p, y = (v / 2 for v in rpy)
    cr, cp, cy = math.cos(r), math.cos(p), math.cos(y)
    sr, sp, sy = math.sin(r), math.sin(p), math.sin(y)
    # URDF fixed-axis RPY = Rz(yaw) Ry(pitch) Rx(roll); glTF is [x,y,z,w].
    return [sr*cp*cy-cr*sp*sy, cr*sp*cy+sr*cp*sy,
            cr*cp*sy-sr*sp*cy, cr*cp*cy+sr*sp*sy]


def origin(element):
    child = element.find('origin')
    attrs = child.attrib if child is not None else {}
    return {'translation': numbers(attrs.get('xyz', '0 0 0')),
            'rotation': rotation(numbers(attrs.get('rpy', '0 0 0')))}


def export(source, target):
    root = ET.parse(source).getroot()
    binary = bytearray()
    gltf = {'asset': {'version': '2.0', 'generator': 'I3L scripts/export_hardware.py'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [],
            'extensionsUsed': ['KHR_mesh_quantization'],
            'extensionsRequired': ['KHR_mesh_quantization']}
    geometry_cache, material_cache, mesh_cache = {}, {}, {}
    source_hashes = {source.name: hashlib.sha256(source.read_bytes()).hexdigest()}

    def accessor(data, component, kind, count, target_type, bounds=None, stride=None):
        while len(binary) % 4:
            binary.append(0)
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary),
                                   'byteLength': len(data), 'target': target_type})
        if stride:
            gltf['bufferViews'][-1]['byteStride'] = stride
        binary.extend(data)
        item = {'bufferView': view, 'componentType': component, 'count': count, 'type': kind}
        if target_type == 34962:
            item['normalized'] = True
        if bounds:
            item.update(min=bounds[0], max=bounds[1])
        gltf['accessors'].append(item)
        return len(gltf['accessors']) - 1

    def geometry(filename):
        if filename in geometry_cache:
            return geometry_cache[filename]
        path = source.parent / filename.removeprefix('package://')
        data = path.read_bytes()
        source_hashes[str(path.relative_to(source.parent))] = hashlib.sha256(data).hexdigest()
        count = struct.unpack_from('<I', data, 80)[0]
        if len(data) != 84 + count * 50:
            raise ValueError(f'Expected a binary STL: {path}')
        faces = [struct.unpack_from('<12f', data, 84 + face * 50) for face in range(count)]
        minimum = [min(face[j+i] for face in faces for j in (3, 6, 9)) for i in range(3)]
        maximum = [max(face[j+i] for face in faces for j in (3, 6, 9)) for i in range(3)]
        extent = max(b-a for a, b in zip(minimum, maximum)) or 1
        positions, normals, indices, lookup = [], [], [], {}
        for values in faces:
            normal = tuple(max(-127, min(127, round(v*127))) for v in values[:3])
            for offset in (3, 6, 9):
                position = tuple(round((v-minimum[i])/extent*65535)
                                 for i, v in enumerate(values[offset:offset+3]))
                key = position + normal
                if key not in lookup:
                    lookup[key] = len(lookup)
                    positions.extend((*position, 0))  # Four-byte aligned vertex stride.
                    normals.extend((*normal, 0))
                indices.append(lookup[key])
        bounds = ([min(positions[i::4]) for i in range(3)], [max(positions[i::4]) for i in range(3)])
        pos = accessor(struct.pack(f'<{len(positions)}H', *positions), 5123, 'VEC3',
                       len(lookup), 34962, bounds, stride=8)
        norm = accessor(struct.pack(f'<{len(normals)}b', *normals), 5120, 'VEC3', len(lookup), 34962, stride=4)
        small = len(lookup) < 65536
        idx = accessor(struct.pack(f'<{len(indices)}' + ('H' if small else 'I'), *indices),
                       5123 if small else 5125, 'SCALAR', len(indices), 34963)
        geometry_cache[filename] = {
            'primitive': {'attributes': {'POSITION': pos, 'NORMAL': norm}, 'indices': idx},
            'translation': minimum, 'scale': [extent] * 3}
        return geometry_cache[filename]

    def node(value):
        gltf['nodes'].append(value)
        return len(gltf['nodes']) - 1

    links = {}
    for link in root.findall('link'):
        children = []
        links[link.attrib['name']] = node({'name': 'link_' + link.attrib['name'], 'children': children})
        for visual in link.findall('visual'):
            mesh = visual.find('geometry/mesh')
            if mesh is None:
                raise ValueError('This exporter expects mesh visuals')
            filename = mesh.attrib['filename']
            color = visual.find('material/color')
            rgba = tuple(numbers(color.attrib['rgba'])) if color is not None else (0.7, 0.7, 0.7, 1)
            if rgba not in material_cache:
                material_cache[rgba] = len(gltf['materials'])
                gltf['materials'].append({'pbrMetallicRoughness': {'baseColorFactor': rgba,
                                          'metallicFactor': 0.12, 'roughnessFactor': 0.6}})
            material = material_cache[rgba]
            geo = geometry(filename)
            key = (filename, material)
            if key not in mesh_cache:
                mesh_cache[key] = len(gltf['meshes'])
                gltf['meshes'].append({'name': Path(filename).stem,
                                      'primitives': [dict(geo['primitive'], material=material)]})
            geometry_node = node({'name': Path(filename).stem, 'mesh': mesh_cache[key],
                                  'translation': geo['translation'], 'scale': geo['scale']})
            children.append(node({'name': Path(filename).stem + '_origin', 'children': [geometry_node],
                                  'scale': numbers(mesh.attrib.get('scale', '1 1 1')), **origin(visual)}))

    child_links = set()
    for joint in root.findall('joint'):
        parent, child = joint.find('parent').attrib['link'], joint.find('child').attrib['link']
        child_links.add(child)
        joint_node = {'name': 'joint_' + joint.attrib['name'], 'children': [links[child]], **origin(joint)}
        if joint.attrib['type'] != 'fixed':
            limits = joint.find('limit').attrib
            joint_node['extras'] = {'joint': {'name': joint.attrib['name'],
                'axis': numbers(joint.find('axis').attrib['xyz']),
                'lower': float(limits['lower']), 'upper': float(limits['upper'])}}
        gltf['nodes'][links[parent]]['children'].append(node(joint_node))
    # Convert URDF's Z-up coordinates to glTF's Y-up coordinates once at the root.
    gltf['scenes'][0]['nodes'] = [node({'name': 'JoyLo_assembly',
        'rotation': rotation([-math.pi/2, 0, 0]),
        'children': [index for name, index in links.items() if name not in child_links]})]
    gltf['buffers'] = [{'byteLength': len(binary)}]
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    content = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
               + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
               + struct.pack('<II', len(binary), 0x004E4942) + binary)
    target.write_bytes(content)
    print(f'{target.name}: {len(content):,} bytes, {len(geometry_cache)} unique geometries')
    return {'source': str(source.relative_to(source.parents[2])), 'source_sha256': source_hashes,
            'output_sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets', type=Path, help='Path to the I3L repository assets directory')
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / 'static/models'
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, path in [('r1pro', 'gello_r1pro_urdf/robot_7dof.urdf'),
                       ('franka', 'gello_franka_urdf/robot.urdf')]:
        manifest[name] = export(args.assets / path, output / f'joylo-{name}.glb')
    (output / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
