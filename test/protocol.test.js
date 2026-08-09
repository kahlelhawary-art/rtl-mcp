/**
 * Conformance tests.
 *
 * These drive the server with the official MCP SDK client over a real stdio
 * pipe. If the hand-written protocol layer drifts from the specification,
 * the reference implementation refuses to talk to it and these fail — which
 * is the whole point of not trusting a hand-rolled protocol.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "bin", "rtl-mcp.js");

/** @type {Client} */
let client;

before(async () => {
  client = new Client({ name: "rtl-mcp-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [serverPath] }),
  );
});

after(async () => {
  await client.close();
});

/** Pull the plain text out of a tool result. */
function textOf(result) {
  return result.content.map((part) => part.text).join("\n");
}

test("the official client completes the handshake", () => {
  const info = client.getServerVersion();
  assert.equal(info.name, "rtl-mcp");
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
});

test("advertises all four tools with schemas", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["detect_direction", "lint_rtl_code", "lint_rtl_path", "normalize_arabic"]);

  for (const tool of tools) {
    assert.ok(tool.description.length > 20, `${tool.name} needs a usable description`);
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(Array.isArray(tool.inputSchema.required));
  }
});

test("lint_rtl_code reports a directional utility", async () => {
  const result = await client.callTool({
    name: "lint_rtl_code",
    arguments: { code: '<div class="ml-4">x</div>', filename: "Card.tsx" },
  });
  const text = textOf(result);
  assert.match(text, /ml-4/);
  assert.match(text, /ms-4/);
  assert.ok(!result.isError);
});

test("lint_rtl_code says so when the code is clean", async () => {
  const result = await client.callTool({
    name: "lint_rtl_code",
    arguments: { code: ".a { margin-inline-start: 8px; }", filename: "a.css" },
  });
  assert.match(textOf(result), /No RTL issues/);
});

test("normalize_arabic strips diacritics through the protocol", async () => {
  const result = await client.callTool({
    name: "normalize_arabic",
    arguments: { text: "مُحَمَّد" },
  });
  assert.match(textOf(result), /محمد/);
});

test("detect_direction reports rtl through the protocol", async () => {
  const result = await client.callTool({
    name: "detect_direction",
    arguments: { text: "مرحبا بالعالم" },
  });
  assert.match(textOf(result), /direction: rtl/);
});

test("a bad argument comes back as an error result, not a crash", async () => {
  const result = await client.callTool({
    name: "normalize_arabic",
    arguments: { text: 42 },
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /must be a string/);

  // The session must still be usable afterwards.
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
});

test("an unknown tool is rejected", async () => {
  await assert.rejects(() => client.callTool({ name: "nope", arguments: {} }), /Unknown tool/);
});

test("lint_rtl_code follows the base direction it is given", async () => {
  const args = { code: '<div class="ml-4 text-right">x</div>', filename: "Card.tsx" };

  const ltr = textOf(await client.callTool({ name: "lint_rtl_code", arguments: args }));
  assert.match(ltr, /ms-4/);
  assert.match(ltr, /text-end/);

  // Arabic-first: right is the start side, so both map the other way.
  const rtl = textOf(
    await client.callTool({ name: "lint_rtl_code", arguments: { ...args, baseDir: "rtl" } }),
  );
  assert.match(rtl, /me-4/);
  assert.match(rtl, /text-start/);
});

test("a bad base direction is an error the model can see", async () => {
  const result = await client.callTool({
    name: "lint_rtl_code",
    arguments: { code: "<div/>", filename: "a.tsx", baseDir: "arabic" },
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /must be "ltr" or "rtl"/);
});

test("utilities already scoped to a direction are not reported", async () => {
  const result = await client.callTool({
    name: "lint_rtl_code",
    arguments: { code: '<div class="ltr:left-3 rtl:right-3">x</div>', filename: "a.tsx", baseDir: "rtl" },
  });
  assert.match(textOf(result), /No RTL issues/);
});

test("both lint tools advertise the baseDir option", async () => {
  const { tools } = await client.listTools();
  for (const name of ["lint_rtl_code", "lint_rtl_path"]) {
    const tool = tools.find((t) => t.name === name);
    assert.deepEqual(tool.inputSchema.properties.baseDir.enum, ["ltr", "rtl"]);
  }
});
