import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every TestBridge screen is live data, so we run fully dynamic (no Cache Components).
  reactCompiler: true,
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
