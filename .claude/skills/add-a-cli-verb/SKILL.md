---
name: add-a-cli-verb
description: Add, rename or promote a verb of the tenant CLI (pinecall <group>). Use when writing a group that PLANNED declares, changing a group's flags or help, or when a verb has to reach the gateway.
---

# Adding a verb to `pinecall`

A verb is one module under `src/cli/`, exporting one `Group`. The dispatcher only picks which
module reads the argv, so a new verb is one import and one line — never a branch inside a growing
parser.

## The five places a verb's name appears

Miss one and either the help lies or the test that pins the design's verb list goes red.

1. `src/cli/<verb>.ts` (or `src/cli/<verb>/index.ts` for a group with sub-verbs) —
   `export const group: Group = { purpose, usage?, run }`.
2. `src/cli/index.ts` → the `BUILT` array, **in the order the help prints**: run and chat first,
   because they are what a person types on the first day.
3. `src/cli/index.ts` → one line in `groupFor()`: `if (name === "x") return (await import("./x.js")).group;`
4. `src/cli/index.ts` → one line in `usage()`, padded like its neighbours.
5. `src/cli/groups.ts` → **delete** it from `PLANNED` in the same commit. A verb is in exactly one
   of the two tables.

## NEVER

- **Never import a group at the top of `index.ts`.** Every group is imported lazily inside
  `groupFor()`: `pinecall prompt` must not pay for a websocket client, and a planned stub must
  pay for nothing at all.
- **Never bind a port.** `test/cli/verbs.test.ts` greps every file under `src/cli/` for
  `createServer` and `.listen(` and allows exactly one exception: `cli/ui/server.ts`. The app
  opens one outbound socket and listens on nothing.
- **Never read `PINECALL_KEY` or `PINECALL_URL` yourself, and never v1's `PINECALL_API_KEY` at
  all.** `theDoor()` from `cli/env.ts` is the one resolution — the environment, else the project's
  nearest `.env` — for every verb; with no key it prints `NO_KEY` and you return 2.
- **Never parse `--prod`.** `cli/world.ts:withoutTheWorldFlag` takes it off argv in `index.ts`
  before your group sees it, and the door carries the world: build the client with
  `cli/client-for.ts:pinecallFor(door)` and every request with `asked(door, …)`, and the
  `pinecall-env` header goes on by itself. A verb that must know the world asks `standing(door)`,
  which is the gateway's answer, never a guess.
- **Never print a key**, never put one in a URL, never log one.
- Never alias an old name. `run` → `start` was a rename, not an alias: an alias today is a
  deprecation carried forever, and a test pins that the old word is gone.

## The shape

```ts
/** `pinecall widget [args]`: one line saying what it is, for whom. */

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";

export const group: Group = {
  purpose: "the one line the help prints",
  usage: `usage: pinecall widget [--flag]\n\n  What the flags are, in prose a person reads.`,
  run,
};

export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { … } });
  const door = theDoor();
  if (door === undefined) return 2;
  …
  return 0;
}
```

- **Exit codes**: `0` it worked (a planned stub also exits 0), `1` it failed — a gateway refused,
  a check did not hold, an app file did not compile — `2` the person typed it wrong or there is
  no key. What a verb *throws* is caught by the dispatcher and printed as one line: a node stack
  trace tells a person nothing they can act on.
- **Streams are parameters**, defaulted to `process.stdout` / `process.stderr`, so a test reads
  the output as a string instead of driving a terminal.
- **`--json` is for a pipe**: when it is on, print nothing but the JSON.
- A group with sub-verbs (`runs`, `personas`) reads `positionals[0]` as the sub-verb and prints
  its own `USAGE` on anything else — **before** it loads a class or knocks at a gateway: a word
  the group does not answer to must cost nothing but the usage and a 2.
- **The environment is a parameter too** (`how.env ?? process.env`, as `agent`, `docs` and
  `personas` take it), or no test can point the verb at a gateway of its own.
- **A flag that means nothing on a sub-verb is refused there**, with the sentence saying which
  verb prints what: `--json` on a verb that holds a live call is not a flag that is ignored.

## Naming a verb that does not exist yet

If the design declares it and you are not writing it, it belongs in `PLANNED` with the sentence a
person gets instead: `"deploy": "put this app on a box and keep it there"` prints
`deploy is not built yet: put this app on a box and keep it there` and exits 0. Never point a
person at a verb that only prints that line — if an error message wants to say "go read the
call", it names `pinecall-runtime sessions show <id>` or `pinecall serve`.

## Verify

```bash
pnpm vitest run test/cli/dispatch.test.ts test/cli/verbs.test.ts
pnpm lint && pnpm test
pnpm exec pinecall            # the whole CLI on one screen: your verb, in its place
pnpm exec pinecall <verb> --help
```

`test/cli/dispatch.test.ts` asserts every verb of the design is declared (built or planned), that
`usage()` carries a line per planned one, and that `console` and `talk` are neither.
