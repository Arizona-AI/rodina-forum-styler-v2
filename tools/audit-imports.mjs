// Heuristic scan: named imports that never appear again in the file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  const importRe = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+"[^"]+";/g;
  const importSpans = [];
  const names = [];
  for (const m of text.matchAll(importRe)) {
    importSpans.push([m.index, m.index + m[0].length]);
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").trim().split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  const code = text.replace(importRe, "");
  for (const name of new Set(names)) {
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(code)) {
      console.log(`${file.slice(root.length + 1)}: unused import "${name}"`);
      total++;
    }
  }
}
console.log(total === 0 ? "OK: no unused imports" : `${total} unused import(s)`);
