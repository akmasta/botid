import { defineConfig } from "tsup";

export default defineConfig([
  // Main SDK bundle
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: false,
  },
  // CLI entry point
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: false,
  },
]);
