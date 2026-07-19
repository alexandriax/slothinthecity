import { CITY_BUS_LOCAL_CLOSURE_POINTS, CITY_BUS_MANHATTAN_MINIMAP_POINTS, type ShuttleMinimapSnapshot } from "./world/CityBusWorld";
import { NYC_OSM_SNAPSHOT } from "./world/nycShuttleOsmData";

type ShuttleMinimapProps = { snapshot: ShuttleMinimapSnapshot | null };

const MAP_MIN_X = -460, MAP_MAX_X = 45, MAP_MIN_Z = -3010, MAP_MAX_Z = -2210;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
// The Hudson is west of Manhattan. World +X points west, while SVG +X points
// right, so the map's horizontal axis must be reversed.
const mapX = (x: number) => 238 - (x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X) * 226;
const mapY = (z: number) => 198 - (z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z) * 184;
const overviewX = (x: number) => 50 + (40 - x) / 400 * 170;
const overviewY = (z: number) => 15 + -z / 2700 * 175;
const overviewPath = (points: readonly (readonly [number, number])[]) => points
  .map(([x, z], index) => `${index ? "L" : "M"}${overviewX(x).toFixed(1)} ${overviewY(z).toFixed(1)}`)
  .join("");
const OVERVIEW_ROUTE_PATH = overviewPath([
  [0, 0], [0, -900], [0, -2180], ...CITY_BUS_MANHATTAN_MINIMAP_POINTS,
]);
const ROUTE_STREET_PATH = CITY_BUS_MANHATTAN_MINIMAP_POINTS
  .map(([x, z], index) => `${index ? "L" : "M"}${mapX(x).toFixed(1)} ${mapY(z).toFixed(1)}`)
  .join("");
const LOCAL_ACCESS_PATH = CITY_BUS_LOCAL_CLOSURE_POINTS.reduce((path, point, index) => {
  const command = index % 2 ? "L" : "M";
  return `${path}${command}${mapX(point[0]).toFixed(1)} ${mapY(point[1]).toFixed(1)}`;
}, "");

export function ShuttleMinimap({ snapshot }: ShuttleMinimapProps) {
  if (!snapshot) return null;
  const detailed = snapshot.z < -2380;
  const headingDegrees = 180 - snapshot.heading * 180 / Math.PI;
  const museumX = Math.min(mapX(-349), mapX(-306));
  const museumWidth = Math.abs(mapX(-306) - mapX(-349));

  return <aside className="shuttle-minimap" aria-label="Museum shuttle navigation map">
    <div className="shuttle-minimap-heading"><span>Live route</span><strong>{detailed ? "Guided · Upper West Side" : "Bronx → Manhattan"}</strong></div>
    {detailed ? <svg viewBox="0 0 250 210" role="img" aria-label="Simplified playable route from the West 79th Street exit to the museum">
      <rect className="minimap-river" x="0" y="0" width="21" height="210" />
      <rect className="minimap-park" x="229" y="0" width="21" height="210" />
      <path className="minimap-local-access" d={LOCAL_ACCESS_PATH}/>
      <path className="minimap-osm-route" d={ROUTE_STREET_PATH}/>
      {CITY_BUS_LOCAL_CLOSURE_POINTS.map(([x, z], index) => <circle className="minimap-local-closure" key={index} cx={mapX(x)} cy={mapY(z)} r="2.1"/>)}
      <rect className="minimap-museum" x={museumX} y={mapY(-2572)} width={museumWidth} height={mapY(-2662) - mapY(-2572)} rx="2" />
      <text className="minimap-museum-label" x={mapX(-339)} y={mapY(-2618)}>AMNH</text>
      <circle className="minimap-destination" cx={mapX(snapshot.destinationX)} cy={mapY(snapshot.destinationZ)} r="4.5" />
      <g className="minimap-player" transform={`translate(${clamp(mapX(snapshot.x), 8, 242)} ${clamp(mapY(snapshot.z), 8, 202)}) rotate(${headingDegrees})`}>
        <path d="M 0 -8 L 6 6 L 0 3 L -6 6 Z" />
      </g>
      <text className="minimap-river-label" x="8" y="108" transform="rotate(-90 8 108)">HUDSON</text>
      <text className="minimap-park-label" x="242" y="106" transform="rotate(90 242 106)">CENTRAL PARK</text>
      <text className="minimap-osm-label" x="107" y="160">W 79 ST · STAY STRAIGHT</text>
      <text className="minimap-osm-label" x="184" y="68">LEFT · CPW</text>
    </svg> : <svg viewBox="0 0 250 210" role="img" aria-label="Bronx to West Side Highway route overview">
      <path className="minimap-overview-route" d={OVERVIEW_ROUTE_PATH} />
      <path className="minimap-overview-river" d="M 31 72 L 31 184" />
      <text className="minimap-overview-label" x="38" y="18">BRONX ZOO</text>
      <text className="minimap-overview-label" x="7" y="112" transform="rotate(-90 7 112)">HUDSON RIVER</text>
      <text className="minimap-overview-label" x="82" y="178">W 79 EXIT</text>
      <text className="minimap-overview-label" x="190" y="201">AMNH</text>
      <g className="minimap-player" transform={`translate(${clamp(overviewX(snapshot.x), 10, 240)} ${clamp(overviewY(snapshot.z), 10, 200)}) rotate(${headingDegrees})`}>
        <path d="M 0 -8 L 6 6 L 0 3 L -6 6 Z" />
      </g>
    </svg>}
    <div className="shuttle-minimap-footer"><span>{snapshot.road}</span><a href={NYC_OSM_SNAPSHOT.attributionUrl} target="_blank" rel="noreferrer">{NYC_OSM_SNAPSHOT.attribution} · {NYC_OSM_SNAPSHOT.sourceDate}</a></div>
  </aside>;
}
