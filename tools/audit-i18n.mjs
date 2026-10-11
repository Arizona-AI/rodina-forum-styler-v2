// Audit: every t("key") used in src/ must exist in src/i18n/ru.ts.
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

const ru = readFileSync(join(root, "src/i18n/ru.ts"), "utf8");
const dictKeys = new Set();
for (const m of ru.matchAll(/^\s{2}"([^"]+)":/gm)) dictKeys.add(m[1]);

const missing = new Map();
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bt\(\s*"([^"]+)"/g)) {
    const key = m[1];
    if (!dictKeys.has(key)) {
      const rel = file.slice(root.length + 1);
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(rel);
    }
  }
}

if (missing.size === 0) {
  console.log(`OK: all keys resolve (dictionary has ${dictKeys.size} keys)`);
} else {
  console.log(`MISSING ${missing.size} key(s):`);
  for (const [key, files] of missing) console.log(`  ${key}  <-  ${[...new Set(files)].join(", ")}`);
  process.exitCode = 1;
}

// Coverage report: which keys are still missing from en.ts (fallback: ru).
const en = readFileSync(join(root, "src/i18n/en.ts"), "utf8");
const enKeys = new Set();
for (const m of en.matchAll(/^\s{2}"([^"]+)":/gm)) enKeys.add(m[1]);
const enMissing = [...dictKeys].filter((k) => !enKeys.has(k));
console.log(`en coverage: ${dictKeys.size - enMissing.length}/${dictKeys.size}`);
if (enMissing.length > 0 && enMissing.length <= 40) {
  console.log(`en missing: ${enMissing.join(", ")}`);
}
const enExtra = [...enKeys].filter((k) => !dictKeys.has(k));
if (enExtra.length > 0) {
  console.log(`en has keys missing from ru (dead): ${enExtra.join(", ")}`);
  process.exitCode = 1;
}
