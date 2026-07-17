"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadGameTextures, type GameTextures } from "../../game/rendering/textures";
import {
  createAldabraTortoise,
  createAmericanBison,
  createAmericanFlamingo,
  createBlueAndGoldMacaw,
  createGaryPolarBear,
  createGreenAracari,
  createRedPanda,
  createScarletIbis,
  createSeaLion,
  createSpiderMonkey,
  createSunConure,
  createZebra,
  measureZooAnimalGeometry,
  type ZooAnimalGeometryMetrics,
  type ZooAnimalRig,
} from "../../game/world/ZooAnimals";
import styles from "../characters/CharacterShowroom.module.css";

type QualityPreset = "hero" | "balanced" | "mobile";
type AnimalDefinition = {
  label: string;
  family: string;
  factory: (textures: GameTextures, quality: number) => ZooAnimalRig;
};

const ANIMALS: AnimalDefinition[] = [
  { label: "Gary", family: "Polar bear", factory: createGaryPolarBear },
  { label: "Sun conure", family: "Parrot", factory: createSunConure },
  { label: "Blue & gold", family: "Macaw", factory: createBlueAndGoldMacaw },
  { label: "Scarlet ibis", family: "Wading bird", factory: createScarletIbis },
  { label: "Green aracari", family: "Toucan", factory: createGreenAracari },
  { label: "Spider monkey", family: "Primate", factory: (textures, quality) => createSpiderMonkey(textures, quality, 1) },
  { label: "Sea lion", family: "Pinniped", factory: (textures, quality) => createSeaLion(textures, quality, 1) },
  { label: "Red panda", family: "Arboreal mammal", factory: createRedPanda },
  { label: "Zebra", family: "Equid", factory: (textures, quality) => createZebra(textures, quality, 1) },
  { label: "Aldabra", family: "Giant tortoise", factory: createAldabraTortoise },
  { label: "Flamingo", family: "Wading bird", factory: (textures, quality) => createAmericanFlamingo(textures, quality, 1) },
  { label: "Bison", family: "Bovid", factory: (textures, quality) => createAmericanBison(textures, quality, 1) },
];

const EMPTY_METRICS: ZooAnimalGeometryMetrics = { articulatedJoints: 0, meshes: 0, triangles: 0, vertices: 0 };
const QUALITY_VALUE: Record<QualityPreset, number> = { hero: 1, balanced: .74, mobile: .5 };

function disposeRig(rig: ZooAnimalRig) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  rig.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  rig.ownedTextures?.forEach(texture => texture.dispose());
}

export function AnimalShowroom() {
  const viewport = useRef<HTMLDivElement>(null);
  const motionRef = useRef("idle"), playingRef = useRef(true);
  const [selected, setSelected] = useState(0);
  const [quality, setQuality] = useState<QualityPreset>("hero");
  const [wireframe, setWireframe] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [motion, setMotion] = useState("idle");
  const [motions, setMotions] = useState<string[]>(["idle"]);
  const [metrics, setMetrics] = useState<ZooAnimalGeometryMetrics>(EMPTY_METRICS);
  const [ready, setReady] = useState(false);

  useEffect(() => { motionRef.current = motion; }, [motion]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;
    let disposed = false, raf = 0;
    setReady(false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#151a17");
    scene.fog = new THREE.Fog("#151a17", 14, 32);
    const camera = new THREE.PerspectiveCamera(34, 1, .04, 80);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = quality !== "mobile";
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "hero" ? 2 : 1));
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.dampingFactor = .075;
    controls.minDistance = .5;
    controls.maxDistance = 24;

    const stage = new THREE.Group();
    scene.add(stage);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(13, 96),
      new THREE.MeshPhysicalMaterial({ color: "#253029", roughness: .78, clearcoat: .06 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    stage.add(floor);
    const grid = new THREE.GridHelper(18, 36, "#64776b", "#344039");
    grid.position.y = .005;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .18;
    stage.add(grid);

    const hemisphere = new THREE.HemisphereLight("#eef1e5", "#283128", 1.75);
    const key = new THREE.DirectionalLight("#ffe6bf", 4.8);
    key.position.set(-5, 8, -6);
    key.castShadow = quality !== "mobile";
    key.shadow.mapSize.set(2048, 2048);
    const rim = new THREE.DirectionalLight("#8fc8c4", 2.4);
    rim.position.set(5, 5, 4);
    scene.add(hemisphere, key, rim);

    const textures = loadGameTextures(renderer, () => { if (!disposed) setReady(true); });
    const rig = ANIMALS[selected].factory(textures, QUALITY_VALUE[quality]);
    stage.add(rig.root);
    rig.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rig.root);
    rig.root.position.y -= bounds.min.y;
    rig.root.updateMatrixWorld(true);
    bounds.setFromObject(rig.root);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z, 1);
    camera.position.set(center.x + extent * .95, center.y + extent * .3, center.z - extent * 2.15);
    controls.target.copy(center).setY(center.y + size.y * .06);
    controls.minDistance = extent * .55;
    controls.maxDistance = extent * 6;
    controls.update();

    const states = Array.isArray(rig.root.userData.animationStates) && rig.root.userData.animationStates.length
      ? rig.root.userData.animationStates.map(String)
      : ["idle"];
    const initialMotion = states.includes(motionRef.current) ? motionRef.current : states[0];
    motionRef.current = initialMotion;
    rig.root.userData.animationState = initialMotion;
    setMotion(initialMotion);
    setMotions(states);
    setMetrics(measureZooAnimalGeometry(rig.root));
    rig.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { if ("wireframe" in material) (material as THREE.MeshStandardMaterial).wireframe = wireframe; });
    });

    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const timer = new THREE.Timer();
    timer.connect(document);
    let elapsed = 0;
    const animate = () => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      timer.update();
      const delta = Math.min(timer.getDelta(), .05);
      if (playingRef.current) elapsed += delta;
      rig.root.userData.animationState = motionRef.current;
      rig.update(elapsed, playingRef.current ? delta : 0);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      timer.dispose();
      controls.dispose();
      disposeRig(rig);
      Object.values(textures).forEach(texture => texture.dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [quality, selected, wireframe]);

  const animal = ANIMALS[selected];
  return <main className={styles.shell} aria-label="Interactive premium zoo animal showroom">
    <div className={styles.viewport} ref={viewport} />
    <header className={styles.header}>
      <div><span>Sloth in the City · development</span><h1>Zoo animal lab</h1></div>
      <div className={styles.loadState}><i className={ready ? styles.ready : undefined} />{ready ? "surface atlas ready" : "loading atlas"}</div>
    </header>
    <aside className={styles.panel}>
      <section>
        <label>Species</label>
        <div className={styles.identities}>
          {ANIMALS.map((definition, index) => <button className={selected === index ? styles.active : undefined} key={definition.label} onClick={() => setSelected(index)} type="button">
            <span>{String(index + 1).padStart(2, "0")}</span>{definition.label}
          </button>)}
        </div>
      </section>
      <section className={`${styles.twoColumn}`}>
        <div><label>LOD budget</label><select value={quality} onChange={event => setQuality(event.target.value as QualityPreset)}><option value="hero">Hero · ultra</option><option value="balanced">Balanced</option><option value="mobile">Mobile</option></select></div>
        <div><label>Motion state</label><select value={motion} onChange={event => setMotion(event.target.value)}>{motions.map(state => <option key={state} value={state}>{state}</option>)}</select></div>
      </section>
      <section>
        <div className={styles.segmented}><button className={!wireframe ? styles.active : undefined} onClick={() => setWireframe(false)} type="button">surface</button><button className={wireframe ? styles.active : undefined} onClick={() => setWireframe(true)} type="button">wireframe</button></div>
        <button className={styles.playButton} onClick={() => setPlaying(value => !value)} type="button"><span>{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause motion" : "Play motion"}</button>
      </section>
      <section className={styles.metrics}>
        <label>Selected mesh · {animal.family}</label>
        <dl>
          <div><dt>Fidelity</dt><dd className={styles.clean}>v2 hero</dd></div>
          <div><dt>Triangles</dt><dd>{metrics.triangles.toLocaleString()}</dd></div>
          <div><dt>Vertices</dt><dd>{metrics.vertices.toLocaleString()}</dd></div>
          <div><dt>Meshes</dt><dd>{metrics.meshes}</dd></div>
          <div><dt>Joints</dt><dd>{metrics.articulatedJoints}</dd></div>
          <div><dt>States</dt><dd>{motions.length}</dd></div>
        </dl>
      </section>
    </aside>
    <nav className={styles.sceneLinks} aria-label="Direct game debug checkpoints"><span>Review in world</span><Link href="/?debug=bronx-polar">Gary</Link><Link href="/?debug=bronx-birds">Aviary</Link><Link href="/?debug=bronx-monkeys">Monkeys</Link><Link href="/debug/characters">Humans</Link></nav>
    <footer className={styles.footer}><span>Drag to orbit · wheel to dolly</span><Link href="/">Return to game ↗</Link></footer>
  </main>;
}
