"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { clamp01, damp, exhibit, lerp, live, seg, useExhibit } from "../engine";
import { labelPosition, overlay } from "../overlay";
import { type Fonts, makeCanvasTexture } from "../textures";
import { basicMaterial, findMesh, findNode, litMap } from "./shared";

const S = 9.5;
const GAP = 0.05;
const PORT_Y = 0.0412;
const PORT_Z = 0.0365;
const SLOPE = Math.atan2(0.056, 0.071);
const OUT_DIR = new THREE.Vector3(0, Math.cos(SLOPE), Math.sin(SLOPE));
const OUT = 0.11;
const PENDING = 0.037;

export const CLIENTS = [
  { name: "Claude", note: "Claude Code and Claude Desktop" },
  { name: "Cursor", note: "ready setup" },
  { name: "Codex", note: "Codex CLI" },
  { name: "VS Code", note: "ready setup" },
  { name: "Any client", note: "any MCP client connects" },
];

const AMBER = "#e0a93c";
const GREEN = "#4fd17a";
const OFF = "#3a3732";
const CODE = "482913";

const portX = (i: number) => (i - (CLIENTS.length - 1) / 2) * GAP;

function drawPlugLabel(ctx: CanvasRenderingContext2D, f: Fonts, text: string) {
  ctx.fillStyle = "#e9e2d2";
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = "#2a2620";
  ctx.font = `600 ${text.length > 7 ? 30 : 36}px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 128, 50);
}

type Screen = { title: string; sub: string };

function drawScreen(ctx: CanvasRenderingContext2D, f: Fonts, s: Screen) {
  ctx.fillStyle = "#0e1410";
  ctx.fillRect(0, 0, 1024, 128);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#9df0b4";
  ctx.font = `600 50px ${f.mono}`;
  ctx.textAlign = "left";
  ctx.fillText(s.title, 40, 66);
  ctx.fillStyle = "rgba(157,240,180,0.6)";
  ctx.font = `500 38px ${f.mono}`;
  ctx.textAlign = "right";
  ctx.fillText(s.sub, 984, 68);
}

const plugIn = (p: number, i: number) => (i < 4 ? seg(p, 0.45 + i * 0.09, 0.8 + i * 0.09) : 0);
const pending = (p: number) => seg(p, 1.45, 1.75) * (1 - seg(p, 2.15, 2.35));
const approved = (p: number) => seg(p, 2.15, 2.35);
const removed = (p: number) => seg(p, 2.6, 2.85);

function screenFor(p: number): Screen {
  if (p > 2.7) return { title: "vs code removed", sub: "4 connected" };
  if (p > 2.25) return { title: "client approved", sub: "5 connected" };
  if (p > 1.5) {
    const n = Math.round(clamp01((p - 1.75) / 0.35) * CODE.length);
    const code = (CODE.slice(0, n) + "······".slice(0, CODE.length - n))
      .replace(/(...)/, "$1 ")
      .trim();
    return { title: "new client", sub: `code ${code}` };
  }
  if (p > 0.95) return { title: "clients connected", sub: "4 connected" };
  return { title: "metis mcp", sub: "waiting" };
}

function Tag({ i }: { i: number }) {
  const plate = useExhibit((s) => s.plate);
  const pick = useExhibit((s) => s.pick);
  const c = CLIENTS[i];
  if (!c) return null;
  const on = (plate === 1 && pick === i) || (plate === 2 && i === 4) || (plate === 3 && i === 3);
  const note =
    plate === 2 && i === 4
      ? "asks for access, then your code"
      : plate === 3 && i === 3
        ? "removed, access ends"
        : c.note;
  const out = (plate === 3 && i === 3 ? OUT : plate === 2 && i === 4 ? PENDING : 0.03) * S;
  return (
    <Html
      position={[
        portX(i) * S,
        PORT_Y * S + OUT_DIR.y * out + 0.55,
        PORT_Z * S + OUT_DIR.z * out + 0.3,
      ]}
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
          <span
            className={`size-1.5 rounded-full ${plate === 3 ? "bg-ink-3" : plate === 2 ? "bg-amber" : "bg-ok"}`}
          />
          {c.name}
        </p>
        <p className="label mt-0.5 !text-[10px] text-ink-3">{note}</p>
      </div>
    </Html>
  );
}

type Plug = {
  node: THREE.Object3D;
  base: THREE.Vector3;
  led: THREE.MeshBasicMaterial;
  out: number;
  lift: number;
};

export function PatchboardModel() {
  const { scene } = useGLTF("/models/patchboard.glb");
  const labels = useMemo(
    () => CLIENTS.map((c) => makeCanvasTexture(256, 96, (ctx, f) => drawPlugLabel(ctx, f, c.name))),
    [],
  );
  const shown = useRef("");
  const screen = useMemo(() => {
    let state: Screen = screenFor(0);
    const t = makeCanvasTexture(1024, 128, (ctx, f) => drawScreen(ctx, f, state));
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
    basicMaterial(findMesh(model, "display"), { map: screen.tex });
    const plugs: Plug[] = [];
    CLIENTS.forEach((_, i) => {
      const label = labels[i];
      if (label) litMap(findMesh(model, `label${i}`), label.tex);
      const led = basicMaterial(findMesh(model, `led${i}`), { color: OFF });
      const node = findNode(model, `plug${i}`);
      if (node) plugs.push({ node, base: node.position.clone(), led, out: OUT, lift: 0 });
    });
    return { root, plugs };
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

    const next = screenFor(p);
    const key = `${next.title}|${next.sub}`;
    if (key !== shown.current) {
      shown.current = key;
      screen.show(next);
    }

    built.plugs.forEach((g, i) => {
      let out = lerp(OUT, 0, plugIn(p, i));
      if (i === 4) {
        out = lerp(OUT, PENDING, pending(p));
        if (approved(p) > 0) out = lerp(PENDING, 0, approved(p));
        if (p > 2.35) out = 0;
      }
      if (i === 3) out = lerp(out, OUT, removed(p));
      const lifted = plate === 1 && pick === i;
      g.out = damp(g.out, lifted ? Math.max(out, 0.03) : out, 8, dt);
      g.lift = damp(g.lift, lifted ? 0.015 : 0, 7, dt);
      g.node.position.copy(g.base).addScaledVector(OUT_DIR, g.out);
      g.node.position.y += g.lift;

      const inserted = g.out < 0.004;
      const waiting = i === 4 && p > 1.5 && p < 2.25;
      if (inserted) g.led.color.set(GREEN);
      else if (waiting) g.led.color.set(AMBER).multiplyScalar(0.55 + 0.45 * Math.sin(t * 5));
      else g.led.color.set(OFF);
    });

    built.root.rotation.y = Math.sin(t * 0.25) * 0.015;
  });

  return (
    <>
      <primitive object={built.root} />
      {CLIENTS.map((c, i) => (
        <Tag key={c.name} i={i} />
      ))}
    </>
  );
}
