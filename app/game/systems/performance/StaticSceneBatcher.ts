import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type StaticSceneBatchOptions = {
  cellSize?: number;
  exclude?: readonly THREE.Object3D[];
  minBatchSize?: number;
};

export type StaticSceneBatchResult = {
  batches: number;
  sourceMeshes: number;
};

function geometrySignature(geometry: THREE.BufferGeometry) {
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
    .sort()
    .join("|");
  return `${geometry.index ? "indexed" : "plain"}|${attributes}`;
}

function excludedByAncestor(object: THREE.Object3D, root: THREE.Object3D, excluded: ReadonlySet<THREE.Object3D>) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (excluded.has(current)) return true;
    if (current === root) return false;
    current = current.parent;
  }
  return true;
}

/**
 * Merges static, opaque meshes by material and world-space cell. Spatial cells
 * retain normal frustum culling while shared materials collapse hundreds of
 * identical submissions into a small number of draw calls.
 */
export function batchStaticMeshes(root: THREE.Object3D, options: StaticSceneBatchOptions = {}): StaticSceneBatchResult {
  const cellSize = Math.max(8, options.cellSize ?? 36);
  const minBatchSize = Math.max(2, options.minBatchSize ?? 3);
  const excluded = new Set(options.exclude ?? []);
  const groups = new Map<string, THREE.Mesh[]>();
  root.updateMatrixWorld(true);

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh) return;
    if (excludedByAncestor(object, root, excluded) || !object.visible || object.userData && Object.keys(object.userData).length > 0) return;
    if (!object.frustumCulled || object.morphTargetInfluences || Array.isArray(object.material)) return;
    const material = object.material;
    if (material.transparent || material.opacity < 1 || object.matrixWorld.determinant() < 0) return;
    if (object.geometry.drawRange.start !== 0 || object.geometry.drawRange.count !== Infinity) return;
    const x = object.matrixWorld.elements[12], z = object.matrixWorld.elements[14];
    const cellX = Math.floor(x / cellSize), cellZ = Math.floor(z / cellSize);
    const key = [material.uuid, geometrySignature(object.geometry), object.castShadow, object.receiveShadow, object.renderOrder, object.layers.mask, cellX, cellZ].join(":");
    const group = groups.get(key);
    if (group) group.push(object); else groups.set(key, [object]);
  });

  const inverseRoot = root.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4();
  let batches = 0, sourceMeshes = 0;
  groups.forEach(meshes => {
    if (meshes.length < minBatchSize) return;
    const geometries = meshes.map(mesh => {
      transform.multiplyMatrices(inverseRoot, mesh.matrixWorld);
      return mesh.geometry.clone().applyMatrix4(transform);
    });
    const mergedGeometry = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!mergedGeometry) return;
    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();
    const first = meshes[0];
    const batch = new THREE.Mesh(mergedGeometry, first.material);
    batch.name = `static-batch-${batches + 1}`;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.matrixAutoUpdate = false;
    batch.updateMatrix();
    root.add(batch);
    meshes.forEach(mesh => {
      if (mesh.name) {
        // Preserve named nodes as non-rendering QA/lookup proxies. Gameplay can
        // still inspect exact authored geometry without submitting it twice.
        mesh.visible = false;
        mesh.userData.staticBatchProxy = true;
      } else mesh.removeFromParent();
    });
    batches += 1;
    sourceMeshes += meshes.length;
  });
  root.userData.staticBatchCount = batches;
  root.userData.staticBatchSourceMeshes = sourceMeshes;
  return { batches, sourceMeshes };
}
