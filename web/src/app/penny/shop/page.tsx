import type { Metadata } from "next";
import ProcessView from "../ProcessView";

export const metadata: Metadata = { title: "Chat with Penny" };

export default function Page() {
  return <ProcessView />;
}
