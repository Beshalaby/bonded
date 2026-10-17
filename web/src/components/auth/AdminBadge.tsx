"use client";
// Small "Admin" pill + sign out, for the nav. Renders nothing unless the viewer holds an admin session on a
// server in token mode (GET /api/auth/session). Optional `showSignIn` renders a "Sign in" link when signed out.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { loginHref } from "@/lib/auth-client";

type State = { mode: "open" | "token" | "closed"; admin: boolean };

export default function AdminBadge({ showSignIn = false, className }: { showSignIn?: boolean; className?: string }) {
  const [s, setS] = useState<State>();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).then((j: State) => { if (live) setS(j); }).catch(() => {});
    return () => { live = false; };
  }, [path]);

  if (!s || s.mode !== "token") return null;
  if (!s.admin)
    return showSignIn ? <Link href={loginHref(path)} className={cx("text-[13px] text-zinc-600 hover:text-zinc-900", className)}>Sign in</Link> : null;

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setS({ ...s, admin: false });
    router.refresh();
  };
  return (
    <span className={cx("inline-flex items-center gap-2 text-[12.5px]", className)}>
      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-medium text-zinc-700">Admin</span>
      <button type="button" onClick={signOut} className="text-zinc-500 hover:text-zinc-900">Sign out</button>
    </span>
  );
}
