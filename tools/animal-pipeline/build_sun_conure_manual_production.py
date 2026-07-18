#!/usr/bin/env python3
"""Build the project-original, production sun-conure asset.

The geometry comes exclusively from the approved manual-retopology source in
``proof_sun_conure_manual_retopo.py``.  Every texture pixel is generated here
from analytic feather/keratin functions.  No mesh, image, scan, or animation is
imported.  The only import performed by this builder is a fresh import of its
own LOD0 GLB for the final visual and deformation QA renders.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from array import array
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import proof_sun_conure_manual_retopo as clay  # noqa: E402


def options() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--qa", required=True, type=Path)
    parser.add_argument("--texture-size", type=int, default=1024)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict:
    return {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, value))


def mix(a: Sequence[float], b: Sequence[float], t: float) -> tuple[float, float, float]:
    t = clamp(t)
    return tuple(a[i] * (1.0 - t) + b[i] * t for i in range(3))


def feather_signal(u: float, v: float) -> tuple[float, float, float]:
    """Analytic rachis/barb height and derivatives in tangent space."""
    x = u - .5
    shaft = math.exp(-((x / .024) ** 2))
    dshaft_du = shaft * (-2.0 * x / (.024**2))
    # Barbs sweep away from the shaft and slightly down-feather.  Their phase
    # changes by side so the normal map has a real central rachis parting.
    side = -1.0 if x < 0.0 else 1.0
    phase = 72.0 * abs(x) + 24.0 * v + .9 * math.sin(v * math.tau * 3.0)
    barb = math.sin(phase) * math.exp(-abs(x) * 1.7)
    dbarb_du = math.cos(phase) * 72.0 * side * math.exp(-abs(x) * 1.7)
    dbarb_dv = math.cos(phase) * (24.0 + 2.7 * math.tau * math.cos(v * math.tau * 3.0)) * math.exp(-abs(x) * 1.7)
    scallop_phase = v * 38.0 - abs(x) * 16.0
    scallop = .22 * math.sin(scallop_phase)
    height = .70 * shaft + .18 * barb + .12 * scallop
    du = .70 * dshaft_du + .18 * dbarb_du - .12 * 16.0 * math.cos(scallop_phase) * side
    dv = .18 * dbarb_dv + .12 * 38.0 * math.cos(scallop_phase)
    return height, du, dv


def write_image(path: Path, size: int, pixel_fn) -> bpy.types.Image:
    image = bpy.data.images.new(path.stem, width=size, height=size, alpha=True, float_buffer=False)
    pixels = array("f")
    for y in range(size):
        v = y / max(1, size - 1)
        for x in range(size):
            u = x / max(1, size - 1)
            pixels.extend(pixel_fn(u, v))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def generate_maps(texture_dir: Path, size: int) -> dict[str, Path]:
    texture_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "body_basecolor": texture_dir / "sun-conure-body-basecolor.png",
        "wing_basecolor": texture_dir / "sun-conure-wing-basecolor.png",
        "tail_basecolor": texture_dir / "sun-conure-tail-basecolor.png",
        "feather_normal": texture_dir / "sun-conure-feather-normal.png",
        "feather_roughness": texture_dir / "sun-conure-feather-roughness.png",
        "foot_basecolor": texture_dir / "sun-conure-foot-basecolor.png",
        "foot_normal": texture_dir / "sun-conure-foot-normal.png",
    }

    def body_color(u: float, v: float):
        yellow = (1.000, .630, .025)
        orange = (1.000, .245, .012)
        red_orange = (.920, .075, .006)
        color = mix(orange, yellow, clamp(v / .30))
        face_mask = clamp((v - .70) / .20) * (.78 + .22 * math.cos((u - .5) * math.pi))
        color = mix(color, mix(orange, red_orange, .28), face_mask * .88)
        height, _, _ = feather_signal(u, v)
        micro = .016 * math.sin((u * 31.0 + v * 47.0) * math.tau) + .020 * height
        color = tuple(clamp(c * (1.0 + micro)) for c in color)
        return (*color, 1.0)

    def wing_color(u: float, v: float):
        deep_green = (.020, .245, .080)
        emerald = (.035, .530, .155)
        cobalt = (.025, .145, .600)
        turquoise = (.015, .440, .540)
        shoulder = (1.000, .510, .025)
        feather = mix(deep_green, emerald, .34 + .42 * v)
        flight = clamp((u - .60) / .30)
        feather = mix(feather, mix(turquoise, cobalt, v), flight)
        feather = mix(feather, shoulder, clamp((v - .73) / .22) * clamp((.50 - abs(u - .5)) * 4.0))
        height, _, _ = feather_signal(u, v)
        feather = tuple(clamp(c * (1.0 + .07 * height)) for c in feather)
        return (*feather, 1.0)

    def tail_color(u: float, v: float):
        green = (.015, .360, .115)
        teal = (.015, .370, .470)
        cobalt = (.015, .095, .560)
        color = mix(green, teal, clamp((.72 - v) / .58))
        color = mix(color, cobalt, clamp((.42 - v) / .36))
        edge = clamp(abs(u - .5) * 2.0)
        color = mix(color, (.010, .180, .200), edge * .30)
        height, _, _ = feather_signal(u, v)
        return (*(clamp(c * (1.0 + .055 * height)) for c in color), 1.0)

    def normal(u: float, v: float):
        _, du, dv = feather_signal(u, v)
        nx, ny, nz = -du * .0013, -dv * .0017, 1.0
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        return (.5 + .5 * nx / length, .5 + .5 * ny / length, .5 + .5 * nz / length, 1.0)

    def roughness(u: float, v: float):
        height, _, _ = feather_signal(u, v)
        shaft = math.exp(-(((u - .5) / .032) ** 2))
        value = clamp(.68 - .14 * shaft + .045 * math.sin(v * 46.0) - .035 * height, .44, .82)
        return (value, value, value, 1.0)

    def foot_color(u: float, v: float):
        scales = .5 + .5 * math.sin(v * 82.0 + 2.2 * math.sin(u * 16.0))
        value = .28 + .08 * scales + .04 * math.sin(u * 31.0)
        return (value * .78, value * .82, value * .76, 1.0)

    def foot_normal(u: float, v: float):
        du = 1.2 * math.cos(u * 31.0) + .3 * math.cos(v * 82.0 + 2.2 * math.sin(u * 16.0)) * 35.2 * math.cos(u * 16.0)
        dv = 4.4 * math.cos(v * 82.0 + 2.2 * math.sin(u * 16.0))
        nx, ny, nz = -du * .026, -dv * .026, 1.0
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        return (.5 + .5 * nx / length, .5 + .5 * ny / length, .5 + .5 * nz / length, 1.0)

    write_image(paths["body_basecolor"], size, body_color)
    write_image(paths["wing_basecolor"], size, wing_color)
    write_image(paths["tail_basecolor"], size, tail_color)
    write_image(paths["feather_normal"], size, normal)
    write_image(paths["feather_roughness"], size, roughness)
    write_image(paths["foot_basecolor"], size, foot_color)
    write_image(paths["foot_normal"], size, foot_normal)
    return paths


def load_image(path: Path, non_color: bool = False) -> bpy.types.Image:
    image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    return image


def pbr_material(name: str, base: Path, normal: Path, roughness: Path | None = None,
                 tint=(1.0, 1.0, 1.0, 1.0), normal_strength=.52, roughness_value=.62) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = roughness_value
    shader.inputs["Specular"].default_value = .32
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.vector_type = "POINT"
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    links.new(coords.outputs["UV"], mapping.inputs["Vector"])
    albedo = nodes.new("ShaderNodeTexImage")
    albedo.image = load_image(base)
    albedo.extension = "REPEAT"
    mix_rgb = nodes.new("ShaderNodeMixRGB")
    mix_rgb.blend_type = "MULTIPLY"
    mix_rgb.inputs[0].default_value = 1.0
    mix_rgb.inputs[2].default_value = tint
    links.new(mapping.outputs["Vector"], albedo.inputs["Vector"])
    links.new(albedo.outputs["Color"], mix_rgb.inputs[1])
    links.new(mix_rgb.outputs["Color"], shader.inputs["Base Color"])
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = load_image(normal, True)
    normal_tex.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    if roughness:
        rough_tex = nodes.new("ShaderNodeTexImage")
        rough_tex.image = load_image(roughness, True)
        rough_tex.extension = "REPEAT"
        links.new(mapping.outputs["Vector"], rough_tex.inputs["Vector"])
        links.new(rough_tex.outputs["Color"], shader.inputs["Roughness"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def simple_material(name: str, color, roughness: float, specular: float = .3,
                    metallic: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular"].default_value = specular
    shader.inputs["Metallic"].default_value = metallic
    return material


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def authored_uv(obj: bpy.types.Object) -> None:
    """Create deterministic project-authored UVs without an external unwrap."""
    if obj.data.uv_layers:
        uv_layer = obj.data.uv_layers.active
    else:
        uv_layer = obj.data.uv_layers.new(name="SunConureUV")
    coordinates = [vertex.co for vertex in obj.data.vertices]
    minimum = Vector((min(co.x for co in coordinates), min(co.y for co in coordinates), min(co.z for co in coordinates)))
    maximum = Vector((max(co.x for co in coordinates), max(co.y for co in coordinates), max(co.z for co in coordinates)))
    extent = maximum - minimum
    name = obj.name
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            if any(token in name for token in (
                "ContinuousHeadNeckTorso", "BreastContourFeather", "NapeFeather",
                "AlmondOrbitalPlane", "ModeledUpperLid", "ModeledLowerLid",
            )):
                u = .5 + math.atan2(co.x, co.y) / math.tau
                v = clamp((co.z - .010) / (.292 - .010))
            elif any(token in name for token in ("Wing", "Feather", "Tail", "Rhamphotheca")):
                u = (co.y - minimum.y) / max(extent.y, 1e-6)
                v = (co.z - minimum.z) / max(extent.z, 1e-6)
            else:
                u = (co.x - minimum.x) / max(extent.x, 1e-6)
                v = (co.z - minimum.z) / max(extent.z, 1e-6)
            uv_layer.data[loop_index].uv = (u, v)


def build_geometry(materials: dict[str, bpy.types.Material]):
    body, body_cage = clay.build_continuous_body(materials["body"])
    upper, lower, upper_cage, lower_cage = clay.build_rhamphotheca(materials["bill"])
    face, face_cages = clay.build_face_details(materials["body"], materials["eye"], materials["recess"])
    wings, wing_cages = clay.build_wings(materials["wing"])
    tail, tail_cages = clay.build_tail(materials["tail"])
    legs, leg_cages = clay.build_legs_and_feet(materials["foot"], materials["claw"])
    breast, breast_cages = clay.build_breast_contour_feathers(materials["body"])
    perch, perch_cage = clay.build_perch(materials["perch"])
    animal = [body, upper, lower, *face, *wings, *tail, *legs, *breast]
    cages = [body_cage, upper_cage, lower_cage, *face_cages, *wing_cages,
             *tail_cages, *leg_cages, *breast_cages, perch_cage]

    for obj in animal:
        name = obj.name
        if "FoldedFlightFeather" in name:
            assign(obj, materials["flight"])
        elif "FoldedWing" in name or "SecondaryCovert" in name or "LayeredSecondary" in name:
            assign(obj, materials["wing"])
        elif "TailFeather" in name:
            assign(obj, materials["tail"])
        elif "TailCovert" in name:
            assign(obj, materials["tail_covert"])
        elif "Rhamphotheca" in name:
            assign(obj, materials["bill"])
        elif "EyeGlobe" in name:
            assign(obj, materials["eye"])
        elif "RecessedNare" in name:
            assign(obj, materials["recess"])
        elif "Tarsus" in name or "Digit" in name or "Plantar" in name:
            assign(obj, materials["foot"])
        elif "CurvedClaw" in name:
            assign(obj, materials["claw"])
        else:
            assign(obj, materials["body"])
        authored_uv(obj)
    for cage in cages:
        cage.hide_viewport = True
        cage.hide_render = True
    perch.hide_viewport = False
    perch.hide_render = False
    return animal, cages, perch


def create_bone(armature: bpy.types.Armature, name: str, head, tail, parent: str | None = None):
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent:
        bone.parent = armature.edit_bones[parent]
    return bone


def make_rig() -> bpy.types.Object:
    data = bpy.data.armatures.new("SunConure.Rig")
    rig = bpy.data.objects.new("SunConure.Rig", data)
    bpy.context.collection.objects.link(rig)
    clay.select_only([rig])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    create_bone(data, "Root", (0, 0, -.016), (0, 0, .030))
    create_bone(data, "Pelvis", (0, -.012, .030), (0, -.002, .105), "Root")
    create_bone(data, "Chest", (0, -.002, .105), (0, .005, .185), "Pelvis")
    create_bone(data, "Neck", (0, .005, .185), (0, .026, .235), "Chest")
    create_bone(data, "Head", (0, .026, .235), (0, .030, .281), "Neck")
    create_bone(data, "Jaw", (0, .055, .236), (0, .101, .224), "Head")
    for side, suffix in ((-1, "L"), (1, "R")):
        create_bone(data, f"WingShoulder.{suffix}", (side * .048, .020, .162), (side * .070, -.005, .133), "Chest")
        create_bone(data, f"WingPrimary.{suffix}", (side * .070, -.005, .133), (side * .070, -.043, .070), f"WingShoulder.{suffix}")
        for index, (base_y, base_z, tip_y, tip_z, _width) in enumerate(clay.WING_FEATHER_LANDMARKS):
            create_bone(
                data,
                f"WingFeather.{suffix}.{index}",
                (side * (.0698 + index * .00016), base_y, base_z),
                (side * (.0698 + index * .00016), tip_y, tip_z),
                f"WingPrimary.{suffix}",
            )
        create_bone(data, f"Thigh.{suffix}", (side * .040, -.002, .065), (side * .030, .004, .026), "Pelvis")
        create_bone(data, f"Tarsus.{suffix}", (side * .030, .004, .026), (side * .027, .001, -.012), f"Thigh.{suffix}")
        create_bone(data, f"Foot.{suffix}", (side * .027, .001, -.012), (side * .027, .000, -.040), f"Tarsus.{suffix}")
        for label, direction in (("ForwardInner", 1), ("ForwardOuter", 1), ("RearInner", -1), ("RearOuter", -1)):
            create_bone(data, f"Digit.{suffix}.{label}", (side * .027, .001 * direction, -.014),
                        (side * .027, .013 * direction, -.039), f"Foot.{suffix}")
    create_bone(data, "TailRoot", (0, -.020, .072), (0, -.050, .020), "Pelvis")
    for index in range(8):
        x = (-.027, -.019, -.0115, -.0045, .0045, .0115, .019, .027)[index]
        create_bone(data, f"TailFan.{index}", (x * .6, -.030, .060), (x, -.090, -.100), "TailRoot")
    for index, x in enumerate((-.022, -.008, .008, .022)):
        create_bone(data, f"TailCovert.{index}", (x * .5, -.022, .070), (x, -.055, -.025), "TailRoot")
    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    return rig


def clear_groups(obj: bpy.types.Object) -> None:
    while obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups[0])


def rigid_bind(obj: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    clear_groups(obj)
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("SunConure skeletal deformation", "ARMATURE")
    modifier.object = rig
    obj.parent = rig


def body_bind(obj: bpy.types.Object, rig: bpy.types.Object) -> None:
    clear_groups(obj)
    groups = {name: obj.vertex_groups.new(name=name) for name in ("Pelvis", "Chest", "Neck", "Head")}
    for vertex in obj.data.vertices:
        z = vertex.co.z
        if z <= .110:
            weights = {"Pelvis": 1.0}
        elif z <= .185:
            t = (z - .110) / .075
            weights = {"Pelvis": 1.0 - t, "Chest": t}
        elif z <= .225:
            t = (z - .185) / .040
            weights = {"Chest": 1.0 - t, "Neck": t}
        elif z <= .252:
            t = (z - .225) / .027
            weights = {"Neck": 1.0 - t, "Head": t}
        else:
            weights = {"Head": 1.0}
        for name, weight in weights.items():
            if weight > 1e-5:
                groups[name].add([vertex.index], weight, "REPLACE")
    modifier = obj.modifiers.new("SunConure skeletal deformation", "ARMATURE")
    modifier.object = rig
    obj.parent = rig


def bone_for_object(name: str) -> str:
    if "ContinuousHeadNeckTorso" in name:
        return "__BODY__"
    if "LowerRhamphotheca" in name:
        return "Jaw"
    if any(token in name for token in ("UpperHooked", "AlmondOrbital", "ModeledUpperLid", "ModeledLowerLid", "EyeGlobe", "RecessedNare")):
        return "Head"
    if "NapeFeather" in name:
        return "Neck"
    if "BreastContour" in name:
        return "Chest"
    if any(token in name for token in ("FoldedWing", "SecondaryCovert")):
        return f"WingShoulder.{name.split('.')[-2] if name.split('.')[-1].isdigit() else name.split('.')[-1]}"
    if "LayeredSecondary" in name:
        return f"WingPrimary.{name.split('.')[-2]}"
    if "FoldedFlightFeather" in name:
        parts = name.split(".")
        return f"WingFeather.{parts[-2]}.{parts[-1]}"
    if "GraduatedTailFeather" in name:
        return f"TailFan.{name.split('.')[-1]}"
    if "PelvicTailCovert" in name:
        return f"TailCovert.{name.split('.')[-1]}"
    if "FeatheredThigh" in name:
        return f"Thigh.{name.split('.')[-1]}"
    if "Tarsus" in name:
        return f"Tarsus.{name.split('.')[-1]}"
    if "PlantarPad" in name:
        return f"Foot.{name.split('.')[-1]}"
    if "ZygodactylDigit" in name or "CurvedClaw" in name:
        parts = name.split(".")
        return f"Digit.{parts[-2]}.{parts[-1]}"
    return "Chest"


def bind_all(objects: Sequence[bpy.types.Object], rig: bpy.types.Object) -> None:
    for obj in objects:
        bone = bone_for_object(obj.name)
        if bone == "__BODY__":
            body_bind(obj, rig)
        else:
            rigid_bind(obj, rig, bone)


def reset_pose(rig: bpy.types.Object) -> None:
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key_bones(rig: bpy.types.Object, frame: int, names: Iterable[str] | None = None) -> None:
    selected = rig.pose.bones if names is None else (rig.pose.bones[name] for name in names)
    for bone in selected:
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert("scale", frame=frame, group=bone.name)


def set_rotation(rig: bpy.types.Object, name: str, degrees: Sequence[float]) -> None:
    rig.pose.bones[name].rotation_euler = tuple(math.radians(v) for v in degrees)


def set_scale(rig: bpy.types.Object, name: str, scale: Sequence[float]) -> None:
    rig.pose.bones[name].scale = tuple(scale)


def set_location(rig: bpy.types.Object, name: str, location: Sequence[float]) -> None:
    rig.pose.bones[name].location = tuple(location)


def make_action(rig: bpy.types.Object, name: str, frames: Sequence[int], poser) -> bpy.types.Action:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    if not rig.animation_data:
        rig.animation_data_create()
    rig.animation_data.action = action
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        reset_pose(rig)
        poser(frame, rig)
        key_bones(rig, frame)
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
    rig.animation_data.action = None
    return action


def create_actions(rig: bpy.types.Object) -> list[bpy.types.Action]:
    def perch(frame, rig):
        phase = math.sin((frame - 1) / 95.0 * math.tau)
        set_rotation(rig, "Chest", (phase * .7, 0, 0))
        set_rotation(rig, "Head", (0, phase * 4.0, phase * 2.0))
        set_rotation(rig, "TailRoot", (phase * 1.4, 0, 0))

    def preen(frame, rig):
        t = (frame - 1) / 119.0
        reach = math.sin(math.pi * t) ** 1.35
        nibble = math.sin(t * math.pi * 10.0) * reach
        set_rotation(rig, "Neck", (6 * reach, -22 * reach, 5 * reach))
        set_rotation(rig, "Head", (10 * reach, -35 * reach, 17 * reach))
        set_location(rig, "Head", (0, -.012 * reach, 0))
        set_rotation(rig, "WingShoulder.L", (-7 * reach, 21 * reach, -20 * reach))
        set_rotation(rig, "WingPrimary.L", (0, 14 * reach, -15 * reach))
        set_rotation(rig, "Jaw", (4.5 * max(0, nibble), 0, 0))

    def short_flight(frame, rig):
        t = (frame - 1) / 79.0
        lift = math.sin(math.pi * t) ** 1.4
        rig.pose.bones["Root"].location = (0, .060 * math.sin(math.pi * t), .145 * lift)
        flap = math.sin(t * math.pi * 8.0) * lift
        set_rotation(rig, "WingShoulder.L", (8 * lift, -105 * lift, -38 * flap))
        set_rotation(rig, "WingShoulder.R", (8 * lift, 105 * lift, 38 * flap))
        set_rotation(rig, "WingPrimary.L", (-10 * lift, -62 * lift, -22 * flap))
        set_rotation(rig, "WingPrimary.R", (-10 * lift, 62 * lift, 22 * flap))
        for suffix, side in (("L", -1), ("R", 1)):
            set_scale(rig, f"WingShoulder.{suffix}", (1.0, 1.45 - .45 * (1.0 - lift), 1.0))
            set_scale(rig, f"WingPrimary.{suffix}", (1.0, 1.55 - .55 * (1.0 - lift), 1.0))
            for index, fan_angle in enumerate((-32, -11, 11, 32)):
                set_rotation(rig, f"WingFeather.{suffix}.{index}", (fan_angle * lift, 7 * side * lift, 0))
                set_scale(rig, f"WingFeather.{suffix}.{index}", (1.0, 1.72 - .72 * (1.0 - lift), 1.0))
        set_rotation(rig, "Tarsus.L", (38 * lift, 0, -5 * lift))
        set_rotation(rig, "Tarsus.R", (38 * lift, 0, 5 * lift))
        set_rotation(rig, "Foot.L", (-24 * lift, 0, 0))
        set_rotation(rig, "Foot.R", (-24 * lift, 0, 0))
        for suffix in ("L", "R"):
            for label, curl in (("ForwardInner", 42), ("ForwardOuter", 34), ("RearInner", -38), ("RearOuter", -46)):
                set_rotation(rig, f"Digit.{suffix}.{label}", (curl * lift, 0, 0))
        set_rotation(rig, "TailRoot", (-14 * lift, 0, 0))
        for index in range(8):
            fan = (index - 3.5) * 3.6 * lift
            set_rotation(rig, f"TailFan.{index}", (0, fan, 0))

    def landing(frame, rig):
        t = (frame - 1) / 83.0
        lift = math.sin(math.pi * t) ** 1.55
        # Both endpoints are the exact authored perch pose. The middle is a
        # continuous short approach, flare, landing, and feather-settle arc.
        rig.pose.bones["Root"].location = (.035 * math.sin(math.pi * t), .080 * math.sin(math.pi * t), .105 * lift)
        flare = math.sin(math.pi * t) ** .8
        settle = math.sin(max(0.0, (t - .68) / .32) * math.pi * 3.0) * max(0.0, (t - .68) / .32)
        set_rotation(rig, "WingShoulder.L", (-6 * flare, -96 * flare, -15 * settle))
        set_rotation(rig, "WingShoulder.R", (-6 * flare, 96 * flare, 15 * settle))
        set_rotation(rig, "WingPrimary.L", (-7 * flare, -56 * flare, 0))
        set_rotation(rig, "WingPrimary.R", (-7 * flare, 56 * flare, 0))
        for suffix, side in (("L", -1), ("R", 1)):
            set_scale(rig, f"WingShoulder.{suffix}", (1.0, 1.38 - .38 * (1.0 - flare), 1.0))
            set_scale(rig, f"WingPrimary.{suffix}", (1.0, 1.46 - .46 * (1.0 - flare), 1.0))
            for index, fan_angle in enumerate((-27, -9, 9, 27)):
                set_rotation(rig, f"WingFeather.{suffix}.{index}", (fan_angle * flare, 5 * side * flare, 0))
                set_scale(rig, f"WingFeather.{suffix}.{index}", (1.0, 1.62 - .62 * (1.0 - flare), 1.0))
        # The legs reach below the belly during the approach.  Opposed toe
        # rotations open the zygodactyl grip, then resolve to the exact rest
        # wrap at both endpoints as lift returns to zero.
        set_rotation(rig, "Tarsus.L", (-16 * lift, 0, -4 * lift))
        set_rotation(rig, "Tarsus.R", (-16 * lift, 0, 4 * lift))
        set_rotation(rig, "Foot.L", (12 * lift, 0, 0))
        set_rotation(rig, "Foot.R", (12 * lift, 0, 0))
        for suffix, side in (("L", -1), ("R", 1)):
            for label, opened, splay, offset in (
                ("ForwardInner", -28, -10, (side * .002, .004, .001)),
                ("ForwardOuter", -38, -22, (side * .006, .008, .002)),
                ("RearInner", 28, 10, (-side * .002, -.004, .001)),
                ("RearOuter", 38, 22, (-side * .006, -.008, .002)),
            ):
                set_rotation(rig, f"Digit.{suffix}.{label}", (opened * lift, 8 * side * lift, splay * side * lift))
                set_location(rig, f"Digit.{suffix}.{label}", tuple(value * lift for value in offset))
        set_rotation(rig, "Head", (5 * settle, 4 * settle, 0))
        set_rotation(rig, "TailRoot", (-12 * flare, 0, 0))

    actions = [
        make_action(rig, "Perch", (1, 25, 49, 73, 96), perch),
        make_action(rig, "Preen", (1, 24, 48, 72, 96, 120), preen),
        make_action(rig, "ShortFlight", (1, 11, 21, 31, 41, 51, 61, 71, 80), short_flight),
        make_action(rig, "LandingSettle", (1, 12, 24, 36, 48, 60, 70, 77, 84), landing),
    ]
    if not rig.animation_data:
        rig.animation_data_create()
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
        track.mute = False
    rig.animation_data.action = None
    return actions


def validate_skin(objects: Sequence[bpy.types.Object], rig: bpy.types.Object) -> dict:
    unweighted = 0
    invalid_groups: list[str] = []
    bone_names = set(rig.data.bones.keys())
    for obj in objects:
        groups = {group.name for group in obj.vertex_groups}
        invalid_groups.extend(sorted(groups - bone_names))
        for vertex in obj.data.vertices:
            if not vertex.groups:
                unweighted += 1
    if unweighted or invalid_groups:
        raise RuntimeError(f"skin audit failed: {unweighted} unweighted, invalid={invalid_groups}")
    return {"meshObjects": len(objects), "unweightedVertices": unweighted, "invalidJointGroups": invalid_groups}


def audit_actions(rig: bpy.types.Object, actions: Sequence[bpy.types.Action]) -> dict:
    results = {}
    if not rig.animation_data:
        rig.animation_data_create()
    tracks = list(rig.animation_data.nla_tracks)
    for track in tracks:
        track.mute = True
    for action in actions:
        rig.animation_data.action = action
        start, end = int(action.frame_range[0]), int(action.frame_range[1])
        endpoint_roots = []
        endpoint_feet = []
        for frame in (start, end):
            bpy.context.scene.frame_set(frame)
            endpoint_roots.append(tuple(round(v, 7) for v in rig.pose.bones["Root"].location))
            endpoint_feet.append({
                suffix: tuple(round(v, 7) for v in rig.pose.bones[f"Foot.{suffix}"].matrix.translation)
                for suffix in ("L", "R")
            })
        root_delta = max(abs(endpoint_roots[0][i] - endpoint_roots[1][i]) for i in range(3))
        foot_delta = max(abs(endpoint_feet[0][s][i] - endpoint_feet[1][s][i]) for s in ("L", "R") for i in range(3))
        previous = None
        maximum_root_step = 0.0
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            root = Vector(rig.pose.bones["Root"].location)
            if previous is not None:
                maximum_root_step = max(maximum_root_step, (root - previous).length)
            previous = root
        if root_delta > 1e-6 or foot_delta > 1e-6:
            raise RuntimeError(f"{action.name}: endpoint contact/root mismatch")
        results[action.name] = {
            "frameRange": [start, end],
            "rootEndpointsMeters": endpoint_roots,
            "maximumRootEndpointDeltaMeters": root_delta,
            "maximumRootStepMeters": maximum_root_step,
            "maximumFootEndpointDeltaMeters": foot_delta,
            "endpointSupport": "authored 240 mm perch; four zygodactyl digits per foot",
        }
    rig.animation_data.action = None
    for track in tracks:
        track.mute = False
    return results


def nearest_surface_gap(first: bpy.types.Object, second: bpy.types.Object) -> float:
    tree = KDTree(len(first.data.vertices))
    for vertex in first.data.vertices:
        tree.insert(first.matrix_world @ vertex.co, vertex.index)
    tree.balance()
    return min(tree.find(second.matrix_world @ vertex.co)[2] for vertex in second.data.vertices)


def deformation_audit(rig: bpy.types.Object, objects: Sequence[bpy.types.Object],
                      actions: Sequence[bpy.types.Action]) -> dict:
    by_name = {obj.name: obj for obj in objects}
    body = by_name["ManualRetopo.ContinuousHeadNeckTorso"]
    rest_seats = {
        "leftWingToBody": nearest_surface_gap(body, by_name["ManualRetopo.FoldedWing.L"]),
        "rightWingToBody": nearest_surface_gap(body, by_name["ManualRetopo.FoldedWing.R"]),
        "leftTarsusToThigh": nearest_surface_gap(by_name["ManualRetopo.FeatheredThigh.L"], by_name["ManualRetopo.Tarsus.L"]),
        "rightTarsusToThigh": nearest_surface_gap(by_name["ManualRetopo.FeatheredThigh.R"], by_name["ManualRetopo.Tarsus.R"]),
    }
    if max(rest_seats.values()) > .012:
        raise RuntimeError(f"surface seam seat exceeds 12 mm: {rest_seats}")

    if not rig.animation_data:
        rig.animation_data_create()
    tracks = list(rig.animation_data.nla_tracks)
    for track in tracks:
        track.mute = True
    joint_pairs = (
        ("WingShoulder.L", "WingPrimary.L"), ("WingShoulder.R", "WingPrimary.R"),
        ("Thigh.L", "Tarsus.L"), ("Thigh.R", "Tarsus.R"),
        ("Tarsus.L", "Foot.L"), ("Tarsus.R", "Foot.R"),
    )
    maximum_joint_gap = 0.0
    minimum_body_extent_ratio = 1.0
    rest_extent = None
    samples = {}
    for action in actions:
        rig.animation_data.action = action
        start, end = int(action.frame_range[0]), int(action.frame_range[1])
        frames = sorted({start, round((start + end) * .5), end})
        action_samples = []
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            for parent, child in joint_pairs:
                gap = (rig.pose.bones[parent].tail - rig.pose.bones[child].head).length
                maximum_joint_gap = max(maximum_joint_gap, gap)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = body.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            coords = [vertex.co for vertex in mesh.vertices]
            extent = Vector((
                max(co.x for co in coords) - min(co.x for co in coords),
                max(co.y for co in coords) - min(co.y for co in coords),
                max(co.z for co in coords) - min(co.z for co in coords),
            ))
            evaluated.to_mesh_clear()
            if rest_extent is None:
                rest_extent = extent.copy()
            ratio = min(extent[i] / max(rest_extent[i], 1e-8) for i in range(3))
            minimum_body_extent_ratio = min(minimum_body_extent_ratio, ratio)
            action_samples.append({"frame": frame, "bodyExtentMeters": [round(v, 6) for v in extent]})
        samples[action.name] = action_samples
    rig.animation_data.action = None
    for track in tracks:
        track.mute = False
    if maximum_joint_gap > 1e-5:
        raise RuntimeError(f"skeletal seam opened by {maximum_joint_gap} m")
    if minimum_body_extent_ratio < .55:
        raise RuntimeError(f"body deformation collapsed below safe ratio: {minimum_body_extent_ratio}")
    return {
        "restSurfaceSeatMeters": rest_seats,
        "maximumConnectedJointGapMeters": maximum_joint_gap,
        "minimumBodyExtentRatio": minimum_body_extent_ratio,
        "sampledBodyBounds": samples,
    }


def mesh_metrics(objects: Sequence[bpy.types.Object]) -> dict:
    return {
        "objects": len(objects),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
        "polygons": sum(len(obj.data.polygons) for obj in objects),
        "triangles": sum(len(poly.vertices) - 2 for obj in objects for poly in obj.data.polygons),
    }


def export_selected(path: Path, rig: bpy.types.Object, objects: Sequence[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clay.select_only([rig, *objects])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=True, export_nla_strips=True, export_skins=True,
        export_materials="EXPORT", export_colors=True, export_texcoords=True,
        export_normals=True, export_tangents=True, export_cameras=False,
        export_lights=False, export_yup=True,
    )


def triangulate_for_export(objects: Sequence[bpy.types.Object]) -> None:
    """Create tangent-safe runtime topology after the editable source save."""
    for obj in objects:
        modifier = obj.modifiers.new("Runtime tangent-safe triangulation", "TRIANGULATE")
        modifier.quad_method = "BEAUTY"
        modifier.ngon_method = "BEAUTY"
        while obj.modifiers.find(modifier.name) > 0:
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        clay.apply(obj, modifier)


def consolidate_runtime_mesh(objects: Sequence[bpy.types.Object], rig: bpy.types.Object) -> list[bpy.types.Object]:
    """Consolidate authored parts into one skinned runtime node.

    The editable source intentionally retains each feather/digit as its own
    named object.  The exported payload does not need that authoring overhead;
    vertex groups preserve every rigid and blended bone assignment after join.
    """
    body = next(obj for obj in objects if "ContinuousHeadNeckTorso" in obj.name)
    clay.select_only(objects)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "SunConure.AuthoredSkinnedMesh"
    body.data.name = "SunConure.AuthoredSkinnedMesh"
    body.parent = rig
    old_materials = [slot.material for slot in body.material_slots]
    unique_materials: list[bpy.types.Material] = []
    material_indices: dict[bpy.types.Material, int] = {}
    for material in old_materials:
        if material and material not in material_indices:
            material_indices[material] = len(unique_materials)
            unique_materials.append(material)
    polygon_material_indices = [material_indices[old_materials[polygon.material_index]] for polygon in body.data.polygons]
    body.data.materials.clear()
    for material in unique_materials:
        body.data.materials.append(material)
    for polygon, material_index in zip(body.data.polygons, polygon_material_indices):
        polygon.material_index = material_index
    armature_modifiers = [modifier for modifier in body.modifiers if modifier.type == "ARMATURE"]
    if len(armature_modifiers) != 1 or armature_modifiers[0].object != rig:
        raise RuntimeError(f"runtime consolidation retained {len(armature_modifiers)} armature modifiers")
    return [body]


def decimate_for_lod2(objects: Sequence[bpy.types.Object]) -> None:
    for obj in objects:
        if len(obj.data.polygons) < 64:
            continue
        modifier = obj.modifiers.new("LOD2 authored silhouette reduction", "DECIMATE")
        modifier.ratio = .50 if len(obj.data.polygons) > 220 else .68
        modifier.use_collapse_triangulate = True
        # Keep skeletal deformation last while reducing the editable rest mesh.
        while obj.modifiers.find(modifier.name) > 0:
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        clay.apply(obj, modifier)


def read_glb_json(path: Path) -> dict:
    with path.open("rb") as source:
        magic, version, total = struct.unpack("<4sII", source.read(12))
        if magic != b"glTF" or version != 2 or total != path.stat().st_size:
            raise RuntimeError(f"invalid GLB header: {path}")
        length, chunk_type = struct.unpack("<II", source.read(8))
        if chunk_type != 0x4E4F534A:
            raise RuntimeError(f"first GLB chunk is not JSON: {path}")
        return json.loads(source.read(length).decode("utf-8"))


def glb_audit(path: Path) -> dict:
    payload = read_glb_json(path)
    animations = [item.get("name", "") for item in payload.get("animations", [])]
    expected = {"Perch", "Preen", "ShortFlight", "LandingSettle"}
    normalized = {name.split("|")[-1] for name in animations}
    if not expected.issubset(normalized):
        raise RuntimeError(f"{path.name}: missing animation clips: {sorted(expected - normalized)}; got {animations}")
    if len(payload.get("skins", [])) != 1:
        raise RuntimeError(f"{path.name}: expected one skin")
    return {
        "animations": animations,
        "skins": len(payload.get("skins", [])),
        "joints": len(payload["skins"][0].get("joints", [])),
        "meshes": len(payload.get("meshes", [])),
        "materials": len(payload.get("materials", [])),
        "images": len(payload.get("images", [])),
    }


def render_studio() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 72
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -.28
    scene.world.color = (.006, .008, .010)
    for name, location, energy, size, color in (
        ("QA.Key", (-1.2, 1.5, 2.3), 540.0, 1.8, (1.0, .79, .62)),
        ("QA.Fill", (1.3, .7, 1.4), 300.0, 2.2, (.58, .72, 1.0)),
        ("QA.Rim", (.8, -1.4, 2.0), 470.0, 1.5, (.70, .82, 1.0)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        clay.aim(obj, (0, 0, .12))


def find_action(label: str) -> bpy.types.Action:
    for action in bpy.data.actions:
        if action.name == label or action.name.endswith(f"|{label}") or action.name.startswith(f"{label}_"):
            return action
    raise RuntimeError(f"fresh import missing action {label}")


def render_fresh_import(glb: Path, qa_dir: Path, materials: dict[str, bpy.types.Material]) -> dict:
    # This is intentionally the sole glTF import in the build. All final review
    # renders therefore prove the exact payload consumed by the game runtime.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    # Remove the source actions/armature data so the review cannot
    # accidentally resolve against pre-export data bearing the same names.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for armature in list(bpy.data.armatures):
        if armature.users == 0:
            bpy.data.armatures.remove(armature)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    imported_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    imported_rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(imported_rigs) != 1:
        raise RuntimeError(f"fresh import expected one armature, got {len(imported_rigs)}")
    rig = imported_rigs[0]
    if not rig.animation_data:
        rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    qa_perch_material = simple_material("QA.FreshImportPerch", (.095, .052, .022, 1), .78, .18)
    perch, _ = clay.build_perch(qa_perch_material)
    render_studio()
    qa_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    action = find_action("Perch")
    rig.animation_data.action = action
    scene.frame_set(int(action.frame_range[0]))
    views = (
        ("textured-three-quarter", (-.70, .58, .205), (0, -.002, .065), .590),
        ("textured-profile", (-.92, .025, .085), (0, -.002, .065), .590),
        ("textured-front", (0, .92, .085), (0, -.002, .065), .590),
        ("textured-rear", (.38, -.78, .30), (0, -.025, .065), .590),
        ("textured-face", (-.58, .47, .303), (0, .056, .249), .145),
        ("textured-feet", (-.30, .36, .025), (0, .000, -.024), .150),
    )
    for label, location, target, scale in views:
        hidden = []
        if label == "textured-feet":
            for obj in imported_meshes:
                if "Tail" in obj.name:
                    obj.hide_render = True
                    hidden.append(obj)
        cam = clay.camera(f"QA.Camera.{label}", location, target, scale)
        scene.camera = cam
        scene.render.filepath = str(qa_dir / f"sun-conure-{label}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        for obj in hidden:
            obj.hide_render = False

    clip_sample_counts = {"Perch": 7, "Preen": 7, "ShortFlight": 9, "LandingSettle": 9}
    clip_frames = {}
    for clip, count in clip_sample_counts.items():
        imported_action = find_action(clip)
        start, end = imported_action.frame_range
        clip_frames[clip] = tuple(round(start + (end - start) * index / (count - 1)) for index in range(count))
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    for clip, frames in clip_frames.items():
        action = find_action(clip)
        rig.animation_data.action = action
        cam = clay.camera(f"QA.Camera.{clip}", (-.70, .58, .205), (0, -.005, .070), .760)
        scene.camera = cam
        clip_dir = qa_dir / "clips" / clip
        clip_dir.mkdir(parents=True, exist_ok=True)
        for frame in frames:
            scene.frame_set(frame)
            scene.render.filepath = str(clip_dir / f"{clip}-{frame:03d}.png")
            bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    motion_reviews = (
        ("Preen", 60, .64),
        ("ShortFlight", 40, .82),
        ("LandingSettle", 42, .78),
        ("LandingSettle", 74, .70),
        ("LandingSettle", 84, .64),
    )
    motion_review_dir = qa_dir / "motion-review"
    motion_review_dir.mkdir(parents=True, exist_ok=True)
    for clip, frame, scale in motion_reviews:
        rig.animation_data.action = find_action(clip)
        scene.frame_set(frame)
        cam = clay.camera(f"QA.Camera.MotionReview.{clip}.{frame}", (0, .96, .19), (0, .025, .070), scale)
        scene.camera = cam
        scene.render.filepath = str(motion_review_dir / f"sun-conure-{clip}-{frame:03d}-front.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    return {
        "freshImportCount": 1,
        "armatures": len(imported_rigs),
        "meshObjects": len(imported_meshes),
        "reviewImages": len(views) + sum(len(frames) for frames in clip_frames.values()) + len(motion_reviews),
        "clipFrames": {name: list(frames) for name, frames in clip_frames.items()},
    }


def main() -> None:
    args = options()
    args.output.mkdir(parents=True, exist_ok=True)
    args.source.mkdir(parents=True, exist_ok=True)
    args.qa.mkdir(parents=True, exist_ok=True)
    texture_dir = args.source / "textures"
    glb_dir = args.output / "glb"
    clay.purge()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.render.fps = 30

    maps = generate_maps(texture_dir, args.texture_size)
    materials = {
        "body": pbr_material("SunConure.BodyFeatherPBR", maps["body_basecolor"], maps["feather_normal"], maps["feather_roughness"], normal_strength=.62),
        "wing": pbr_material("SunConure.WingCovertPBR", maps["wing_basecolor"], maps["feather_normal"], maps["feather_roughness"], normal_strength=.72),
        "flight": pbr_material("SunConure.FlightFeatherPBR", maps["wing_basecolor"], maps["feather_normal"], maps["feather_roughness"], tint=(.68, .88, 1.0, 1.0), normal_strength=.68),
        "tail": pbr_material("SunConure.TailFeatherPBR", maps["tail_basecolor"], maps["feather_normal"], maps["feather_roughness"], normal_strength=.70),
        "tail_covert": pbr_material("SunConure.TailCovertPBR", maps["tail_basecolor"], maps["feather_normal"], maps["feather_roughness"], tint=(.92, 1.0, .78, 1.0), normal_strength=.65),
        "foot": pbr_material("SunConure.ZygodactylFootPBR", maps["foot_basecolor"], maps["foot_normal"], None, normal_strength=.45, roughness_value=.67),
        "bill": simple_material("SunConure.BillKeratin", (.045, .052, .060, 1), .38, .52),
        "claw": simple_material("SunConure.ClawKeratin", (.022, .026, .031, 1), .34, .50),
        "eye": simple_material("SunConure.EyeCornea", (.0025, .0035, .0045, 1), .08, .74),
        "recess": simple_material("SunConure.NareRecess", (.003, .004, .005, 1), .80, .12),
        "perch": simple_material("QA.Perch", (.095, .052, .022, 1), .78, .18),
    }
    animal, cages, perch = build_geometry(materials)
    rig = make_rig()
    bind_all(animal, rig)
    actions = create_actions(rig)
    skin_audit = validate_skin(animal, rig)
    motion_audit = audit_actions(rig, actions)
    deformation = deformation_audit(rig, animal, actions)
    source_metrics = mesh_metrics(animal)

    # Review-only objects remain in the editable .blend but are never selected
    # for either GLB export.
    for obj in [*cages, perch]:
        obj.hide_render = True
    rig_bone_count = len(rig.data.bones)
    source_blend = args.source / "sun-conure-manual-production-source.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))

    triangulate_for_export(animal)
    runtime_animal = consolidate_runtime_mesh(animal, rig)
    runtime_skin_audit = validate_skin(runtime_animal, rig)
    lod0_metrics = mesh_metrics(runtime_animal)
    lod0 = glb_dir / "sun-conure-lod0.glb"
    export_selected(lod0, rig, runtime_animal)
    lod0_glb = glb_audit(lod0)
    decimate_for_lod2(runtime_animal)
    lod2_metrics = mesh_metrics(runtime_animal)
    lod2 = glb_dir / "sun-conure-lod2.glb"
    export_selected(lod2, rig, runtime_animal)
    lod2_glb = glb_audit(lod2)

    fresh_import = render_fresh_import(lod0, args.qa, materials)
    audit = {
        "asset": "sun-conure-manual-authored-v1",
        "species": "Aratinga solstitialis",
        "scale": "meters",
        "skeletonBones": rig_bone_count,
        "skin": skin_audit,
        "runtimeConsolidatedSkin": runtime_skin_audit,
        "clips": motion_audit,
        "deformation": deformation,
        "editableSource": {"metrics": source_metrics, "topology": "approved manual retopology"},
        "lod0": {"metrics": lod0_metrics, "glb": lod0_glb},
        "lod2": {"metrics": lod2_metrics, "glb": lod2_glb},
        "freshImport": fresh_import,
    }
    audit_path = args.output / "sun-conure-production-audit.json"
    audit_path.write_text(json.dumps(audit, indent=2) + "\n")

    provenance = {
        "id": "sun-conure-manual-authored-v1",
        "displayName": "Project-original Sun Conure",
        "species": "Aratinga solstitialis",
        "license": "Original-Project-Asset",
        "authors": ["Sloth in the City project"],
        "generator": str(Path(__file__).relative_to(SCRIPT_DIR.parent.parent)),
        "geometrySource": "Approved explicit project-authored edge loops, profile lofts, contour shells, and path sections from proof_sun_conure_manual_retopo.py",
        "textureSource": "Analytic project-authored feather, keratin, and scale functions; zero imported or sampled pixels",
        "animationSource": "Project-authored skeletal keyframes; zero imported motion data",
        "externalMeshes": [],
        "externalTextures": [],
        "externalMotion": [],
        "referenceUse": "Visual anatomy study only; no external file was downloaded, traced, embedded, or sampled",
        "files": {
            "sourceBlend": file_record(source_blend),
            "lod0": file_record(lod0),
            "lod2": file_record(lod2),
            "audit": file_record(audit_path),
            "textures": [file_record(path) for path in maps.values()],
        },
    }
    provenance_path = args.output / "sun-conure-provenance.json"
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps({"lod0": lod0_metrics, "lod2": lod2_metrics, "freshImport": fresh_import}, indent=2))
    print(f"Production source: {source_blend}")
    print(f"LOD0: {lod0}")
    print(f"LOD2: {lod2}")
    print(f"QA: {args.qa}")


if __name__ == "__main__":
    main()
