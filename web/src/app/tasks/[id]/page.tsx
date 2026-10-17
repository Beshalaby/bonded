import TaskView from "./TaskView";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Task ${decodeURIComponent(id)}` };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskView id={decodeURIComponent(id)} />;
}
