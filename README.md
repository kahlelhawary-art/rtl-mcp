# rtl-mcp

[![npm](https://img.shields.io/npm/v/rtl-mcp?logo=npm&color=CB3837)](https://www.npmjs.com/package/rtl-mcp)
[![CI](https://github.com/kahlelhawary-art/rtl-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kahlelhawary-art/rtl-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server that gives a coding agent right-to-left awareness.

Ask an agent for a card component and you get `ml-4 text-left` — correct English, broken Arabic. The agent has no way to check itself, because nothing in its toolbox knows what RTL is. This gives it four tools that do.

## Install

Point your MCP client at the package. Nothing to install first — `npx` fetches it.

**Claude Code**

```bash
claude mcp add rtl -- npx -y rtl-mcp
```

**Any client that reads an `mcpServers` block** (Claude Desktop, Cursor, Windsurf, Zed):

```json
{
  "mcpServers": {
    "rtl": {
      "command": "npx",
      "args": ["-y", "rtl-mcp"]
    }
  }
}
```

## Tools

| Tool | What the agent gets |
|---|---|
| `lint_rtl_code` | Pass a snippet and a filename; get every physical CSS property, directional Tailwind utility and `dir` problem, each with its logical replacement. Powered by [rtl-lint](https://www.npmjs.com/package/rtl-lint). |
| `lint_rtl_path` | The same check across a file or a whole directory on disk. |
| `normalize_arabic` | Fold the spellings users type interchangeably into one key — strips diacritics and tatweel, unifies the alef forms. For search and matching, not for display. |
| `detect_direction` | Whether a string is `rtl`, `ltr`, `mixed` or `neutral`, and what to set `dir` to. |

Both lint tools accept `baseDir: "rtl"` for an Arabic-first app — see below.

### Why `normalize_arabic` matters

`مُحَمَّد` and `محمد` are the same name and different strings. So are `أحمد` and `احمد`. A user who types their name without diacritics will not find their own record, and the bug reads like a broken database rather than a text problem.

```
normalize_arabic("مُحَمَّدْ") → "محمد"
normalize_arabic("أحـمد")    → "احمد"
```

The two folds that change meaning — `ى → ي` and `ة → ه` — are **off by default**. They widen fuzzy search and corrupt anything you display.

### Pass `baseDir: "rtl"` for an Arabic-first app

Which logical side a physical one maps to depends on the document's base direction. In `ltr`, `left` is the start; in `rtl`, `left` is the end. So `text-right` in an English-first app becomes `text-end`, and in an app rooted at `<html dir="rtl">` it becomes `text-start` — the opposite edge. Take the default on an Arabic app and the agent mirrors a working layout.

Utilities the author already scoped, like `ltr:left-3 rtl:right-3`, are left alone entirely.

### Why `detect_direction` is not just a regex

Arabic-Indic digits (`٢٠٢٦`) live inside the Arabic Unicode block, so the obvious implementation calls them RTL. Under the bidirectional algorithm they are class `AN`, not `AL` — they never set the direction of a paragraph. Only strong letters vote here, so `٢٠٢٦` comes back `neutral` and inherits its container's direction, which is what the spec says should happen.

## Zero runtime dependencies

MCP over stdio is JSON-RPC 2.0, one message per line. The reference SDK brings seventeen transitive dependencies — Express, Hono, CORS, JOSE — none of which a stdio server uses. So the protocol layer here is written directly, and the only runtime dependency is `rtl-lint`.

That trade is only safe if conformance is proven rather than assumed. **The test suite drives this server with the official SDK's client over a real stdio pipe.** If the hand-written layer ever drifts from the specification, the reference implementation stops talking to it and CI goes red.

Protocol revisions understood: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`. The server negotiates whichever one the client asks for.

## Library use

The Arabic helpers work standalone, no MCP involved:

```js
import { normalizeArabic, detectDirection } from "rtl-mcp/arabic";

normalizeArabic("مُحَمَّد");                      // "محمد"
normalizeArabic("٢٠٢٦", { convertDigits: true }); // "2026"
detectDirection("مرحبا React").direction;         // "mixed"
```

## Requirements

Node.js 20 or newer. (Node 18 reached end of life in April 2025.)

## License

MIT © Khalel Hawary
