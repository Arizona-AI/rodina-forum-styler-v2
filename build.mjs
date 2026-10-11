/**
 * Rodina Forum Styler — build script (esbuild).
 *
 * Produces a loadable MV3 extension in ./dist:
 *   content.js / background.js / options.* / popup.html (iframe shell) / manifest / assets
 *
 * Flags:
 *   --watch    rebuild bundles on source change (static files copied once)
 *   --tests    also bundle tests/ into dist-tests/ (for `node --test`)
 *   --zip      package dist/ into a versioned zip (Windows: PowerShell Compress-Archive)
 *   --dev      unminified output with sourcemaps
 *   --firefox  emit manifest.firefox.json as dist/manifest.json (MV3, gecko id, background.scripts)
 */
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const dev = args.has("--dev") || args.has("--watch");
const firefox = args.has("--firefox");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "iife",
  target: ["chrome110", "firefox115"],
  platform: "browser",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  logLevel: "info",
  loader: { ".css": "text" },
};

/** Entry points: [source, output base name] (esbuild appends `.js`). */
const entries = [
  ["src/content/main.ts", "content"],
  ["src/background/service-worker.ts", "background"],
  ["src/options/options.ts", "options"],
];

function entryPoints() {
  const map = {};
  for (const [src, out] of entries) map[out] = join(root, src);
  return map;
}

/** Copy static files that esbuild does not own (manifest, HTML shells, styles, icons). */
async function copyStatic() {
  const dist = join(root, "dist");
  await mkdir(dist, { recursive: true });
  const manifest = firefox ? "manifest.firefox.json" : "manifest.json";
  if (!existsSync(join(root, manifest))) throw new Error(`${manifest} not found`);
  await cp(join(root, manifest), join(dist, "manifest.json"));
  for (const file of ["popup.html", "options.html", "popup.css", "options.css"]) {
    const src = join(root, "src", file.replace(/\.(html|css)$/, ""), file);
    if (existsSync(src)) await cp(src, join(dist, file));
  }
  const assets = join(root, "assets");
  if (existsSync(assets)) await cp(assets, join(dist, "assets"), { recursive: true });
  console.log("[build] static files copied");
  console.log(`[build] manifest: ${firefox ? "firefox (MV3, gecko)" : "chrome (MV3)"}`);
}

/** Bundle tests with the node platform so `node --test dist-tests/` works. */
async function buildTests() {
  const testDir = join(root, "tests");
  if (!existsSync(testDir)) return;
  const files = (await readdir(testDir)).filter((f) => f.endsWith(".test.ts"));
  const map = {};
  for (const f of files) map[f.replace(/\.ts$/, "")] = join(testDir, f);
  if (Object.keys(map).length === 0) return;
  await rm(join(root, "dist-tests"), { recursive: true, force: true });
  await build({
    ...common,
    entryPoints: map,
    outdir: join(root, "dist-tests"),
    platform: "node",
    format: "esm",
    target: ["node20"],
    minify: false,
    sourcemap: false,
    packages: "bundle",
  });
  console.log(`[build] bundled ${files.length} test file(s)`);
}

async function makeZip() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const zipName = `rodina-forum-styler-v${pkg.version}.zip`;
  const zipPath = join(root, zipName);
  if (existsSync(zipPath)) await rm(zipPath, { force: true });
  const dist = join(root, "dist");
  if (!existsSync(dist)) throw new Error("dist/ not found — run `npm run build` first");
  if ((await stat(join(dist, "manifest.json"))).size === 0) {
    throw new Error("dist/manifest.json is empty");
  }
  if (process.platform === "win32") {
    const res = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Compress-Archive -Path "${dist}\\*" -DestinationPath "${zipPath}" -Force`],
      { stdio: "inherit" },
    );
    if (res.status !== 0) throw new Error("Compress-Archive failed");
  } else {
    const res = spawnSync("zip", ["-r", zipPath, "."], { cwd: dist, stdio: "inherit" });
    if (res.status !== 0) throw new Error("zip failed — install a `zip` utility");
  }
  console.log(`[build] packaged ${zipName}`);
}

try {
  if (args.has("--tests")) await buildTests();
  if (args.has("--watch")) {
    await copyStatic();
    const ctx = await context({ ...common, entryPoints: entryPoints(), outdir: join(root, "dist") });
    await ctx.watch();
    console.log("[build] watching source…");
  } else {
    await rm(join(root, "dist"), { recursive: true, force: true });
    await build({ ...common, entryPoints: entryPoints(), outdir: join(root, "dist") });
    await copyStatic();
    if (args.has("--zip")) await makeZip();
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
