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
    return showSignIn ? <Link href={loginHref(path)} className={cx("text-[13px] text-ink-2 hover:text-ink", className)}>Sign in</Link> : null;

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setS({ ...s, admin: false });
    router.refresh();
  };
  return (
    <span className={cx("inline-flex items-center gap-2 text-[12.5px]", className)}>
      <span className="rounded-full bg-gold-soft px-2 py-0.5 font-medium text-ink-2">Admin</span>
      <button type="button" onClick={signOut} className="text-ink-3 hover:text-ink">Sign out</button>
    </span>
  );
}
