// Fail-closed switch for admin + process-spawning routes: on in dev, off under `next start` unless SPENDBENCH_DEMO=1.
export function demoEnabled() {
  if (process.env.SPENDBENCH_DEMO === "0") return false;
  return process.env.SPENDBENCH_DEMO === "1" || process.env.NODE_ENV !== "production";
}
