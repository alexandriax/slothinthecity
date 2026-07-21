import * as THREE from "three";

export type VisibilityAwareUpdateOptions = {
  fullRateDistance?: number;
  backgroundHz?: number;
  forwardDistance?: number;
  horizontalMargin?: number;
};

/**
 * Keeps authored motion full-rate whenever it can be seen, while coalescing
 * animation work for distant actors behind the camera. Routes still sample
 * absolute elapsed time, so a returning actor never drifts out of formation.
 */
export class VisibilityAwareUpdateScheduler {
  private readonly lastUpdateAt = new WeakMap<THREE.Object3D, number>();
  private readonly worldPosition = new THREE.Vector3();

  deltaFor(
    root: THREE.Object3D,
    elapsed: number,
    frameDelta: number,
    observer?: THREE.Vector3,
    observerYaw = 0,
    options: VisibilityAwareUpdateOptions = {},
  ): number | null {
    if (!observer) {
      this.lastUpdateAt.set(root, elapsed);
      return frameDelta;
    }

    root.getWorldPosition(this.worldPosition);
    const dx = this.worldPosition.x - observer.x;
    const dz = this.worldPosition.z - observer.z;
    const distanceSq = dx * dx + dz * dz;
    const fullRateDistance = options.fullRateDistance ?? 46;
    const forward = dx * -Math.sin(observerYaw) + dz * -Math.cos(observerYaw);
    const lateral = Math.abs(dx * Math.cos(observerYaw) - dz * Math.sin(observerYaw));
    const forwardDistance = options.forwardDistance ?? 190;
    const horizontalMargin = options.horizontalMargin ?? 20;
    const likelyVisible = forward >= -4
      && forward <= forwardDistance
      && lateral <= horizontalMargin + Math.max(0, forward) * 1.7;
    const fullRate = distanceSq <= fullRateDistance * fullRateDistance || likelyVisible;
    const previous = this.lastUpdateAt.get(root);

    if (!fullRate) {
      const interval = 1 / Math.max(1, options.backgroundHz ?? 8);
      if (previous !== undefined && elapsed - previous < interval) return null;
    }

    this.lastUpdateAt.set(root, elapsed);
    if (previous === undefined) return frameDelta;
    return THREE.MathUtils.clamp(elapsed - previous, 0, .18);
  }
}
