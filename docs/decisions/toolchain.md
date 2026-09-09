# The toolchain

What `package.json`, the three tsconfigs and `vitest.config.ts` decide, and why. The Python
half of the product has a page of the same name in `pinecall/runtime`; nothing here is about it.

## One package, and the two things that are not it

`pinecall` is the package, and its source is `src/` at the repo root — the layout
`anthropic-sdk-typescript` uses, and for its reason: a `packages/` directory is for what
somebody installs SEPARATELY, and nothing here is except one thing.

That one thing is `web/`: `@pinecall/web` is a browser's read of its own call, and a customer's
page must not pull in `oxc-parser`, `tsx` and `ws` to get it. It installs alone, so it is a
package.

The console is the counter-example and the useful one. It is 5,000 lines of React, it has its
own compiler settings and its own bundler — and nobody installs it. It is the page one verb
serves, so it lives inside that verb, at `src/cli/ui/console/`, and vite writes its build to
`dist/cli/ui/console/`, which is where `pinecall ui` looks and what `files` publishes. Making it
a package would have bought a `package.json` and cost a runtime `import.meta.resolve` of a
sibling app — a dependency on an app being installed beside the framework, which no published
package can promise.

## The wire is a workspace path, not a copy

`@pinecall/protocol` lives in `pinecall/protocol`, one repo over, and `pnpm-workspace.yaml`
names `../protocol/typescript` as a workspace package. So it is resolved, built and linked like
any other, and the day it is published the only line that changes is a version range in
`package.json`. Nothing here reads its schema, and nothing here generates from it: the protocol
repo commits its own output, and both languages install it.

The golden call log comes from the same package (`@pinecall/protocol/fixtures/…`), so the log a
test folds here is byte-for-byte the one Python folds there.

## Three tsconfigs, and which is the parent

`tsconfig.tenant.json` is the only place the framework's compiler flags are written:
`experimentalDecorators`, `jsx: react-jsx`, `jsxImportSource: pinecall/views`. A tenant extends
it and writes none of them.

`tsconfig.json` extends THAT and adds this repo's own strictness — `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` — so the
package is built under exactly the settings a tenant gets, plus more. If the preset ever stops
being enough for the framework, this build is what says so first.

`tsconfig.lint.json` is the same over `test/` as well, emitting nothing. It caught four type
errors the day the client folded in: the old `@pinecall/sdk` linted its `src` only, so its own
tests had never been checked.

`tsconfig.console.json` is the fourth and the exception: the console is a browser program, so it
gets `DOM` in its lib, `moduleResolution: bundler` and React's JSX factory. `tsconfig.json`
excludes it by path, which is the one place in the tree where a directory is named twice.

## Two vitest projects, because there are two programs

One config cannot serve both JSX runtimes. The framework's project transforms `.tsx` with
`importSource: pinecall/views` and legacy decorators; the console's leaves both alone. Without
the split, a console test that imported a screen would be transformed by our text runtime and
fail in a way that reads like a React bug.

Decorators are legacy on purpose and it was measured, not assumed: `tsc`, `esbuild` and `tsx`
all take TC39 standard decorators and vite's oxc transform does not. The table is in
[agent.md](agent.md).

## Nothing is aliased in the examples

`examples/*/vitest.config.ts` carries the two oxc facts and no `resolve.alias` at all. Both
examples resolve `pinecall` the way a customer does — through `node_modules`, into the package's
`dist` — because `pinecall run` loads `agent.ts` with tsx and tsx honours a tsconfig's `paths` at
RUNTIME: a mapping to `../../src` would give the process a second copy of the framework, and an
agent built by one copy is not an agent to the other.

That is what `scripts/build` exists for, and why `scripts/check` builds before it lints.
