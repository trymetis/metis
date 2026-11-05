"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { clamp01, damp, exhibit, live, useExhibit } from "../engine";
import { labelPosition, overlay } from "../overlay";
import { type Fonts, makeCanvasTexture, roundRect } from "../textures";
import { basicMaterial, findMesh, findNode } from "./shared";

const S = 10;
const FRONT = 1.05;
const BAY_W = 0.305;
const BAY_H = 1.18;
const BAY_GAP = 0.042;
const BAY_Y = 0.81;

export const STACK = [
  { name: "Caddy", note: "mail.example.com, TLS" },
  { name: "App", note: "next start" },
  { name: "sqld", note: "your data, your disk" },
  { name: "Updater", note: "1.2.0, healthy" },
];

const AMBER = "#e0a93c";
const GREEN = "#4fd17a";

function bayX(i: number) {
  const span = STACK.length * BAY_W + (STACK.length - 1) * BAY_GAP;
  return -span / 2 + BAY_W / 2 + i * (BAY_W + BAY_GAP);
}

function drawBayLabel(ctx: CanvasRenderingContext2D, f: Fonts, text: string) {
  ctx.fillStyle = "#24221f";
  ctx.fillRect(0, 0, 256, 72);
  ctx.fillStyle = "#d9cfb8";
  ctx.font = `600 ${text.length > 5 ? 30 : 34}px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 128, 38);
}

type Screen = { title: string; sub: string; progress: number | null };

function drawScreen(ctx: CanvasRenderingContext2D, f: Fonts, s: Screen) {
  const w = 1024;
  const h = 256;
  ctx.fillStyle = "#0e1410";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#9df0b4";
  ctx.font = `600 64px ${f.mono}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s.title, 48, 112);
  ctx.fillStyle = "rgba(157,240,180,0.6)";
  ctx.font = `500 38px ${f.mono}`;
  ctx.fillText(s.sub, 50, 184);
  if (s.progress !== null) {
    ctx.strokeStyle = "rgba(157,240,180,0.55)";
    ctx.lineWidth = 4;
    roundRect(ctx, 600, 152, 370, 40, 10);
    ctx.stroke();
    ctx.fillStyle = "#9df0b4";
    roundRect(ctx, 608, 160, Math.max(0.001, 354 * s.progress), 24, 6);
    ctx.fill();
  }
}

function screenFor(plate: number, p: number): Screen {
  if (plate === 2)
    return {
      title: "mail.example.com",
      sub: "HTTPS ready",
      progress: null,
    };
  if (plate === 3) {
    const k = clamp01((p - 2.55) / 0.4);
    if (k >= 1) return { title: "metis 1.2.0", sub: "healthy", progress: null };
    return {
      title: "metis 1.1.0",
      sub: "updating",
      progress: Math.round(k * 20) / 20,
    };
  }
  if (plate === 1) return { title: "4 containers", sub: "all running", progress: null };
  return { title: "metis", sub: "running", progress: null };
}

function Tag({ i }: { i: number }) {
  const plate = useExhibit((s) => s.plate);
  const pick = useExhibit((s) => s.pick);
  const c = STACK[i];
  if (!c) return null;
  const on = (plate === 1 && pick === i) || (plate === 2 && i === 0) || (plate === 3 && i === 3);
  const done = plate === 3 && i === 3;
  return (
    <Html
      position={[bayX(i), BAY_Y + BAY_H / 2 + 0.42, FRONT + 0.25]}
      center
      zIndexRange={[3, 0]}
      portal={overlay}
      calculatePosition={labelPosition}
      pointerEvents="none"
    >
      <div
        className={`pointer-events-none whitespace-nowrap rounded-[10px] border border-line bg-bg/95 px-3 py-2 shadow-[0_10px_30px_-12px_rgba(42,38,32,0.35)] transition-all duration-500 ${
          on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <span className={`size-1.5 rounded-full ${done ? "bg-ok" : "bg-amber"}`} />
          {c.name}
        </p>
        <p className="label mt-0.5 !text-[10px] text-ink-3">{c.note}</p>
      </div>
    </Html>
  );
}

type Bay = {
  node: THREE.Object3D;
  z: number;
  led: THREE.MeshBasicMaterial;
  out: number;
  glow: number;
};

export function ServerModel() {
  const { scene } = useGLTF("/models/server.glb");
  const labels = useMemo(
    () => STACK.map((c) => makeCanvasTexture(256, 72, (ctx, f) => drawBayLabel(ctx, f, c.name))),
    [],
  );
  const shown = useRef("");
  const screen = useMemo(() => {
    let state: Screen = screenFor(0, 0);
    const t = makeCanvasTexture(1024, 256, (ctx, f) => drawScreen(ctx, f, state));
    return {
      ...t,
      show: (s: Screen) => {
        state = s;
        t.paint();
      },
    };
  }, []);

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);

    const bays: Bay[] = [];
    STACK.forEach((_, i) => {
      const label = labels[i];
      if (label) basicMaterial(findMesh(model, `label${i}`), { map: label.tex });
      const led = basicMaterial(findMesh(model, `led${i}`), { color: GREEN });
      const node = findNode(model, `bay${i}`);
      if (node) bays.push({ node, z: node.position.z, led, out: 0, glow: 0 });
    });
    basicMaterial(findMesh(model, "display"), { map: screen.tex });
    const power = basicMaterial(findMesh(model, "power_led"), { color: AMBER });

    return { root, bays, power };
  }, [scene, labels, screen]);

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      for (const l of labels) l.paint();
      screen.paint();
    });
  }, [labels, screen]);

  useFrame((s, dt) => {
    const { plate, pick } = exhibit.get();
    const p = live.ps;
    const t = s.clock.elapsedTime;

    const next = screenFor(plate, p);
    const key = JSON.stringify(next);
    if (key !== shown.current) {
      shown.current = key;
      screen.show(next);
    }

    built.bays.forEach((b, i) => {
      let out = 0;
      if (plate === 1 && pick === i) out = 0.42;
      if (plate === 2 && i === 0) out = 0.14;
      if (plate === 3 && i === 3) out = 0.14;
      b.out = damp(b.out, out, 6, dt);
      b.node.position.z = b.z + b.out / S;

      const focus =
        (plate === 1 && (pick === null || pick === i)) ||
        (plate === 2 && i === 0) ||
        (plate === 3 && i === 3);
      b.glow = damp(b.glow, focus ? 1 : 0, 5, dt);
      const updating = plate === 3 && i === 3 && p < 2.95;
      const blink = 0.55 + 0.45 * Math.sin(t * (3.1 + i * 0.9) + i * 1.7);
      b.led.color.set(updating ? AMBER : GREEN);
      const k = plate === 0 ? blink : 0.35 + 0.65 * b.glow;
      b.led.color.multiplyScalar(Math.max(0.25, k));
    });

    built.power.color.set(AMBER).multiplyScalar(0.75 + 0.25 * Math.sin(t * 1.4));
    built.root.rotation.y = Math.sin(t * 0.25) * 0.02;
  });

  return (
    <>
      <primitive object={built.root} />
      {STACK.map((c, i) => (
        <Tag key={c.name} i={i} />
      ))}
    </>
  );
}
