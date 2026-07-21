"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPremiumHuman, markPremiumHumanDisposed, type PremiumHumanOptions } from "../../game/world/PremiumCharacter";
import styles from "./CharacterShowroom.module.css";

type LightingPreset = "studio" | "park" | "subway";
type Framing = "lineup" | "body" | "face";
type QualityPreset = "hero" | "mobile";
type AnimationPreset = "HumanIdle" | "HumanWalk";
type PosePreset = NonNullable<PremiumHumanOptions["pose"]>;
type CharacterStatus = {
  status: string;
  lod: string;
  triangles: number;
  bones: number;
  clips: string[];
  visibleRoots: number;
  legacyParts: string[];
};

const ARCHETYPES: Array<PremiumHumanOptions & { label: string }> = [
  { label: "Male · short", role: "attendant", quality: 1, variant: 0, faceVariant: 0, coat: "#315c43", trousers: "#21382d", skin: "#704735", hair: "#211916", accessory: "radio", outfit: "zoo-uniform", zooNameTag: "Bronx Zoo" },
  { label: "Male · curly", role: "visitor", quality: 1, variant: 1, faceVariant: 1, coat: "#4f7fa4", trousers: "#315777", skin: "#aa7655", hair: "#2b1d17", accessory: "tote", outfit: "cotton-denim" },
  { label: "Female · bob", role: "visitor", quality: 1, variant: 12, faceVariant: 12, coat: "#a05d7b", trousers: "#24252c", skin: "#7d4f39", hair: "#171719", accessory: "camera", outfit: "silk-leggings" },
  { label: "Female · ponytail", role: "visitor", quality: 1, variant: 13, faceVariant: 13, coat: "#a95135", trousers: "#51493f", skin: "#d0a17d", hair: "#332219", accessory: "backpack", outfit: "knit-chinos" },
];

const EMPTY_STATUS: CharacterStatus = { status: "loading", lod: "—", triangles: 0, bones: 0, clips: [], visibleRoots: 0, legacyParts: [] };

function inspectCharacter(root: THREE.Group): CharacterStatus {
  let triangles = 0, bones = 0;
  const legacyParts: string[] = [];
  const legacyPattern = /premium-human|continuous-tailored|head-conforming|garmentplacket|collar\.|bobstrand|ponytail|curl\.|mouthdetail|brow\./i;
  root.traverse(object => {
    if (object instanceof THREE.Bone) bones++;
    if (!(object instanceof THREE.Mesh)) return;
    if (legacyPattern.test(object.name)) legacyParts.push(object.name);
    const geometry = object.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count ?? 0) / 3;
  });
  return {
    status: String(root.userData.authoredHumanStatus ?? "procedural"),
    lod: String(root.userData.authoredHumanLod ?? "fallback"),
    triangles: Math.round(triangles),
    bones,
    clips: root.animations.map(clip => clip.name || "Untitled clip"),
    visibleRoots: root.children.length,
    legacyParts,
  };
}

function reviewBodyBounds(root: THREE.Group) {
  const bounds = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    bounds.union(new THREE.Box3().setFromObject(object, true));
  });
  // Loading/error states should remain inspectable even if an exporter changes
  // the mesh subclass. Runtime accessories never dictate face/body framing.
  return bounds.isEmpty() ? new THREE.Box3().setFromObject(root, true) : bounds;
}

function disposeLooseSceneResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function CharacterShowroom() {
  const viewport = useRef<HTMLDivElement>(null);
  const lightingRef = useRef<LightingPreset>("studio"), framingRef = useRef<Framing>("lineup"), selectedRef = useRef(0), animationRef = useRef(true), animationClipRef = useRef<AnimationPreset>("HumanWalk");
  const framingVersion = useRef(0);
  const [lighting, setLighting] = useState<LightingPreset>("studio");
  const [framing, setFraming] = useState<Framing>("lineup");
  const [quality, setQuality] = useState<QualityPreset>("hero");
  const [pose, setPose] = useState<PosePreset>("neutral");
  const [selected, setSelected] = useState(0);
  const [animationClip, setAnimationClip] = useState<AnimationPreset>("HumanWalk");
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [statuses, setStatuses] = useState<CharacterStatus[]>(ARCHETYPES.map(() => ({ ...EMPTY_STATUS })));

  useEffect(() => { lightingRef.current = lighting; }, [lighting]);
  useEffect(() => { framingRef.current = framing; framingVersion.current++; }, [framing]);
  useEffect(() => { selectedRef.current = selected; framingVersion.current++; }, [selected]);
  useEffect(() => { animationRef.current = animationPlaying; }, [animationPlaying]);
  useEffect(() => { animationClipRef.current = animationClip; }, [animationClip]);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;
    let disposed = false, raf = 0, previousStatus = "", previousLighting = "", appliedFramingVersion = -1, appliedFramingGeometry = "";
    const scene = new THREE.Scene();
    const background = new THREE.Color("#171b19");
    scene.background = background;
    scene.fog = new THREE.Fog("#171b19", 10, 22);
    const camera = new THREE.PerspectiveCamera(34, 1, .04, 60);
    camera.position.set(0, 1.55, -10.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = quality === "hero";
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "hero" ? 2 : 1));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.enablePan = false;
    controls.minDistance = .65;
    controls.maxDistance = 16;
    controls.target.set(0, 1.25, 0);

    const stage = new THREE.Group();
    scene.add(stage);
    const floorMaterial = new THREE.MeshPhysicalMaterial({ color: "#28302d", roughness: .7, metalness: .04, clearcoat: .08 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 96), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    stage.add(floor);
    const backdropMaterial = new THREE.MeshStandardMaterial({ color: "#202725", roughness: .92, side: THREE.DoubleSide });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), backdropMaterial);
    backdrop.position.set(0, 3.2, 2.2);
    stage.add(backdrop);
    const grid = new THREE.GridHelper(14, 28, "#607068", "#35413d");
    grid.position.y = .002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .22;
    stage.add(grid);

    const hemisphere = new THREE.HemisphereLight("#ecf0e4", "#31372f", 1.6);
    const key = new THREE.DirectionalLight("#fff0d5", 4.5);
    key.position.set(-4.5, 7, -5.5);
    key.castShadow = quality === "hero";
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -7;
    key.shadow.camera.right = key.shadow.camera.top = 7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    const rim = new THREE.DirectionalLight("#8dbdc2", 2.2);
    rim.position.set(4, 4.5, 3.5);
    const fill = new THREE.PointLight("#d9ef8b", 1.4, 12, 2);
    fill.position.set(0, 2.5, -3.5);
    scene.add(hemisphere, key, rim, fill);

    // The diagnostics panel occupies the left quarter of the viewport. Keep
    // the complete four-rig lineup in the unobstructed stage area.
    const spacing = 1.78, lineupCenter = 2.70;
    const results = ARCHETYPES.map((options, index) => {
      const result = createPremiumHuman({
        ...options,
        quality: quality === "hero" ? 1 : .58,
        pose,
      });
      result.root.position.x = lineupCenter + (index - 1.5) * spacing;
      stage.add(result.root);
      return result;
    });
    const mixers = new Map<THREE.Group, { action: THREE.AnimationAction; clipName: string; mixer: THREE.AnimationMixer }>();
    const timer = new THREE.Timer();
    timer.connect(document);

    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const applyLighting = (preset: LightingPreset) => {
      if (preset === "park") {
        background.set("#283d40"); scene.fog = new THREE.Fog("#283d40", 9, 20);
        hemisphere.color.set("#9bb5b3"); hemisphere.groundColor.set("#30291f"); hemisphere.intensity = .75;
        key.color.set("#ffc178"); key.intensity = 3.4; rim.color.set("#698c99"); rim.intensity = 1.15; fill.intensity = .45;
        renderer.toneMappingExposure = .94;
      } else if (preset === "subway") {
        background.set("#6a716c"); scene.fog = new THREE.Fog("#6a716c", 12, 24);
        hemisphere.color.set("#f4f0df"); hemisphere.groundColor.set("#6d7068"); hemisphere.intensity = 2.25;
        key.color.set("#e8fff1"); key.intensity = 5.8; rim.color.set("#d2e8e4"); rim.intensity = 2.5; fill.intensity = 2.2;
        renderer.toneMappingExposure = 1.18;
      } else {
        background.set("#171b19"); scene.fog = new THREE.Fog("#171b19", 10, 22);
        hemisphere.color.set("#ecf0e4"); hemisphere.groundColor.set("#31372f"); hemisphere.intensity = 1.6;
        key.color.set("#fff0d5"); key.intensity = 4.5; rim.color.set("#8dbdc2"); rim.intensity = 2.2; fill.intensity = 1.4;
        renderer.toneMappingExposure = 1.08;
      }
    };

    const applyFraming = () => {
      const mode = framingRef.current, index = selectedRef.current;
      const focusX = lineupCenter + (index - 1.5) * spacing;
      const selectedRoot = results[index]?.root;
      const bounds = selectedRoot ? reviewBodyBounds(selectedRoot) : new THREE.Box3();
      const hasBounds = !bounds.isEmpty();
      const height = hasBounds ? Math.max(.1, bounds.max.y - bounds.min.y) : 2.2;
      const center = hasBounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(focusX, 1.1, 0);
      if (mode === "face") {
        // Every source mesh has slightly different stature and head-to-body
        // proportions. Frame the measured cranium rather than a hard-coded
        // adult height so the close-up gate cannot crop shorter archetypes.
        const faceY = hasBounds ? bounds.min.y + height * .875 : 1.93;
        const faceDistance = THREE.MathUtils.clamp(height * .48, .92, 1.25);
        camera.position.set(center.x, faceY, center.z - faceDistance);
        controls.target.set(center.x, faceY, center.z);
        controls.minDistance = .55;
      } else if (mode === "body") {
        const bodyDistance = THREE.MathUtils.clamp(height * 2.2, 4.2, 5.8);
        camera.position.set(center.x, center.y + height * .05, center.z - bodyDistance);
        controls.target.copy(center);
        controls.minDistance = 2.2;
      } else {
        camera.position.set(lineupCenter, 1.55, -14.2);
        controls.target.set(lineupCenter, 1.25, 0);
        controls.minDistance = 5.5;
      }
      controls.update();
    };

    const animate = (timestamp?: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), .05);
      if (previousLighting !== lightingRef.current) { previousLighting = lightingRef.current; applyLighting(lightingRef.current); }
      const framingGeometry = results.map(result => String(result.root.userData.authoredHumanStatus ?? "loading")).join(":");
      if (appliedFramingVersion !== framingVersion.current || appliedFramingGeometry !== framingGeometry) {
        appliedFramingVersion = framingVersion.current;
        appliedFramingGeometry = framingGeometry;
        applyFraming();
      }
      results.forEach((result, resultIndex) => {
        const ready = result.root.userData.authoredHumanStatus === "ready";
        result.root.visible = ready && (framingRef.current === "lineup" || resultIndex === selectedRef.current);
        if (!ready || !result.root.animations.length) return;
        const desired = result.root.animations.find(clip => clip.name === animationClipRef.current) ?? result.root.animations[0];
        const current = mixers.get(result.root);
        if (current?.clipName === desired.name) return;
        const mixer = current?.mixer ?? new THREE.AnimationMixer(result.root);
        const action = mixer.clipAction(desired).reset().fadeIn(.16).play();
        current?.action.fadeOut(.16);
        mixers.set(result.root, { action, clipName: desired.name, mixer });
      });
      mixers.forEach(({ mixer }) => { mixer.timeScale = animationRef.current ? 1 : 0; mixer.update(delta); });
      const nextStatuses = results.map(result => inspectCharacter(result.root));
      const statusKey = JSON.stringify(nextStatuses);
      if (statusKey !== previousStatus) { previousStatus = statusKey; setStatuses(nextStatuses); }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mixers.forEach(({ mixer }) => mixer.stopAllAction());
      timer.dispose();
      results.forEach(result => {
        markPremiumHumanDisposed(result.root);
        result.ownedTextures.forEach(texture => texture.dispose());
      });
      controls.dispose();
      disposeLooseSceneResources(stage);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pose, quality]);

  const active = statuses[selected] ?? EMPTY_STATUS;
  const readyCount = statuses.filter(status => status.status === "ready").length;
  return <main className={styles.shell} data-character-debug="true" data-ready-count={readyCount}>
    <div ref={viewport} className={styles.viewport} aria-label="Interactive authored human character showroom" />
    <header className={styles.header}>
      <div><span>Sloth in the City · development</span><h1>Human character lab</h1></div>
      <div className={styles.loadState}><i className={readyCount === ARCHETYPES.length ? styles.ready : ""}/>{readyCount} / {ARCHETYPES.length} authored rigs ready</div>
    </header>
    <aside className={styles.panel}>
      <section><label>Framing</label><div className={styles.segmented}>
        {(["lineup", "body", "face"] as Framing[]).map(value => <button key={value} className={framing === value ? styles.active : ""} onClick={() => setFraming(value)}>{value}</button>)}
      </div></section>
      <section><label>Identity</label><div className={styles.identities}>
        {ARCHETYPES.map((character, index) => <button key={character.label} className={selected === index ? styles.active : ""} onClick={() => { setSelected(index); if (framing === "lineup") setFraming("body"); }}><span>{String(index + 1).padStart(2, "0")}</span>{character.label}</button>)}
      </div></section>
      <section className={styles.twoColumn}><div><label>LOD</label><select value={quality} onChange={event => setQuality(event.target.value as QualityPreset)}><option value="hero">Hero · LOD0</option><option value="mobile">Mobile · LOD2</option></select></div><div><label>Pose</label><select value={pose} onChange={event => { const next = event.target.value as PosePreset; setPose(next); if (next !== "neutral") setAnimationClip("HumanIdle"); }}><option value="neutral">Neutral</option><option value="waving">Waving</option><option value="checking-map">Map</option><option value="photographing">Camera</option><option value="seated">Seated</option></select></div></section>
      <section><label>Lighting</label><div className={styles.segmented}>{(["studio", "park", "subway"] as LightingPreset[]).map(value => <button key={value} className={lighting === value ? styles.active : ""} onClick={() => setLighting(value)}>{value}</button>)}</div></section>
      <section className={styles.twoColumn}><div><label>Animation</label><select value={animationClip} onChange={event => setAnimationClip(event.target.value as AnimationPreset)}><option value="HumanWalk">Natural walk</option><option value="HumanIdle">Breathing idle</option></select></div><button className={styles.playButton} onClick={() => setAnimationPlaying(value => !value)}><span>{animationPlaying ? "Ⅱ" : "▶"}</span>{animationPlaying ? "Pause" : "Play"}</button></section>
      <section className={styles.metrics}><label>Selected mesh</label><dl><div><dt>Status</dt><dd>{active.status}</dd></div><div><dt>LOD</dt><dd>{active.lod}</dd></div><div><dt>Triangles</dt><dd>{active.triangles.toLocaleString()}</dd></div><div><dt>Bones</dt><dd>{active.bones}</dd></div><div><dt>Roots</dt><dd>{active.visibleRoots}</dd></div><div><dt>Legacy</dt><dd className={active.legacyParts.length ? styles.warning : styles.clean}>{active.legacyParts.length ? active.legacyParts.length : "0 · clean"}</dd></div><div><dt>Clip</dt><dd>{active.clips.includes(animationClip) ? animationClip : active.clips[0] ?? "—"}</dd></div></dl>{active.legacyParts.length > 0 && <p className={styles.legacyList}>{active.legacyParts.join(" · ")}</p>}</section>
    </aside>
    <nav className={styles.sceneLinks} aria-label="Direct game debug checkpoints"><span>Review in world</span><Link href="/?debug=station">Platform</Link><Link href="/?debug=train">N train</Link><Link href="/?debug=transfer">Transfer</Link><Link href="/?debug=bronx">Bronx entry</Link><Link href="/?debug=bronx-sloths">Sloth habitat</Link><Link href="/?debug=return-train-5">Return train</Link><Link href="/?debug=homecoming">Home Grove</Link></nav>
    <footer className={styles.footer}><span>Drag to orbit · wheel to dolly</span><Link href="/">Return to game ↗</Link></footer>
  </main>;
}
