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
names `../protocol/typescript` as a workspace package. So it is resolved and linked like any
other, and the day it is published the only line that changes is a version range in
`package.json`. Nothing here reads its schema, and nothing here generates from it: the protocol
repo commits its own output, and both languages install it.

The golden call log comes from the same package (`@pinecall/protocol/fixtures/…`), so the log a
test folds here is byte-for-byte the one Python folds there.

## Exports point at the sources; publishConfig points at the dist

There is no build between a change and a test, and no `pnpm link` either, because the link is
already there: pnpm links every workspace package into `node_modules`, and what a link leads to
is whatever `package.json` says. Ours says `./src/index.ts`. `publishConfig` — a pnpm-specific
field, honoured by `pnpm pack` and `pnpm publish` and by nothing else — swaps `main`, `types`,
`exports` and `bin` for their `dist/` twins at publish time, so npm gets compiled JavaScript with
declarations and a bin that needs no loader.

Three things had to be true for this to hold, and each was measured rather than assumed:

- **`tsc` follows an export that ends in `.ts`** under `moduleResolution: NodeNext`, and reads
  the types off the source. Both examples type-check with no `dist` in either repository.
- **vitest and tsx follow it too**, and both rewrite the `./x.js` specifiers our sources use to
  the `.ts` files they name. Node's own type stripping does neither — it refuses TypeScript under
  `node_modules`, will not transform decorators, and takes a `.js` specifier at its word — which
  is why a published package still ships a dist, and why the CLI runs under tsx in a checkout.
- **One copy of the framework.** The old objection to running from source was that a tsconfig
  `paths` mapping to `../../src` handed `pinecall run` — which loads `agent.ts` with tsx, and tsx
  honours `paths` at runtime — a second copy of the framework beside the one in `node_modules`,
  and an agent built by one copy is not an agent to the other. An export is not a mapping: there
  is one resolution, through `node_modules`, and it leads to the sources. So the `paths` block
  left `tsconfig.json`, the aliases left `vitest.config.ts`, and the examples carry neither.

The bin is the one place with two spellings, because it has two worlds: `bin/pinecall.js`, the
checkout's, registers tsx and imports `src/cli/index.ts`; `publishConfig.bin` points npm at
`dist/cli/index.js`, which has its own shebang. pnpm links bins at install time and silently
skips one whose file does not exist yet, which is what a bin under `dist/` is in a fresh
checkout — a warning nobody reads and a `pinecall` that is not on the path.

The console is the exception and the reason `scripts/build` still exists for a developer: a
browser reads no TypeScript, so `pinecall ui` serves a vite bundle and says so when there is
none. The test that greps that bundle for a key builds it itself, into a directory of its own —
a check that depended on somebody having run the build first was a check that passed by being
skipped.

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

`examples/*/vitest.config.ts` carries the two oxc facts and no `resolve.alias` at all, and
`examples/*/tsconfig.json` carries no `paths`. Both examples resolve `pinecall` exactly as a
customer does, through `node_modules` — which leads to the sources here and to the dist from
npm — so an example is a real tenant and not a special case of one.
