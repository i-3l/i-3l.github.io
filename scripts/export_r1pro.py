"""Export the R1 Pro (soft-gripper variant) from its OmniGibson USDA to a small articulated GLB.

Runs inside Blender 4.5 (its Python ships with the USD importer and glTF exporter):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/export_r1pro.py -- \
        /path/to/r1pro_soft_gripper.usda static/models/r1pro.glb

Steps: import the flattened stage, drop collision meshes, weld and decimate each link to a triangle budget,
keep its materials (UV-mapped JPEG atlases from the materials/ folder beside the USDA, or the flat colour of
untextured links), rebuild the kinematic tree
from the joint prims, store each joint's axis and limits as glTF extras (read by static/js/takeover-robot.js),
and export without normals: the CAD meshes have unreliable normals, so the viewer shades per face.
If Node >= 18 is on PATH, the file is then quantised and meshopt-compressed with gltfpack (the website ships
the matching meshopt decoder) and static/models/sources.json is updated.
"""
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

SRC, OUT = (Path(p).resolve() for p in sys.argv[sys.argv.index("--") + 1:][:2])
ROOT = Path(__file__).resolve().parents[1]

# --- joints, from the text layer -------------------------------------------------------------------
text = SRC.read_text()
joints = []
for m in re.finditer(r'def Physics(Revolute|Prismatic|Fixed)Joint "([^"]+)"\s*(\([^)]*\))?\s*\{(.*?)\n\s*\}\n', text, re.S):
    kind, name, _, body = m.groups()

    def attr(key, body=body):
        found = re.search(re.escape(key) + r"\s*=\s*([^\n]+)", body)
        return found.group(1).strip() if found else None

    body0, body1 = attr("rel physics:body0"), attr("rel physics:body1")
    if not body0 or not body1 or "base_footprint" in body0 or "base_footprint" in body1:
        continue  # the virtual base joints are not part of the robot
    rot1 = attr("physics:localRot1")
    joints.append({
        "kind": kind, "name": name,
        "parent": body0.strip("<>").split("/")[-1], "child": body1.strip("<>").split("/")[-1],
        "axis": (attr("physics:axis") or "").strip('"'),
        "lower": attr("physics:lowerLimit"), "upper": attr("physics:upperLimit"),
        "rot1": [float(v) for v in rot1.strip("()").split(",")] if rot1 else [1, 0, 0, 0],
    })

# --- import -----------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.usd_import(filepath=str(SRC), import_cameras=False, import_lights=False, import_materials=True,
                      import_guide=False, import_proxy=False, import_render=True, read_mesh_uvs=True,
                      import_subdiv=False, import_visible_only=False)
for obj in list(bpy.data.objects):
    stem = obj.name.split(".")[0]
    if obj.type == "MESH" and stem in ("collisions", "VisualSphere"):
        bpy.data.objects.remove(obj, do_unlink=True)
    elif obj.type == "EMPTY" and "_joint" in stem and not obj.children:
        bpy.data.objects.remove(obj, do_unlink=True)  # joint prims import as empties; only links are kept
links = {obj.name: obj for obj in bpy.data.objects if obj.type == "EMPTY"}

# --- weld, decimate, colour -------------------------------------------------------------------------
BUDGET = {"base_link": 14000, "torso_link4": 12000, "torso_link1": 5000, "torso_link2": 4000,
          "torso_link3": 4000, "zed_link": 2500}


def budget(link):
    if link in BUDGET:
        return BUDGET[link]
    if "finger" in link:
        return 1500
    if "realsense" in link:
        return 1200
    if "steer" in link or "wheel" in link:
        return 800
    return 3000


# Blender does not read the MDL shaders the USDA uses, so rebuild each material from the text layer:
# OmniPBR materials sample a JPEG atlas (a few flat colour patches) through the mesh UVs; the two
# OmniSurface materials are plain black and white.
TEXTURES = {}
for m in re.finditer(r'def Material "([^"]+)"(.*?)(?=\n        def Material|\n    }\n)', text, re.S):
    found = re.search(r"inputs:diffuse_texture = @([^@]+)@", m.group(2))
    if found:
        TEXTURES[m.group(1)] = found.group(1)
FLAT = {"black": (0.03, 0.03, 0.035, 1), "white": (0.9, 0.9, 0.88, 1)}
images = {}


def image(relative):
    if relative not in images:
        images[relative] = bpy.data.images.load(str((SRC.parent / relative).resolve()))
    return images[relative]


def rebuild_material(mat):
    """Returns True when the material samples a texture."""
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    if mat.name in TEXTURES:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image(TEXTURES[mat.name])
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        return True
    bsdf.inputs["Base Color"].default_value = FLAT.get(mat.name, (0.86, 0.85, 0.83, 1))
    return False


def fallback_material():
    mat = bpy.data.materials.get("body") or bpy.data.materials.new("body")
    rebuild_material(mat)
    return mat


triangles = 0
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue
    link = obj.parent.name if obj.parent else "?"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)  # faces are stored unshared; weld so decimation cannot crack
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode="OBJECT")
    before = len(obj.data.polygons)
    if before > budget(link):
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.ratio = budget(link) / before
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is None:
        obj.data.materials.append(fallback_material())
        textured = False
    else:
        textured = rebuild_material(mat)
    triangles += len(obj.data.polygons)
    print(f"{link:30s} {before:7d} -> {len(obj.data.polygons):6d}  {'textured' if textured else 'flat'}")
print(f"{triangles} triangles")

# --- kinematic tree and joint extras ----------------------------------------------------------------
AXES = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}
for joint in joints:
    parent, child = links.get(joint["parent"]), links.get(joint["child"])
    if parent is None or child is None:
        print("skipping joint without links:", joint["name"])
        continue
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = world
    if joint["kind"] in ("Revolute", "Prismatic") and joint["axis"]:
        axis = Quaternion(joint["rot1"]) @ AXES[joint["axis"]]  # joint axis in the child link frame
        lower, upper = float(joint["lower"] or 0), float(joint["upper"] or 0)
        if joint["kind"] == "Revolute":
            lower, upper = math.radians(lower), math.radians(upper)
        # The glTF exporter conjugates every local frame by the Z-up to Y-up change: (x, y, z) -> (x, z, -y).
        child["joint"] = {"name": joint["name"], "type": joint["kind"].lower(),
                          "axis": [axis.x, axis.z, -axis.y], "lower": lower, "upper": upper}

# --- export and compress ----------------------------------------------------------------------------
raw = Path(tempfile.mkdtemp()) / "r1pro-raw.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(raw), export_format="GLB", export_extras=True, export_yup=True,
                          export_apply=True, export_texcoords=True, export_normals=False,
                          export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=80,
                          export_cameras=False,
                          export_lights=False, export_animations=False, export_skins=False)
OUT.parent.mkdir(parents=True, exist_ok=True)
compressed = False
if shutil.which("npx"):
    result = subprocess.run(["npx", "-y", "gltfpack", "-i", str(raw), "-o", str(OUT), "-cc", "-kn", "-ke"],
                            capture_output=True, text=True)
    compressed = result.returncode == 0 and OUT.exists()
    if not compressed:
        print("gltfpack failed (needs Node >= 18); writing the uncompressed GLB\n", result.stderr[-500:])
if not compressed:
    shutil.copy(raw, OUT)

manifest_path = ROOT / "static" / "models" / "sources.json"
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
    manifest["r1pro_robot"] = {
        "source": SRC.name,
        "source_sha256": {name: hashlib.sha256((SRC.parent / name).read_bytes()).hexdigest()
                          for name in [SRC.name, *sorted(set(TEXTURES.values()))]},
        "generator": "scripts/export_r1pro.py (Blender) + gltfpack" if compressed else "scripts/export_r1pro.py (Blender)",
        "triangles": triangles, "output": f"static/models/{OUT.name}",
        "output_sha256": hashlib.sha256(OUT.read_bytes()).hexdigest(), "bytes": OUT.stat().st_size,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes, {'meshopt' if compressed else 'uncompressed'})")
