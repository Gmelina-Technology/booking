// Copies MapLibre's web worker into public/ (run before dev and build).
//
// MapLibre 6 finds its worker next to its own module file, which the bundler
// doesn't emit, so lib/map.ts points it at /maplibre-gl-worker.mjs instead.
// The copy is gitignored and refreshed on every run, so it always matches the
// installed version.

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs");
const target = path.join(process.cwd(), "public", "maplibre-gl-worker.mjs");

await mkdir(path.dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Copied the MapLibre worker to ${path.relative(process.cwd(), target)}`);
