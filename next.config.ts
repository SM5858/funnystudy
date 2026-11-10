import type { NextConfig } from "next";

// Keep the controlled preview's generated files separate from normal builds.
const nextConfig: NextConfig = process.env.FUNNYSTUDY_SETTINGS_PREVIEW === "1"
  ? {
      distDir: ".next-settings-preview",
      typescript: { tsconfigPath: ".next-settings-preview/tsconfig.json" },
    }
  : {};

export default nextConfig;
