/**
 * Model Context Protocol server over stdio.
 *
 * MCP on stdio is JSON-RPC 2.0 with one message per line, so this implements
 * it directly rather than pulling in the reference SDK and its seventeen
 * transitive dependencies — none of which a stdio server needs. Conformance
 * is not taken on trust: the test suite drives this server with the official
 * SDK client.
 *
 * The one hard rule: stdout carries protocol messages and nothing else.
 * A stray console.log corrupts the stream and the client drops the
 * connection. Diagnostics go to stderr.
 */

import { createInterface } from "node:readline";
import { TOOL_DESCRIPTORS, HANDLERS } from "./tools.js";

const JSONRPC_VERSION = "2.0";

/** Protocol revisions this server understands, newest first. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
};

/**
 * Run the server until stdin closes.
 *
 * @param {{ name: string, version: string, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} options
 * @returns {Promise<void>} resolves when the input stream ends
 */
export function serve({ name, version, input = process.stdin, output = process.stdout }) {
  const send = (message) => output.write(JSON.stringify(message) + "\n");

  const reply = (id, result) => send({ jsonrpc: JSONRPC_VERSION, id, result });
  const fail = (id, code, message) => send({ jsonrpc: JSONRPC_VERSION, id, error: { code, message } });

  async function handle(request) {
    const { id, method, params } = request;
    // A notification has no id and must never be answered.
    const isNotification = id === undefined || id === null;

    switch (method) {
      case "initialize": {
        const asked = params?.protocolVersion;
        const agreed = SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : SUPPORTED_PROTOCOL_VERSIONS[0];
        return reply(id, {
          protocolVersion: agreed,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
        });
      }

      case "notifications/initialized":
      case "notifications/cancelled":
        return;

      case "ping":
        return reply(id, {});

      case "tools/list":
        return reply(id, { tools: TOOL_DESCRIPTORS });

      case "tools/call": {
        const toolName = params?.name;
        const handler = HANDLERS.get(toolName);
        if (!handler) return fail(id, ERROR.invalidParams, `Unknown tool: ${toolName}`);

        try {
          const text = await handler(params?.arguments ?? {});
          return reply(id, { content: [{ type: "text", text }] });
        } catch (error) {
          // A tool that throws is a result the model should see and correct,
          // not a protocol error that tears down the session.
          return reply(id, {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
          });
        }
      }

      default:
        if (isNotification) return;
        return fail(id, ERROR.methodNotFound, `Unknown method: ${method}`);
    }
  }

  const lines = createInterface({ input, crlfDelay: Infinity });

  lines.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      return fail(null, ERROR.parse, "Invalid JSON");
    }

    if (request.jsonrpc !== JSONRPC_VERSION || typeof request.method !== "string") {
      return fail(request.id ?? null, ERROR.invalidRequest, "Not a JSON-RPC 2.0 request");
    }

    handle(request).catch((error) => {
      process.stderr.write(`rtl-mcp: ${error.stack ?? error.message}\n`);
      if (request.id !== undefined && request.id !== null) {
        fail(request.id, ERROR.internal, error.message);
      }
    });
  });

  return new Promise((resolve) => lines.on("close", resolve));
}
