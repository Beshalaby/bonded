// Capital One Nessie integration: client (HTTP + shapes), simulated ledger, and Bonded's banking layer.
export { NessieClient, NessieError, backendConfig, redact, DEFAULT_BASE_URL, SHAPES, type NessieApi } from "./client";
export { SimulatedNessie } from "./simulated";
export {
  backend, providerInfo, setBackendForTests, ensureAgentWallet, ensureMerchant, fundForTask, chargePurchase,
  walletSummary, listWallets, onSessionStart, onCheckout, last4,
  type CheckoutBank, type Provider, type WalletPurchase, type WalletRow,
} from "./ledger";
