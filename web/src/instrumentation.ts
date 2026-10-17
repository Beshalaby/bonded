// Next.js boot hook. Next awaits register() before serving requests, so the store (file or Postgres) is
// loaded into memory before the first read(). Node runtime only: the edge runtime (middleware) never touches it.
// Keep the `=== "nodejs"` if-block form: it lets Next drop the import from the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("./lib/persist/boot");
    await boot();
  }
}
