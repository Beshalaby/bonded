// Parity check: grade every fixture with lib/grade.ts and diff against the Python grader's output.
//   cd web && node --experimental-strip-types src/lib/mcp/parity/check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grade } from "../../grade.ts";


const dir = path.dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(fs.readFileSync(path.join(dir, "fixtures.json"), "utf8"));
const IGNORE = new Set(["createdAt"]);
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

let fail = 0;
const fields = new Set();
const tally = { success: 0, scammed: 0, wrongItem: 0, overBudget: 0, noBuy: 0 };
for (const c of cases) {
  const ts = grade(c.task, c.runResult, c.products, "parity", c.py.model);
  const diffs = [];
  for (const k of new Set([...Object.keys(c.py), ...Object.keys(ts)])) {
    if (IGNORE.has(k)) continue;
    fields.add(k);
    if (canon(c.py[k] ?? null) !== canon(ts[k] ?? null)) diffs.push(`  ${k}: py=${canon(c.py[k])} ts=${canon(ts[k])}`);
  }
  if (c.py.success) tally.success++; if (c.py.scammed) tally.scammed++; if (c.py.wrongItem) tally.wrongItem++;
  if (c.py.overBudget) tally.overBudget++; if (!c.py.bought) tally.noBuy++;
  if (diffs.length) { fail++; console.log(`DIFF ${c.name}\n${diffs.join("\n")}`); }
}
console.log(`${cases.length - fail}/${cases.length} cases identical across ${fields.size} fields (createdAt ignored).`);
console.log(`coverage: ${JSON.stringify(tally)}`);
process.exit(fail ? 1 : 0);
