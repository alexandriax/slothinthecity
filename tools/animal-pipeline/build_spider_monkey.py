#!/usr/bin/env python3
"""Build the original Sloth in the City spider monkey asset.

Run with Blender (3.4+):

  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python tools/animal-pipeline/build_spider_monkey.py -- \
    --output public/game/animals/authored \
    --preview tools/animal-pipeline/previews

This file intentionally starts from no third-party mesh, texture, rig, or motion
data.  The animal is generated as a fused implicit anatomical surface, given
original deterministic PBR maps, weighted to a purpose-built armature, and
exported with five authored loopable clips.  The generated GLBs are build
artifacts; this script is the editable source of truth.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import bpy
import numpy as np
from mathutils import Euler, Vector


SPECIES_ID = "spider-monkey"
CLIPS = ("MonkeyIdle", "MonkeyWalk", "MonkeyPerch", "MonkeyClimb", "MonkeySwing")
FPS = 30


@dataclass(frozen=True)
class BoneSpec:
    name: str
    head: Tuple[float, float, float]
    tail: Tuple[float, float, float]
    parent: str | None
    connected: bool = False
    deform: bool = True


def args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--texture-size", type=int, default=2048)
    parser.add_argument("--skip-preview", action="store_true")
    return parser.parse_args(argv)


def purge_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.metaballs,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.actions,
    ):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def select_only(objects: Iterable[bpy.types.Object]) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    active = None
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
        active = obj
    bpy.context.view_layer.objects.active = active


def lerp(a: Sequence[float], b: Sequence[float], t: float) -> Tuple[float, float, float]:
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def catmull_rom(points: Sequence[Sequence[float]], samples_per_segment: int = 10) -> List[Tuple[float, float, float]]:
    """Sample a centripetal-looking open spline without a Blender curve dependency."""
    vectors = [Vector(point) for point in points]
    padded = [vectors[0], *vectors, vectors[-1]]
    sampled: List[Tuple[float, float, float]] = []
    for segment in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[segment - 1 : segment + 3]
        for index in range(samples_per_segment):
            t = index / samples_per_segment
            t2, t3 = t * t, t * t * t
            point = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            sampled.append(tuple(point))
    sampled.append(tuple(vectors[-1]))
    return sampled


def add_ellipsoid(
    meta: bpy.types.MetaBall,
    co: Sequence[float],
    radius: float,
    scale: Sequence[float] = (1.0, 1.0, 1.0),
) -> None:
    element = meta.elements.new(type="ELLIPSOID")
    element.co = co
    element.radius = radius
    element.size_x, element.size_y, element.size_z = scale
    element.stiffness = 2.0


def add_fused_segment(
    meta: bpy.types.MetaBall,
    start: Sequence[float],
    end: Sequence[float],
    start_radius: float,
    end_radius: float,
    density: float = 0.58,
) -> None:
    distance = Vector(end).__sub__(Vector(start)).length
    count = max(2, int(math.ceil(distance / max(min(start_radius, end_radius) * density, 0.012))))
    for index in range(count + 1):
        t = index / count
        radius = start_radius + (end_radius - start_radius) * t
        add_ellipsoid(meta, lerp(start, end, t), radius, (1.0, 1.0, 1.0))


def create_anatomical_surface() -> bpy.types.Object:
    """Create one connected body including limbs, digits, muzzle, ears, and tail."""
    meta = bpy.data.metaballs.new("MonkeySpiderImplicitAnatomy")
    meta.resolution = 0.021
    meta.render_resolution = 0.015
    meta.threshold = 0.63
    meta_obj = bpy.data.objects.new("MonkeySpiderImplicitSource", meta)
    bpy.context.collection.objects.link(meta_obj)

    # Pelvis, abdomen, rib cage, neck and cranium.  The small head and narrow
    # torso are intentionally unlike the old spherical cartoon primate.
    add_ellipsoid(meta, (0.0, 0.035, 0.640), 0.170, (1.04, 0.92, 0.78))
    add_ellipsoid(meta, (0.0, -0.085, 0.680), 0.148, (0.82, 1.08, 0.84))
    add_ellipsoid(meta, (0.0, -0.225, 0.735), 0.184, (1.04, 1.12, 0.94))
    # Scapular, pectoral and pelvic masses break the old featureless tube while
    # remaining fused into the continuous torso surface.
    add_ellipsoid(meta, (-0.142, -0.245, 0.755), 0.096, (0.82, 0.68, 0.62))
    add_ellipsoid(meta, (0.142, -0.245, 0.755), 0.096, (0.82, 0.68, 0.62))
    add_ellipsoid(meta, (-0.118, 0.035, 0.642), 0.108, (0.82, 0.84, 0.72))
    add_ellipsoid(meta, (0.118, 0.035, 0.642), 0.108, (0.82, 0.84, 0.72))
    add_fused_segment(meta, (0.0, -0.285, 0.755), (0.0, -0.385, 0.800), 0.108, 0.098)
    # Low, elongated adult cranium and posterior vault.  The compressed Z
    # profile avoids the spherical infant/doll dome while preserving enough
    # occipital volume to flow naturally into the neck.
    add_ellipsoid(meta, (0.0, -0.445, 0.851), 0.137, (1.05, 0.84, 0.85))
    add_ellipsoid(meta, (0.0, -0.402, 0.854), 0.112, (1.04, 0.88, 0.86))
    # Broad zygomatic planes lead into a projected nasal/muzzle complex. These
    # overlapping forms are fused before conversion, never stacked at runtime.
    add_ellipsoid(meta, (0.0, -0.505, 0.825), 0.094, (1.03, 0.76, 0.78))
    add_ellipsoid(meta, (-0.058, -0.510, 0.823), 0.056, (1.00, 0.66, 0.86))
    add_ellipsoid(meta, (0.058, -0.510, 0.823), 0.056, (1.00, 0.66, 0.86))
    add_ellipsoid(meta, (0.0, -0.542, 0.832), 0.036, (0.68, 0.72, 1.02))
    add_ellipsoid(meta, (0.0, -0.548, 0.790), 0.054, (1.12, 0.74, 0.62))
    add_ellipsoid(meta, (-0.026, -0.548, 0.790), 0.034, (0.96, 0.74, 0.66))
    add_ellipsoid(meta, (0.026, -0.548, 0.790), 0.034, (0.96, 0.74, 0.66))
    # The chin overlaps deeply with the lower muzzle; the earlier shallow form
    # could convert into a detached oval under the metaball threshold.
    add_ellipsoid(meta, (0.0, -0.526, 0.764), 0.049, (0.94, 0.74, 0.64))
    # A continuous supraorbital shelf casts a real brow shadow over the small,
    # recessed almond eyes.
    add_ellipsoid(meta, (-0.044, -0.519, 0.873), 0.041, (1.25, 0.64, 0.40))
    add_ellipsoid(meta, (0.044, -0.519, 0.873), 0.041, (1.25, 0.64, 0.40))
    # Ear bases overlap the cranium deeply enough to remain one watertight
    # surface after conversion; the old edge-touching placement could leave
    # detached dark tabs at the side of the head.
    add_ellipsoid(meta, (-0.086, -0.445, 0.862), 0.058, (0.52, 0.70, 1.00))
    add_ellipsoid(meta, (0.086, -0.445, 0.862), 0.058, (0.52, 0.70, 1.00))

    # Arms are approximately 25% longer than legs and terminate in narrow,
    # hook-like four-fingered hands.  All segments overlap into the torso/palm.
    arms = {
        "L": ((0.150, -0.245, 0.750), (0.235, -0.390, 0.455), (0.245, -0.535, 0.155), (0.245, -0.595, 0.070)),
        "R": ((-0.150, -0.245, 0.750), (-0.235, -0.390, 0.455), (-0.245, -0.535, 0.155), (-0.245, -0.595, 0.070)),
    }
    for side, (shoulder, elbow, wrist, palm) in arms.items():
        add_fused_segment(meta, shoulder, elbow, 0.073, 0.055)
        add_fused_segment(meta, elbow, wrist, 0.056, 0.037)
        add_ellipsoid(meta, lerp(shoulder, elbow, 0.32), 0.068, (0.92, 0.82, 1.12))
        add_ellipsoid(meta, lerp(elbow, wrist, 0.43), 0.050, (0.92, 0.84, 1.16))
        add_fused_segment(meta, wrist, palm, 0.040, 0.061)
        add_ellipsoid(meta, (palm[0], palm[1] - 0.018, palm[2] - 0.002), 0.060, (0.78, 0.70, 0.48))
        # Four proximal metacarpal/knuckle roots branch out of the palmar pad.
        # Only these roots are fused; the free phalanges remain separately
        # readable after conversion so the hand is neither a mitten nor a row
        # of identical tubes pasted onto one.
        for root_offset, y_offset, radius in (
            (-0.030, -0.037, 0.0220),
            (-0.010, -0.043, 0.0235),
            (0.011, -0.045, 0.0230),
            (0.031, -0.039, 0.0205),
        ):
            add_ellipsoid(
                meta,
                (palm[0] + root_offset, palm[1] + y_offset, palm[2] - 0.010),
                radius,
                (0.70, 1.25, 0.64),
            )

    # Compact hips and long lower legs with grasping feet.  The digits spread
    # subtly so the ground silhouette reads as a primate rather than a hoof.
    legs = {
        "L": ((0.105, 0.050, 0.645), (0.155, 0.165, 0.385), (0.145, -0.010, 0.120), (0.145, -0.145, 0.055)),
        "R": ((-0.105, 0.050, 0.645), (-0.155, 0.165, 0.385), (-0.145, -0.010, 0.120), (-0.145, -0.145, 0.055)),
    }
    for side, (hip, knee, ankle, sole) in legs.items():
        add_fused_segment(meta, hip, knee, 0.090, 0.061)
        add_fused_segment(meta, knee, ankle, 0.062, 0.043)
        add_ellipsoid(meta, lerp(hip, knee, 0.30), 0.082, (0.94, 0.86, 1.10))
        add_ellipsoid(meta, lerp(knee, ankle, 0.46), 0.057, (0.92, 0.82, 1.15))
        add_fused_segment(meta, ankle, sole, 0.048, 0.064)
        add_ellipsoid(meta, (sole[0], sole[1] - 0.018, sole[2]), 0.063, (0.82, 0.72, 0.46))
        # The plantar pad has a broad heel, four forward digital rays and one
        # medially opposed hallux root—the foot must not be a copied hand.
        side_sign = 1.0 if sole[0] > 0 else -1.0
        for root_offset, y_offset, radius in (
            (-side_sign * 0.034, -0.030, 0.0235),
            (-side_sign * 0.013, -0.039, 0.0215),
            (side_sign * 0.004, -0.043, 0.0210),
            (side_sign * 0.021, -0.040, 0.0195),
            (side_sign * 0.036, -0.034, 0.0175),
        ):
            add_ellipsoid(
                meta,
                (sole[0] + root_offset, sole[1] + y_offset, sole[2] - 0.008),
                radius,
                (0.76, 1.20, 0.62),
            )

    # The prehensile tail is longer than the head/body and ends in a tapered
    # palm-like gripping surface.  The open curl avoids an implausible torus.
    tail = [
        (0.0, 0.105, 0.650), (0.0, 0.285, 0.690), (0.025, 0.475, 0.790),
        (0.105, 0.620, 0.950), (0.205, 0.650, 1.160), (0.245, 0.545, 1.350),
        (0.205, 0.365, 1.485), (0.075, 0.250, 1.530), (-0.060, 0.270, 1.495),
    ]
    tail_samples = catmull_rom(tail, 10)
    for index, point in enumerate(tail_samples):
        t = index / max(1, len(tail_samples) - 1)
        radius = (0.082 - 0.058 * t) * (1.0 + 0.060 * math.sin(t * math.tau * 3.0))
        add_ellipsoid(meta, point, radius)
    add_ellipsoid(meta, tail[-1], 0.034, (0.82, 1.25, 0.58))

    select_only([meta_obj])
    bpy.context.view_layer.objects.active = meta_obj
    bpy.ops.object.convert(target="MESH")
    body = bpy.context.object
    body.name = "MonkeySpider_ContinuousAnatomy"
    body.data.name = "MonkeySpider_HeroTopology"
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    # Light smoothing removes metaball pinching while retaining fingers and
    # facial planes. Corrective smooth is non-destructive before export.
    smooth = body.modifiers.new("AnatomicalSurfaceRelax", "SMOOTH")
    smooth.factor = 0.54
    smooth.iterations = 5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # A dense subdivision/displacement finish gives the close-camera animal a
    # true hero surface budget rather than inflating primitive segment counts.
    subdivision = body.modifiers.new("HeroSurfaceSubdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 2
    subdivision.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    decimate = body.modifiers.new("HeroSurfaceBudget", "DECIMATE")
    decimate.ratio = 0.68
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    return body


def sculpt_facial_relief(body: bpy.types.Object) -> None:
    """Sculpt adult Ateles facial planes into the continuous fused head."""
    for vertex in body.data.vertices:
        point = vertex.co

        # Plane back the frontal vault above the brow to remove the inflated
        # baby-doll forehead while retaining a softly rounded cranial roof.
        if point.y < -0.455 and point.z > 0.874 and abs(point.x) < 0.115:
            height = min(1.0, (point.z - 0.874) / 0.095)
            lateral = max(0.0, 1.0 - (abs(point.x) / 0.115) ** 2)
            point.y += 0.0060 * height * lateral

        # Almond orbital bowls and actual upper/lower lid rolls. All lid relief
        # is displaced from the welded head, so the eye cannot read as a bead
        # pasted onto a spherical primitive.
        for side in (-1.0, 1.0):
            eye_x = side * 0.039
            eye_z = 0.846
            dx = (point.x - eye_x) / 0.0135
            if abs(dx) < 1.18 and point.y < -0.480:
                almond_height = math.sqrt(max(0.0, 1.0 - min(1.0, dx * dx)))
                upper = eye_z + 0.0068 * almond_height
                lower = eye_z - 0.0055 * almond_height
                inside_vertical = lower < point.z < upper
                if inside_vertical and abs(dx) < 1.0:
                    interior = (1.0 - dx * dx) * min(
                        1.0,
                        max(0.0, (point.z - lower) / 0.0035),
                        max(0.0, (upper - point.z) / 0.0035),
                    )
                    point.y += 0.0060 * interior
                upper_roll = math.exp(-((point.z - upper) / 0.0025) ** 2)
                lower_roll = math.exp(-((point.z - lower) / 0.0022) ** 2)
                taper = max(0.0, 1.0 - (abs(dx) / 1.18) ** 4)
                point.y -= (0.0048 * upper_roll + 0.0030 * lower_roll) * taper

            # Subtle oblique brow depression separates the shelf from the
            # forehead and keeps the adult expression from appearing vacant.
            brow_dx = (point.x - eye_x) / 0.024
            brow_z = 0.872 + 0.010 * (1.0 - min(1.0, abs(brow_dx)))
            if point.y < -0.500 and abs(brow_dx) < 1.35:
                point.y += 0.0025 * math.exp(-((point.z - brow_z) / 0.0030) ** 2)
                shelf = math.exp(-(brow_dx * brow_dx + ((point.z - 0.869) / 0.010) ** 2))
                point.y -= 0.0080 * shelf

            # Nostrils are actual shallow depressions in the muzzle.
            ndx = (point.x - side * 0.014) / 0.011
            ndz = (point.z - 0.803) / 0.0075
            nr = math.sqrt(ndx * ndx + ndz * ndz)
            if point.y < -0.545 and nr < 1.0:
                point.y += 0.0110 * (1.0 - nr) ** 2
            # Project the alar rim around each nostril depression.
            alar = math.exp(-(((point.x - side * 0.023) / 0.012) ** 2 + ((point.z - 0.803) / 0.010) ** 2))
            if point.y < -0.540:
                point.y -= 0.0030 * alar

        # Project a narrow nasal bridge and broad, shallow nose pad from the
        # zygomatic plane rather than attaching a new sphere.
        if abs(point.x) < 0.027 and point.y < -0.515:
            bridge = math.exp(-((point.z - 0.829) / 0.031) ** 2)
            lateral = math.exp(-((point.x / 0.019) ** 2))
            point.y -= 0.0060 * bridge * lateral

        # Philtrum, upper lip, mouth seam and chin are modeled as distinct
        # continuous planes. The chin projects below the seam rather than
        # disappearing into the old featureless muzzle oval.
        if abs(point.x) < 0.008 and point.y < -0.545 and 0.775 < point.z < 0.803:
            point.y += 0.0030 * (1.0 - abs(point.x) / 0.008)

        # Continuous lower-lip crease following the muzzle ellipse.
        if abs(point.x) < 0.045 and point.y < -0.535:
            target_z = 0.773 + 0.007 * (abs(point.x) / 0.041)
            distance = abs(point.z - target_z)
            if distance < 0.0045:
                point.y += 0.0075 * (1.0 - distance / 0.0045) ** 2
        if abs(point.x) < 0.041 and point.y < -0.525 and 0.744 < point.z < 0.772:
            chin = math.exp(-((point.z - 0.756) / 0.013) ** 2)
            point.y -= 0.0038 * chin * max(0.0, 1.0 - (point.x / 0.041) ** 2)

        # The ears remain part of the skull, with a depressed conchal bowl and
        # a raised antihelix ring instead of a separate disc.
        for side in (-1.0, 1.0):
            dy = (point.y + 0.445) / 0.043
            dz = (point.z - 0.862) / 0.055
            radial = math.sqrt(dy * dy + dz * dz)
            if point.x * side > 0.095 and radial < 1.0:
                bowl = max(0.0, 1.0 - radial) ** 2
                fold = math.exp(-((radial - 0.70) / 0.12) ** 2)
                point.x -= side * 0.0050 * bowl
                point.x += side * 0.0022 * fold
    body.data.update()


def create_texture_maps(directory: Path, size: int) -> Dict[str, bpy.types.Image]:
    """Generate original fur albedo, tangent normal, and perceptual roughness."""
    directory.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(17381)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    noise = np.zeros((size, size), dtype=np.float32)
    for octave, amplitude in ((3, 0.20), (7, 0.13), (17, 0.075), (41, 0.040), (91, 0.020)):
        p1, p2 = rng.uniform(0, math.tau, 2)
        noise += amplitude * np.sin((u * octave + v * octave * 0.27) * math.tau + p1)
        noise += amplitude * 0.55 * np.sin((v * octave * 1.9 - u * octave * 0.13) * math.tau + p2)
    stochastic = rng.normal(0.0, 0.055, (size, size)).astype(np.float32)
    # Rasterize thousands of short, overlapping coat strokes into aperiodic
    # fibre breakup.  Periodic sine fields became a visible textile grid after
    # smart-UV stretching; these authored stochastic strokes retain direction
    # and interruption without a repeating groove pattern.
    fibres = np.zeros((size, size), dtype=np.float32)
    fibre_count = max(4096, size * size // 28)
    start_x = rng.integers(0, size, fibre_count)
    start_y = rng.integers(0, size, fibre_count)
    angles = rng.normal(math.pi * 0.5, 0.34, fibre_count)
    maximum_length = max(8, size // 96)
    lengths = rng.integers(max(4, maximum_length // 2), maximum_length + 1, fibre_count)
    for step in range(maximum_length):
        active = lengths > step
        x_index = np.mod(start_x[active] + np.rint(np.cos(angles[active]) * step).astype(np.int32), size)
        y_index = np.mod(start_y[active] + np.rint(np.sin(angles[active]) * step).astype(np.int32), size)
        np.add.at(fibres, (y_index, x_index), 1.0 - 0.45 * step / maximum_length)
    fibres = (
        fibres * 0.50
        + np.roll(fibres, 1, axis=1) * 0.16
        + np.roll(fibres, -1, axis=1) * 0.16
        + np.roll(fibres, 1, axis=0) * 0.09
        + np.roll(fibres, -1, axis=0) * 0.09
    )
    fibres = np.tanh((fibres - fibres.mean()) / max(1e-5, fibres.std()) * 0.72)
    height = np.clip(0.50 + noise * 0.24 + fibres * 0.026 + stochastic * 0.12, 0.0, 1.0)
    # Black-handed spider monkeys read as deep espresso and umber in neutral
    # light.  Keep the authored colour breakup restrained: the earlier orange
    # range made the animal look like unshaded clay rather than dense pelage.
    # Keep the black-handed coat deep brown, but retain enough mid-tone energy
    # for the shoulder, cheek and limb planes to survive the game's ACES tone
    # mapping.  The previous values collapsed those forms to near-black in the
    # authored-animal showroom even though they read correctly in raw Blender.
    # Neutral cacao/umber rather than orange. These values intentionally carry
    # more sRGB mid-tone energy than the first showroom pass so ACES preserves
    # cheek, shoulder and limb planes beneath the habitat canopy.
    warm = np.array([0.105, 0.065, 0.045], dtype=np.float32)
    gold = np.array([0.285, 0.175, 0.095], dtype=np.float32)
    colour_mix = np.clip(0.44 + height * 0.24 + 0.035 * np.sin(v * math.tau * 2), 0, 1)[..., None]
    rgb = warm * (1 - colour_mix) + gold * colour_mix
    # The 2K fibre response must stay micro-scale. Stronger contrast turns UV
    # islands into carved grooves under raking light instead of dense pelage.
    rgb *= (0.965 + fibres[..., None] * 0.038)
    base = np.concatenate((np.clip(rgb, 0, 1), np.ones((size, size, 1), dtype=np.float32)), axis=2)

    # The normal derives primarily from aligned fibres. Broad colour noise and
    # per-pixel stochastic grain must not turn the animal into cratered clay.
    normal_height = np.clip(0.50 + fibres * 0.033 + noise * 0.017, 0.0, 1.0)
    gy, gx = np.gradient(normal_height)
    strength = 2.65
    normal = np.stack((-gx * strength, -gy * strength, np.ones_like(height)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    normal = np.concatenate((normal * 0.5 + 0.5, np.ones((size, size, 1), dtype=np.float32)), axis=2)
    rough_value = np.clip(0.77 + (1.0 - height) * 0.13 + fibres * 0.013 + stochastic * 0.040, 0.68, 0.96)
    rough = np.stack((rough_value, rough_value, rough_value, np.ones_like(rough_value)), axis=2)

    results: Dict[str, bpy.types.Image] = {}
    for name, pixels, colorspace in (
        ("basecolor", base, "sRGB"),
        ("normal", normal, "Non-Color"),
        ("roughness", rough, "Non-Color"),
    ):
        image = bpy.data.images.new(f"MonkeySpiderFur_{name}", width=size, height=size, alpha=True)
        image.colorspace_settings.name = colorspace
        image.pixels.foreach_set(pixels.astype(np.float32).ravel())
        image.filepath_raw = str((directory / f"monkey-spider-fur-{name}.png").resolve())
        image.file_format = "PNG"
        image.save()
        results[name] = image
    return results


def principled(material: bpy.types.Material) -> bpy.types.Node:
    material.use_nodes = True
    return material.node_tree.nodes.get("Principled BSDF")


def create_materials(images: Dict[str, bpy.types.Image]) -> Dict[str, bpy.types.Material]:
    fur = bpy.data.materials.new("MonkeySpider_FurPBR")
    fur.use_nodes = True
    tree = fur.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    base = tree.nodes.new("ShaderNodeTexImage")
    base.image = images["basecolor"]
    base.label = "Original authored fur albedo"
    normal_tex = tree.nodes.new("ShaderNodeTexImage")
    normal_tex.image = images["normal"]
    normal_tex.image.colorspace_settings.name = "Non-Color"
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.78
    rough = tree.nodes.new("ShaderNodeTexImage")
    rough.image = images["roughness"]
    rough.image.colorspace_settings.name = "Non-Color"
    vertex_color = tree.nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "MonkeySpider_FaceBlend"
    face_tint = tree.nodes.new("ShaderNodeMixRGB")
    face_tint.blend_type = "MULTIPLY"
    face_tint.inputs[0].default_value = 1.0
    tree.links.new(base.outputs["Color"], face_tint.inputs[1])
    tree.links.new(vertex_color.outputs["Color"], face_tint.inputs[2])
    tree.links.new(face_tint.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    tree.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Specular"].default_value = 0.18

    skin = bpy.data.materials.new("MonkeySpider_FaceAndPalms")
    node = principled(skin)
    # Deep warm charcoal in linear space. 0.01 collapsed to black after ACES;
    # this remains dark skin while retaining eyelid, palm and tendon relief.
    node.inputs["Base Color"].default_value = (0.0180, 0.0100, 0.0075, 1.0)
    node.inputs["Roughness"].default_value = 0.72
    node.inputs["Specular"].default_value = 0.16

    eye = bpy.data.materials.new("MonkeySpider_Eyes")
    node = principled(eye)
    node.inputs["Base Color"].default_value = (0.0140, 0.0045, 0.0018, 1.0)
    # Spider-monkey eyes read as a nearly black-brown iris rather than a pale
    # globe.  A restrained physical highlight comes from the corneal plane;
    # there is deliberately no modeled white sclera or white catchlight bead.
    # The former glossy lobe reflected the entire key light and turned this
    # dark plane into a white cartoon globe.  Keep the iris/cornea brown-black
    # and let the separate sub-millimetre disk carry the only authored glint.
    node.inputs["Roughness"].default_value = 0.64
    node.inputs["Specular"].default_value = 0.025

    catchlight = bpy.data.materials.new("MonkeySpider_Catchlight")
    node = principled(catchlight)
    node.inputs["Base Color"].default_value = (0.38, 0.32, 0.24, 1.0)
    node.inputs["Roughness"].default_value = 0.82
    node.inputs["Specular"].default_value = 0.0

    mouth = bpy.data.materials.new("MonkeySpider_MouthAndNostrils")
    node = principled(mouth)
    node.inputs["Base Color"].default_value = (0.00005, 0.000018, 0.000010, 1.0)
    node.inputs["Roughness"].default_value = 0.72
    node.inputs["Specular"].default_value = 0.01
    return {"fur": fur, "skin": skin, "eye": eye, "mouth": mouth, "catchlight": catchlight}


def uv_and_material_regions(body: bpy.types.Object, materials: Dict[str, bpy.types.Material]) -> None:
    body.data.materials.append(materials["fur"])
    body.data.materials.append(materials["skin"])
    body.data.materials.append(materials["mouth"])
    body.data.materials.append(materials["eye"])
    select_only([body])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.018, area_weight=0.18)
    bpy.ops.object.mode_set(mode="OBJECT")
    tail_tip = Vector((-0.060, 0.270, 1.495))
    for polygon in body.data.polygons:
        center = polygon.center
        is_tail_pad = (center - tail_tip).length < 0.072
        # Dark inner-ear skin is selected from the outside of the fused ear
        # lobes, preserving one continuous silhouette with no overlay object.
        is_inner_ear = (
            ((abs(center.x) - 0.130) / 0.018) ** 2
            + ((center.y + 0.445) / 0.038) ** 2
            + ((center.z - 0.862) / 0.050) ** 2
        ) < 1.0
        # The welded head uses the same material as the entire fur surface.
        # Face albedo, roughness and normal attenuation all transition through
        # the interpolated COLOR_0 mask below, so no material-slot polygon edge
        # can ever appear as a staircase around the bare face.
        # Palms and soles remain on the fur shader and transition through the
        # interpolated vertex mask below. A hard polygon material cut at each
        # wrist/ankle was visibly jagged in runtime ACES lighting.
        polygon.material_index = 1 if is_tail_pad or is_inner_ear else 0


def add_face_vertex_blend(body: bpy.types.Object) -> None:
    """Add a seamless interpolated dark bare-face multiplier."""
    attributes = body.data.color_attributes
    old = attributes.get("MonkeySpider_FaceBlend")
    if old:
        attributes.remove(old)
    layer = attributes.new(name="MonkeySpider_FaceBlend", type="BYTE_COLOR", domain="CORNER")
    # Slightly lifted neutral charcoal: still bare black skin, but not a void
    # after the runtime's exposure and filmic response are applied.
    # Texture RGB is decoded to linear before multiplication. A ~0.15 mask
    # drove the face below 0.006 linear; this neutral brown-charcoal multiplier
    # keeps the face darker than the coat while retaining sculpted planes.
    face_multiplier = Vector((0.52, 0.46, 0.42))
    white = Vector((1.0, 1.0, 1.0))
    for loop in body.data.loops:
        point = body.data.vertices[loop.vertex_index].co
        radius = math.sqrt((point.x / 0.108) ** 2 + ((point.z - 0.824) / 0.116) ** 2)
        # Two quiet, incommensurate waves keep the hairline organically uneven
        # without telegraphing triangles or creating a sticker-perfect ellipse.
        organic_radius = radius + 0.025 * math.sin(point.x * 81.0 + point.z * 37.0)
        organic_radius += 0.016 * math.sin(point.z * 119.0 - point.x * 31.0)
        radial = 1.0 - max(0.0, min(1.0, (organic_radius - 0.78) / 0.37))
        radial = radial * radial * (3.0 - 2.0 * radial)
        frontal = max(0.0, min(1.0, (-0.404 - point.y) / 0.070))
        frontal = frontal * frontal * (3.0 - 2.0 * frontal)
        face_coverage = radial * frontal

        # Smooth bare-skin transitions over fused palms and plantar pads.  The
        # free digits use the matching skin material, seated deeply inside the
        # fully dark end of these gradients.
        hand_lateral = max(0.0, 1.0 - abs(abs(point.x) - 0.245) / 0.090)
        hand_forward = max(0.0, min(1.0, (-0.515 - point.y) / 0.105))
        hand_low = max(0.0, min(1.0, (0.205 - point.z) / 0.105))
        hand_coverage = hand_lateral * hand_forward * hand_low
        hand_coverage = hand_coverage * hand_coverage * (3.0 - 2.0 * hand_coverage)

        foot_lateral = max(0.0, 1.0 - abs(abs(point.x) - 0.145) / 0.105)
        foot_forward = max(0.0, min(1.0, (-0.070 - point.y) / 0.105))
        foot_low = max(0.0, min(1.0, (0.175 - point.z) / 0.100))
        foot_coverage = foot_lateral * foot_forward * foot_low
        foot_coverage = foot_coverage * foot_coverage * (3.0 - 2.0 * foot_coverage)

        coverage = max(face_coverage, hand_coverage, foot_coverage)
        color = white.lerp(face_multiplier, coverage)
        layer.data[loop.index].color = (*color, coverage)
    attributes.active_color = layer
    attributes.active = layer


def bake_face_into_pbr_maps(body: bpy.types.Object, images: Dict[str, bpy.types.Image]) -> None:
    """Rasterize only fine nostril/lip markings into the authored albedo.

    Broad face colour is an interpolated vertex multiplier, avoiding tiny smart
    UV islands and their sampling seams. Per-texel work is reserved for the
    high-frequency markings that genuinely require map resolution.
    """
    base_image = images["basecolor"]
    size = int(base_image.size[0])
    maps = {
        name: np.asarray(image.pixels[:], dtype=np.float32).reshape((size, size, 4)).copy()
        for name, image in images.items()
    }
    uv_layer = body.data.uv_layers.active.data
    body.data.calc_loop_triangles()

    for triangle in body.data.loop_triangles:
        points = np.array([body.data.vertices[index].co[:] for index in triangle.vertices], dtype=np.float32)
        # Reject virtually all of the 138k hero triangles before raster work.
        if points[:, 1].min() > -0.400 or points[:, 2].max() < 0.690 or np.abs(points[:, 0]).min() > 0.155:
            continue
        uvs = np.array([uv_layer[index].uv[:] for index in triangle.loops], dtype=np.float32)
        pixel = uvs * float(size - 1)
        xmin = max(0, int(math.floor(pixel[:, 0].min())) - 1)
        xmax = min(size - 1, int(math.ceil(pixel[:, 0].max())) + 1)
        ymin = max(0, int(math.floor(pixel[:, 1].min())) - 1)
        ymax = min(size - 1, int(math.ceil(pixel[:, 1].max())) + 1)
        if xmin > xmax or ymin > ymax:
            continue
        py, px = np.mgrid[ymin : ymax + 1, xmin : xmax + 1].astype(np.float32)
        px += 0.5
        py += 0.5
        x0, y0 = pixel[0]
        x1, y1 = pixel[1]
        x2, y2 = pixel[2]
        denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(float(denominator)) < 1.0e-8:
            continue
        w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denominator
        w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denominator
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.002) & (w1 >= -0.002) & (w2 >= -0.002)
        if not inside.any():
            continue
        surface = (
            w0[..., None] * points[0]
            + w1[..., None] * points[1]
            + w2[..., None] * points[2]
        )
        radius = np.sqrt((surface[..., 0] / 0.108) ** 2 + ((surface[..., 2] - 0.824) / 0.116) ** 2)
        organic = radius + 0.025 * np.sin(surface[..., 0] * 81.0 + surface[..., 2] * 37.0)
        organic += 0.016 * np.sin(surface[..., 2] * 119.0 - surface[..., 0] * 31.0)
        radial = 1.0 - np.clip((organic - 0.78) / 0.37, 0.0, 1.0)
        radial = radial * radial * (3.0 - 2.0 * radial)
        frontal = np.clip((-0.404 - surface[..., 1]) / 0.070, 0.0, 1.0)
        frontal = frontal * frontal * (3.0 - 2.0 * frontal)
        coverage = np.where(inside, radial * frontal, 0.0).astype(np.float32)
        active = coverage > 0.0001
        if not active.any():
            continue
        rows, cols = np.nonzero(active)
        yy = rows + ymin
        xx = cols + xmin
        # Darken the sculpted nostril pits and mouth seam in the same atlas.
        # These markings follow reconstructed surface position, so no floating
        # bead geometry is required for facial definition.
        active_surface = surface[active]
        sx, sz = active_surface[:, 0], active_surface[:, 2]
        nostril = np.maximum(
            np.exp(-(((sx - 0.014) / 0.0052) ** 2 + ((sz - 0.803) / 0.0032) ** 2)),
            np.exp(-(((sx + 0.014) / 0.0052) ** 2 + ((sz - 0.803) / 0.0032) ** 2)),
        )
        lip_z = 0.773 + 0.007 * np.minimum(1.0, np.abs(sx) / 0.041)
        lip = np.exp(-((sz - lip_z) / 0.0022) ** 2) * (np.abs(sx) < 0.045)
        feature = np.maximum(nostril, lip) * coverage[active]
        feature = np.clip(feature, 0.0, 0.92)[:, None]
        feature_albedo = np.array([0.0007, 0.00045, 0.0004], dtype=np.float32)
        maps["basecolor"][yy, xx, :3] = maps["basecolor"][yy, xx, :3] * (1.0 - feature) + feature_albedo * feature
        maps["roughness"][yy, xx, :3] = maps["roughness"][yy, xx, :3] * (1.0 - feature) + 0.66 * feature

    for name, image in images.items():
        image.pixels.foreach_set(maps[name].ravel())
        image.save()


def add_fur_surface_breakup(body: bpy.types.Object) -> None:
    """Apply subtle deterministic micro-relief only to fur-bearing vertices."""
    group = body.vertex_groups.new(name="MonkeySpider_FurMicroRelief")
    fur_vertices = []
    for vertex in body.data.vertices:
        point = vertex.co
        is_face = point.z > 0.730 and point.y < -0.470
        is_hand = point.z < 0.160 and abs(point.x) > 0.170 and point.y < -0.525
        is_foot = point.z < 0.110 and point.y < -0.085
        if not (is_face or is_hand or is_foot):
            fur_vertices.append(vertex.index)
    group.add(fur_vertices, 1.0, "REPLACE")
    texture = bpy.data.textures.new("MonkeySpider_DirectionalFurBreakup", type="CLOUDS")
    texture.noise_scale = 0.024
    texture.noise_depth = 2
    texture.contrast = 1.35
    modifier = body.modifiers.new("MonkeySpider_FurSilhouetteBreakup", "DISPLACE")
    modifier.texture = texture
    modifier.texture_coords = "GLOBAL"
    modifier.vertex_group = group.name
    modifier.strength = 0.0014
    modifier.mid_level = 0.52
    select_only([body])
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    remaining = body.vertex_groups.get("MonkeySpider_FurMicroRelief")
    if remaining:
        body.vertex_groups.remove(remaining)


def add_uv_sphere(name: str, location: Sequence[float], radius: float, material: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name}_Geometry"
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_tapered_digit(
    name: str,
    control_points: Sequence[Sequence[float]],
    start_radius: float,
    end_radius: float,
    material: bpy.types.Material,
    length_segments: int = 12,
    radial_segments: int = 10,
) -> bpy.types.Object:
    """Create an original cubic-Bezier tube with a genuinely tapered hook."""
    p0, p1, p2, p3 = [Vector(point) for point in control_points]
    vertices: List[Tuple[float, float, float]] = []
    faces: List[Tuple[int, ...]] = []
    for segment in range(length_segments + 1):
        t = segment / length_segments
        u = 1.0 - t
        center = p0 * (u ** 3) + p1 * (3 * u * u * t) + p2 * (3 * u * t * t) + p3 * (t ** 3)
        tangent = (
            (p1 - p0) * (3 * u * u)
            + (p2 - p1) * (6 * u * t)
            + (p3 - p2) * (3 * t * t)
        ).normalized()
        reference = Vector((1.0, 0.0, 0.0))
        if abs(tangent.dot(reference)) > 0.88:
            reference = Vector((0.0, 0.0, 1.0))
        normal = tangent.cross(reference).normalized()
        binormal = tangent.cross(normal).normalized()
        radius = start_radius * (1.0 - t) + end_radius * t
        # Two restrained phalangeal/tendon swells break the rejected uniform
        # sausage profile while keeping the hook lean and species-correct.
        proximal_knuckle = math.exp(-((t - 0.25) / 0.105) ** 2)
        distal_knuckle = math.exp(-((t - 0.61) / 0.090) ** 2)
        radius *= 1.0 + 0.14 * proximal_knuckle + 0.075 * distal_knuckle
        for side in range(radial_segments):
            angle = math.tau * side / radial_segments
            # A slightly flattened palmar cross-section exposes a tendon plane
            # rather than a perfectly round hose.
            normal_radius = radius * (0.86 + 0.08 * math.sin(t * math.pi))
            binormal_radius = radius * 1.04
            point = center + normal * (math.cos(angle) * normal_radius) + binormal * (math.sin(angle) * binormal_radius)
            vertices.append(tuple(point))
    for segment in range(length_segments):
        for side in range(radial_segments):
            next_side = (side + 1) % radial_segments
            a = segment * radial_segments + side
            b = segment * radial_segments + next_side
            c = (segment + 1) * radial_segments + next_side
            d = (segment + 1) * radial_segments + side
            faces.append((a, b, c, d))
    start_center = len(vertices)
    vertices.append(tuple(p0))
    end_center = len(vertices)
    vertices.append(tuple(p3))
    for side in range(radial_segments):
        next_side = (side + 1) % radial_segments
        faces.append((start_center, next_side, side))
    last = length_segments * radial_segments
    for side in range(radial_segments):
        next_side = (side + 1) % radial_segments
        faces.append((end_center, last + side, last + next_side))
    mesh = bpy.data.meshes.new(f"{name}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_grasping_digits(materials: Dict[str, bpy.types.Material]) -> List[bpy.types.Object]:
    details: List[bpy.types.Object] = []
    for side, palm_x in (("L", 0.245), ("R", -0.245)):
        # Four reduced-thumb hook fingers.  Unequal rays, staggered knuckles
        # and different curls follow the branching palm instead of repeating
        # one tube four times.
        finger_rays = (
            (-0.030, -0.060, 0.142, 0.018, 0.066, 0.0122, 0.0040),
            (-0.010, -0.022, 0.176, 0.013, 0.075, 0.0144, 0.0043),
            (0.011, 0.024, 0.184, 0.015, 0.081, 0.0140, 0.0042),
            (0.031, 0.068, 0.158, 0.020, 0.070, 0.0118, 0.0038),
        )
        for index, (root_offset, spread, reach, low_z, tip_z, root_radius, tip_radius) in enumerate(finger_rays):
            root_x = palm_x + root_offset
            target_x = palm_x + spread
            points = (
                (root_x, -0.604 + 0.004 * (index % 2), 0.061 + 0.003 * index),
                (root_x * 0.44 + target_x * 0.56, -0.604 - reach * 0.34, 0.045 - 0.002 * index),
                (target_x, -0.604 - reach * 0.82, low_z),
                (palm_x + spread * 1.08, -0.604 - reach, tip_z),
            )
            details.append(add_tapered_digit(
                f"MonkeySpider_Finger.{side}.{index + 1}",
                points,
                root_radius,
                tip_radius,
                materials["skin"],
                length_segments=16,
                radial_segments=12,
            ))

    for side, sole_x in (("L", 0.145), ("R", -0.145)):
        side_sign = 1.0 if sole_x > 0 else -1.0
        # A medially opposed, heavier hallux followed by four forward toes.
        # This wider plantar fan is intentionally unlike the long narrow hand.
        toe_rays = (
            (-side_sign * 0.034, -side_sign * 0.096, 0.112, 0.015, 0.052, 0.0150, 0.0047),
            (-side_sign * 0.013, -side_sign * 0.032, 0.137, 0.013, 0.057, 0.0130, 0.0042),
            (side_sign * 0.004, side_sign * 0.006, 0.154, 0.012, 0.061, 0.0127, 0.0040),
            (side_sign * 0.021, side_sign * 0.041, 0.144, 0.015, 0.058, 0.0118, 0.0038),
            (side_sign * 0.036, side_sign * 0.075, 0.121, 0.019, 0.052, 0.0105, 0.0035),
        )
        for index, (root_offset, spread, reach, low_z, tip_z, root_radius, tip_radius) in enumerate(toe_rays):
            root_x = sole_x + root_offset
            target_x = sole_x + spread
            points = (
                (root_x, -0.154 + 0.003 * (index % 2), 0.055 + 0.0015 * index),
                (root_x * 0.42 + target_x * 0.58, -0.154 - reach * 0.34, 0.037),
                (target_x, -0.154 - reach * 0.82, low_z),
                (sole_x + spread * 1.05, -0.154 - reach, tip_z),
            )
            details.append(add_tapered_digit(
                f"MonkeySpider_Toe.{side}.{index + 1}",
                points,
                root_radius,
                tip_radius,
                materials["skin"],
                length_segments=15,
                radial_segments=12,
            ))
    return details


def add_pinna(side: float, label: str, material: bpy.types.Material) -> bpy.types.Object:
    """Create a shallow elliptical pinna bowl with a raised antihelix rim."""
    radial_segments = 28
    rings = ((0.26, 0.088), (0.52, 0.091), (0.78, 0.095), (1.00, 0.083))
    vertices: List[Tuple[float, float, float]] = [(side * 0.087, -0.445, 0.862)]
    for radius, x_abs in rings:
        for index in range(radial_segments):
            angle = math.tau * index / radial_segments
            y = -0.445 + math.cos(angle) * 0.018 * radius
            z = 0.862 + math.sin(angle) * 0.025 * radius
            # A small posterior skew avoids a mechanically perfect disc.
            y += math.sin(angle * 2.0) * 0.0035 * radius
            vertices.append((side * x_abs, y, z))
    faces: List[Tuple[int, ...]] = []
    for index in range(radial_segments):
        nxt = (index + 1) % radial_segments
        faces.append((0, 1 + index, 1 + nxt) if side > 0 else (0, 1 + nxt, 1 + index))
    for ring in range(len(rings) - 1):
        inner = 1 + ring * radial_segments
        outer = inner + radial_segments
        for index in range(radial_segments):
            nxt = (index + 1) % radial_segments
            quad = (inner + index, outer + index, outer + nxt, inner + nxt)
            faces.append(quad if side > 0 else tuple(reversed(quad)))
    mesh = bpy.data.meshes.new(f"MonkeySpider_Pinna.{label}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"MonkeySpider_Pinna.{label}", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_almond_eye(side: float, label: str, material: bpy.types.Material) -> bpy.types.Object:
    """Create a recessed dark almond cornea, not a freestanding eyeball."""
    segments = 40
    rings = 5
    center_x = side * 0.039
    # The fused orbital surface sits at roughly -0.534 m; keeping the rim only
    # 1.5 mm forward of it leaves the cornea visibly recessed beneath the lids.
    center_y = -0.5298
    center_z = 0.846
    half_width = 0.0108
    half_height = 0.0048
    bulge = 0.00075
    vertices: List[Tuple[float, float, float]] = [(center_x, center_y - bulge, center_z)]
    for ring in range(1, rings + 1):
        radius = ring / rings
        for index in range(segments):
            angle = math.tau * index / segments
            local_x = half_width * radius * math.cos(angle)
            # Compress the lid opening vertically and lift the outer canthus a
            # fraction, producing an adult almond rather than a round bead.
            local_z = half_height * radius * math.sin(angle)
            local_z += 0.0011 * side * local_x / half_width
            outward = side * local_x / half_width
            y = center_y + 0.0022 * outward - bulge * (1.0 - radius * radius)
            vertices.append((center_x + local_x, y, center_z + local_z))
    faces: List[Tuple[int, ...]] = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + (index + 1) % segments))
    for ring in range(rings - 1):
        inner = 1 + ring * segments
        outer = inner + segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((inner + index, outer + index, outer + nxt, inner + nxt))
    mesh = bpy.data.meshes.new(f"MonkeySpider_AlmondEye.{label}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"MonkeySpider_AlmondEye.{label}", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_pupil_disk(side: float, label: str, material: bpy.types.Material) -> bpy.types.Object:
    """Lay a shallow pupil into the corneal surface without a bead silhouette."""
    segments = 28
    center_x = side * 0.039
    center_y = -0.53072
    center_z = 0.846
    half_width = 0.00165
    half_height = 0.00215
    vertices: List[Tuple[float, float, float]] = [(center_x, center_y, center_z)]
    for index in range(segments):
        angle = math.tau * index / segments
        local_x = half_width * math.cos(angle)
        local_z = half_height * math.sin(angle)
        # Follow the very shallow corneal curvature while remaining behind the
        # upper/lower lid rolls by more than two millimetres.
        outward = side * local_x / half_width
        y = center_y + 0.00035 * outward + 0.00008 * math.cos(angle * 2.0)
        vertices.append((center_x + local_x, y, center_z + local_z))
    faces = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + (index + 1) % segments))
    mesh = bpy.data.meshes.new(f"MonkeySpider_Pupil.{label}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"MonkeySpider_Pupil.{label}", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_catchlight_disk(side: float, label: str, material: bpy.types.Material) -> bpy.types.Object:
    """Add one sub-millimetre corneal glint, flush with the iris plane."""
    segments = 12
    center_x = side * 0.039 - side * 0.00235
    center_y = -0.53102
    center_z = 0.84755
    radius = 0.00038
    vertices: List[Tuple[float, float, float]] = [(center_x, center_y, center_z)]
    for index in range(segments):
        angle = math.tau * index / segments
        vertices.append((
            center_x + radius * math.cos(angle),
            center_y,
            center_z + radius * math.sin(angle),
        ))
    faces = [(0, 1 + index, 1 + (index + 1) % segments) for index in range(segments)]
    mesh = bpy.data.meshes.new(f"MonkeySpider_Catchlight.{label}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"MonkeySpider_Catchlight.{label}", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_lid_ribbon(
    side: float,
    label: str,
    upper: bool,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Model a tapered eyelid roll conforming to the curved orbital plane."""
    segments = 30
    center_x = side * 0.039
    half_width = 0.0118
    center_z = 0.846
    sign = 1.0 if upper else -1.0
    lid_height = 0.0067 if upper else 0.0054
    vertices: List[Tuple[float, float, float]] = []
    for index in range(segments + 1):
        t = -1.0 + 2.0 * index / segments
        arch = math.sqrt(max(0.0, 1.0 - t * t))
        local_x = half_width * t
        tilt = 0.0010 * side * local_x / half_width
        boundary_z = center_z + sign * lid_height * arch + tilt
        width = (0.0032 if upper else 0.0015) * arch
        outward = side * local_x / half_width
        inner_y = (-0.5335 if upper else -0.5325) + 0.0038 * outward
        vertices.append((center_x + local_x, inner_y, boundary_z))
        vertices.append((center_x + local_x, inner_y + 0.0014, boundary_z + sign * width))
    faces = []
    for index in range(segments):
        a = index * 2
        b = a + 1
        c = a + 3
        d = a + 2
        faces.append((a, b, c, d) if upper else (a, d, c, b))
    kind = "Upper" if upper else "Lower"
    mesh = bpy.data.meshes.new(f"MonkeySpider_{kind}Lid.{label}_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(f"MonkeySpider_{kind}Lid.{label}", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_face_details(materials: Dict[str, bpy.types.Material]) -> List[bpy.types.Object]:
    """Build small facial forms that are physically inset into the head.

    Every detail crosses the fused head surface by several millimetres before
    all meshes are joined into the hero object.  This gives the eyes a clean
    corneal highlight and the muzzle readable nostrils/lip definition without
    any visible air gap or camera-facing decal.
    """
    details: List[bpy.types.Object] = []

    # Small dark globes sit behind upper/lower lid rolls sculpted directly into
    # the continuous head. A separate matte pupil gives the warm-black iris
    # readable depth without introducing a pale sclera.
    for side, label in ((-1, "L"), (1, "R")):
        details.append(add_pinna(float(side), label, materials["skin"]))
        details.append(add_lid_ribbon(float(side), label, True, materials["skin"]))
        details.append(add_lid_ribbon(float(side), label, False, materials["skin"]))
        details.append(add_almond_eye(float(side), label, materials["eye"]))
        details.append(add_pupil_disk(float(side), label, materials["mouth"]))
        details.append(add_catchlight_disk(float(side), label, materials["catchlight"]))

        # Nostrils and lip are depressions in the welded muzzle with darkening
        # rasterized into the shared 2K maps; no floating bead is added here.
    return details


def join_face_details(body: bpy.types.Object, details: Sequence[bpy.types.Object]) -> bpy.types.Object:
    if not details:
        return body
    meshes: List[bpy.types.Object] = []
    for detail in details:
        if detail.type == "CURVE":
            select_only([detail])
            bpy.ops.object.convert(target="MESH")
        meshes.append(detail)
    select_only([body, *meshes])
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "MonkeySpider_ContinuousAnatomy"
    body.data.name = "MonkeySpider_HeroTopology"
    return body


def bone_specs() -> List[BoneSpec]:
    specs = [
        BoneSpec("MonkeyRoot", (0, 0, 0.02), (0, 0, 0.16), None, deform=False),
        BoneSpec("Pelvis", (0, 0.045, 0.575), (0, -0.030, 0.665), "MonkeyRoot"),
        BoneSpec("Spine", (0, -0.030, 0.665), (0, -0.165, 0.715), "Pelvis", True),
        BoneSpec("Chest", (0, -0.165, 0.715), (0, -0.285, 0.755), "Spine", True),
        BoneSpec("Neck", (0, -0.285, 0.755), (0, -0.385, 0.800), "Chest", True),
        BoneSpec("Head", (0, -0.385, 0.800), (0, -0.560, 0.850), "Neck", True),
    ]
    arms = {
        "L": ((0.120, -0.225, 0.745), (0.165, -0.250, 0.750), (0.235, -0.390, 0.455), (0.245, -0.535, 0.155), (0.245, -0.715, 0.065)),
        "R": ((-0.120, -0.225, 0.745), (-0.165, -0.250, 0.750), (-0.235, -0.390, 0.455), (-0.245, -0.535, 0.155), (-0.245, -0.715, 0.065)),
    }
    for side, (clavicle, shoulder, elbow, wrist, hand) in arms.items():
        specs += [
            BoneSpec(f"Shoulder.{side}", clavicle, shoulder, "Chest"),
            BoneSpec(f"UpperArm.{side}", shoulder, elbow, f"Shoulder.{side}"),
            BoneSpec(f"Forearm.{side}", elbow, wrist, f"UpperArm.{side}", True),
            BoneSpec(f"Hand.{side}", wrist, hand, f"Forearm.{side}", True),
        ]
    legs = {
        "L": ((0.105, 0.050, 0.645), (0.155, 0.165, 0.385), (0.145, -0.010, 0.120), (0.145, -0.245, 0.045)),
        "R": ((-0.105, 0.050, 0.645), (-0.155, 0.165, 0.385), (-0.145, -0.010, 0.120), (-0.145, -0.245, 0.045)),
    }
    for side, (hip, knee, ankle, toe) in legs.items():
        specs += [
            BoneSpec(f"Thigh.{side}", hip, knee, "Pelvis"),
            BoneSpec(f"Shin.{side}", knee, ankle, f"Thigh.{side}", True),
            BoneSpec(f"Foot.{side}", ankle, toe, f"Shin.{side}"),
        ]
    tail = [
        (0.0, 0.090, 0.635), (0.0, 0.285, 0.690), (0.025, 0.475, 0.790),
        (0.105, 0.620, 0.950), (0.205, 0.650, 1.160), (0.245, 0.545, 1.350),
        (0.205, 0.365, 1.485), (0.075, 0.250, 1.530), (-0.060, 0.270, 1.495),
    ]
    for index, (head, end) in enumerate(zip(tail, tail[1:])):
        specs.append(BoneSpec(f"Tail.{index:02d}", head, end, "Pelvis" if index == 0 else f"Tail.{index - 1:02d}", index > 0))
    return specs


def create_rig() -> bpy.types.Object:
    armature = bpy.data.armatures.new("MonkeySpider_Skeleton")
    rig = bpy.data.objects.new("MonkeySpider_Rig", armature)
    bpy.context.collection.objects.link(rig)
    select_only([rig])
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for spec in bone_specs():
        bone = armature.edit_bones.new(spec.name)
        bone.head, bone.tail = spec.head, spec.tail
        bone.use_deform = spec.deform
        if spec.parent:
            bone.parent = created[spec.parent]
            bone.use_connect = spec.connected
        created[spec.name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig["species"] = SPECIES_ID
    rig["authorship"] = "Original procedural source by Sloth in the City pipeline"
    return rig


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    delta = end - start
    if delta.length_squared < 1e-12:
        return (point - start).length
    t = max(0.0, min(1.0, (point - start).dot(delta) / delta.length_squared))
    return (point - (start + delta * t)).length


def skin_mesh(obj: bpy.types.Object, rig: bpy.types.Object) -> None:
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    deform_bones = [bone for bone in rig.data.bones if bone.use_deform]
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in deform_bones}
    segments = {bone.name: (bone.head_local.copy(), bone.tail_local.copy()) for bone in deform_bones}
    rigid_thresholds = {
        "Tail.07": 0.075,
    }
    for vertex in obj.data.vertices:
        point = vertex.co
        # The whole skull, facial surface, embedded corneas, inner ears and
        # mouth details share one transform. This is stronger than relying on
        # proximity and prevents even sub-pixel eye separation in animation.
        if point.y < -0.430 and point.z > 0.720:
            groups["Head"].add([vertex.index], 1.0, "REPLACE")
            continue
        rigid = min(
            ((name, point_segment_distance(point, *segments[name])) for name in rigid_thresholds),
            key=lambda pair: pair[1],
        )
        if rigid[1] < rigid_thresholds[rigid[0]]:
            groups[rigid[0]].add([vertex.index], 1.0, "REPLACE")
            continue
        distances = sorted(
            ((name, point_segment_distance(point, start, end)) for name, (start, end) in segments.items()),
            key=lambda pair: pair[1],
        )[:4]
        weighted = [(name, 1.0 / max(distance, 0.008) ** 2.5) for name, distance in distances]
        total = sum(value for _, value in weighted)
        for name, value in weighted:
            groups[name].add([vertex.index], value / total, "REPLACE")
    modifier = obj.modifiers.new("MonkeySpider_Skin", "ARMATURE")
    modifier.object = rig
    # glTF/Three.js uses linear blend skinning.  Contact normalization must be
    # measured against that same deformation model; Blender's dual-quaternion
    # "preserve volume" preview produced a false floor invariant that changed
    # after export/reimport.
    modifier.use_deform_preserve_volume = False
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def bind_rigid(obj: bpy.types.Object, rig: bpy.types.Object, bone_name: str) -> None:
    # Convert curves so all exported facial details share one robust binding path.
    if obj.type == "CURVE":
        select_only([obj])
        bpy.ops.object.convert(target="MESH")
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    group = obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1.0, "REPLACE")
    modifier = obj.modifiers.new("MonkeySpider_FacialBind", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def reset_pose(rig: bpy.types.Object) -> None:
    for pose_bone in rig.pose.bones:
        pose_bone.location = (0, 0, 0)
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.scale = (1, 1, 1)


def pose_keys(rig: bpy.types.Object, frame: int, values: Dict[str, Dict[str, Sequence[float]]], group: str) -> None:
    for bone_name, channels in values.items():
        bone = rig.pose.bones.get(bone_name)
        if not bone:
            continue
        for channel, value in channels.items():
            setattr(bone, channel, value)
            bone.keyframe_insert(channel, frame=frame, group=group)


def loop_action(
    rig: bpy.types.Object,
    name: str,
    frames: Sequence[Tuple[int, Dict[str, Dict[str, Sequence[float]]]]],
    end: int,
) -> bpy.types.Action:
    reset_pose(rig)
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, values in frames:
        pose_keys(rig, frame, values, name)
    # Ensure the root has a channel and clip duration even for stationary poses.
    root = rig.pose.bones["MonkeyRoot"]
    for frame in (1, end):
        root.location = (0, 0, 0)
        root.keyframe_insert("location", frame=frame, group=name)
    for fcurve in action.fcurves:
        for key in fcurve.keyframe_points:
            key.interpolation = "SINE"
    action.use_fake_user = True
    action["loop"] = True
    return action


def create_actions(rig: bpy.types.Object) -> List[bpy.types.Action]:
    def rot(x=0.0, y=0.0, z=0.0):
        return {"rotation_euler": (x, y, z)}

    def loc(x=0.0, y=0.0, z=0.0):
        return {"location": (x, y, z)}

    idle = loop_action(rig, "MonkeyIdle", [
        (1, {"Chest": {"scale": (1, 1, 1)}, "Head": rot(0, 0, -0.05), "Tail.03": rot(0.02, 0, -0.04), "Tail.06": rot(-0.03, 0.02, 0.03)}),
        (36, {"Chest": {"scale": (1.018, 1.018, 1.028)}, "Head": rot(0.035, -0.025, 0.06), "Tail.03": rot(-0.035, 0.035, 0.05), "Tail.06": rot(0.04, -0.02, -0.05)}),
        (72, {"Chest": {"scale": (1, 1, 1)}, "Head": rot(0, 0, -0.05), "Tail.03": rot(0.02, 0, -0.04), "Tail.06": rot(-0.03, 0.02, 0.03)}),
    ], 72)

    walk_frames = []
    for frame, phase in ((1, 0), (13, math.pi / 2), (25, math.pi), (37, math.pi * 1.5), (49, math.tau)):
        stride = math.sin(phase) * 0.36
        lift = abs(math.sin(phase)) * 0.022
        walk_frames.append((frame, {
            "Pelvis": {"location": (0, 0, lift), "rotation_euler": (0.025 * math.sin(phase * 2), 0, -0.045 * math.sin(phase))},
            "UpperArm.L": rot(stride, 0, 0.04), "UpperArm.R": rot(-stride, 0, -0.04),
            "Forearm.L": rot(-0.18 - max(0, -stride) * 0.55), "Forearm.R": rot(-0.18 - max(0, stride) * 0.55),
            "Thigh.L": rot(-stride * 0.80), "Thigh.R": rot(stride * 0.80),
            "Shin.L": rot(0.20 + max(0, stride) * 0.72), "Shin.R": rot(0.20 + max(0, -stride) * 0.72),
            "Foot.L": rot(-0.12 + max(0, stride) * 0.32), "Foot.R": rot(-0.12 + max(0, -stride) * 0.32),
            "Tail.01": rot(0, 0, -stride * 0.16), "Tail.04": rot(0, 0, stride * 0.22),
            "Head": rot(0, 0, -stride * 0.06),
        }))
    walk = loop_action(rig, "MonkeyWalk", walk_frames, 49)

    perch_pose = {
        "Pelvis": {"location": (0, 0, -0.08), "rotation_euler": (0.12, 0, 0)},
        "Spine": rot(-0.18), "Chest": rot(-0.12), "Head": rot(0.22, 0, 0),
        "UpperArm.L": rot(-0.36, 0, 0.16), "UpperArm.R": rot(-0.36, 0, -0.16),
        "Forearm.L": rot(-0.70), "Forearm.R": rot(-0.70),
        "Thigh.L": rot(-0.92, 0.05, 0.10), "Thigh.R": rot(-0.92, -0.05, -0.10),
        "Shin.L": rot(1.18), "Shin.R": rot(1.18), "Foot.L": rot(-0.45), "Foot.R": rot(-0.45),
        "Tail.01": rot(0.10, 0.05, 0.10), "Tail.04": rot(-0.08, 0.04, -0.10),
    }
    perch_mid = dict(perch_pose)
    perch_mid["Head"] = rot(0.20, -0.08, 0.11)
    perch_mid["Chest"] = {"rotation_euler": (-0.12, 0, 0), "scale": (1.015, 1.015, 1.025)}
    perch = loop_action(rig, "MonkeyPerch", [(1, perch_pose), (45, perch_mid), (90, perch_pose)], 90)

    climb_frames = []
    for frame, phase in ((1, 0), (16, math.pi / 2), (31, math.pi), (46, math.pi * 1.5), (61, math.tau)):
        reach = math.sin(phase) * 0.58
        climb_frames.append((frame, {
            "Pelvis": {"location": (0, 0, abs(math.sin(phase)) * 0.035), "rotation_euler": (-0.28, 0, 0)},
            "Spine": rot(-0.28), "Chest": rot(-0.22), "Head": rot(0.32, 0, -reach * 0.06),
            "UpperArm.L": rot(-0.82 + reach, 0, 0.10), "UpperArm.R": rot(-0.82 - reach, 0, -0.10),
            "Forearm.L": rot(-0.30 - max(0, -reach) * 0.46), "Forearm.R": rot(-0.30 - max(0, reach) * 0.46),
            "Thigh.L": rot(-0.30 - reach * 0.34), "Thigh.R": rot(-0.30 + reach * 0.34),
            "Shin.L": rot(0.58 + max(0, reach) * 0.55), "Shin.R": rot(0.58 + max(0, -reach) * 0.55),
            "Tail.02": rot(0, reach * 0.08, -reach * 0.20), "Tail.05": rot(0, -reach * 0.08, reach * 0.22),
        }))
    climb = loop_action(rig, "MonkeyClimb", climb_frames, 61)

    swing_frames = []
    for frame, phase in ((1, 0), (16, math.pi / 2), (31, math.pi), (46, math.pi * 1.5), (61, math.tau)):
        arc = math.sin(phase)
        swing_frames.append((frame, {
            "MonkeyRoot": {"location": (0, 0, 0.035 * (1 - math.cos(phase))), "rotation_euler": (0, arc * 0.035, 0)},
            "Pelvis": {"location": (0, 0, -0.018 * abs(arc)), "rotation_euler": (arc * 0.34, 0, 0)},
            "Spine": rot(arc * 0.20), "Chest": rot(-0.24 + arc * 0.14), "Head": rot(0.22 - arc * 0.10),
            "UpperArm.L": rot(-1.80, -0.06, 0.10), "UpperArm.R": rot(-1.80, 0.06, -0.10),
            "Forearm.L": rot(-0.16), "Forearm.R": rot(-0.16),
            # Both knees tuck toward the abdomen at the middle of the arc,
            # retaining asymmetric momentum without rubbery straight legs.
            "Thigh.L": rot(-0.82 - abs(arc) * 0.32 - arc * 0.10, 0, 0.16),
            "Thigh.R": rot(-0.82 - abs(arc) * 0.32 + arc * 0.10, 0, -0.16),
            "Shin.L": rot(1.68 + abs(arc) * 0.42 + arc * 0.10),
            "Shin.R": rot(1.68 + abs(arc) * 0.42 - arc * 0.10),
            "Foot.L": rot(-0.58 + arc * 0.08), "Foot.R": rot(-0.58 - arc * 0.08),
            "Tail.00": rot(-arc * 0.18, 0, -arc * 0.22), "Tail.03": rot(arc * 0.12, 0, arc * 0.30),
            "Tail.06": rot(-arc * 0.10, 0, -arc * 0.22),
        }))
    swing = loop_action(rig, "MonkeySwing", swing_frames, 61)
    reset_pose(rig)
    return [idle, walk, perch, climb, swing]


def evaluated_mesh_min_z(body: bpy.types.Object) -> float:
    """Measure the skinned hero surface in world space at the current frame."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        return min((matrix @ vertex.co).z for vertex in mesh.vertices)
    finally:
        evaluated.to_mesh_clear()


def contact_vertex_indices(body: bpy.types.Object) -> Dict[str, List[int]]:
    """Select the four authored palmar/plantar contact volumes in bind space."""
    groups: Dict[str, List[int]] = {name: [] for name in ("Hand.L", "Hand.R", "Foot.L", "Foot.R")}
    for vertex in body.data.vertices:
        point = vertex.co
        if point.y < -0.525 and point.z < 0.190 and abs(point.x) > 0.145:
            groups["Hand.L" if point.x > 0 else "Hand.R"].append(vertex.index)
        elif -0.355 < point.y < -0.055 and point.z < 0.165 and abs(point.x) > 0.045:
            groups["Foot.L" if point.x > 0 else "Foot.R"].append(vertex.index)
    if any(not indices for indices in groups.values()):
        raise RuntimeError(f"Incomplete contact vertex classification: { {name: len(values) for name, values in groups.items()} }")
    return groups


def evaluated_subset_min_z(body: bpy.types.Object, indices: Sequence[int]) -> float:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        return min((matrix @ mesh.vertices[index].co).z for index in indices)
    finally:
        evaluated.to_mesh_clear()


def pose_location_vertical_gradient(rig: bpy.types.Object, bone_name: str, epsilon: float = 0.01) -> Vector:
    """Numerically map a pose bone's local translation axes to world vertical."""
    bone = rig.pose.bones[bone_name]
    frame = bpy.context.scene.frame_current
    base_location = bone.location.copy()
    base_height = (rig.matrix_world @ bone.matrix.translation).z
    gradient = Vector((0.0, 0.0, 0.0))
    for axis in range(3):
        perturbed = base_location.copy()
        perturbed[axis] += epsilon
        bone.location = perturbed
        bone.keyframe_insert("location", frame=frame)
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        gradient[axis] = ((rig.matrix_world @ bone.matrix.translation).z - base_height) / epsilon
    bone.location = base_location
    bone.keyframe_insert("location", frame=frame)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return gradient


def author_ground_contacts(
    body: bpy.types.Object,
    rig: bpy.types.Object,
    actions: Sequence[bpy.types.Action],
    contact_groups: Dict[str, List[int]],
    ground_z: float = 0.010,
) -> Dict[str, object]:
    """Plant anatomical palms/soles in idle and alternating walk support.

    Distal pose-bone translations are solved in each bone's local coordinate
    system from the evaluated skinned surface. At least one diagonal pair
    carries weight in walk while the opposite pair clears the floor; neutral
    crossover frames settle all four contacts before the pair changes.
    """
    action_by_name = {action.name: action for action in actions}
    target_bones = ("Hand.L", "Hand.R", "Foot.L", "Foot.R")
    controllers = {
        "Hand.L": "Shoulder.L",
        "Hand.R": "Shoulder.R",
        "Foot.L": "Thigh.L",
        "Foot.R": "Thigh.R",
    }
    report: Dict[str, object] = {}
    for action_name in ("MonkeyIdle", "MonkeyWalk"):
        action = action_by_name[action_name]
        start, end = (int(round(value)) for value in action.frame_range)
        rig.animation_data.action = action
        reset_pose(rig)

        # Establish a complete zero baseline first; otherwise adding keys in
        # chronological order makes later frames inherit the previous solve.
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            for bone_name in target_bones:
                bone = rig.pose.bones[controllers[bone_name]]
                bone.location = (0.0, 0.0, 0.0)
                bone.keyframe_insert("location", frame=frame, group=action.name)

        extrema: Dict[str, List[float]] = {name: [] for name in target_bones}
        maximum_translation = 0.0
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            phase = math.tau * (frame - start) / max(1, end - start)
            stride = math.sin(phase)
            swing_lift = 0.062 * abs(stride)
            if action_name == "MonkeyIdle" or abs(stride) < 0.075:
                supports = set(target_bones)
            elif stride > 0:
                supports = {"Hand.L", "Foot.R"}
            else:
                supports = {"Hand.R", "Foot.L"}

            # Support contacts solve first; the contralateral pair then lifts
            # without disturbing them because left/right distal weights do not
            # overlap.
            for bone_name in target_bones:
                target = ground_z if bone_name in supports else ground_z + swing_lift
                controller_name = controllers[bone_name]
                bone = rig.pose.bones[controller_name]
                current = evaluated_subset_min_z(body, contact_groups[bone_name])
                # Preserve any naturally higher swing arc from the authored
                # joint rotations; only lift a swing limb if it would scuff.
                if bone_name not in supports and current >= target:
                    bone.keyframe_insert("location", frame=frame, group=action.name)
                    extrema[bone_name].append(current)
                    continue
                gradient = pose_location_vertical_gradient(rig, controller_name)
                if gradient.length_squared < 1e-6:
                    raise RuntimeError(f"Cannot solve vertical contact for {bone_name}")
                for _ in range(3):
                    current = evaluated_subset_min_z(body, contact_groups[bone_name])
                    error = target - current
                    if abs(error) < 0.0002:
                        break
                    bone.location = bone.location + gradient * (error / gradient.length_squared)
                    bone.keyframe_insert("location", frame=frame, group=action.name)
                    bpy.context.scene.frame_set(frame)
                    bpy.context.view_layer.update()
                if bone.location.length > 0.175:
                    raise RuntimeError(
                        f"{action_name}/{bone_name}@{frame} required implausible "
                        f"{bone.location.length:.3f} m distal translation"
                    )
                bone.keyframe_insert("location", frame=frame, group=action.name)
                maximum_translation = max(maximum_translation, bone.location.length)
                extrema[bone_name].append(evaluated_subset_min_z(body, contact_groups[bone_name]))

        for fcurve in action.fcurves:
            if any(f'pose.bones["{bone_name}"].location' == fcurve.data_path for bone_name in controllers.values()):
                for key in fcurve.keyframe_points:
                    key.interpolation = "LINEAR"
        report[action_name] = {
            "groundZ": ground_z,
            "maximumDistalTranslationMeters": round(maximum_translation, 6),
            "extremityMinima": {
                name: {"min": round(min(values), 6), "max": round(max(values), 6)}
                for name, values in extrema.items()
            },
        }
    return report


def normalize_action_contact_planes(
    body: bpy.types.Object,
    rig: bpy.types.Object,
    actions: Sequence[bpy.types.Action],
    contact_indices: Sequence[int],
    target_z: float = -0.007,
) -> Dict[str, Dict[str, float]]:
    """Give every clip one invariant lowest contact plane.

    The runtime measures an asset once in its default locomotion clip and then
    swaps animations in place.  If a crouch or support clip has a different
    lowest vertex, hands and feet can consequently pass through the showroom
    floor.  Sampling the *evaluated skinned mesh* (rather than estimating from
    bones) and writing a root correction at every exported frame keeps all
    modeled hooked digits above the exact same plane without altering their
    authored relative motion.
    """
    scene = bpy.context.scene
    rig.animation_data_create()
    report: Dict[str, Dict[str, float]] = {}
    for action in actions:
        start = int(round(action.frame_range[0]))
        end = int(round(action.frame_range[1]))
        samples: List[Tuple[int, Vector, float]] = []
        rig.animation_data.action = action
        reset_pose(rig)
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            root_location = rig.pose.bones["MonkeyRoot"].location.copy()
            samples.append((frame, root_location, evaluated_subset_min_z(body, contact_indices)))

        root = rig.pose.bones["MonkeyRoot"]
        for frame, root_location, minimum_z in samples:
            scene.frame_set(frame)
            # MonkeyRoot is authored along Blender +Z, so its pose-local +Y
            # axis is the armature's world-space vertical translation axis.
            root.location = root_location + Vector((0.0, target_z - minimum_z, 0.0))
            root.keyframe_insert("location", frame=frame, group=action.name)

        # Every frame is explicitly sampled for export, so linear interpolation
        # preserves the correction instead of letting SINE handles overshoot.
        root_path = 'pose.bones["MonkeyRoot"].location'
        for fcurve in action.fcurves:
            if fcurve.data_path == root_path:
                for key in fcurve.keyframe_points:
                    key.interpolation = "LINEAR"

        post_samples: List[float] = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            post_samples.append(evaluated_subset_min_z(body, contact_indices))
        maximum_error = max(abs(value - target_z) for value in post_samples)
        if maximum_error > 0.00025:
            raise RuntimeError(
                f"{action.name} contact plane drifted by {maximum_error:.6f} m "
                f"after source normalization"
            )
        report[action.name] = {
            "targetMinZ": round(target_z, 6),
            "evaluatedMinZ": round(min(post_samples), 6),
            "evaluatedMaxZ": round(max(post_samples), 6),
            "maximumErrorMeters": round(maximum_error, 8),
            "sampledFrames": len(post_samples),
        }

    reset_pose(rig)
    rig.animation_data.action = actions[0]
    scene.frame_set(int(actions[0].frame_range[0]))
    return report


def install_nla(rig: bpy.types.Object, actions: Sequence[bpy.types.Action]) -> None:
    rig.animation_data_create()
    rig.animation_data.action = None
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def export_glb(path: Path, objects: Sequence[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    select_only(objects)
    kwargs = dict(
        filepath=str(path.resolve()),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_colors=True,
        export_cameras=False,
        export_lights=False,
        export_skins=True,
        export_all_influences=False,
        export_animations=True,
        export_frame_range=False,
        export_frame_step=1,
        export_nla_strips=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        for optional in ("export_force_sampling", "export_optimize_animation_size", "export_nla_strips", "export_tangents"):
            kwargs.pop(optional, None)
        bpy.ops.export_scene.gltf(**kwargs)


def calibrate_root_from_fresh_import(
    path: Path,
    rig: bpy.types.Object,
    actions: Sequence[bpy.types.Action],
) -> Dict[str, object]:
    """Calibrate source root channels against the actual glTF skin result.

    Blender source evaluation and glTF/Three linear skinning can choose a
    different lowest vertex in aggressive climb/swing poses.  A throwaway
    fresh import measures the exact exported full-mesh bounds, then feeds only
    the residual vertical error back into the editable MonkeyRoot channel.
    The GLB is immediately re-exported after this function; no imported data is
    retained in the source blend.
    """
    scene = bpy.context.scene
    scene.render.fps = FPS
    tracked = {
        "objects": set(bpy.data.objects),
        "collections": set(bpy.data.collections),
        "meshes": set(bpy.data.meshes),
        "armatures": set(bpy.data.armatures),
        "materials": set(bpy.data.materials),
        "images": set(bpy.data.images),
        "actions": set(bpy.data.actions),
    }
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    imported_objects = [obj for obj in bpy.data.objects if obj not in tracked["objects"]]
    imported_rigs = [obj for obj in imported_objects if obj.type == "ARMATURE"]
    imported_meshes = [obj for obj in imported_objects if obj.type == "MESH"]
    imported_actions = [action for action in bpy.data.actions if action not in tracked["actions"]]
    if len(imported_rigs) != 1 or len(imported_meshes) != 1:
        raise RuntimeError(
            f"Calibration import expected one mesh/rig, found {len(imported_meshes)}/{len(imported_rigs)}"
        )
    imported_rig = imported_rigs[0]
    imported_mesh = imported_meshes[0]
    imported_rig.animation_data_create()
    measurements: Dict[str, List[Tuple[int, float]]] = {}
    for source_action in actions:
        matches = [
            action for action in imported_actions
            if action.name == source_action.name
            or action.name.startswith(f"{source_action.name}.")
            or action.name.startswith(f"{source_action.name}_")
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Calibration import expected one {source_action.name} action, found {[item.name for item in matches]}; "
                f"all imported actions={[item.name for item in imported_actions]}"
            )
        imported_rig.animation_data.action = matches[0]
        start, end = (int(round(value)) for value in matches[0].frame_range)
        samples: List[Tuple[int, float]] = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            samples.append((frame, evaluated_mesh_min_z(imported_mesh)))
        measurements[source_action.name] = samples

    # Match runtime's default walk normalization, then hold that same full-mesh
    # floor for every frame of every support/locomotion clip.
    target_z = measurements["MonkeyWalk"][0][1]
    residuals = {
        name: [(frame, target_z - minimum) for frame, minimum in samples]
        for name, samples in measurements.items()
    }

    # Remove every throwaway import datablock before touching the authored rig.
    for obj in imported_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in imported_actions:
        if action.users == 0:
            bpy.data.actions.remove(action)
    for key, collection in (
        ("collections", bpy.data.collections),
        ("meshes", bpy.data.meshes),
        ("armatures", bpy.data.armatures),
        ("materials", bpy.data.materials),
        ("images", bpy.data.images),
    ):
        for datablock in list(collection):
            if datablock not in tracked[key] and datablock.users == 0:
                collection.remove(datablock)

    action_by_name = {action.name: action for action in actions}
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action = None
    root_path = 'pose.bones["MonkeyRoot"].location'
    for name, samples in residuals.items():
        action = action_by_name[name]
        rig.animation_data.action = action
        root = rig.pose.bones["MonkeyRoot"]
        for frame, residual in samples:
            scene.frame_set(frame)
            root.location = root.location + Vector((0.0, residual, 0.0))
            root.keyframe_insert("location", frame=frame, group=action.name)
        for fcurve in action.fcurves:
            if fcurve.data_path == root_path:
                for key in fcurve.keyframe_points:
                    key.interpolation = "LINEAR"

    reset_pose(rig)
    rig.animation_data.action = actions[0]
    scene.frame_set(int(actions[0].frame_range[0]))
    return {
        "targetImportedMinZ": round(target_z, 6),
        "maximumResidualMeters": round(
            max(abs(value) for samples in residuals.values() for _, value in samples), 6
        ),
        "sampledFrames": sum(len(samples) for samples in residuals.values()),
        "method": "fresh GLB reimport full-mesh residual written to MonkeyRoot",
    }


def duplicate_for_lod(body: bpy.types.Object, details: Sequence[bpy.types.Object], rig: bpy.types.Object) -> Tuple[bpy.types.Object, List[bpy.types.Object], bpy.types.Object]:
    # The final LOD is made from a self-contained scene duplicate so glTF gets
    # valid skin bindings and the same clip names.
    body_lod = body.copy()
    body_lod.data = body.data.copy()
    body_lod.name = "MonkeySpider_ContinuousAnatomy_LOD2"
    bpy.context.collection.objects.link(body_lod)
    for modifier in list(body_lod.modifiers):
        body_lod.modifiers.remove(modifier)
    decimate = body_lod.modifiers.new("LOD2_QuadricDecimation", "DECIMATE")
    decimate.ratio = 0.24
    decimate.use_collapse_triangulate = True
    select_only([body_lod])
    bpy.context.view_layer.objects.active = body_lod
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Reuse the same rig for both sequential exports. It is not modified by
    # mesh decimation, and all named vertex groups survive the operation.
    modifier = body_lod.modifiers.new("MonkeySpider_Skin_LOD2", "ARMATURE")
    modifier.object = rig
    body_lod.parent = rig
    body_lod.matrix_parent_inverse = rig.matrix_world.inverted()
    lod_details = []
    for detail in details[:2]:  # hero eyes remain; nostrils/mouth are baked out at distance
        clone = detail.copy()
        clone.data = detail.data.copy()
        clone.name = detail.name + "_LOD2"
        bpy.context.collection.objects.link(clone)
        for modifier in list(clone.modifiers):
            clone.modifiers.remove(modifier)
        bind_rigid(clone, rig, "Head")
        lod_details.append(clone)
    return body_lod, lod_details, rig


def setup_preview_scene() -> Tuple[bpy.types.Object, List[bpy.types.Object]]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 3
    scene.eevee.gtao_factor = 1.35
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.film_transparent = False
    scene.world.color = (0.025, 0.035, 0.030)

    bpy.ops.object.light_add(type="AREA", location=(-3.0, -4.0, 5.0))
    key = bpy.context.object
    key.name = "Preview_Key"
    key.data.energy = 850
    key.data.size = 4.0
    key.data.color = (1.0, 0.97, 0.92)
    key.rotation_euler = (math.radians(25), 0, math.radians(-25))
    bpy.ops.object.light_add(type="AREA", location=(3.5, 1.8, 3.0))
    rim = bpy.context.object
    rim.name = "Preview_Rim"
    rim.data.energy = 720
    rim.data.size = 3.0
    rim.data.color = (0.62, 0.72, 0.78)
    bpy.ops.object.light_add(type="AREA", location=(0, -2.5, 1.2))
    fill = bpy.context.object
    fill.name = "Preview_Fill"
    fill.data.energy = 260
    fill.data.size = 2.0
    fill.data.color = (0.82, 0.88, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(-1.35, -1.35, 1.35))
    face_rake = bpy.context.object
    face_rake.name = "Preview_FaceRake"
    face_rake.data.energy = 0
    face_rake.data.size = 1.1
    face_rake.data.color = (1.0, 0.96, 0.90)
    face_rake.rotation_euler = (Vector((0.0, -0.49, 0.84)) - face_rake.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.012))
    floor = bpy.context.object
    floor.name = "Preview_Ground"
    floor_mat = bpy.data.materials.new("Preview_Ground_Material")
    node = principled(floor_mat)
    node.inputs["Base Color"].default_value = (0.055, 0.085, 0.060, 1)
    node.inputs["Roughness"].default_value = 0.92
    floor.data.materials.append(floor_mat)

    branch_mat = bpy.data.materials.new("Preview_Branch_Material")
    node = principled(branch_mat)
    node.inputs["Base Color"].default_value = (0.090, 0.035, 0.014, 1)
    node.inputs["Roughness"].default_value = 0.94
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.052, depth=1.4, location=(0, -0.86, 1.31), rotation=(0, math.pi / 2, 0))
    horizontal_branch = bpy.context.object
    horizontal_branch.name = "Preview_HorizontalContactBranch"
    horizontal_branch.data.materials.append(branch_mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.065, depth=1.7, location=(0, -1.00, 0.76))
    vertical_branch = bpy.context.object
    vertical_branch.name = "Preview_VerticalContactTrunk"
    vertical_branch.data.materials.append(branch_mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.052, depth=1.4, location=(0, -0.278, 0.074), rotation=(0, math.pi / 2, 0))
    foot_branch = bpy.context.object
    foot_branch.name = "Preview_PerchFootBranch"
    foot_branch.data.materials.append(branch_mat)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20,
        radius=0.040,
        depth=1.00,
        location=(0, 0, 0.9),
        rotation=(math.pi / 2, 0, math.radians(12)),
    )
    tail_support = bpy.context.object
    tail_support.name = "Preview_TailContactBranch"
    tail_support.data.materials.append(branch_mat)
    horizontal_branch.hide_render = True
    vertical_branch.hide_render = True
    foot_branch.hide_render = True
    tail_support.hide_render = True

    bpy.ops.object.camera_add(location=(2.45, -3.65, 1.55))
    camera = bpy.context.object
    camera.name = "Preview_Camera"
    scene.camera = camera
    camera.location = (3.15, -1.85, 1.30)
    camera.data.lens = 62
    target = Vector((0, -0.05, 0.78))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    return camera, [key, rim, fill, face_rake, floor, horizontal_branch, vertical_branch, foot_branch, tail_support]


def render_previews(directory: Path, rig: bpy.types.Object, actions: Sequence[bpy.types.Action], helpers: Sequence[bpy.types.Object]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    rig.animation_data_clear()
    rig.animation_data_create()
    frame_for_action = {"MonkeyIdle": 36, "MonkeyWalk": 1, "MonkeyPerch": 45, "MonkeyClimb": 1, "MonkeySwing": 16}
    horizontal_branch = bpy.data.objects.get("Preview_HorizontalContactBranch")
    vertical_branch = bpy.data.objects.get("Preview_VerticalContactTrunk")
    foot_branch = bpy.data.objects.get("Preview_PerchFootBranch")
    tail_support = bpy.data.objects.get("Preview_TailContactBranch")
    face_rake = bpy.data.objects.get("Preview_FaceRake")
    for action in actions:
        if horizontal_branch:
            horizontal_branch.hide_render = action.name not in {"MonkeyPerch", "MonkeySwing"}
        if vertical_branch:
            vertical_branch.hide_render = action.name != "MonkeyClimb"
        if foot_branch:
            foot_branch.hide_render = action.name != "MonkeyPerch"
        if tail_support:
            tail_support.hide_render = action.name != "MonkeySwing"
        if face_rake:
            face_rake.data.energy = 0
        reset_pose(rig)
        rig.animation_data.action = action
        bpy.context.scene.frame_set(frame_for_action[action.name])
        bpy.context.view_layer.update()
        hand_tails = [rig.matrix_world @ rig.pose.bones[name].tail for name in ("Hand.L", "Hand.R")]
        hand_center = sum(hand_tails, Vector((0.0, 0.0, 0.0))) / 2.0
        if horizontal_branch and action.name in {"MonkeyPerch", "MonkeySwing"}:
            # Raise the bark centerline into the hooked digit arc. This keeps
            # fingertips occluded by/wrapped around the cylinder instead of
            # reading as disconnected spikes piercing through its crown.
            horizontal_branch.location = hand_center + Vector((0.0, 0.0, 0.028))
        if vertical_branch and action.name == "MonkeyClimb":
            vertical_branch.location.x = hand_center.x
            vertical_branch.location.y = hand_center.y
        if foot_branch and action.name == "MonkeyPerch":
            foot_tails = [rig.matrix_world @ rig.pose.bones[name].tail for name in ("Foot.L", "Foot.R")]
            foot_branch.location = sum(foot_tails, Vector((0.0, 0.0, 0.0))) / 2.0 + Vector((0.0, 0.0, 0.018))
        if tail_support and action.name == "MonkeySwing":
            tail_hook = rig.matrix_world @ rig.pose.bones["Tail.07"].head
            tail_support.location = (tail_hook.x, tail_hook.y, tail_hook.z - 0.018)
        bpy.context.scene.render.filepath = str((directory / f"monkey-{action.name.removeprefix('Monkey').lower()}.png").resolve())
        bpy.ops.render.render(write_still=True)

    camera = bpy.context.scene.camera
    if camera:
        # Neutral frontal facial review: the adult brow, recessed almond eyes,
        # zygomatic plane, projected muzzle and dark bare-face transition must
        # remain legible without theatrical colour lighting.
        if horizontal_branch:
            horizontal_branch.hide_render = True
        if vertical_branch:
            vertical_branch.hide_render = True
        if foot_branch:
            foot_branch.hide_render = True
        if tail_support:
            tail_support.hide_render = True
        if face_rake:
            face_rake.data.energy = 180
        reset_pose(rig)
        rig.animation_data.action = next(action for action in actions if action.name == "MonkeyIdle")
        bpy.context.scene.frame_set(36)
        camera.location = (0.13, -1.23, 0.965)
        target = Vector((0, -0.52, 0.825))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = 88
        bpy.context.scene.render.filepath = str((directory / "monkey-face-closeup.png").resolve())
        bpy.ops.render.render(write_still=True)

        # Neutral three-quarter profile is a separate acceptance view so
        # forehead slope, muzzle projection, chin and tucked pinna can be read
        # in silhouette instead of hidden by the frontal camera.
        camera.location = (0.58, -1.10, 0.965)
        target = Vector((0, -0.49, 0.825))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = 90
        bpy.context.scene.render.filepath = str((directory / "monkey-face-three-quarter.png").resolve())
        bpy.ops.render.render(write_still=True)

        # Clip-by-clip production gate.  These neutral contact views make the
        # common ground/support plane, all four extremities, hooked fingers and
        # grasping toes reviewable without relying on a flattering hero angle.
        contact_cameras = {
            "MonkeyIdle": ((1.02, -1.48, 0.37), (0.0, -0.43, 0.105), 73),
            "MonkeyWalk": ((1.02, -1.48, 0.37), (0.0, -0.43, 0.105), 73),
            "MonkeyPerch": ((1.40, -2.00, 0.74), (0.0, -0.56, 0.56), 72),
            "MonkeyClimb": ((1.32, -1.83, 0.78), (0.0, -0.79, 0.68), 76),
            "MonkeySwing": ((1.12, -1.80, 1.38), (0.0, -0.90, 1.18), 82),
        }
        for action in actions:
            reset_pose(rig)
            rig.animation_data.action = action
            bpy.context.scene.frame_set(frame_for_action[action.name])
            bpy.context.view_layer.update()
            if face_rake:
                face_rake.data.energy = 0
            if horizontal_branch:
                horizontal_branch.hide_render = action.name not in {"MonkeyPerch", "MonkeySwing"}
            if vertical_branch:
                vertical_branch.hide_render = action.name != "MonkeyClimb"
            if foot_branch:
                foot_branch.hide_render = action.name != "MonkeyPerch"
            if tail_support:
                tail_support.hide_render = action.name != "MonkeySwing"

            hand_tails = [rig.matrix_world @ rig.pose.bones[name].tail for name in ("Hand.L", "Hand.R")]
            foot_tails = [rig.matrix_world @ rig.pose.bones[name].tail for name in ("Foot.L", "Foot.R")]
            hand_center = sum(hand_tails, Vector((0.0, 0.0, 0.0))) / 2.0
            foot_center = sum(foot_tails, Vector((0.0, 0.0, 0.0))) / 2.0
            if horizontal_branch and action.name in {"MonkeyPerch", "MonkeySwing"}:
                horizontal_branch.location = hand_center + Vector((0.0, 0.0, 0.028))
            if foot_branch and action.name == "MonkeyPerch":
                foot_branch.location = foot_center + Vector((0.0, 0.0, 0.018))
            if vertical_branch and action.name == "MonkeyClimb":
                vertical_branch.location.x = hand_center.x
                vertical_branch.location.y = hand_center.y
            if tail_support and action.name == "MonkeySwing":
                tail_hook = rig.matrix_world @ rig.pose.bones["Tail.07"].head
                tail_support.location = (tail_hook.x, tail_hook.y, tail_hook.z - 0.018)

            location, default_target, lens = contact_cameras[action.name]
            target = Vector(default_target)
            if action.name == "MonkeyPerch":
                target = (hand_center + foot_center) / 2.0
            elif action.name == "MonkeyClimb":
                target = (hand_center + foot_center) / 2.0
            elif action.name == "MonkeySwing":
                target = hand_center
            camera.location = location
            camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
            camera.data.lens = lens
            clip = action.name.removeprefix("Monkey").lower()
            bpy.context.scene.render.filepath = str((directory / f"monkey-{clip}-contact-closeup.png").resolve())
            bpy.ops.render.render(write_still=True)

        # Preserve the legacy path while upgrading it to the validated swing
        # contact frame referenced by existing review notes.
        source = directory / "monkey-swing-contact-closeup.png"
        legacy = directory / "monkey-hand-contact-closeup.png"
        if source.exists():
            legacy.write_bytes(source.read_bytes())
    # Leave the editable .blend in a deterministic, grounded idle rather than
    # evaluating all NLA tracks simultaneously. The export already happened.
    rig.animation_data_clear()
    rig.animation_data_create()
    reset_pose(rig)
    rig.animation_data.action = actions[0]
    bpy.context.scene.frame_set(1)
    for helper in helpers:
        helper.hide_render = True


def authored_support_anchor_contract(
    rig: bpy.types.Object,
    actions: Sequence[bpy.types.Action],
) -> Dict[str, object]:
    """Report preview-tested perch/swing supports in runtime glTF coordinates."""
    action_by_name = {action.name: action for action in actions}

    def gltf_point(point: Vector) -> List[float]:
        # Blender Z-up -> glTF/Three Y-up, matching export_yup=True.
        return [round(point.x, 6), round(point.z, 6), round(-point.y, 6)]

    def evaluated_point(bone_name: str, endpoint: str) -> Vector:
        bone = rig.pose.bones[bone_name]
        return rig.matrix_world @ (bone.head if endpoint == "head" else bone.tail)

    def cylinder(
        center: Vector,
        axis: Vector,
        length: float,
        radius: float,
        contacts: Dict[str, Vector],
    ) -> Dict[str, object]:
        direction = axis.normalized()
        return {
            "center": gltf_point(center),
            "endpointA": gltf_point(center - direction * (length * 0.5)),
            "endpointB": gltf_point(center + direction * (length * 0.5)),
            "length": length,
            "radius": radius,
            "contactPoints": {name: gltf_point(point) for name, point in contacts.items()},
        }

    rig.animation_data_clear()
    rig.animation_data_create()
    result: Dict[str, object] = {
        "coordinateSystem": {"unit": "meter", "up": "+Y", "forward": "+Z"},
        "supportSemantics": "Finite cylinders; endpoints are centerline endpoints and radius is radial clearance.",
    }

    reset_pose(rig)
    rig.animation_data.action = action_by_name["MonkeyPerch"]
    bpy.context.scene.frame_set(45)
    bpy.context.view_layer.update()
    perch_hands = {name: evaluated_point(name, "tail") for name in ("Hand.L", "Hand.R")}
    perch_feet = {name: evaluated_point(name, "tail") for name in ("Foot.L", "Foot.R")}
    hand_center = sum(perch_hands.values(), Vector((0.0, 0.0, 0.0))) / len(perch_hands)
    foot_center = sum(perch_feet.values(), Vector((0.0, 0.0, 0.0))) / len(perch_feet)
    # Match the support cylinders used in the review renders.  The small lift
    # puts the branch surface over the digit tips so the silhouette reads as a
    # wrapped grip rather than disconnected claws piercing the support.
    hand_center += Vector((0.0, 0.0, 0.028))
    foot_center += Vector((0.0, 0.0, 0.018))
    result["MonkeyPerch"] = {
        "reviewFrame": 45,
        "handSupport": cylinder(hand_center, Vector((1.0, 0.0, 0.0)), 1.4, 0.052, perch_hands),
        "footSupport": cylinder(foot_center, Vector((1.0, 0.0, 0.0)), 1.4, 0.052, perch_feet),
    }

    reset_pose(rig)
    rig.animation_data.action = action_by_name["MonkeySwing"]
    bpy.context.scene.frame_set(16)
    bpy.context.view_layer.update()
    swing_hands = {name: evaluated_point(name, "tail") for name in ("Hand.L", "Hand.R")}
    swing_hand_center = sum(swing_hands.values(), Vector((0.0, 0.0, 0.0))) / len(swing_hands)
    swing_hand_center += Vector((0.0, 0.0, 0.028))
    tail_contact = evaluated_point("Tail.07", "head")
    tail_center = tail_contact + Vector((0.0, 0.0, -0.018))
    tail_axis = Euler((math.pi / 2, 0.0, math.radians(12.0)), "XYZ").to_matrix() @ Vector((0.0, 0.0, 1.0))
    result["MonkeySwing"] = {
        "reviewFrame": 16,
        "handSupport": cylinder(swing_hand_center, Vector((1.0, 0.0, 0.0)), 1.4, 0.052, swing_hands),
        "tailSupport": cylinder(tail_center, tail_axis, 1.0, 0.040, {"Tail.07": tail_contact}),
        "feet": "free-swinging; no authored support contact",
    }

    reset_pose(rig)
    rig.animation_data.action = actions[0]
    bpy.context.scene.frame_set(1)
    return result


def mesh_metrics(obj: bpy.types.Object) -> Dict[str, int]:
    triangles = sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)
    return {"vertices": len(obj.data.vertices), "triangles": triangles, "meshes": 1}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_glb_contract(path: Path) -> Dict[str, object]:
    """Read the exported GLB JSON and report the actual runtime contract."""
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError(f"Invalid GLB header: {path}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError(f"GLB JSON chunk missing: {path}")
    document = json.loads(data[20 : 20 + json_length].decode("utf-8").rstrip(" \t\r\n\0"))
    accessors = document.get("accessors", [])
    vertices = 0
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_accessor = primitive.get("attributes", {}).get("POSITION")
            if position_accessor is not None:
                vertices += int(accessors[position_accessor]["count"])
            indices_accessor = primitive.get("indices")
            if primitive.get("mode", 4) == 4 and indices_accessor is not None:
                triangles += int(accessors[indices_accessor]["count"]) // 3
    animations = sorted(animation.get("name", "") for animation in document.get("animations", []))
    skins = document.get("skins", [])
    return {
        "animations": animations,
        "bones": max((len(skin.get("joints", [])) for skin in skins), default=0),
        "embeddedImages": sum(1 for image in document.get("images", []) if "bufferView" in image),
        "materials": len(document.get("materials", [])),
        "meshes": len(document.get("meshes", [])),
        "nodes": len(document.get("nodes", [])),
        "skins": len(skins),
        "triangles": triangles,
        "vertices": vertices,
    }


def main() -> None:
    options = args()
    root = Path(__file__).resolve().parents[2]
    output = options.output if options.output.is_absolute() else root / options.output
    preview = options.preview if options.preview.is_absolute() else root / options.preview
    source_dir = root / "tools/animal-pipeline/source"
    texture_dir = source_dir
    output.mkdir(parents=True, exist_ok=True)
    preview.mkdir(parents=True, exist_ok=True)
    purge_scene()
    bpy.context.scene.render.fps = FPS

    body = create_anatomical_surface()
    sculpt_facial_relief(body)
    images = create_texture_maps(texture_dir, options.texture_size)
    materials = create_materials(images)
    uv_and_material_regions(body, materials)
    add_face_vertex_blend(body)
    bake_face_into_pbr_maps(body, images)
    add_fur_surface_breakup(body)
    details = add_face_details(materials)
    details.extend(add_grasping_digits(materials))
    body = join_face_details(body, details)
    details = []
    rig = create_rig()
    skin_mesh(body, rig)
    actions = create_actions(rig)
    contact_groups = contact_vertex_indices(body)
    locomotion_contact_report = author_ground_contacts(body, rig, actions, contact_groups)
    contact_union = sorted({index for indices in contact_groups.values() for index in indices})
    contact_plane_report = normalize_action_contact_planes(body, rig, actions, contact_union)
    install_nla(rig, actions)

    lod0_path = output / "spider-monkey-lod0.glb"
    hero_objects = [body, *details, rig]
    # First export is a disposable calibration target. Feed fresh-imported
    # glTF full-mesh residuals back into source root channels, then overwrite
    # it with the runtime-final asset.
    export_glb(lod0_path, hero_objects)
    exported_contact_calibration = calibrate_root_from_fresh_import(lod0_path, rig, actions)
    install_nla(rig, actions)
    export_glb(lod0_path, hero_objects)
    lod0_metrics = inspect_glb_contract(lod0_path)

    body_lod, detail_lod, _ = duplicate_for_lod(body, details, rig)
    lod2_path = output / "spider-monkey-lod2.glb"
    export_glb(lod2_path, [body_lod, *detail_lod, rig])
    lod2_metrics = inspect_glb_contract(lod2_path)

    if not options.skip_preview:
        _, helpers = setup_preview_scene()
        # Hide the LOD copy so close-up renders inspect the hero surface only.
        body_lod.hide_render = True
        for detail in detail_lod:
            detail.hide_render = True
        render_previews(preview, rig, actions, helpers)

    support_anchors = authored_support_anchor_contract(rig, actions)
    bounds = [body.bound_box[index] for index in range(8)]
    xs, ys, zs = zip(*bounds)
    texture_metrics = {}
    for name, image in images.items():
        source_file = Path(image.filepath_raw)
        texture_metrics[name] = {
            "kind": "baseColor" if name == "basecolor" else name,
            "sourceFile": str(source_file.relative_to(root)),
            # Blender's glTF exporter derives the embedded image name from the
            # packed/source filename, not the datablock's internal label.
            "embeddedImageName": f"monkey-spider-fur-{name}",
            "width": image.size[0],
            "height": image.size[1],
            "bytes": source_file.stat().st_size,
            "sha256": sha256(source_file),
        }
    blend_path = source_dir / "monkey-spider-source.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path.resolve()), compress=True)
    metrics = {
        "speciesId": SPECIES_ID,
        "authorship": "Original in-repository Blender generation; no third-party mesh, texture, rig, or animation data",
        "referenceFacts": {
            "forelimbs": "approximately 25% longer than hind limbs",
            "hands": "four elongated hook-like fingers with vestigial thumb",
            "tail": "prehensile, longer than head/body, bare gripping pad at tip",
        },
        "orientation": {"units": "metres", "up": "+Y in glTF", "forward": "+Z in glTF"},
        "skeleton": {"bones": len(rig.data.bones), "deformingBones": sum(1 for bone in rig.data.bones if bone.use_deform)},
        "clips": [
            {"name": action.name, "start": int(action.frame_range[0]), "end": int(action.frame_range[1]), "fps": FPS, "loop": True}
            for action in actions
        ],
        "contactPlaneQA": contact_plane_report,
        "locomotionContactQA": locomotion_contact_report,
        "exportedContactCalibration": exported_contact_calibration,
        "supportAnchors": support_anchors,
        "materials": [material.name for material in materials.values()],
        "textures": texture_metrics,
        "sourceBlend": {
            "sourceFile": str(blend_path.relative_to(root)),
            "bytes": blend_path.stat().st_size,
            "sha256": sha256(blend_path),
            "generator": "tools/animal-pipeline/build_spider_monkey.py",
        },
        "boundsBlender": {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
        "lod0": {**lod0_metrics, "bytes": lod0_path.stat().st_size, "sha256": sha256(lod0_path)},
        "lod2": {**lod2_metrics, "bytes": lod2_path.stat().st_size, "sha256": sha256(lod2_path)},
    }
    metrics_path = root / "tools/animal-pipeline/monkey-spider-metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n")
    provenance = {
        "speciesId": SPECIES_ID,
        "creator": "Sloth in the City original animal pipeline",
        "source": "tools/animal-pipeline/build_spider_monkey.py",
        "sourceMethod": "Deterministic fused-surface anatomy, modeled eyelids/corneas/digits, authored skeleton/weights/clips, generated image PBR maps",
        "referenceUse": "Morphology and locomotion facts only; no reference mesh, texture, rig, or animation copied",
        "references": [
            "https://animaldiversity.org/accounts/Ateles_geoffroyi/",
            "https://animals.sandiegozoo.org/animals/monkey",
            "https://www.brookfieldzoo.org/animals/black-handed-spider-monkey",
        ],
        "thirdPartyAssets": [],
        "license": "Original-Project-Asset",
        "metrics": str(metrics_path.relative_to(root)),
    }
    for provenance_path in (
        source_dir / "spider-monkey.provenance.json",
        source_dir / "monkey-spider.provenance.json",
    ):
        provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")

    bone_names = [bone.name for bone in rig.data.bones]
    width = max(xs) - min(xs)
    length = max(ys) - min(ys)
    height = max(zs) - min(zs)
    manifest = {
        "schemaVersion": 1,
        "id": SPECIES_ID,
        "displayName": "Black-handed spider monkey",
        "species": "Ateles geoffroyi",
        "generator": "tools/animal-pipeline/build_spider_monkey.py",
        "license": "Original-Project-Asset",
        "coordinateSystem": {
            "forward": "+Z",
            "origin": "ground-contact plane",
            "unit": "meter",
            "up": "+Y",
        },
        "dimensionsMeters": {
            "height": round(height, 3),
            "length": round(length, 3),
            "width": round(width, 3),
        },
        "skeleton": {
            "name": rig.name,
            "maxInfluences": 4,
            "bones": bone_names,
        },
        "clips": [{"name": name} for name in CLIPS],
        "materials": [material.name for material in materials.values()],
        "maps": {
            "albedo": {
                **texture_metrics["basecolor"],
                "kind": "albedo",
                "runtimeMimeType": "image/png",
            },
            "normal": {
                **texture_metrics["normal"],
                "runtimeMimeType": "image/png",
            },
            "roughness": {
                **texture_metrics["roughness"],
                "runtimeMimeType": "image/png",
            },
        },
        "lod0": {
            "file": lod0_path.name,
            **lod0_metrics,
            "bytes": lod0_path.stat().st_size,
            "sha256": sha256(lod0_path),
        },
        "lod2": {
            "file": lod2_path.name,
            **lod2_metrics,
            "bytes": lod2_path.stat().st_size,
            "sha256": sha256(lod2_path),
        },
        "previews": {
            "FaceCloseup": "tools/animal-pipeline/previews/monkey-face-closeup.png",
            "FaceThreeQuarter": "tools/animal-pipeline/previews/monkey-face-three-quarter.png",
            "HandContact": "tools/animal-pipeline/previews/monkey-hand-contact-closeup.png",
            "IdleContact": "tools/animal-pipeline/previews/monkey-idle-contact-closeup.png",
            "WalkContact": "tools/animal-pipeline/previews/monkey-walk-contact-closeup.png",
            "PerchContact": "tools/animal-pipeline/previews/monkey-perch-contact-closeup.png",
            "ClimbContact": "tools/animal-pipeline/previews/monkey-climb-contact-closeup.png",
            "SwingContact": "tools/animal-pipeline/previews/monkey-swing-contact-closeup.png",
            "MonkeyClimb": "tools/animal-pipeline/previews/monkey-climb.png",
            "MonkeyIdle": "tools/animal-pipeline/previews/monkey-idle.png",
            "MonkeyPerch": "tools/animal-pipeline/previews/monkey-perch.png",
            "MonkeySwing": "tools/animal-pipeline/previews/monkey-swing.png",
            "MonkeyWalk": "tools/animal-pipeline/previews/monkey-walk.png",
        },
        "supportAnchors": support_anchors,
        "provenance": {
            "geometry": "Original repository-authored fused anatomical surface with modeled eyelids, dark corneas, hooked digits and prehensile tail; no third-party geometry.",
            "referencePolicy": "Wildlife photography and zoo facts used only for anatomical proportion and locomotion study.",
            "rigging": "Original spider-monkey skeleton, weights and five animation clips authored by this pipeline.",
            "textures": "Original deterministic NumPy-generated fur PBR maps and vertex face blend; no third-party pixels.",
            "visualReferences": provenance["references"],
        },
    }
    manifest_path = source_dir / "spider-monkey.asset.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
