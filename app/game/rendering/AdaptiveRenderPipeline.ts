import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import type { RenderBudget } from "../systems/quality/AdaptiveQualityManager";

type AdaptiveRenderPipelineOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  postProcessingPixelLimit?: number;
  ambientOcclusionIntensity?: number;
};

/** Applies live render-budget changes without rebuilding or resetting a world. */
export class AdaptiveRenderPipeline {
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private postProcessingActive = false;
  private lastSignature = "";
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly postProcessingPixelLimit: number;
  private readonly ambientOcclusionIntensity: number;

  constructor(options: AdaptiveRenderPipelineOptions) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.postProcessingPixelLimit = options.postProcessingPixelLimit ?? 1_750_000;
    this.ambientOcclusionIntensity = options.ambientOcclusionIntensity ?? .58;
  }

  apply(budget: RenderBudget, width: number, height: number, pixelRatioCap = Number.POSITIVE_INFINITY) {
    const pixelRatio = Math.min(budget.pixelRatio, pixelRatioCap);
    const postProcessingActive = budget.postProcessing
      && budget.ambientOcclusion
      && width * height < this.postProcessingPixelLimit;
    const signature = [
      budget.level,
      pixelRatio.toFixed(3),
      width,
      height,
      budget.shadows,
      budget.shadowMapSize,
      budget.softShadows,
      budget.textureAnisotropy,
      postProcessingActive,
    ].join(":");
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = budget.shadows;
    // Three r185 folds soft PCF into PCFShadowMap and warns on the legacy
    // PCFSoftShadowMap constant. Keep one supported filter across presets.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applySceneSampling(budget);

    if (postProcessingActive && !this.composer) this.createComposer(width, height);
    this.postProcessingActive = postProcessingActive;
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
    }
  }

  render(allowPostProcessing = true) {
    if (allowPostProcessing && this.postProcessingActive && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.gtao?.dispose();
    this.composer?.dispose();
    this.gtao = null;
    this.composer = null;
  }

  private createComposer(width: number, height: number) {
    // Reuse the beauty pass depth buffer for GTAO. The stock pass otherwise
    // renders every mesh a second time solely to recover depth and normals;
    // GTAO supports reconstructing normals from this full-resolution depth.
    const renderTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: true });
    renderTarget.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, width, height);
    this.gtao.blendIntensity = this.ambientOcclusionIntensity;
    this.composer.addPass(this.gtao);
    const sharedDepthTexture = this.composer.readBuffer.depthTexture;
    if (!sharedDepthTexture) throw new Error("Adaptive render pipeline requires a readable beauty depth buffer");
    this.gtao.setGBuffer(sharedDepthTexture);
    this.composer.addPass(new OutputPass());
  }

  private applySceneSampling(budget: RenderBudget) {
    const anisotropy = Math.min(budget.textureAnisotropy, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.traverse(object => {
      if (object instanceof THREE.Light && "shadow" in object) {
        const light = object as THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
        const originalCastShadow = light.userData.qualityOriginalCastShadow;
        if (typeof originalCastShadow !== "boolean") light.userData.qualityOriginalCastShadow = light.castShadow;
        light.castShadow = budget.shadows && Boolean(light.userData.qualityOriginalCastShadow);
        if (light.shadow.mapSize.width !== budget.shadowMapSize || light.shadow.mapSize.height !== budget.shadowMapSize) {
          light.shadow.map?.dispose();
          light.shadow.map = null;
          light.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
        }
      }
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (!(value instanceof THREE.Texture) || value.anisotropy === anisotropy) continue;
          value.anisotropy = anisotropy;
          // Loaders will upload undecoded textures when their image arrives.
          // Marking an empty source dirty here causes a WebGL warning per map.
          if (value.image) value.needsUpdate = true;
        }
      }
    });
  }
}
