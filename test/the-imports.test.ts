// The import table, as a test. A directory earns its place in src/ by having a line here, and a
// line says everything that directory may reach — ours and the world's alike. Read top to bottom
// it is the whole architecture: the client knows only the wire, the pages know only a browser,
// and nothing below the CLI knows there is a CLI.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * What each part of src/ may import: our own directories, and the packages it may name. A browser
 * page is addressed by its whole path, because `cli/` may import one no more than it may import
 * `cli/` — the pages are served, never imported.
 */
const MAY_IMPORT: Record<string, string[]> = {
  // The socket, and nothing above it. It knows the wire and how to hold one open.
  "client": ["@pinecall/protocol", "ws"],
  // The class a tenant extends. It reads its own source with oxc, describes its tools with zod,
  // and names one type of the JSX runtime: what its `render()` hands back. That runtime imports
  // nothing of ours, so naming it here is a leaf and not a knot.
  "agent": ["call", "views", "@pinecall/protocol", "oxc-parser", "zod"],
  // The live call as a value: the room, the turns, the six verbs. Reduced from entries it is given.
  "call": ["agent", "@pinecall/protocol"],
  // The JSX-to-text runtime. It reads the class to lay the prompt out, and the wire for the shape
  // of a block's name — one definition of that rule, and it is the schema's.
  "views": ["agent", "@pinecall/protocol"],
  // The bridge: what the class does, become what the wire sees.
  "runtime": ["agent", "call", "views", "client", "@pinecall/protocol"],
  // The verbs. Anything of ours except the page the console is — that one is served, not imported.
  // It names `call` because a page that prints a prompt gives its instance a line to answer on.
  // Two of these are loaded only when something needs them: `tsx`, which is how a tenant writes
  // .tsx and never a build step, and `@livekit/rtc-node`, which is `pinecall simulate --listen` —
  // a room joined from this terminal so the call comes out of this machine's speakers.
  "cli": ["agent", "call", "views", "runtime", "client", "@pinecall/protocol", "ws", "tsx", "@livekit/rtc-node"],
  // What the page is made of below its screens: the fetch to the gateway, the credentials context,
  // the theme, and what the gateway says about itself before anybody holds a key. It names no
  // screen, so the plumbing cannot reach back up into the page.
  "cli/ui/shared": ["react", "zod"],
  // THE page. It must never reach the framework: none of it would run in a browser, and a build
  // that pulled a TypeScript parser into the bundle is a build nobody would notice.
  "cli/ui/console": ["cli/ui/shared", "@pinecall/protocol", "react", "react-dom", "react-router", "livekit-client", "vite", "@vitejs/plugin-react", "zod"],
  // The one file at the top of src/: the public surface, which may name anything it exports.
  "": ["agent", "call", "views", "runtime"],
};

/** Which line of the table a file falls under: the longest declared prefix of its path. */
function partOf(path: string): string {
  const parts = path.split("/").slice(0, -1);
  for (let depth = parts.length; depth >= 0; depth--) {
    const candidate = parts.slice(0, depth).join("/");
    if (candidate in MAY_IMPORT) return candidate;
  }
  throw new Error(`src/${path} is in no part of the table: give its directory a line`);
}

// What an import looks like once the comments are gone. A prose line naming a package is prose,
// and this test used to read one of them as an import. The third alternative is `import("x")` —
// a package loaded when it is needed rather than when the module is: the optional room library
// `--listen` joins a call with is reached that way, and the table governs it like any other.
const SPECIFIER = /^(?:import|export)[\s\S]*?from\s+"([^"]+)"|^import\s+"([^"]+)"|\bimport\("([^"]+)"\)/gm;

/** The source with its comments removed, so only code is read for imports. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every import specifier in the tree, as a pair of the part that wrote it and what it named. */
function edges(): { from: string; to: string; file: string }[] {
  const found: { from: string; to: string; file: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (extname(full) !== ".ts" && extname(full) !== ".tsx") continue;
      const path = relative(SRC, full);
      const from = partOf(path);
      for (const [, named, bare, lazy] of withoutComments(readFileSync(full, "utf8")).matchAll(SPECIFIER)) {
        const spec = named ?? bare ?? lazy;
        if (spec === undefined || spec.startsWith("node:")) continue;
        const to = spec.startsWith(".")
          ? partOf(relative(SRC, resolve(dir, spec)))
          : spec.replace(/^(@[^/]+\/[^/]+|[^@/][^/]*).*$/, "$1");
        if (to !== from) found.push({ from, to, file: path });
      }
    }
  };
  walk(SRC);
  return found;
}

describe("the import table", () => {
  it("is obeyed, line by line", () => {
    const broken = edges()
      .filter(({ from, to }) => !MAY_IMPORT[from]!.includes(to))
      .map(({ from, to, file }) => `src/${file}: ${from || "src"} may not import ${to}`);

    expect([...new Set(broken)].sort()).toEqual([]);
  });

  // A line nobody needs is a line that stops being read. Every entry is either used or gone.
  it("names nothing the tree does not actually import", () => {
    const used = new Set(edges().map(({ from, to }) => `${from} -> ${to}`));
    const idle: string[] = [];
    for (const [part, allowed] of Object.entries(MAY_IMPORT)) {
      for (const one of allowed) {
        if (!used.has(`${part} -> ${one}`)) idle.push(`${part || "src"} -> ${one}`);
      }
    }

    expect(idle, "delete the line, or the import it was written for is missing").toEqual([]);
  });

  it("gives every directory of src/ a line of its own or of its parent", () => {
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (!statSync(full).isDirectory()) continue;
        expect(() => partOf(join(relative(SRC, full), "a.ts"))).not.toThrow();
        walk(full);
      }
    };

    walk(SRC);
  });
});
