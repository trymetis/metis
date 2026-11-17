const BLOCK = 512;
const NAME_MAX = 100;

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function header(
  name: string,
  size: number,
  mode: number,
  type: "0" | "5",
  modified: number,
): Buffer {
  if (Buffer.byteLength(name) > NAME_MAX) {
    throw new Error(`[tar] ${name} is longer than ${NAME_MAX} bytes`);
  }
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, "utf8");
  block.write(octal(mode, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(modified, 12), 136, "ascii");
  block.write("        ", 148, "ascii");
  block.write(type, 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  const sum = block.reduce((total, byte) => total + byte, 0);
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

function folders(paths: string[]): string[] {
  const found = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      found.add(`${parts.slice(0, depth).join("/")}/`);
    }
  }
  return [...found].toSorted();
}

export function tar(files: Map<string, Buffer>): Buffer {
  const blocks: Buffer[] = [];
  const modified = Math.floor(Date.now() / 1000);
  for (const folder of folders([...files.keys()])) {
    blocks.push(header(folder, 0, 0o755, "5", modified));
  }
  for (const [path, content] of files) {
    blocks.push(header(path, content.length, 0o644, "0", modified), content);
    const rest = content.length % BLOCK;
    if (rest > 0) blocks.push(Buffer.alloc(BLOCK - rest));
  }
  blocks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(blocks);
}
