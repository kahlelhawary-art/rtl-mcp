/**
 * Tool definitions and handlers.
 *
 * Each tool returns plain text: an agent reads the result, so prose it can
 * quote back to the user beats a JSON blob it has to re-describe.
 */

import { lintSource } from "rtl-lint";
import { lintFiles } from "rtl-lint";
import { normalizeArabic, detectDirection } from "./arabic.js";

/**
 * Validate the base direction an agent passed.
 *
 * Silently falling back on a typo would be the worst outcome here: the whole
 * point of the option is that the two directions produce opposite advice, so
 * a wrong value has to be an error the model can see and correct.
 */
function checkBaseDir(value) {
  if (value === undefined) return "ltr";
  if (value !== "ltr" && value !== "rtl") {
    throw new Error(`baseDir must be "ltr" or "rtl", not ${JSON.stringify(value)}.`);
  }
  return value;
}

/** Render findings the way the CLI does, minus the colour. */
function renderFindings(findings, subject) {
  if (findings.length === 0) return `No RTL issues found in ${subject}.`;

  const lines = findings.map((f) => {
    const where = f.file ? `${f.file}:${f.line}:${f.column}` : `${f.line}:${f.column}`;
    return `${where}  ${f.severity}  ${f.message}\n  → ${f.suggestion}  [${f.rule}]`;
  });

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const counts = [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : null,
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `${counts} in ${subject}:\n\n${lines.join("\n")}`;
}

export const TOOLS = [
  {
    name: "lint_rtl_code",
    description:
      "Check a snippet of CSS, HTML, JSX or TSX for layout that breaks in right-to-left languages: physical CSS properties, directional Tailwind utilities, and dir problems. Returns each finding with the logical replacement. Use this before handing RTL-facing markup back to the user.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The source to check." },
        filename: {
          type: "string",
          description:
            "A filename such as Button.tsx or theme.css. Only the extension matters — it selects which rules run.",
        },
        baseDir: {
          type: "string",
          enum: ["ltr", "rtl"],
          description:
            'The base direction of the document. Pass "rtl" when the app root is <html dir="rtl">: in an Arabic-first app "right" is the start side, so the logical replacement is the opposite one. Default "ltr".',
        },
      },
      required: ["code", "filename"],
    },
    async handler({ code, filename, baseDir }) {
      if (typeof code !== "string" || typeof filename !== "string") {
        throw new Error("`code` and `filename` must both be strings.");
      }
      return renderFindings(lintSource(code, filename, { baseDir: checkBaseDir(baseDir) }), filename);
    },
  },
  {
    name: "lint_rtl_path",
    description:
      "Check a file or a whole directory on disk for right-to-left layout problems. Skips node_modules and build output.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path to check." },
        baseDir: {
          type: "string",
          enum: ["ltr", "rtl"],
          description: 'Base direction of the app. Pass "rtl" for an Arabic-first codebase. Default "ltr".',
        },
      },
      required: ["path"],
    },
    async handler({ path, baseDir }) {
      if (typeof path !== "string") throw new Error("`path` must be a string.");
      const { findings, files } = await lintFiles(path, { baseDir: checkBaseDir(baseDir) });
      return renderFindings(findings, `${files} file${files === 1 ? "" : "s"} under ${path}`);
    },
  },
  {
    name: "normalize_arabic",
    description:
      "Normalise Arabic text so that forms users type interchangeably compare equal — strips diacritics and tatweel and folds the alef variants. Use it for search keys, deduplication and matching, never for text you are about to display.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The Arabic text to normalise." },
        unifyAlefMaqsura: {
          type: "boolean",
          description: "Fold ى into ي. Helps fuzzy matching, changes meaning. Default false.",
        },
        unifyTaaMarbuta: {
          type: "boolean",
          description: "Fold ة into ه. Helps fuzzy matching, changes meaning. Default false.",
        },
        convertDigits: {
          type: "boolean",
          description: "Convert Arabic-Indic digits into 0-9. Default false.",
        },
        collapseWhitespace: { type: "boolean", description: "Collapse whitespace runs. Default false." },
      },
      required: ["text"],
    },
    async handler(args) {
      const { text, ...options } = args;
      if (typeof text !== "string") throw new Error("`text` must be a string.");
      const normalized = normalizeArabic(text, options);
      return normalized === text
        ? `Already normalised — nothing changed.\n\n${normalized}`
        : `${normalized}\n\n(was: ${text})`;
    },
  },
  {
    name: "detect_direction",
    description:
      "Report whether a string is predominantly right-to-left, left-to-right, mixed or neutral, and what to set dir to. Use it when you need to decide the direction of a label, a database field or a block of user content.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to inspect." },
      },
      required: ["text"],
    },
    async handler({ text }) {
      if (typeof text !== "string") throw new Error("`text` must be a string.");
      const report = detectDirection(text);
      return [
        `direction: ${report.direction}`,
        `RTL characters: ${report.rtlCharacters}`,
        `LTR characters: ${report.ltrCharacters}`,
        "",
        report.recommendation,
      ].join("\n");
    },
  },
];

/** Tool list in the shape the protocol expects, without the handlers. */
export const TOOL_DESCRIPTORS = TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

/** @type {Map<string, (args: object) => Promise<string>>} */
export const HANDLERS = new Map(TOOLS.map((tool) => [tool.name, tool.handler]));
