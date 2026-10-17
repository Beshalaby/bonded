import ModelView from "./ModelView";

export async function generateMetadata({ params }: { params: Promise<{ model: string }> }) {
  const { model } = await params;
  return { title: decodeURIComponent(model) };
}

export default async function Page({ params }: { params: Promise<{ model: string }> }) {
  const { model } = await params;
  return <ModelView model={decodeURIComponent(model)} />;
}
