// Renders compiled theme variables to a text file for live smoke tests.
// The entry is bundled AND executed (it writes the file itself), so we get
// the actual CSS output rather than the bundle source.
import { build } from "esbuild";
import { writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const entry = `
import { writeFileSync } from "node:fs";
import { BUILTIN_THEMES } from "./src/theme/library/index";
import { compileThemeVariables } from "./src/theme/compile";
const theme = BUILTIN_THEMES.find((t) => t.id === "rodina-eclipse") ?? BUILTIN_THEMES[0];
writeFileSync("dist-live-vars.txt", compileThemeVariables(theme.tokens), "utf8");
`;

const runner = "dist-live-vars.runner.mjs";
await build({
  stdin: { contents: entry, resolveDir: process.cwd() },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: runner,
  packages: "bundle",
});

await import(pathToFileURL(runner).href);
rmSync(runner, { force: true });

const { readFileSync } = await import("node:fs");
const css = readFileSync("dist-live-vars.txt", "utf8");
console.log(`wrote dist-live-vars.txt (${css.length} chars)`);
console.log(css.slice(0, 120).replace(/\n/g, " | "));
