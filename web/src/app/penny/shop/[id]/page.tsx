import type { Metadata } from "next";
import ProcessView from "../../ProcessView";

export const metadata: Metadata = { title: "Shopping with Penny" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProcessView key={id} id={id} />;
}
