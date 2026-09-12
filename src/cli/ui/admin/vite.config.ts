/** The operator's page: one bundle, served by the gateway under `/admin`, assets addressed there. */

import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A second program beside the console's, with a second bundle and a second credential. It is
// built the same way and copied in by the same script (the runtime's `scripts/console`), but it
// is never the same page: the ops key belongs to no org and must not reach a tab holding a
// tenant's key. The gateway serves this directory at `/admin` (runtime `api/pages.py`).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // Every asset addressed from `/admin/`, because that is where the gateway mounts this page and
  // a deep screen — /admin/orgs/clinica — would otherwise resolve an asset one directory too far.
  base: "/admin/",
  build: {
    outDir: fileURLToPath(new URL("../../../../dist/cli/ui/admin", import.meta.url)),
    emptyOutDir: true,
  },
});
