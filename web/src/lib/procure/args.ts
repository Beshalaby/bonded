// Shared validation for plan_purchase (MCP) and POST /api/procure. Returns an error message string on bad input.
import type { ProcureInput } from ".";
import type { Source } from "./types";

export function parseProcureArgs(a: Record<string, unknown>): Omit<ProcureInput, "agent"> | string {
  const request = typeof a.request === "string" ? a.request.trim() : "";
  if (!request) return "'request' is required (what to buy, in plain words)";
  if (request.length > 1000) return "'request' is too long (max 1000 characters)";
  const budget = a.budget == null || a.budget === "" ? undefined : Number(a.budget);
  if (budget != null && !(budget > 0)) return "'budget' must be a positive number (USD)";
  const quantity = a.quantity == null || a.quantity === "" ? undefined : Number(a.quantity);
  if (quantity != null && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= 100)) return "'quantity' must be an integer from 1 to 100";
  let constraints: Record<string, string | number> | undefined;
  if (a.constraints != null) {
    if (typeof a.constraints !== "object" || Array.isArray(a.constraints)) return "'constraints' must be an object, e.g. {\"size\": \"10\", \"color\": \"black\"}";
    constraints = Object.fromEntries(Object.entries(a.constraints as Record<string, unknown>).slice(0, 12)
      .filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k.slice(0, 40), typeof v === "string" ? v.slice(0, 100) : v as number]));
  }
  let sources: Source[] | undefined;
  if (a.sources != null) {
    if (!Array.isArray(a.sources) || !a.sources.every((s) => s === "web" || s === "arena")) return "'sources' must be an array of \"web\" and/or \"arena\"";
    sources = [...new Set(a.sources as Source[])];
  }
  return { request, budget, quantity, constraints, sources };
}
