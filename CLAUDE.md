# pinecall/agents — working agreement

The framework a tenant writes an agent in, its CLI, the console that CLI serves, and the
browser's own package. Reply to the human in Spanish; code, comments, commit messages and this
file in English.

**Thesis.** An agent is an object. Fields are state. Methods are capabilities. Docstrings are
prompts. Types are contracts. The prompt is `render(state)`. Tools are the only thing that
changes state. What does the real time is `pinecall/runtime`, over a socket, and this package
never imports it.

## The tree

`README.md` is the map: six directories under `src/`, and `examples/` as two real
tenants. `test/` mirrors `src/`. The why behind each part is in `docs/decisions/`, which is this
laptop's engineering notebook and not the repository's: git ignores it, a clone has no such
directory, and a comment that names a page there is pointing at a note, not at documentation.

## Invariants the tests enforce

- `test/the-imports.test.ts` is the import table. `client/` knows only the wire and `ws`;
  `cli/ui/console/` is a browser page and may never reach the framework; a directory earns its
  place in `src/` by having a line. A line nobody uses is a line the test deletes.
- `test/the-tree.test.ts`: no `.ts` at the repo root, no file over 400 lines, every file opens by
  saying what it is, no two names in one directory one letter apart.
- `test/index.test.ts` and `test/client/index.test.ts` pin the two public surfaces by name.
  Adding an export means editing a list on purpose.
- `package.json` exports point at `src/` and `publishConfig` swaps them for `dist/` at publish.
  Both examples resolve `pinecall` through `node_modules` like a customer would — into the sources
  here, into `dist` from npm — and nothing anywhere is aliased or path-mapped.
- The golden call log comes from `@pinecall/protocol/fixtures`, so a log folded here is the one
  Python folds there.

## Hygiene — what every review greps for

One definition per thing. No dead code, no code "for later": a symbol with no user outside its
own file and its own test goes in the commit that notices it. The public surface is explicit and
tested. No module-level mutable state — a registry or a "current" holder is per call, per mount
or per request, or it rides `AsyncLocalStorage`. One idea per file, named by the idea. A stale
comment is a bug.

## Code style

Files open with a one-line docstring, then imports, then public methods, then private ones. A
short comment above any method whose name does not say everything — why, never what. Names are
sentences: `find_patient`, `render_static_region`, never `mgr` or `ctx2`. Small methods, small
files: 400 lines is the ceiling, 150 the norm. Two-space indentation. Tests read as sentences.
If it would not have shipped in Rails 2.3, do not write it.

## Commits, versions

`Bernardo Castro <me@bernardocastro.dev>`, no `Co-Authored-By`, no generated-with trailers.
Versions and tags are the human's call — never pick a number, never tag.

## Commands

```
pnpm install                        the workspace, and the wire from the repo next door
scripts/build                       the wire, the package, the console
scripts/check                       build, then lint, then test — what CI runs
pnpm test                           the framework and the console, two vitest projects
pnpm -r test                        both examples, and the wire's own suite
```

Nothing has to be built to lint or test: every package in the workspace exports its sources.
`scripts/build` is for what gets published, and for the console — a browser reads no TypeScript,
so `pinecall ui` in a checkout needs the bundle once.
