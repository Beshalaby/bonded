// OWNER: Team 3 (Risk + Guardian). STUB — replace implementation, keep signature.
import type { Cart, GuardianVerdict, Product, Session, Merchant } from "./types";

export async function checkCart(
  session: Session, cart: Cart, products: Product[], merchants: Merchant[],
): Promise<GuardianVerdict> {
  void products; void merchants;
  const total = cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  if (total > session.task.budget)
    return { decision: "block", reasons: [{ code: "OVER_BUDGET", severity: "critical", message: `Cart $${total.toFixed(2)} exceeds budget $${session.task.budget}` }] };
  return { decision: "approve", reasons: [] };
}
