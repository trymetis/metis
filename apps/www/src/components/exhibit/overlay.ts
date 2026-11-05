"use client";

import type { RefObject } from "react";
import * as THREE from "three";

import { live } from "./engine";

export const overlay: RefObject<HTMLElement> = {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drei's Html `portal` prop takes a non-null RefObject<HTMLElement>; the stage assigns the element on mount, before any Html portals into it
  current: null as unknown as HTMLElement,
};

export const LABEL_HEIGHT = 46;
const LABEL_HALF_WIDTH = 112;
const EDGE = 12;

const at = new THREE.Vector3();

export function labelPosition(
  el: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
) {
  at.setFromMatrixPosition(el.matrixWorld).project(camera);
  const x = (at.x * 0.5 + 0.5) * size.width;
  const y = (-at.y * 0.5 + 0.5) * size.height;
  if (size.width / size.height >= 0.9) return [x, y];
  return [
    Math.min(size.width - LABEL_HALF_WIDTH - EDGE, Math.max(LABEL_HALF_WIDTH + EDGE, x)),
    Math.min(y, live.modelTop * size.height - LABEL_HEIGHT / 2 - 8),
  ];
}
