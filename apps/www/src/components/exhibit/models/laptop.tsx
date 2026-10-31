"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

import { clamp01, damp, ease, exhibit } from "../engine";
import { findMesh, findNode } from "./shared";

const S = 10;
const OPEN = 1.9;

export const SCREEN_IMAGES = [
  "screens/inbox",
  "screens/mail-ai",
  "screens/calendar",
  "screens/drive",
  "screens/agent",
  "agent/workflow",
  "agent/mcp",
].map((n) => `/shots/${n}.webp`);

export function LaptopModel() {
  const { scene } = useGLTF("/models/laptop.glb");
  const textures = useTexture(SCREEN_IMAGES);
  const [start] = useState(() => performance.now());

  const built = useMemo(() => {
    for (const t of textures) {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);
    const bar = findMesh(model, "menubar");
    const menubar = bar?.material instanceof THREE.MeshStandardMaterial ? bar.material : null;
    const mesh = findMesh(model, "screen");
    const mat = new THREE.MeshBasicMaterial({
      map: textures[0] ?? null,
      color: new THREE.Color(0, 0, 0),
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    if (mesh) mesh.material = mat;
    return { root, lid: findNode(model, "lid"), mat, menubar, shown: 0, glow: 0 };
  }, [scene, textures]);

  useFrame((s, dt) => {
    const t = (performance.now() - start) / 1000;
    const open = ease(clamp01((t - 0.35) / 1.7));
    if (built.lid) built.lid.rotation.x = -open * OPEN;
    const want = Math.min(textures.length - 1, exhibit.get().plate);
    const on = clamp01((open - 0.55) / 0.3);
    if (want !== built.shown) {
      built.glow = damp(built.glow, 0, 18, dt);
      if (built.glow < 0.04) {
        built.shown = want;
        built.mat.map = textures[want] ?? null;
        built.mat.needsUpdate = true;
      }
    } else {
      built.glow = damp(built.glow, 1, 9, dt);
    }
    const k = built.glow * on;
    built.mat.color.setRGB(k, k, k);
    if (built.menubar) built.menubar.emissiveIntensity = on;
    built.root.position.y = Math.sin(s.clock.elapsedTime * 0.6) * 0.012;
  });

  return <primitive object={built.root} />;
}
