import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PYLOT_DIST_DIR lets verify scripts boot a second dev server (own build
  // dir + PYLOT_DB_PATH scratch DB) while the owner's `npm run dev` is running.
  distDir: process.env.PYLOT_DIST_DIR ?? ".next",
};

export default nextConfig;
