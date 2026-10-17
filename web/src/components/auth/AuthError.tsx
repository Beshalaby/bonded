"use client";
// Inline error for POSTing UI: an auth failure (see lib/auth-client) becomes "Sign in to start runs" + link.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { isAuthError, loginHref } from "@/lib/auth-client";

export default function AuthError({ message, className }: { message?: string; className?: string }) {
  const path = usePathname();
  if (!message) return null;
  if (!isAuthError(message)) return <p className={cx("text-[12.5px] text-coral-ink", className)}>{message}</p>;
  return (
    <p className={cx("text-[12.5px] text-ink-2", className)} role="status">
      Sign in to start runs.{" "}
      <Link href={loginHref(path)} className="font-medium text-accent hover:underline underline-offset-2">Sign in</Link>
    </p>
  );
}
