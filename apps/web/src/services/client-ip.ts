import "server-only";
import { BlockList, isIP } from "node:net";

import { getInstanceConfig } from "@/config/runtime";

export function ipList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = "", prefix] = entry.trim().split("/");
    const family = isIP(address);
    if (!family) continue;
    const type = family === 4 ? "ipv4" : "ipv6";
    try {
      if (prefix === undefined) list.addAddress(address, type);
      else list.addSubnet(address, Number(prefix), type);
    } catch {
      continue;
    }
  }
  return list;
}

export function inIpList(list: BlockList, address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  return list.check(address, family === 4 ? "ipv4" : "ipv6");
}

function hopAddress(raw: string): string | null {
  let hop = raw.trim();
  if (hop.startsWith("[")) {
    const end = hop.indexOf("]");
    hop = end === -1 ? "" : hop.slice(1, end);
  } else if (hop.split(":").length === 2) {
    hop = hop.slice(0, hop.indexOf(":"));
  }
  return isIP(hop) ? hop : null;
}

export function forwardedClient(
  headers: Headers,
  trustedProxies: readonly string[],
): string | null {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const trusted = ipList(trustedProxies);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const hop = hopAddress(chain[i] ?? "");
    if (!hop) return null;
    if (!inIpList(trusted, hop)) return hop;
    if (i === 0) return hopAddress(headers.get("cf-connecting-ip") ?? "") ?? hop;
  }
  return null;
}

export function clientIp(headers: Headers): string | null {
  return forwardedClient(headers, getInstanceConfig().proxies.trustedProxies);
}
