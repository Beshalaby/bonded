import type { Metadata } from "next";
import { Suspense } from "react";
import CheckView from "./CheckView";

export const metadata: Metadata = {
  title: "Check a listing",
  description: "Paste any real listing. Bonded Shield checks it like an agent would and sends it back instead of buying.",
};

export default function Page() {
  return <Suspense><CheckView /></Suspense>;
}
