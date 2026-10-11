#!/usr/bin/env python3
"""Package the custom JoyLo+ link and grip meshes as millimetre STL downloads.

Only the selected custom parts are included, not the entire URDF assembly.
The source STL coordinates are in metres. Scale vertices to millimetres without
changing their orientation or triangles, and give every archive a fixed timestamp.
"""
import argparse
import csv
import io
import math
from pathlib import Path
import struct
import zipfile


PARTS = {
    'franka': ('gello_franka_urdf/assets', [
        'part_1.stl', 'part_1__2.stl', 'part_1__3.stl', 'part_1__4.stl',
        'part_1__5.stl', 'part_1__6.stl',
        'ljcv2_v1.stl', 'ljcv2_v1__2.stl', 'ljcv2_v1__3.stl',
    ]),
    'r1pro': ('gello_r1pro_urdf/meshes', [
        '1.stl', '2.stl', '3a.stl', '3b.stl', '4.stl',
        '5.stl', '6.stl', '7.stl', '8.stl',
    ]),
}


def millimetre_stl(path):
    source = path.read_bytes()
    count = struct.unpack_from('<I', source, 80)[0]
    if not count or len(source) != 84 + count * 50:
        raise ValueError(f'Expected a complete binary STL: {path.name}')
    output = bytearray(b'JoyLo+ link / grip; vertex coordinates in millimetres'.ljust(80, b'\0'))
    output.extend(struct.pack('<I', count))
    minimum, maximum = [math.inf] * 3, [-math.inf] * 3
    for face in range(count):
        values = struct.unpack_from('<12f', source, 84 + face * 50)
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f'Non-finite triangle in {path.name}')
        vertices = [value * 1000 for value in values[3:]]
        for offset in (0, 3, 6):
            for axis in range(3):
                minimum[axis] = min(minimum[axis], vertices[offset + axis])
                maximum[axis] = max(maximum[axis], vertices[offset + axis])
        # STL normals are unitless; clear unused per-face attribute bytes.
        output.extend(struct.pack('<12fH', *values[:3], *vertices, 0))
    return bytes(output), [hi - lo for lo, hi in zip(minimum, maximum)]


def add_file(archive, name, data):
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


def export(assets, output):
    output.mkdir(parents=True, exist_ok=True)
    for robot, (folder, filenames) in PARTS.items():
        title = 'Franka' if robot == 'franka' else 'R1 Pro'
        target = output / f'joylo-{robot}-printed-parts.zip'
        table = io.StringIO(newline='')
        writer = csv.writer(table)
        writer.writerow(['file', 'quantity', 'size_x_mm', 'size_y_mm', 'size_z_mm'])
        with zipfile.ZipFile(target, 'w') as archive:
            for filename in filenames:
                data, extents = millimetre_stl(assets / folder / filename)
                add_file(archive, 'stl/' + filename, data)
                writer.writerow([filename, 1, *(f'{value:.3f}' for value in extents)])
            add_file(archive, 'parts.csv', table.getvalue())
            add_file(archive, 'README.txt', f'''JoyLo+ {title}: custom links and grip parts

This archive contains {len(filenames)} individual STL meshes from the single-arm
leader CAD used by the hardware viewer. See parts.csv for filenames, quantities
and bounding-box dimensions. Assembly models are available separately in the BOM.

Units: millimetres. Import at 100% scale in a slicer that uses millimetres.
The source geometry has been converted from metres to millimetres; triangles
and CAD orientations are unchanged. Arrange and orient each part for your
printer, then choose suitable material, supports and print settings.
These files do not include a tested slicer profile or G-code.

The set covers one leader's custom link and grip geometry. Servo assemblies,
hinges, electronics, fasteners and the bimanual mounting bar are not included.
''')
        print(f'{target.name}: {len(filenames)} STL files, {target.stat().st_size:,} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets', type=Path, help='Path to the I3L assets directory')
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parents[1] / 'static/downloads')
    args = parser.parse_args()
    export(args.assets, args.output)
