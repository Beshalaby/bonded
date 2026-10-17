import Nav from "@/components/Nav";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[1200px] px-5 pb-24 pt-8 sm:px-8">{children}</main>
    </>
  );
}
