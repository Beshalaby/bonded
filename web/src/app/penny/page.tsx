import type { Metadata } from "next";
import PennyView from "./PennyView";

export const metadata: Metadata = {
  title: "Penny",
  description: "Penny is Bonded's AI shopping agent: she shops around, checks every listing for scams, and only buys when she's sure.",
};

export default function Page() {
  return <PennyView />;
}
