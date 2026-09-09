// Two programs live in this repo, so the suite has two projects: the framework, which runs in node
// against our own JSX-to-text runtime, and the console, which is a browser page and compiles its
// JSX against React's. One config could not tell them apart — a console test that imports a screen
// would silently be transformed by the wrong factory — so neither has to pretend to be the other.
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const views = fileURLToPath(new URL("./src/views/", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // The framework, alone: no gateway, no network, no build step between source and test.
        //
        // Decorators: measured, not assumed — tsc, esbuild and tsx all take TC39 standard
        // decorators and vite's oxc transform does not, so the package is written against the
        // legacy ones. The table and the migration are in docs/decisions/agent.md.
        //
        // JSX: a view is a .tsx file whose factory is our own text runtime. The alias points the
        // specifier a tenant writes at the sources, because this suite runs before there is a dist.
        oxc: {
          decorator: { legacy: true },
          jsx: { runtime: "automatic", importSource: "pinecall/views" },
        },
        resolve: {
          alias: [
            { find: "pinecall/views/jsx-dev-runtime", replacement: `${views}jsx-dev-runtime.ts` },
            { find: "pinecall/views/jsx-runtime", replacement: `${views}jsx-runtime.ts` },
          ],
        },
        test: {
          name: "pinecall",
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          exclude: ["test/cli/ui/console/**"],
        },
      },
      {
        // The console's tests run in node and read files: what they prove is an absence, not a
        // rendering. Bernardo's rule stands — there are no UI suites here; `tsc` against the DOM
        // and a clean build are the gates.
        test: {
          name: "console",
          include: ["test/cli/ui/console/**/*.test.ts"],
        },
      },
    ],
  },
});
