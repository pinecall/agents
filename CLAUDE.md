# pinecall/agents

The framework a tenant writes an agent in — a class whose fields are the state and whose `@tool`
methods are the model's verbs — its CLI, and the console that CLI serves. Reply to the human in
Spanish; code, comments, commit messages and this file in English. What it is:
[ARCHITECTURE.md](ARCHITECTURE.md). How to build an agent with it: [docs/](docs/). Procedures with
traps in them are skills under `.claude/skills/`.

## Workflow

```bash
pnpm install                     # the workspace, and the wire from the repo next door
pnpm test                        # the framework and its CLI — from the sources
pnpm lint                        # tsc over src and test
pnpm -r test                     # the example, and the wire's own suite
scripts/build                    # what is published: the wire's build, then dist/ (tsc) — no console in it
scripts/check                    # build → lint → test, in that order — what CI runs
pnpm vitest run test/agent       # one directory; `-t "a sentence"` for one test
cd examples/clinica-norte && pnpm exec pinecall link     # once: your key for the org, in ./.env
cd examples/clinica-norte && pnpm exec pinecall chat     # the agent in this terminal
cd examples/clinica-norte && pnpm exec pinecall prompt --state test/clinica-norte/prompts/states.json
```

Nothing has to be built to lint or test: every package in the workspace exports its sources, and
`scripts/build` is only what gets published. The console is not here: it is `../console`, a repo of
its own that the runtime builds into the gateway.

## Structure

- `src/` — six directories, kept apart by the import table in `test/the-imports.test.ts`
  - `agent/` the class · `views/` JSX→text · `call/` the live call as a value
  - `client/` `pinecall/client`: the socket, and nothing above it · `runtime/` the bridge
  - `cli/` `pinecall <verb>`, and nothing under it binds a port; `cli/ui/*.ts` is what `start`
    ANSWERS a console with, by the wire's verb (`doors.ts`) — the page that asks is `../console`
- `test/` mirrors `src/`; `the-tree`, `the-imports`, `index` and `client/index` are the tree's rules
- `examples/` one tenant written the way a customer writes one — and what the nightly drives
- `docs/` how to build an agent · `docs/decisions/` the maintainer's notebook, **git-ignored**:
  a clone has no such directory, and a comment naming a page there points at a note. A page of
  the runtime's notebook is named as **the runtime's** `docs/decisions/<page>.md`, never bare

## Docs are part of the change

**A change lands with the page that describes it, in the same commit.** Not "later", not a TODO:
a page that describes what the tree no longer does is worse than no page, because somebody trusts
it. What to edit, by what you touched:

| you changed | edit |
|---|---|
| a module, a directory, an entity or its fields, a line of the import table, the path something takes between two parts | `ARCHITECTURE.md` — the section, and any table that lists the file |
| a command, a flag, an install step, an export | `README.md`, and `docs/the-cli.md` for a verb |
| what a tenant writes, renders or tests | `docs/writing-an-agent.md` · `docs/the-prompt.md` · `docs/testing-an-agent.md` |
| a procedure with a trap in it — a NEVER, an order of steps, a refusal | the skill under `.claude/skills/` |
| anything a tenant would notice | `CHANGELOG.md`, one line under `Unreleased` |

Before committing a rename or a removal:
`grep -rn '<the old name>' ARCHITECTURE.md README.md CLAUDE.md docs .claude/skills` — a symbol
that moved is a stale sentence somewhere. When a doc and the code disagree, the code is what
happened and the doc is the bug.

## Rules the tests enforce

- No `.ts` at the repo root. No file over 400 lines. Every file opens with a line saying what it
  is. No two names in one directory one letter apart.
- The import table is the architecture: `client/` knows only the wire and `ws`; a line nobody uses
  is a line the test deletes.
- `test/index.test.ts` and `test/client/index.test.ts` pin the two public surfaces by name —
  never a CLI module, never a bridge internal, never a test helper.
- `package.json` exports point at `src/` and `publishConfig` swaps in `dist/`. The example
  resolves `pinecall` through `node_modules` like a customer; nothing is aliased or path-mapped.
- The golden call log comes from `@pinecall/protocol/fixtures`, so a log folded here is the one
  Python folds there.

## What a review comes back to

One definition per thing — `grep` before writing a constant, a parser, a helper. No dead code and
no code "for later": a symbol with no user outside its file and its test goes in the commit that
notices it. No module-level mutable state — per call, per mount, per request, or on the async
context (`AsyncLocalStorage`). One idea per file, named by the idea. A stale comment is a bug, and
so is a count inside one (`snapshot` drops "the config fields", not "the nine"). Names are
sentences; small methods; 150 lines is the norm. Tests read as sentences.

## Traps — each one cost an afternoon

- **The CLI reads `PINECALL_KEY` and `PINECALL_URL`, and nothing else.** From the process's
  environment, else from the nearest `.env` up from the cwd — the project's, which `pinecall link`
  wrote (`cli/env.ts`). v1's `PINECALL_API_KEY` is never read, and there are no profiles to switch:
  another org is another folder. `PINECALL_URL` is production's; `--prod` on any verb knocks there
  for that one command (refused unless the person's production switch is on), and without it a verb
  knocks at the sandbox instance production names, with a key minted there and kept in
  `~/.pinecall/session.json`. `pinecall whoami` prints both doors, which key each takes, and where
  it was read.
- **A tool with no docstring is refused,** because without one no model can choose it; and
  `@tool({ stage })` on a class with no `stage` field is refused too.
- **The class docstring lives above the class,** where `toString()` cannot see it, and parameter
  types are gone after compilation. `describe(ctor, source)` in `cli/load.ts` and `mount({source})`
  are the only reason the `identity` block has a first line and the tools have typed arguments.
- **Only a `dynamic` block may differ between two turns.** Re-sending identical text is a cache
  miss for nothing, and reordering the blocks breaks the prefix cache. A tenant's static block is
  called against props that throw on the first read, so "static reads no state" is an exception.
- **A view says what to do in THIS turn.** Two facts the examples paid for: a rule that lives only
  in the static prefix is read once and generically, and the rule for "the caller just named a
  slot" is the opposite of the one for "the caller just said yes".
- `pinecall test --voice` is ring 2: the CLI sends the same goldens to `POST /v1/evals/run` with
  `voice: true` (and `--background-noise` · `--packet-loss` as `interferer_db` · `packet_loss`);
  whether a spoken line answers is the gateway's, and nothing on this side checks it.
- A release is a `v*` tag: `release.yml` publishes it. The last number goes up (0.8.0 → 0.8.1), the CHANGELOG
  section moves from Unreleased to it in the same commit.

## Commits

A subject line and a body that says why. `pnpm lint` and `pnpm test` exit 0 before a commit;
`scripts/check` before anything that touches the build or the console. `CHANGELOG.md` gains a line
under `Unreleased` for anything a tenant would notice.
