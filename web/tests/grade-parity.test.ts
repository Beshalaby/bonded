// Parity: grade.ts (TypeScript port) and agents/spendbench/grader.py must agree field-for-field on the shared
// fixtures. Python grades them via `python3 -m agents.tests.grade_fixtures`.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { grade } from "@/lib/grade";
import { GRADE_CASES, REPO_ROOT } from "./fixtures";

const PY = process.env.PYTHON || "python3";

function pythonGrades(): Record<string, Record<string, unknown>> | null {
  try {
    const out = execFileSync(PY, ["-m", "agents.tests.grade_fixtures"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 30_000 });
    return JSON.parse(out);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; // no python on this machine
    throw e;
  }
}

const py = pythonGrades();

describe.skipIf(!py)("grade.ts <-> grader.py parity", () => {
  it.each(GRADE_CASES.map((c) => [c.name, c] as const))("%s", (name, c) => {
    const ts = grade(c.task, c.runResult, c.products, "fixture", c.runResult.model) as unknown as Record<string, unknown>;
    const p = py![name];
    expect(p, `python graded ${name}`).toBeDefined();
    const keys = new Set([...Object.keys(p), ...Object.keys(ts)]);
    keys.delete("createdAt");
    for (const k of keys) expect(ts[k] ?? null, `field ${k}`).toEqual(p[k] ?? null);
  });
});
