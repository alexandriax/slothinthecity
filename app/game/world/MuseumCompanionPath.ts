export type MuseumNavigationPoint = { x: number; z: number };
export type MuseumNavigationBox = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MuseumNavigationCircle = { x: number; z: number; radius: number };
export type MuseumNavigationBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const DEFAULT_BOUNDS: MuseumNavigationBounds = {
  minX: -43.25,
  maxX: 43.25,
  minZ: -223.25,
  maxZ: 20,
};

/** Shortest floor distance to a solid rectangular exhibit footprint. */
export function museumNavigationDistanceToBox(
  point: MuseumNavigationPoint,
  box: MuseumNavigationBox,
) {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

function pointInsideBounds(point: MuseumNavigationPoint, bounds: MuseumNavigationBounds, clearance: number) {
  return point.x >= bounds.minX + clearance
    && point.x <= bounds.maxX - clearance
    && point.z >= bounds.minZ + clearance
    && point.z <= bounds.maxZ - clearance;
}

export function museumCompanionPointClear(
  point: MuseumNavigationPoint,
  boxes: readonly MuseumNavigationBox[],
  circles: readonly MuseumNavigationCircle[],
  clearance: number,
  bounds: MuseumNavigationBounds = DEFAULT_BOUNDS,
) {
  if (!pointInsideBounds(point, bounds, clearance)) return false;
  for (const box of boxes) {
    if (
      point.x >= box.minX - clearance
      && point.x <= box.maxX + clearance
      && point.z >= box.minZ - clearance
      && point.z <= box.maxZ + clearance
    ) return false;
  }
  for (const circle of circles) {
    if (Math.hypot(point.x - circle.x, point.z - circle.z) <= circle.radius + clearance) return false;
  }
  return true;
}

function segmentIntersectsExpandedBox(
  from: MuseumNavigationPoint,
  to: MuseumNavigationPoint,
  box: MuseumNavigationBox,
  clearance: number,
) {
  const minX = box.minX - clearance, maxX = box.maxX + clearance;
  const minZ = box.minZ - clearance, maxZ = box.maxZ + clearance;
  const dx = to.x - from.x, dz = to.z - from.z;
  let near = 0, far = 1;
  for (const [origin, delta, minimum, maximum] of [
    [from.x, dx, minX, maxX],
    [from.z, dz, minZ, maxZ],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta, second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

function distanceSquaredToSegment(point: MuseumNavigationPoint, from: MuseumNavigationPoint, to: MuseumNavigationPoint) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return (point.x - from.x) ** 2 + (point.z - from.z) ** 2;
  const amount = Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
  const nearestX = from.x + dx * amount, nearestZ = from.z + dz * amount;
  return (point.x - nearestX) ** 2 + (point.z - nearestZ) ** 2;
}

export function museumCompanionSegmentClear(
  from: MuseumNavigationPoint,
  to: MuseumNavigationPoint,
  boxes: readonly MuseumNavigationBox[],
  circles: readonly MuseumNavigationCircle[],
  clearance: number,
  bounds: MuseumNavigationBounds = DEFAULT_BOUNDS,
) {
  if (!pointInsideBounds(from, bounds, clearance) || !pointInsideBounds(to, bounds, clearance)) return false;
  for (const box of boxes) {
    if (segmentIntersectsExpandedBox(from, to, box, clearance)) return false;
  }
  for (const circle of circles) {
    const required = circle.radius + clearance;
    if (distanceSquaredToSegment(circle, from, to) <= required * required) return false;
  }
  return true;
}

type HeapEntry = { index: number; score: number };

class MinHeap {
  private readonly entries: HeapEntry[] = [];

  get length() { return this.entries.length; }

  push(entry: HeapEntry) {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent].score <= entry.score) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last || !this.entries.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1, right = left + 1;
      if (left >= this.entries.length) break;
      const child = right < this.entries.length && this.entries[right].score < this.entries[left].score ? right : left;
      if (this.entries[child].score >= last.score) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

/**
 * Plans a deterministic floor route and then removes unnecessary grid bends.
 * Every retained segment is rechecked against expanded walls and exhibit
 * footprints, so the rendered companion never cuts a corner through a plinth.
 */
export function planMuseumCompanionPath(
  from: MuseumNavigationPoint,
  to: MuseumNavigationPoint,
  boxes: readonly MuseumNavigationBox[],
  circles: readonly MuseumNavigationCircle[],
  radius: number,
  bounds: MuseumNavigationBounds = DEFAULT_BOUNDS,
) {
  const clearance = Math.max(0, radius) + .12;
  if (museumCompanionSegmentClear(from, to, boxes, circles, clearance, bounds)) return [{ ...from }, { ...to }];

  const step = 1.15;
  const gridMinX = bounds.minX + clearance, gridMinZ = bounds.minZ + clearance;
  const columns = Math.floor((bounds.maxX - clearance - gridMinX) / step) + 1;
  const rows = Math.floor((bounds.maxZ - clearance - gridMinZ) / step) + 1;
  const cellPoint = (column: number, row: number) => ({ x: gridMinX + column * step, z: gridMinZ + row * step });
  const cellIndex = (column: number, row: number) => row * columns + column;
  const cellCoordinates = (index: number) => ({ column: index % columns, row: Math.floor(index / columns) });

  const nearestCell = (point: MuseumNavigationPoint) => {
    const baseColumn = Math.min(columns - 1, Math.max(0, Math.round((point.x - gridMinX) / step)));
    const baseRow = Math.min(rows - 1, Math.max(0, Math.round((point.z - gridMinZ) / step)));
    for (let ring = 0; ring <= 18; ring++) {
      let nearest = -1, nearestDistance = Infinity;
      for (let row = Math.max(0, baseRow - ring); row <= Math.min(rows - 1, baseRow + ring); row++) {
        for (let column = Math.max(0, baseColumn - ring); column <= Math.min(columns - 1, baseColumn + ring); column++) {
          if (ring && Math.abs(column - baseColumn) !== ring && Math.abs(row - baseRow) !== ring) continue;
          const candidate = cellPoint(column, row);
          if (!museumCompanionPointClear(candidate, boxes, circles, clearance, bounds)) continue;
          if (!museumCompanionSegmentClear(point, candidate, boxes, circles, clearance, bounds)) continue;
          const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
          if (distance < nearestDistance) { nearest = cellIndex(column, row); nearestDistance = distance; }
        }
      }
      if (nearest >= 0) return nearest;
    }
    return -1;
  };

  const start = nearestCell(from), destination = nearestCell(to);
  if (start < 0 || destination < 0) return [{ ...from }];
  const count = columns * rows;
  const previous = new Int32Array(count); previous.fill(-1);
  const distance = new Float64Array(count); distance.fill(Infinity); distance[start] = 0;
  const visited = new Uint8Array(count);
  const open = new MinHeap();
  const destinationPoint = cellPoint(destination % columns, Math.floor(destination / columns));
  open.push({ index: start, score: 0 });
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ] as const;

  while (open.length) {
    const current = open.pop();
    if (!current || visited[current.index]) continue;
    visited[current.index] = 1;
    if (current.index === destination) break;
    const { column, row } = cellCoordinates(current.index), currentPoint = cellPoint(column, row);
    for (const [columnStep, rowStep] of directions) {
      const nextColumn = column + columnStep, nextRow = row + rowStep;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const nextIndex = cellIndex(nextColumn, nextRow);
      if (visited[nextIndex]) continue;
      const nextPoint = cellPoint(nextColumn, nextRow);
      if (!museumCompanionPointClear(nextPoint, boxes, circles, clearance, bounds)) continue;
      if (!museumCompanionSegmentClear(currentPoint, nextPoint, boxes, circles, clearance, bounds)) continue;
      const stepDistance = columnStep && rowStep ? step * Math.SQRT2 : step;
      const candidateDistance = distance[current.index] + stepDistance;
      if (candidateDistance >= distance[nextIndex]) continue;
      distance[nextIndex] = candidateDistance;
      previous[nextIndex] = current.index;
      const heuristic = Math.hypot(nextPoint.x - destinationPoint.x, nextPoint.z - destinationPoint.z);
      open.push({ index: nextIndex, score: candidateDistance + heuristic });
    }
  }

  if (!visited[destination]) return [{ ...from }];
  const gridPath: MuseumNavigationPoint[] = [];
  for (let index = destination; index >= 0; index = previous[index]) {
    const { column, row } = cellCoordinates(index);
    gridPath.push(cellPoint(column, row));
    if (index === start) break;
  }
  gridPath.reverse();
  const unsmoothed = [{ ...from }, ...gridPath, { ...to }];
  const route: MuseumNavigationPoint[] = [unsmoothed[0]];
  let anchor = 0;
  while (anchor < unsmoothed.length - 1) {
    let next = unsmoothed.length - 1;
    while (next > anchor + 1 && !museumCompanionSegmentClear(unsmoothed[anchor], unsmoothed[next], boxes, circles, clearance, bounds)) next--;
    route.push(unsmoothed[next]);
    anchor = next;
  }
  return route;
}
