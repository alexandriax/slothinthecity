import type { ShuttleMinimapSnapshot } from "./world/CityBusWorld";

type ShuttleMinimapProps = { snapshot: ShuttleMinimapSnapshot | null };

const avenues = [
  [0, "12 AV"], [-46, "RIVERSIDE"], [-92, "WEST END"], [-146, "BROADWAY"],
  [-202, "AMSTERDAM"], [-250, "COLUMBUS"], [-298, "CPW"],
] as const;
const streets = [
  [-2494, "W 81"], [-2534, "W 80"], [-2574, "W 79"], [-2614, "W 78"], [-2654, "W 77"],
  [-2694, "W 76"], [-2734, "W 75"], [-2774, "W 74"], [-2814, "W 73"], [-2854, "W 72"],
] as const;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const mapX = (x: number) => 18 + (x + 298) * .68;
const mapY = (z: number) => 20 + (-2494 - z) * .45;

export function ShuttleMinimap({ snapshot }: ShuttleMinimapProps) {
  if (!snapshot) return null;
  const detailed = snapshot.z < -2380;
  const headingDegrees = snapshot.heading * 180 / Math.PI + 180;

  return <aside className="shuttle-minimap" aria-label="Museum shuttle navigation map">
    <div className="shuttle-minimap-heading"><span>Live route</span><strong>{detailed ? "Upper West Side" : "Bronx → Manhattan"}</strong></div>
    {detailed ? <svg viewBox="0 0 250 210" role="img" aria-label="West 79th Street exit and Upper West Side street grid">
      <rect className="minimap-park" x="0" y="0" width="15" height="210" rx="3" />
      <rect className="minimap-river" x="224" y="0" width="26" height="210" rx="3" />
      {avenues.map(([x, label]) => <g key={label}>
        <line className={label === "CPW" || label === "12 AV" ? "minimap-major-road" : "minimap-road"} x1={mapX(x)} y1="8" x2={mapX(x)} y2="196" />
        <text className="minimap-avenue-label" x={mapX(x) + 2} y="204">{label}</text>
      </g>)}
      {streets.map(([z, label]) => <g key={label}>
        <line className={label === "W 79" ? "minimap-route-road" : "minimap-road"} x1="14" y1={mapY(z)} x2="228" y2={mapY(z)} />
        <text className="minimap-street-label" x="226" y={mapY(z) - 2}>{label}</text>
      </g>)}
      <rect className="minimap-museum" x={mapX(-298) + 3} y={mapY(-2494) + 3} width={mapX(-250) - mapX(-298) - 6} height={mapY(-2654) - mapY(-2494) - 6} rx="3" />
      <text className="minimap-museum-label" x={mapX(-296) + 4} y={mapY(-2574)}>AMNH</text>
      <circle className="minimap-destination" cx={mapX(snapshot.destinationX)} cy={mapY(snapshot.destinationZ)} r="5" />
      <g className="minimap-player" transform={`translate(${clamp(mapX(snapshot.x), 10, 236)} ${clamp(mapY(snapshot.z), 10, 198)}) rotate(${headingDegrees})`}>
        <path d="M 0 -8 L 6 6 L 0 3 L -6 6 Z" />
      </g>
      <text className="minimap-park-label" x="4" y="106" transform="rotate(-90 4 106)">CENTRAL PARK</text>
      <text className="minimap-river-label" x="241" y="108" transform="rotate(90 241 108)">HUDSON</text>
    </svg> : <svg viewBox="0 0 250 210" role="img" aria-label="Bronx to West Side Highway route overview">
      <path className="minimap-overview-route" d="M 82 14 C 132 42 89 69 91 93 L 91 168 Q 91 184 108 184 L 223 184" />
      <path className="minimap-overview-river" d="M 114 72 L 114 170" />
      <text className="minimap-overview-label" x="18" y="18">BRONX ZOO</text>
      <text className="minimap-overview-label" x="122" y="112">HUDSON RIVER</text>
      <text className="minimap-overview-label" x="111" y="178">W 79 EXIT</text>
      <text className="minimap-overview-label" x="199" y="201">AMNH</text>
      <circle className="minimap-player-dot" cx={91} cy={clamp(18 + (-snapshot.z / 2494) * 158, 18, 176)} r="5" />
    </svg>}
    <div className="shuttle-minimap-footer"><span>{snapshot.road}</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></div>
  </aside>;
}
