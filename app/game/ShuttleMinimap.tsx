import type { ShuttleMinimapSnapshot } from "./world/CityBusWorld";
import { NYC_OSM_BOUNDARY_CLOSURES, NYC_OSM_ROADS, NYC_OSM_SNAPSHOT } from "./world/nycShuttleOsmData";

type ShuttleMinimapProps = { snapshot: ShuttleMinimapSnapshot | null };

const MAP_MIN_X = -460, MAP_MAX_X = 45, MAP_MIN_Z = -3010, MAP_MAX_Z = -2210;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const mapX = (x: number) => 12 + (x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X) * 226;
const mapY = (z: number) => 198 - (z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z) * 184;
const roadPath = (predicate: (road: (typeof NYC_OSM_ROADS)[number]) => boolean) => NYC_OSM_ROADS
  .filter(predicate)
  .map(road => `M${mapX(road.start[0]).toFixed(1)} ${mapY(road.start[1]).toFixed(1)}L${mapX(road.end[0]).toFixed(1)} ${mapY(road.end[1]).toFixed(1)}`)
  .join("");
const LOCAL_STREET_PATH = roadPath(road => !/motorway|trunk|primary|secondary/.test(road.roadClass));
const MAJOR_STREET_PATH = roadPath(road => /motorway|trunk|primary|secondary/.test(road.roadClass));
const ROUTE_STREET_PATH = roadPath(road => {
  const x = (road.start[0] + road.end[0]) * .5, z = (road.start[1] + road.end[1]) * .5;
  if (road.name === "West 79th Street") return x >= -225 && x <= -108 && z >= -2640 && z <= -2468;
  if (road.name === "Amsterdam Avenue") return z >= -2584 && z <= -2518;
  if (road.name === "West 81st Street") return x >= -336 && x <= -228 && z >= -2632 && z <= -2515;
  return road.name === "Central Park West" && z >= -2644 && z <= -2608;
});

export function ShuttleMinimap({ snapshot }: ShuttleMinimapProps) {
  if (!snapshot) return null;
  const detailed = snapshot.z < -2380;
  const headingDegrees = snapshot.heading * 180 / Math.PI + 180;

  return <aside className="shuttle-minimap" aria-label="Museum shuttle navigation map">
    <div className="shuttle-minimap-heading"><span>Live route</span><strong>{detailed ? "OSM · Upper West Side" : "Bronx → Manhattan"}</strong></div>
    {detailed ? <svg viewBox="0 0 250 210" role="img" aria-label="OpenStreetMap street network from the West 79th Street exit to the museum">
      <rect className="minimap-park" x="0" y="0" width="20" height="210" />
      <rect className="minimap-river" x="229" y="0" width="21" height="210" />
      <path className="minimap-osm-local" d={LOCAL_STREET_PATH}/>
      <path className="minimap-osm-major" d={MAJOR_STREET_PATH}/>
      <path className="minimap-osm-route" d={ROUTE_STREET_PATH}/>
      {NYC_OSM_BOUNDARY_CLOSURES.filter(closure => closure.road !== "West Side Highway").map((closure, index) => <g className="minimap-closure" key={`${closure.road}-${index}`} transform={`translate(${mapX(closure.x)} ${mapY(closure.z)}) rotate(${-closure.heading * 180 / Math.PI})`}>
        <line x1="-3" y1="0" x2="3" y2="0"/><circle cx="0" cy="0" r="1.25"/>
      </g>)}
      <rect className="minimap-museum" x={mapX(-349)} y={mapY(-2572)} width={mapX(-306) - mapX(-349)} height={mapY(-2662) - mapY(-2572)} rx="2" />
      <text className="minimap-museum-label" x={mapX(-344)} y={mapY(-2618)}>AMNH</text>
      <circle className="minimap-destination" cx={mapX(snapshot.destinationX)} cy={mapY(snapshot.destinationZ)} r="4.5" />
      <g className="minimap-player" transform={`translate(${clamp(mapX(snapshot.x), 8, 242)} ${clamp(mapY(snapshot.z), 8, 202)}) rotate(${headingDegrees})`}>
        <path d="M 0 -8 L 6 6 L 0 3 L -6 6 Z" />
      </g>
      <text className="minimap-park-label" x="6" y="106" transform="rotate(-90 6 106)">CENTRAL PARK</text>
      <text className="minimap-river-label" x="242" y="108" transform="rotate(90 242 108)">HUDSON</text>
      <text className="minimap-osm-label" x="128" y="205">W 65 ST</text><text className="minimap-osm-label" x="112" y="18">W 95 ST</text>
    </svg> : <svg viewBox="0 0 250 210" role="img" aria-label="Bronx to West Side Highway route overview">
      <path className="minimap-overview-route" d="M 82 14 C 132 42 89 69 91 93 L 91 168 Q 91 184 108 184 L 223 184" />
      <path className="minimap-overview-river" d="M 114 72 L 114 170" />
      <text className="minimap-overview-label" x="18" y="18">BRONX ZOO</text>
      <text className="minimap-overview-label" x="122" y="112">HUDSON RIVER</text>
      <text className="minimap-overview-label" x="111" y="178">W 79 EXIT</text>
      <text className="minimap-overview-label" x="199" y="201">AMNH</text>
      <circle className="minimap-player-dot" cx={91} cy={clamp(18 + (-snapshot.z / 2494) * 158, 18, 176)} r="5" />
    </svg>}
    <div className="shuttle-minimap-footer"><span>{snapshot.road}</span><a href={NYC_OSM_SNAPSHOT.attributionUrl} target="_blank" rel="noreferrer">{NYC_OSM_SNAPSHOT.attribution} · {NYC_OSM_SNAPSHOT.sourceDate}</a></div>
  </aside>;
}
