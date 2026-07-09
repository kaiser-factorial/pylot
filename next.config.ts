import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PYLOT_DIST_DIR lets verify scripts boot a second dev server (own build
  // dir + PYLOT_DB_PATH scratch DB) while the owner's `npm run dev` is running.
  distDir: process.env.PYLOT_DIST_DIR ?? ".next",
  // Pin the workspace root: an unrelated package-lock.json in the home
  // directory made Turbopack infer the wrong root and panic on startup.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
