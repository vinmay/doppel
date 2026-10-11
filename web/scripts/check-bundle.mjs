// Quality gate: a production build must not contain the fake embedder or test fixtures.
// Usage: node scripts/check-bundle.mjs [distDir]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist";
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(dir);
const bad = [];
for (const f of files) {
  if (/tests[\\/]fixtures|test-images/.test(f)) bad.push(`${f}: test fixture in the build`);
  if (/\.(js|html|json)$/.test(f)) {
    const s = readFileSync(f, "utf8");
    for (const needle of ["fake-embedder", "tests/fixtures"]) if (s.includes(needle)) bad.push(`${f}: contains "${needle}"`);
  }
}
if (bad.length) {
  console.error(`BUNDLE_FAIL\n${bad.join("\n")}`);
  process.exit(1);
}
console.log(`BUNDLE_OK ${files.length} files in ${dir}, no fake embedder, no fixtures`);
