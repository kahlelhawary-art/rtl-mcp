#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve } from "../src/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const { name, version } = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8"));

await serve({ name, version });
