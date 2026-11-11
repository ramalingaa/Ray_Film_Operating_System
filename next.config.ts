import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PGlite ships WASM and data files; load it from node_modules instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The sample script and sheets are read at runtime by the "Run the sample screenplay" action.
  outputFileTracingIncludes: {
    "/": ["./data/script.fountain", "./data/costumes.csv", "./data/locations.csv", "./data/sample-story.txt"],
    "/projects": ["./data/script.fountain", "./data/costumes.csv", "./data/locations.csv", "./data/sample-story.txt"],
  },
  partialPrefetching: true,
  // Screenplays and sheets are attached to chat messages, which are server actions (default limit 1 MB).
  // Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
