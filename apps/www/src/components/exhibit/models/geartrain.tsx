"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { clamp01, damp, exhibit, smooth, useExhibit } from "../engine";
import { labelPosition, overlay } from "../overlay";
import { type Fonts, makeCanvasTexture } from "../textures";
import { basicMaterial, findMesh, findNode, litMap } from "./shared";

const S = 11;
const TEETH = [30, 16, 36, 12];
const RATIO = TEETH.map((_, i) =>
  TEETH.slice(1, i + 1).reduce((r, z, k) => (-r * (TEETH[k] ?? 1)) / z, 1),
);
const PAWL_REST = (28 * Math.PI) / 180;
const TOOTH = (2 * Math.PI) / (TEETH[0] ?? 30);
const AMBER = "#e0a93c";
const DIM = "#4a3b22";
const QUESTION_AT: [number, number, number] = [1.18, 1.02, -0.61];

function drawCounter(ctx: CanvasRenderingContext2D, f: Fonts, runs: number) {
  ctx.fillStyle = "#1b1a18";
  ctx.fillRect(0, 0, 512, 100);
  const digits = String(runs).padStart(6, "0");
  ctx.font = `600 64px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 6; i++) {
    const x = 46 + i * 84;
    ctx.fillStyle = i === 5 ? "#e0a93c" : "#efe7d4";
    ctx.fillRect(x - 36, 10, 72, 80);
    ctx.fillStyle = "#2a2620";
    ctx.fillText(digits[i] ?? "0", x, 54);
  }
}

function cycle(t: number) {
  const u = (t % 3.2) / 3.2;
  const engage = smooth((u - 0.35) / 0.12) * (1 - smooth((u - 0.78) / 0.12));
  return { engage, held: engage > 0.6 };
}

function Question() {
  const plate = useExhibit((s) => s.plate);
  return (
    <Html
      position={QUESTION_AT}
      center
      zIndexRange={[3, 0]}
      portal={overlay}
      calculatePosition={labelPosition}
      pointerEvents="none"
    >
      <div
        className={`pointer-events-none whitespace-nowrap rounded-[10px] border border-line bg-bg/95 px-3 py-2 shadow-[0_10px_30px_-12px_rgba(42,38,32,0.35)] transition-all duration-500 ${
          plate === 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <span className="size-1.5 rounded-full bg-amber" />
          Is this an invoice?
        </p>
        <p className="label mt-0.5 !text-[10px] text-ink-3">yes, 92%, filed to Invoices</p>
      </div>
    </Html>
  );
}

export function GeartrainModel() {
  const { scene } = useGLTF("/models/geartrain.glb");
  const counter = useMemo(() => {
    const state = { runs: 128 };
    const t = makeCanvasTexture(512, 100, (ctx, f) => drawCounter(ctx, f, state.runs));
    return { ...t, state };
  }, []);

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);
    litMap(findMesh(model, "counter_face"), counter.tex);
    const gears = TEETH.map((_, i) => findNode(model, `gear${i}`));
    const lamps = [0, 1, 2, 3].map((i) =>
      basicMaterial(findMesh(model, `lamp${i}`), { color: DIM }),
    );
    return { root, gears, lamps, pawl: findNode(model, "pawl"), theta: 0, target: 0, lastPick: -1 };
  }, [scene, counter]);

  useEffect(() => {
    void document.fonts?.ready.then(() => counter.paint());
  }, [counter]);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const { plate, pick } = exhibit.get();
    const b = built;
    let engage = 0;
    let lit: number | null = null;

    if (plate === 1 && pick !== null) {
      lit = pick;
      if (pick !== b.lastPick) b.target = b.theta;
      if (pick === 0) b.theta += dt * 2.4 * Math.max(0, Math.sin(t * 2.4)) ** 4;
      else if (pick === 1) b.theta = damp(b.theta, Math.floor(t * 1.25) * TOOTH * 2, 18, dt);
      else if (pick === 2) {
        if (pick !== b.lastPick) b.target = b.theta + Math.PI * 0.6;
        b.theta = damp(b.theta, b.target, 3, dt);
      } else b.theta += dt * 1.3 * smooth(Math.sin(t * 1.6) * 3);
    } else if (plate === 2) {
      const c = cycle(t);
      engage = c.engage;
      if (!c.held) b.theta += dt * 0.9 * (1 - engage);
    } else {
      b.theta += dt * (plate === 3 ? 1.4 : 0.55);
      if (plate === 0) lit = Math.floor(t / 1.6) % 4;
    }
    b.lastPick = plate === 1 ? (pick ?? -1) : -1;

    b.gears.forEach((g, i) => {
      if (g) g.rotation.y = b.theta * (RATIO[i] ?? 1);
    });
    if (b.pawl) b.pawl.rotation.y = -PAWL_REST * engage;

    b.lamps.forEach((m, i) => {
      const on = lit === i;
      m.color.set(on ? AMBER : DIM);
      if (on) m.color.multiplyScalar(0.8 + 0.2 * Math.sin(t * 4));
    });

    const runs = 128 + Math.floor(Math.abs(b.theta * (RATIO[3] ?? 1)) / (2 * Math.PI));
    if (runs !== counter.state.runs) {
      counter.state.runs = runs;
      counter.paint();
    }
    b.root.rotation.y = Math.sin(t * 0.25) * 0.02 * clamp01(1 - engage);
  });

  return (
    <>
      <primitive object={built.root} />
      <Question />
    </>
  );
}
