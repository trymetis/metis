"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Special_Elite } from "next/font/google";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { clamp01, damp, live } from "../engine";
import { makeCanvasTexture } from "../textures";
import { findMesh, findNode } from "./shared";

const typeface = Special_Elite({ weight: "400", subsets: ["latin"], display: "swap" });

const S = 9;
const USER = "#2a2620";
const AGENT = "#9a6a12";

type Line = { who: "user" | "agent" | ""; text: string };

const L = (who: Line["who"], text = ""): Line => ({ who, text });

const TRANSCRIPT: Line[] = [
  L("user", "USER:"),
  L("user", "FIND MEERA'S RENEWAL THREAD"),
  L("user", "AND DRAFT A REPLY."),
  L(""),
  L("agent", "AGENT:"),
  L("agent", "SEARCHING MAIL ...... 3 THREADS"),
  L("agent", 'READING "FINAL REDLINES"'),
  L("agent", "CHECKING CALENDAR ... FRI 24 OCT"),
  L("agent", "OPENING DRIVE ....... CONTRACT V7"),
  L(""),
  L("agent", "AGENT:"),
  L("agent", "DRAFT READY. SEND IT TO MEERA?"),
  L("agent", "[ APPROVE ]      [ DENY ]"),
  L(""),
  L("user", "USER:"),
  L("user", "APPROVED."),
  L(""),
  L("agent", "SENT. RUNNING ON YOUR MODEL,"),
  L("agent", "WITH YOUR OWN KEY."),
];

const SEGMENTS: { from: number; to: number; a: number; b: number }[] = [
  { from: 0, to: 2, a: -1, b: 0 },
  { from: 3, to: 8, a: 0.55, b: 1.35 },
  { from: 9, to: 12, a: 1.55, b: 2.0 },
  { from: 13, to: 15, a: 2.08, b: 2.32 },
  { from: 16, to: 18, a: 2.55, b: 2.95 },
];

const COLS = 34;
const CW = 1024;
const MARGIN = 0.09;
const ADVANCE = (1 - MARGIN * 2) / COLS;
const KEY_ROWS = [11, 11, 11, 10];

function typed(p: number) {
  let line = 0;
  let col = 0;
  for (const s of SEGMENTS) {
    const lines = TRANSCRIPT.slice(s.from, s.to + 1);
    const total = lines.reduce((n, l) => n + l.text.length + 1, 0);
    let left = Math.floor(clamp01((p - s.a) / (s.b - s.a)) * total);
    if (left <= 0) break;
    for (let i = 0; i < lines.length; i++) {
      const len = (lines[i]?.text.length ?? 0) + 1;
      if (left >= len) {
        left -= len;
        line = s.from + i + 1;
        col = 0;
      } else {
        line = s.from + i;
        col = left;
        left = 0;
        break;
      }
    }
    if (left > 0) break;
  }
  return { line, col };
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  h: number,
  printV: number,
  state: { line: number; col: number; scroll: number },
) {
  ctx.fillStyle = "#f3eee3";
  ctx.fillRect(0, 0, CW, h);
  const size = CW * ADVANCE * 1.55;
  const lh = size * 1.5;
  ctx.font = `${size}px ${typeface.style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const base = printV * h;
  TRANSCRIPT.forEach((l, i) => {
    if (i > state.line) return;
    const y = base - (state.scroll - i) * lh;
    if (y < -lh || y > h + lh) return;
    const count = i < state.line ? l.text.length : state.col;
    for (let c = 0; c < count; c++) {
      const ch = l.text[c];
      if (!ch || ch === " ") continue;
      const k = i * 97 + c;
      ctx.save();
      ctx.globalAlpha = 0.72 + hash(k) * 0.28;
      ctx.fillStyle = l.who === "agent" ? AGENT : USER;
      ctx.translate(CW * (MARGIN + ADVANCE * (c + 0.5)), y + (hash(k + 0.5) - 0.5) * size * 0.08);
      ctx.rotate((hash(k + 0.25) - 0.5) * 0.04);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  });
}

type Key = { node: THREE.Object3D; y: number; down: number };

export function TypewriterModel() {
  const { scene } = useGLTF("/models/typewriter.glb");

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);
    const sheetMesh = findMesh(model, "sheet");
    const extras = (sheetMesh?.userData ?? {}) as {
      printV?: number;
      aspect?: number;
      width?: number;
    };
    const printV = extras.printV ?? 0.86;
    const width = extras.width ?? 0.16;
    const h = Math.round(CW * (extras.aspect ?? 0.92));
    const state = { line: 0, col: 0, scroll: 0 };
    const sheet = makeCanvasTexture(CW, h, (ctx) => drawSheet(ctx, h, printV, state));
    if (sheetMesh)
      sheetMesh.material = new THREE.MeshStandardMaterial({
        map: sheet.tex,
        roughness: 0.85,
        side: THREE.DoubleSide,
      });
    const keys: Key[] = [];
    KEY_ROWS.forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const node = findNode(model, `k${r}_${i}`);
        if (node) keys.push({ node, y: node.position.y, down: 0 });
      }
    });
    const space = findNode(model, "space");
    const carriage = findNode(model, "carriage");
    return {
      root,
      sheet,
      state,
      width,
      keys,
      space: space ? { node: space, y: space.position.y, down: 0 } : null,
      carriage,
      carriageX: carriage?.position.x ?? 0,
      lever: findNode(model, "lever"),
      kick: 0,
      shown: "",
    };
  }, [scene]);

  useEffect(() => {
    const repaint = () => {
      built.shown = "";
    };
    const face = typeface.style.fontFamily.split(",")[0];
    void document.fonts?.load(`40px ${face}`).then(repaint, repaint);
  }, [built]);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const { line, col } = typed(live.ps);
    const st = built.state;
    const prev = `${st.line}:${st.col}`;
    if (line > st.line) built.kick = 1;
    if (line !== st.line || col !== st.col) {
      const text = TRANSCRIPT[line]?.text ?? "";
      const ch = text[col - 1];
      if (col > 0 && ch === " " && built.space) built.space.down = 1;
      else if (col > 0) {
        const k = built.keys[Math.floor(hash(line * 31 + col) * built.keys.length)];
        if (k) k.down = 1;
      }
    }
    st.line = line;
    st.col = col;
    const scroll = damp(st.scroll, line, 9, dt);
    const settled = Math.abs(scroll - line) < 0.002;
    st.scroll = settled ? line : scroll;
    const key = `${prev}|${line}:${col}|${st.scroll.toFixed(3)}`;
    if (key !== built.shown) {
      built.shown = key;
      built.sheet.paint();
    }

    const u = MARGIN + ADVANCE * (col + 0.5);
    if (built.carriage) {
      const want = built.carriageX - (u - 0.5) * built.width;
      built.carriage.position.x = damp(built.carriage.position.x, want, 14, dt);
    }
    built.kick = damp(built.kick, 0, 3.2, dt);
    if (built.lever) built.lever.rotation.y = -Math.sin(Math.min(1, built.kick) * Math.PI) * 0.55;

    for (const k of [...built.keys, ...(built.space ? [built.space] : [])]) {
      k.down = damp(k.down, 0, 16, dt);
      k.node.position.y = k.y - k.down * 0.0032;
    }
    built.root.rotation.y = Math.sin(t * 0.3) * 0.02;
  });

  return <primitive object={built.root} />;
}
