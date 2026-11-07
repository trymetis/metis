"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { damp, exhibit, lerp, live, seg } from "../engine";
import { type Fonts, makeCanvasTexture, roundRect } from "../textures";
import { findMesh, findNode, litMap } from "./shared";

const S = 18;
const SAVED = 5;
const LIFT = 0.032;

type Person = { name: string; role: string; email: string; phone: string; tag: string };

const PEOPLE: Person[] = [
  {
    name: "Maya Lindqvist",
    role: "Head of Partnerships · Northwind",
    email: "maya@northwind.example",
    phone: "+46 70 555 01 22",
    tag: "Google Contacts",
  },
  {
    name: "Tomás Reyes",
    role: "Account Manager · Harbor & Co.",
    email: "tomas@harborco.example",
    phone: "+34 600 555 314",
    tag: "Outlook",
  },
  {
    name: "Aiko Tanaka",
    role: "Procurement · Kumo Ceramics",
    email: "aiko@kumo.example",
    phone: "+81 90 5550 1187",
    tag: "Zoho Contacts",
  },
  {
    name: "Daniel Okoye",
    role: "Founder · Lattice Labs",
    email: "daniel@lattice.example",
    phone: "+234 803 555 0144",
    tag: "CardDAV",
  },
  {
    name: "Priya Raman",
    role: "Counsel · Raman & Hart",
    email: "priya@ramanhart.example",
    phone: "+91 98 5550 2210",
    tag: "Google Contacts",
  },
  {
    name: "Lena Fischer",
    role: "Producer · Kaltwasser Film",
    email: "lena@kaltwasser.example",
    phone: "+49 151 555 0193",
    tag: "Saved from mail",
  },
];

function drawCard(ctx: CanvasRenderingContext2D, f: Fonts, p: Person) {
  const w = 850;
  const h = 550;
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(176,125,31,0.16)";
  roundRect(ctx, w - 70 - p.tag.length * 17, 48, p.tag.length * 17 + 30, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#815b17";
  ctx.font = `500 26px ${f.mono}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(p.tag.toUpperCase(), w - 55, 75);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#2a2620";
  ctx.font = `italic 500 76px ${f.display}`;
  ctx.fillText(p.name, 60, 200);
  ctx.fillStyle = "#7a7263";
  ctx.font = `400 32px ${f.sans}`;
  ctx.fillText(p.role, 62, 252);
  ctx.strokeStyle = "rgba(176,125,31,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(62, 300);
  ctx.lineTo(240, 300);
  ctx.stroke();
  ctx.fillStyle = "#2a2620";
  ctx.font = `500 30px ${f.mono}`;
  ctx.fillText(p.email, 62, 400);
  ctx.fillText(p.phone, 62, 456);
}

type Card = {
  node: THREE.Object3D;
  base: THREE.Vector3;
  quat: THREE.Quaternion;
  up: THREE.Vector3;
  lift: number;
};

export function CardholderModel() {
  const { scene } = useGLTF("/models/cardholder.glb");
  const env = useGLTF("/models/envelope.glb");

  const faces = useMemo(
    () => PEOPLE.map((p) => makeCanvasTexture(850, 550, (ctx, f) => drawCard(ctx, f, p))),
    [],
  );

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.updateMatrixWorld(true);
    const cards: Card[] = [];
    PEOPLE.forEach((_, i) => {
      const face = faces[i];
      if (face) litMap(findMesh(model, `face${i}`), face.tex);
      const node = findNode(model, `card${i}`);
      if (!node) return;
      cards.push({
        node,
        base: node.position.clone(),
        quat: node.quaternion.clone(),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(node.quaternion),
        lift: 0,
      });
    });
    const holder = findNode(model, "holder");
    const top = holder ? new THREE.Box3().setFromObject(holder).max.y : 0.06;
    root.scale.setScalar(S);
    const letter = env.scene.clone(true);
    letter.traverse((o) => {
      if (o.name === "letter") o.visible = false;
    });
    const envGroup = new THREE.Group();
    envGroup.add(letter);
    envGroup.scale.setScalar(0.6);
    root.add(envGroup);
    return { root, cards, envGroup, top, flap: findNode(letter, "flap") };
  }, [scene, env.scene, faces]);

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      for (const face of faces) face.paint();
    });
  }, [faces]);

  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
    }),
    [],
  );

  useFrame((s, dt) => {
    const p = live.ps;
    const { pick, plate } = exhibit.get();
    const t = s.clock.elapsedTime;

    built.cards.forEach((c, i) => {
      if (i === SAVED) return;
      const want = plate === 1 && pick === i ? LIFT : 0;
      c.lift = damp(c.lift, want, 6, dt);
      c.node.position.copy(c.base).addScaledVector(c.up, c.lift);
    });

    const g = built.envGroup;
    const inE = seg(p, 1.4, 1.6);
    const outE = seg(p, 1.95, 2.1);
    g.position.set(
      lerp(0.16, 0.0, inE),
      built.top + 0.03 + lerp(0.05, 0, inE),
      lerp(0.06, 0.07, inE),
    );
    g.position.x += outE * 0.2;
    g.rotation.set(0, lerp(0.6, 0.05, inE), 0);
    g.visible = inE > 0.01 && outE < 0.99;
    if (built.flap) built.flap.rotation.x = -seg(p, 1.52, 1.66) * Math.PI * 0.94;

    const saved = built.cards[SAVED];
    if (!saved) return;
    const rise = seg(p, 1.64, 1.78);
    const slot = seg(p, 1.78, 1.96);
    const pos = tmp.a.set(g.position.x, g.position.y + rise * 0.07, g.position.z);
    pos.lerp(saved.base, slot);
    const show = seg(p, 2.55, 2.95);
    pos.lerp(tmp.b.set(0, built.top + 0.035, saved.base.z + 0.05), show);
    pos.y += Math.sin(t * 0.8) * 0.0008 * show;
    saved.node.position.copy(pos);
    const flat = tmp.q.setFromEuler(tmp.e.set(-Math.PI / 2 + rise * (Math.PI / 2), 0, 0));
    saved.node.quaternion.copy(flat).slerp(saved.quat, slot);
    saved.node.quaternion.slerp(tmp.q.setFromEuler(tmp.e.set(0.05, 0, 0)), show);
    saved.node.scale.setScalar(lerp(1, 1.6, show));
    saved.node.visible = p > 1.62;
  });

  return <primitive object={built.root} />;
}
