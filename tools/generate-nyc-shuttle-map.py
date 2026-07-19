#!/usr/bin/env python3
"""Generate the checked-in OSM street/building snapshot used by the shuttle.

The source extract is not shipped. Download a current New York OSM PBF, install
pyosmium, and run:

  python tools/generate-nyc-shuttle-map.py INPUT.osm.pbf \
    app/game/world/nycShuttleOsmData.ts

Road navigation is deliberately bounded to the performance-safe Upper West
Side play district. A larger building margin is retained behind every boundary
closure so a blocked street still ends in visible city rather than clear color.
"""

from __future__ import annotations

import json
import math
import pathlib
import sys
from collections import Counter
from dataclasses import dataclass

import osmium


SOURCE_DATE = "2026-07-11"
SOURCE_URL = "https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf"
ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright"

# The playable street network is smaller than the retained building context.
ROAD_BOUNDS = (-73.9960, 40.7730, -73.9650, 40.7920)  # west, south, east, north
BUILDING_BOUNDS = (-74.0020, 40.7690, -73.9590, 40.7960)
ORIGIN_LON = -73.99125
ORIGIN_LAT = 40.78325
GAME_ORIGIN_Z = -2574.0  # West 79th Street exit in the authored level.
X_SCALE = 0.20
Z_SCALE = 0.36

ROAD_CLASSES = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary",
    "primary_link", "secondary", "secondary_link", "tertiary",
    "tertiary_link", "residential", "unclassified", "living_street",
}


def inside(lon: float, lat: float, bounds: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bounds
    return west <= lon <= east and south <= lat <= north


def project(lon: float, lat: float) -> tuple[float, float]:
    east_m = (lon - ORIGIN_LON) * 111_320.0 * math.cos(math.radians(ORIGIN_LAT))
    north_m = (lat - ORIGIN_LAT) * 111_320.0
    return (-east_m * X_SCALE, GAME_ORIGIN_Z + north_m * Z_SCALE)


@dataclass
class RoadWay:
    osm_id: int
    name: str
    road_class: str
    lanes: int
    one_way: bool
    nodes: list[tuple[int, float, float]]


@dataclass
class BuildingWay:
    osm_id: int
    name: str
    levels: float
    height_m: float
    points: list[tuple[float, float]]


class CorridorHandler(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.roads: list[RoadWay] = []
        self.buildings: list[BuildingWay] = []

    def way(self, way: osmium.osm.Way) -> None:
        try:
            nodes = [(node.ref, node.location.lon, node.location.lat) for node in way.nodes]
        except osmium.InvalidLocationError:
            return
        if len(nodes) < 2:
            return
        highway = way.tags.get("highway")
        if highway in ROAD_CLASSES and any(inside(lon, lat, ROAD_BOUNDS) for _, lon, lat in nodes):
            raw_lanes = way.tags.get("lanes", "2").split(";")[0]
            try:
                lanes = max(1, min(6, int(float(raw_lanes))))
            except ValueError:
                lanes = 2
            name = way.tags.get("name") or way.tags.get("ref") or highway.replace("_", " ").title()
            self.roads.append(RoadWay(way.id, name, highway, lanes, way.tags.get("oneway") in {"yes", "1", "true", "-1"}, nodes))
        if way.tags.get("building") and len(nodes) >= 4 and nodes[0][0] == nodes[-1][0] and any(inside(lon, lat, BUILDING_BOUNDS) for _, lon, lat in nodes):
            levels_raw = way.tags.get("building:levels", "0").split(";")[0]
            height_raw = way.tags.get("height", "0").lower().replace(" m", "").replace("m", "")
            try:
                levels = max(0.0, float(levels_raw))
            except ValueError:
                levels = 0.0
            try:
                height_m = max(0.0, float(height_raw))
            except ValueError:
                height_m = 0.0
            self.buildings.append(BuildingWay(way.id, way.tags.get("name", ""), levels, height_m, [(lon, lat) for _, lon, lat in nodes[:-1]]))


def road_half_width(road_class: str, lanes: int) -> float:
    base = {
        "motorway": 10.8, "motorway_link": 7.4, "trunk": 10.2,
        "trunk_link": 7.2, "primary": 8.8, "primary_link": 7.2,
        "secondary": 8.1, "secondary_link": 6.9, "tertiary": 7.4,
        "tertiary_link": 6.6, "residential": 6.4, "unclassified": 6.1,
        "living_street": 5.5,
    }[road_class]
    return max(base, lanes * 1.8)


def building_box(building: BuildingWay) -> dict[str, object] | None:
    points = [project(lon, lat) for lon, lat in building.points]
    if len(points) < 3:
        return None
    center_x = sum(point[0] for point in points) / len(points)
    center_z = sum(point[1] for point in points) / len(points)
    xx = sum((x - center_x) ** 2 for x, _ in points)
    zz = sum((z - center_z) ** 2 for _, z in points)
    xz = sum((x - center_x) * (z - center_z) for x, z in points)
    yaw = .5 * math.atan2(2 * xz, xx - zz)
    cosine, sine = math.cos(yaw), math.sin(yaw)
    local = [((x - center_x) * cosine + (z - center_z) * sine, -(x - center_x) * sine + (z - center_z) * cosine) for x, z in points]
    width = max(x for x, _ in local) - min(x for x, _ in local)
    depth = max(z for _, z in local) - min(z for _, z in local)
    if width < 1.4 or depth < 1.4 or width * depth > 5_000:
        return None
    inferred_levels = building.levels or 4 + building.osm_id % 8
    real_height = building.height_m or inferred_levels * 3.15 + 1.2
    return {
        "id": building.osm_id,
        "name": building.name,
        "x": round(center_x, 3), "z": round(center_z, 3),
        "width": round(width, 3), "depth": round(depth, 3),
        "height": round(max(7.0, min(62.0, real_height * .72)), 3),
        "yaw": round(yaw, 5), "variant": building.osm_id % 8,
    }


def generate(input_path: pathlib.Path) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    handler = CorridorHandler()
    handler.apply_file(str(input_path), locations=True)
    node_use = Counter(node_id for way in handler.roads for node_id, lon, lat in way.nodes if inside(lon, lat, ROAD_BOUNDS))
    roads: list[dict[str, object]] = []
    endpoint_degree: Counter[tuple[float, float]] = Counter()
    endpoint_meta: dict[tuple[float, float], tuple[str, float]] = {}
    closure_candidates: dict[tuple[float, float], tuple[str, float]] = {}
    for way in handler.roads:
        inside_indices = [index for index, node in enumerate(way.nodes) if inside(node[1], node[2], ROAD_BOUNDS)]
        clipped = [way.nodes[index] for index in inside_indices]
        if len(clipped) < 2:
            continue
        retained = [clipped[0]]
        for index in range(1, len(clipped) - 1):
            previous, current, following = clipped[index - 1], clipped[index], clipped[index + 1]
            a = project(previous[1], previous[2]); b = project(current[1], current[2]); c = project(following[1], following[2])
            first = math.atan2(b[1] - a[1], b[0] - a[0]); second = math.atan2(c[1] - b[1], c[0] - b[0])
            bend = abs((second - first + math.pi) % (2 * math.pi) - math.pi)
            if node_use[current[0]] > 1 or bend > math.radians(5) or math.dist(project(retained[-1][1], retained[-1][2]), b) > 12:
                retained.append(current)
        retained.append(clipped[-1])
        for segment_index, (start, end) in enumerate(zip(retained, retained[1:])):
            start_game, end_game = project(start[1], start[2]), project(end[1], end[2])
            length = math.dist(start_game, end_game)
            if length < .8:
                continue
            half_width = road_half_width(way.road_class, way.lanes)
            roads.append({
                "id": f"osm-{way.osm_id}-{segment_index}", "osmId": way.osm_id,
                "name": way.name, "roadClass": way.road_class,
                "start": [round(start_game[0], 3), round(start_game[1], 3)],
                "end": [round(end_game[0], 3), round(end_game[1], 3)],
                "halfWidth": round(half_width, 2), "oneWay": way.one_way,
            })
            for point, other in ((start_game, end_game), (end_game, start_game)):
                key = (round(point[0], 1), round(point[1], 1)); endpoint_degree[key] += 1
                endpoint_meta[key] = (way.name, math.atan2(-(other[0] - point[0]), -(other[1] - point[1])))
        # A way that continues outside the performance envelope is explicitly
        # closed in game. Retaining a larger building bbox means the player can
        # still see a complete city block beyond the closure.
        for endpoint, neighbour, leaves_bounds in (
            (clipped[0], clipped[1], inside_indices[0] > 0),
            (clipped[-1], clipped[-2], inside_indices[-1] < len(way.nodes) - 1),
        ):
            if not leaves_bounds:
                continue
            point, other = project(endpoint[1], endpoint[2]), project(neighbour[1], neighbour[2])
            key = (round(point[0], 1), round(point[1], 1))
            closure_candidates[key] = (way.name, math.atan2(-(other[0] - point[0]), -(other[1] - point[1])))
    buildings = [box for building in handler.buildings if (box := building_box(building))]
    closures: list[dict[str, object]] = []
    west, south, east, north = ROAD_BOUNDS
    projected_edges = [project(west, ORIGIN_LAT)[0], project(east, ORIGIN_LAT)[0], project(ORIGIN_LON, south)[1], project(ORIGIN_LON, north)[1]]
    for (x, z), degree in endpoint_degree.items():
        near_edge = min(abs(x - projected_edges[0]), abs(x - projected_edges[1]), abs(z - projected_edges[2]), abs(z - projected_edges[3])) < 2.2
        if degree == 1 and near_edge:
            name, heading = endpoint_meta[(x, z)]
            closure_candidates[(x, z)] = (name, heading)
    for (x, z), (name, heading) in closure_candidates.items():
        closures.append({"x": x, "z": z, "heading": round(heading, 5), "road": name})
    roads.sort(key=lambda item: item["id"])
    buildings.sort(key=lambda item: item["id"])
    closures.sort(key=lambda item: (item["z"], item["x"]))
    return roads, buildings, closures


def typescript(roads: list[dict[str, object]], buildings: list[dict[str, object]], closures: list[dict[str, object]]) -> str:
    compact = lambda value: json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return f'''// Generated by tools/generate-nyc-shuttle-map.py; do not hand edit.
// © OpenStreetMap contributors. Data available under the ODbL.
export const NYC_OSM_SNAPSHOT = {{
  source: "{SOURCE_URL}",
  sourceDate: "{SOURCE_DATE}",
  attribution: "© OpenStreetMap contributors · ODbL",
  attributionUrl: "{ATTRIBUTION_URL}",
  roadBounds: {compact(ROAD_BOUNDS)},
  buildingBounds: {compact(BUILDING_BOUNDS)},
}} as const;

export type NycOsmRoadSegment = {{ id: string; osmId: number; name: string; roadClass: string; start: readonly [number, number]; end: readonly [number, number]; halfWidth: number; oneWay: boolean }};
export type NycOsmBuilding = {{ id: number; name: string; x: number; z: number; width: number; depth: number; height: number; yaw: number; variant: number }};
export type NycOsmClosure = {{ x: number; z: number; heading: number; road: string }};

export const NYC_OSM_ROADS = {compact(roads)} as const satisfies readonly NycOsmRoadSegment[];
export const NYC_OSM_BUILDINGS = {compact(buildings)} as const satisfies readonly NycOsmBuilding[];
export const NYC_OSM_BOUNDARY_CLOSURES = {compact(closures)} as const satisfies readonly NycOsmClosure[];
'''


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-nyc-shuttle-map.py INPUT.osm.pbf OUTPUT.ts")
    input_path, output_path = map(pathlib.Path, sys.argv[1:])
    roads, buildings, closures = generate(input_path)
    output_path.write_text(typescript(roads, buildings, closures), encoding="utf-8")
    print(f"generated {len(roads)} road segments, {len(buildings)} buildings, {len(closures)} boundary closures")


if __name__ == "__main__":
    main()
