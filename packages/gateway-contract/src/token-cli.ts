#!/usr/bin/env bun
import process from "node:process";

const [rawEndpoint, action, address, name] = process.argv.slice(2);
const endpoint = rawEndpoint?.replace(/\/+$/, "");
const adminToken = process.env.ADMIN_TOKEN;

if (!endpoint || !adminToken || !action) {
  console.error(`Usage:
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com create you@domain.com ["Your Name"]
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com name you@domain.com "Your Name"
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com revoke you@domain.com
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com list

ADMIN_TOKEN is the API_TOKEN secret set on the gateway.
The name is the sender name mail from that address carries; name "" removes it.`);
  process.exit(1);
}

const METHODS: Record<string, string> = {
  create: "POST",
  name: "PATCH",
  revoke: "DELETE",
  list: "GET",
};
const method = METHODS[action];
if (!method) {
  console.error(`"${action}" is not create, name, revoke or list.`);
  process.exit(1);
}
if (method !== "GET" && !address) {
  console.error(`"${action}" needs an address argument.`);
  process.exit(1);
}
if (action === "name" && name === undefined) {
  console.error(`"name" needs a name argument ("" removes the name).`);
  process.exit(1);
}

const res = await fetch(`${endpoint}/v1/tokens`, {
  method,
  headers: {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  },
  ...(method === "GET"
    ? {}
    : { body: JSON.stringify({ address, ...(name === undefined ? {} : { name }) }) }),
});

const body: {
  error?: string;
  address?: string;
  token?: string;
  name?: string | null;
  tokens?: unknown;
} = await res.json();
if (!res.ok) {
  console.error(`✗ ${res.status}:`, body.error ?? body);
  process.exit(1);
}

if (action === "create") {
  console.log(`Token for ${body.address} (shown once — store it now):\n`);
  console.log(body.token);
} else if (action === "name") {
  console.log(
    body.name ? `✓ ${body.address} sends as ${body.name}` : `✓ ${body.address} sends with no name`,
  );
} else if (action === "revoke") {
  console.log(`✓ Token for ${address} revoked`);
} else {
  console.log(JSON.stringify(body.tokens, null, 2));
}
