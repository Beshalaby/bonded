// Fail-closed switch for demo/admin routes: on in dev, off in production unless BONDED_DEMO=1.
export function demoEnabled() {
  if (process.env.BONDED_DEMO === "0") return false;
  return process.env.BONDED_DEMO === "1" || process.env.NODE_ENV !== "production";
}
