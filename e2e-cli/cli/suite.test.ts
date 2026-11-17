import { afterAll, describe } from "vitest";

import componentTests from "./components";
import configTests from "./config";
import domainTests from "./domain";
import exportTests from "./export";
import gatewayTests from "./gateways";
import migrationTests from "./migration";
import moveTests from "./move";
import needsAttentionTests from "./needs-attention";
import remoteTests from "./remote";
import remoteExportTests from "./remote-export";
import restoreTests from "./restore";
import selfUpdateTests from "./self-update";
import setupTests from "./setup";
import statusTests from "./status";
import { closeBrowser } from "./support/browser";
import updateTests from "./update";
import updateFailureTests from "./update-failures";

afterAll(closeBrowser);

describe("status", () => {
  statusTests();
});
describe("config", () => {
  configTests();
});
describe("components", () => {
  componentTests();
});
describe("update", () => {
  updateTests();
});
describe("update failures", () => {
  updateFailureTests();
});
describe("domain", () => {
  domainTests();
});
describe("gateways", () => {
  gatewayTests();
});
describe("self-update", () => {
  selfUpdateTests();
});
describe("export", () => {
  exportTests();
});
describe("needs attention", () => {
  needsAttentionTests();
});
describe("remote", () => {
  remoteTests();
});
describe("restore", () => {
  restoreTests();
});
describe("move", () => {
  moveTests();
});
describe("remote export", () => {
  remoteExportTests();
});
describe("migration", () => {
  migrationTests();
});
describe("setup", () => {
  setupTests();
});
