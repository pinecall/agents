/** The console's build: one page, served by the gateway at its root, with every asset addressed from `/`. */

import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The console is a browser program living inside a node package, so its build is its own: `tsc`
// neither compiles it nor type-checks it (tsconfig.json excludes it, tsconfig.console.json is
// what checks it against the DOM), and vite writes straight into the package's dist. The
// runtime's `scripts/console` copies that directory into the gateway as package data, and the
// gateway serves it at `/` — so a build here is what a browser gets there.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // Absolute assets: the gateway answers `/a/<agent>/talk` with the page, and a relative asset
  // path resolved from there would be a 404 three directories deep.
  base: "/",
  build: {
    outDir: fileURLToPath(new URL("../../../../dist/cli/ui/console", import.meta.url)),
    emptyOutDir: true,
  },
});
