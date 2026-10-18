// Model ids for agents shopping through Bonded Shield: `bonded/shield:<base model>` (e.g. `bonded/shield:openai/gpt-5-mini`,
// `bonded/shield:sim/careful`). `bonded/shield-nomarket:<base>` is the same agent with the market price lookup hidden
// (blind LLM estimate only), used to show Shield doesn't depend on it. Pure module: client components use it too.
export const SHIELD_PROVIDER = "Bonded";
const RE = /^bonded\/(shield|shield-nomarket):(.+)$/;

export function parseShieldModel(model: string | null | undefined): { variant: "shield" | "shield-nomarket"; base: string } | null {
  const m = RE.exec(model || "");
  return m ? { variant: m[1] as "shield" | "shield-nomarket", base: m[2] } : null;
}

/** "Bonded Shield (GPT-5 mini)"; `baseName` maps the base model id to its display name. */
export function shieldDisplayName(model: string, baseName: (m: string) => string): string | null {
  const s = parseShieldModel(model);
  if (!s) return null;
  const base = baseName(s.base).replace(/\s*\(sim\)\s*$/i, "");
  return s.variant === "shield" ? `Bonded Shield (${base})` : `Bonded Shield (${base}, no market data)`;
}

/** Simulated agents: `sim/*`, and Shield driving a simulated base (`bonded/shield:sim/careful`). */
export function isSimulatedModel(model: string): boolean {
  return model.startsWith("sim/") || !!parseShieldModel(model)?.base.startsWith("sim/");
}
