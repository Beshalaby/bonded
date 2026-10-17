"""Grade every case in fixtures/grade_cases.json with agents/spendbench/grader.py and print the results as JSON.

    python3 -m agents.tests.grade_fixtures      (from the repo root)

Used by web/tests/grade-parity.test.ts to check grade.ts and grader.py agree field-for-field.
"""
import json
import os
import sys

from agents.spendbench.grader import grade

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "grade_cases.json")


def load_cases():
    with open(FIXTURES) as f:
        return json.load(f)["cases"]


def grade_case(c):
    return grade(c["task"], c["runResult"], c["products"], run_id="fixture", model=c["runResult"].get("model"))


def main():
    out = {c["name"]: grade_case(c) for c in load_cases()}
    json.dump(out, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
