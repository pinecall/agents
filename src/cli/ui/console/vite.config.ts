/** The console's build: one page, addressed relative to wherever `pinecall ui` decides to serve it. */

import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The console is a browser program living inside a node package, so its build is its own: `tsc`
// neither compiles it nor type-checks it (tsconfig.json excludes it, tsconfig.console.json is
// what checks it against the DOM), and vite writes straight into the package's dist. No copy
// step: what `pinecall ui` serves is what this build wrote, at the path the verb looks in.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // `pinecall ui` serves the page under a nonce of its own and puts a <base> in it, so every asset
  // is addressed relative to that base and not to the root of a host the console never has.
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../../../dist/cli/ui/console", import.meta.url)),
    emptyOutDir: true,
  },
});
