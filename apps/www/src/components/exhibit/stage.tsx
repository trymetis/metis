"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { live, smooth } from "./engine";
import { CabinetModel } from "./models/cabinet";
import { CalendarModel } from "./models/calendar";
import { EnvelopeModel } from "./models/envelope";
import { GeartrainModel } from "./models/geartrain";
import { LaptopModel } from "./models/laptop";
import { PadlockModel } from "./models/padlock";
import { PatchboardModel } from "./models/patchboard";
import { ServerModel } from "./models/server";
import { TypewriterModel } from "./models/typewriter";
import { LABEL_HEIGHT, overlay } from "./overlay";
import type { ModelKey, Pose } from "./types";

const MODELS: Record<ModelKey, () => React.JSX.Element> = {
  envelope: EnvelopeModel,
  calendar: CalendarModel,
  cabinet: CabinetModel,
  typewriter: TypewriterModel,
  padlock: PadlockModel,
  server: ServerModel,
  patchboard: PatchboardModel,
  geartrain: GeartrainModel,
  laptop: LaptopModel,
};

THREE.setConsoleFunction((type, message, ...params) => {
  if (message.startsWith("THREE.Clock:")) return;
  const log = params[0];
  if (
    message.startsWith("THREE.WebGLProgram: Program Info Log") &&
    typeof log === "string" &&
    log
      .split("\n")
      .filter((line) => line.trim() !== "")
      .every((line) => line.includes("warning X4122"))
  )
    return;
  const out = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  const traced = stackTraceError(params[0], message);
  if (traced) out(traced);
  else out(message, ...params);
});

function stackTraceError(trace: unknown, message: string): Error | null {
  if (typeof trace !== "object" || trace === null) return null;
  if (!("isStackTrace" in trace) || trace.isStackTrace !== true) return null;
  if (!("getError" in trace) || typeof trace.getError !== "function") {
    return null;
  }
  const error: unknown = trace.getError(message);
  return error instanceof Error ? error : null;
}

const D2R = Math.PI / 180;

const part = new THREE.Box3();
const UP = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const off = new THREE.Vector3();
const FIT_X = 0.86;
const BAND_GAP = 0.04;
const MIN_BAND = 0.2;
const LABELLED = new Set<ModelKey>(["patchboard", "server", "geartrain"]);
const corner = new THREE.Vector3();

function visibleBox(root: THREE.Object3D, out: THREE.Box3) {
  out.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverseVisible((m) => {
    if (!(m instanceof THREE.Mesh)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    out.union(part);
  });
}

function cornerOf(b: THREE.Box3, k: number, out: THREE.Vector3) {
  return out.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z);
}

function cornerOffset(b: THREE.Box3, k: number, t: THREE.Vector3) {
  return cornerOf(b, k, off).sub(t);
}

function Rig({
  poses,
  model,
  labelled,
}: {
  poses: Pose[];
  model: React.RefObject<THREE.Group | null>;
  labelled: boolean;
}) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3());
  const fit = useRef({ box: new THREE.Box3(), d: 0, shift: 0, lift: 0, n: 0 });
  useFrame((_, dt) => {
    const ps = Math.min(poses.length - 1, Math.max(0, live.ps));
    const i = Math.min(poses.length - 2, Math.floor(ps));
    const a = poses[Math.max(0, i)];
    const b = poses[Math.min(poses.length - 1, i + 1)];
    if (!a || !b) return;
    const f = poses.length === 1 ? 0 : smooth(ps - i);
    const narrow = size.width / size.height < 0.9;
    const yaw = (a.yaw + (b.yaw - a.yaw) * f + live.sx * 3.2) * D2R;
    const pitch = (a.pitch + (b.pitch - a.pitch) * f - live.sy * 1.8) * D2R;
    let dist = (a.dist + (b.dist - a.dist) * f) * (narrow ? 1.25 : 1);
    target.current.set(
      a.target[0] + (b.target[0] - a.target[0]) * f,
      a.target[1] + (b.target[1] - a.target[1]) * f,
      a.target[2] + (b.target[2] - a.target[2]) * f,
    );
    const fitted = fit.current;
    if (narrow && model.current) {
      if (fitted.n++ % 6 === 0) visibleBox(model.current, fitted.box);
    }
    if (narrow && !fitted.box.isEmpty()) {
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 28;
      const tanV = Math.tan((fov * D2R) / 2);
      const room = labelled ? ((LABEL_HEIGHT + 16) / size.height) * 2 : 0;
      const top = 1 - 2 * live.top - BAND_GAP - room;
      const bottom = 1 - 2 * live.bottom + BAND_GAP;
      const mid = (top + bottom) / 2;
      const kx = tanV * (size.width / size.height) * FIT_X;
      const ky = tanV * Math.max(MIN_BAND, (top - bottom) / 2);
      fwd
        .set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw))
        .negate();
      right.crossVectors(fwd, UP).normalize();
      up.crossVectors(right, fwd);
      let left = Infinity;
      let rightmost = -Infinity;
      let low = Infinity;
      let high = -Infinity;
      for (let k = 0; k < 8; k++) {
        const o = cornerOffset(fitted.box, k, target.current);
        const x = o.dot(right);
        const y = o.dot(up);
        left = Math.min(left, x);
        rightmost = Math.max(rightmost, x);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      const ease = 1 - Math.exp(-dt * 3);
      const first = fitted.d === 0;
      const shift = (left + rightmost) / 2;
      const lift = (low + high) / 2;
      fitted.shift = first ? shift : fitted.shift + (shift - fitted.shift) * ease;
      fitted.lift = first ? lift : fitted.lift + (lift - fitted.lift) * ease;
      target.current.addScaledVector(right, fitted.shift).addScaledVector(up, fitted.lift);
      let need = 0;
      for (let k = 0; k < 8; k++) {
        const o = cornerOffset(fitted.box, k, target.current);
        const depth = o.dot(fwd);
        need = Math.max(
          need,
          Math.abs(o.dot(right)) / kx - depth,
          Math.abs(o.dot(up)) / ky - depth,
        );
      }
      fitted.d = first ? need : fitted.d + (need - fitted.d) * ease;
      dist = fitted.d;
      target.current.addScaledVector(up, -mid * tanV * dist);
    }
    camera.position.set(
      target.current.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.current.y + dist * Math.sin(pitch),
      target.current.z + dist * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(target.current);
    if (narrow && !fitted.box.isEmpty()) {
      camera.updateMatrixWorld();
      let highest = 1;
      for (let k = 0; k < 8; k++) {
        cornerOf(fitted.box, k, corner).project(camera);
        highest = Math.min(highest, -corner.y * 0.5 + 0.5);
      }
      live.modelTop = highest;
    } else {
      live.modelTop = 1;
    }
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export default function Stage({ model, poses }: { model: ModelKey; poses: Pose[] }) {
  const Model = MODELS[model];
  const [ready, setReady] = useState(false);
  const group = useRef<THREE.Group>(null);
  return (
    <div
      className={`relative h-full w-full transition-opacity duration-[1200ms] ease-out ${ready ? "opacity-100" : "opacity-0"}`}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 28, near: 0.4, far: 60, position: [0, 1.5, 7] }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Rig poses={poses} model={group} labelled={LABELLED.has(model)} />
        <ambientLight intensity={0.15} />
        <directionalLight position={[3.5, 6, 4]} intensity={1.3} color="#fff6e8" />
        <directionalLight position={[-5, 2.5, -2]} intensity={0.35} color="#e8eeff" />
        <Suspense fallback={null}>
          <Environment
            files="/hdri/studio.hdr"
            environmentIntensity={0.9}
            environmentRotation={[0, 0, 0]}
          />
          <group ref={group}>
            <Model />
          </group>
          <ContactShadows
            position={[0, 0, 0]}
            scale={9}
            blur={2.6}
            far={3.2}
            opacity={0.42}
            resolution={512}
            color="#3a2f1c"
          />
          <Ready onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <div
        ref={(el) => {
          if (el) overlay.current = el;
        }}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </div>
  );
}
