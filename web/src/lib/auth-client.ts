// Client-side helpers for auth-aware POSTs. Same contract as postJSON in lib/ui/api.ts, but a 401/403 from the
// auth layer throws an Error whose message is AUTH_REQUIRED_MSG, which <AuthError> renders as a sign-in notice.
export const AUTH_REQUIRED_MSG = "Sign in to start runs.";

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 || (r.status === 403 && j?.code === "auth_required")) throw new Error(AUTH_REQUIRED_MSG);
    throw new Error(j?.error ? String(j.error) : `${r.status} ${r.statusText}`);
  }
  return j as T;
}

export const isAuthError = (msg: unknown) => msg === AUTH_REQUIRED_MSG;

/** /login?next=<current path> */
export function loginHref(next?: string) {
  const n = next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return `/login?next=${encodeURIComponent(n)}`;
}

/** Only same-site relative paths are valid redirect targets (no //host or scheme). */
export function safeNext(n: string | null | undefined) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}
