import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several dev servers run side by side (one per team) without clobbering .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Self-contained server for the Docker image: .next/standalone/server.js + a traced node_modules.
  // (Static assets and public/ are copied next to it by the Dockerfile.)
  output: "standalone",
  // Trace from web/ itself so standalone/server.js lands at the top of .next/standalone (not under a
  // parent dir picked from some lockfile higher up). agents/ is copied separately.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Never bake local stores, other dist dirs or tests into the standalone bundle (the tracer sees
  // path.join(process.cwd(), ".data") in lib/persist/file.ts and would copy web/.data/db.json).
  outputFileTracingExcludes: { "*": [".data/**", ".data-*/**", ".next-*/cache/**", "tests/**", ".dev-server*.log"] },
  // pg is loaded at runtime from node_modules (optional native bindings, dynamic requires).
  serverExternalPackages: ["pg"],
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
};

export default nextConfig;
