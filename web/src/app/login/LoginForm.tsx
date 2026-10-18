"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass, PageHeader } from "@/components/ui";
import { safeNext } from "@/lib/auth-client";

type Mode = "open" | "token" | "closed";

export default function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [mode, setMode] = useState<Mode>();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json())
      .then((j: { mode: Mode; admin: boolean }) => { setMode(j.mode); setAdmin(j.admin); }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(undefined);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 429 ? "Too many attempts. Wait a minute and try again." : j?.error || `${r.status} ${r.statusText}`);
      router.replace(next);
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <PageHeader tone="dusk" art={false} title="Sign in" description="Enter the admin token to start runs, red-team rounds and live sessions." />
      {mode === "open" && <p className="mb-4 rounded-md border border-divider bg-ivory px-3 py-2 text-[13px] text-ink-2">This server runs in open demo mode. No sign-in is needed.</p>}
      {mode === "closed" && <p className="mb-4 rounded-md border border-divider bg-ivory px-3 py-2 text-[13px] text-ink-2">Sign-in is not configured on this server (BONDED_ADMIN_TOKEN is unset), so runs are disabled.</p>}
      {mode === "token" && admin && <p className="mb-4 rounded-md border border-divider bg-ivory px-3 py-2 text-[13px] text-ink-2">You are already signed in.</p>}
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Admin token</span>
          <input type="password" autoComplete="current-password" autoFocus value={token} onChange={(e) => setToken(e.target.value)}
            disabled={mode === "closed" || mode === "open"}
            className="h-9 w-full rounded-md border border-divider px-2.5 font-mono text-[13px] shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-ivory" />
        </label>
        {err && <p className="text-[12.5px] text-coral-ink" role="alert">{err}</p>}
        <button type="submit" disabled={busy || !token || mode === "closed" || mode === "open"} className={`${buttonClass("primary")} h-9 w-full`}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
