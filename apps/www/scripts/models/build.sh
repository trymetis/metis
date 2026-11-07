#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PUBLIC="$HERE/../../public"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MODELS=("$@")
if [ ${#MODELS[@]} -eq 0 ]; then
  MODELS=(laptop envelope padlock server calendar cabinet cardholder typewriter patchboard geartrain)
fi

blender -b --factory-startup -P "$HERE/kit/tex.py" -- "$WORK" > "$WORK/tex.log" 2>&1 || { cat "$WORK/tex.log"; exit 1; }
export KIT_TEX="$WORK"

if [ $# -eq 0 ]; then
  blender -b --factory-startup -P "$HERE/kit/hdri.py" -- "$PUBLIC/hdri/studio.hdr" > "$WORK/hdri.log" 2>&1 || { cat "$WORK/hdri.log"; exit 1; }
  echo "[models] hdri/studio.hdr"
fi

for m in "${MODELS[@]}"; do
  blender -b --factory-startup -P "$HERE/$m.py" -- "$WORK/$m.glb" > "$WORK/$m.log" 2>&1 || { tail -30 "$WORK/$m.log"; exit 1; }
  if grep -q "Traceback" "$WORK/$m.log"; then tail -30 "$WORK/$m.log"; exit 1; fi
  bunx --bun @gltf-transform/cli@4.2.1 meshopt "$WORK/$m.glb" "$PUBLIC/models/$m.glb" --quantization-volume scene > /dev/null
  echo "[models] models/$m.glb $(( $(stat -c %s "$PUBLIC/models/$m.glb") / 1024 ))KB $(grep -o 'baked.*' "$WORK/$m.log" || true)"
done
