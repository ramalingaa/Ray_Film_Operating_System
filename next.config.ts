import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PGlite ships WASM and data files; load it from node_modules instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The sample script and sheets are read at runtime by the "Run the sample screenplay" action.
  outputFileTracingIncludes: { "/": ["./data/script.fountain", "./data/costumes.csv", "./data/locations.csv", "./data/sample-story.txt"] },
  partialPrefetching: true,
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
