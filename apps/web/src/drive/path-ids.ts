export function topOfPath(id: string, root = ""): string {
  const rest = id.slice(root.length);
  const cut = rest.indexOf("/");
  return cut === -1 ? id : `${root}${rest.slice(0, cut + 1)}`;
}
