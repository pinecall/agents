// Two programs live in this repo, so the suite has two projects: the framework, which runs in node
// against our own JSX-to-text runtime, and the console, which is a browser page and compiles its
// JSX against React's. One config could not tell them apart — a console test that imports a screen
// would silently be transformed by the wrong factory — so neither has to pretend to be the other.
import { defineConfig } from "vitest/config";

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
        // JSX: a view is a .tsx file whose factory is our own text runtime, reached by the
        // specifier a tenant writes — package.json's exports point at the sources, so nothing here
        // is aliased and there is no dist between the source and the test.
        oxc: {
          decorator: { legacy: true },
          jsx: { runtime: "automatic", importSource: "pinecall/views" },
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
