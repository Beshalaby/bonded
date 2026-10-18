"use client";
import { useEffect, useState } from "react";

/** The origin to put in copy-paste snippets: the server's public URL when one is configured
 *  (scripts/public.sh), otherwise the address this page was opened with. */
export function usePublicOrigin(initial = "http://localhost:3000"): string {
  const [origin, setOrigin] = useState(initial);
  useEffect(() => {
    setOrigin(window.location.origin);
    let live = true;
    fetch("/api/public-url", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => { if (live && d?.url) setOrigin(d.url); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return origin;
}
