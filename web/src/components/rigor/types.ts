// Client-safe shapes shared by lib/compare.ts (server) and the rigor components.

export interface PairwiseModel {
  model: string;
  displayName: string;
  provider: string;
  simulated: boolean;
  s: number;          // successes
  n: number;          // graded results (latest per task)
  a: number;          // Beta posterior α = 1 + s
  b: number;          // Beta posterior β = 1 + n − s
  mean: number;
  lower: number;      // 5% quantile
  upper: number;      // 95% quantile
}

export interface PairwiseCell {
  p: number;               // exact P(row model's true success rate > column model's)
  mc: number;              // seeded Monte Carlo estimate of the same quantity (20k draws)
  distinguishable: boolean; // p > 0.95
}

export interface PairwiseMatrixData {
  models: PairwiseModel[];          // sorted by posterior mean desc
  cells: (PairwiseCell | null)[][]; // cells[i][j] = P(models[i] > models[j]); diagonal null
  method: { exact: "closed-form"; mcSamples: number; seed: number; maxAbsMcError: number };
  threshold: number;                // 0.95
}

/** Compact outcome label for a graded result. */
export function outcomeKey(r: { success: boolean; scammed?: boolean; overBudget?: boolean; wrongItem?: boolean; bought?: boolean; error?: string | null }): string {
  if (r.success) return "success";
  if (r.error) return "error";
  if (r.scammed) return "scammed";
  if (r.overBudget) return "over_budget";
  if (r.wrongItem) return "wrong_item";
  if (r.bought === false) return "no_purchase";
  return "failed";
}
