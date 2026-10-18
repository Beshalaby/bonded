import type { Metadata } from "next";
import PennyView from "./PennyView";

export const metadata: Metadata = {
  title: "Penny",
  description: "Penny is Bonded's AI shopping assistant. Compare prices, check sellers, and find options that fit.",
};

export default function Page() {
  return <PennyView />;
}
