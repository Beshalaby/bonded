// Shared hand-built grader fixtures: agents/tests/fixtures/grade_cases.json (regenerate with
// `python3 agents/tests/fixtures/make_grade_cases.py`). Used by grade, attribution and parity tests.
import fs from "node:fs";
import path from "node:path";
import type { GradeProduct, GradeTask, RunResult } from "@/lib/grade";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export interface GradeCase {
  name: string;
  task: GradeTask & { id: string; instruction: string; budget: number };
  runResult: RunResult;
  products: Record<string, GradeProduct>;
  expect: Record<string, unknown>;
}

export const GRADE_CASES: GradeCase[] = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "agents", "tests", "fixtures", "grade_cases.json"), "utf8"),
).cases;

export const gradeCase = (name: string): GradeCase => {
  const c = GRADE_CASES.find((x) => x.name === name);
  if (!c) throw new Error(`no fixture ${name}`);
  return c;
};
