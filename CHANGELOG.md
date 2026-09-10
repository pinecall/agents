# Changelog

All notable changes to `pinecall`, the package a tenant writes an agent in. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers and tags are the
maintainer's call, so everything sits under Unreleased until one is cut.

## [Unreleased]

### Added
- What the class knows, reads and remembers travels in the declaration: `knowledge` is read beside
  `agent.ts` and sent whole as `{ path, text }` (a missing file is refused at load, with the path);
  `docs` names the base it was pushed under — `docs = "clinica-norte"` or
  `{ base, mode?, k?, minScore? }`, typed as `DocsDeclaration` — and the old glob form is refused
  with the verb that replaces it; `memory = { remember, forget }` is `MemoryDeclaration`.
- `pinecall knowledge push [dir] --base <name>` · `list` · `drop <base>`, and
  `pinecall memory <contact>` · `memory forget <contact>`: the folder of `*.md` to the gateway
  under a name, and one contact's facts read or erased. Both leave the planned table.
- `pinecall chat --as <contact>`: the written caller says who it is, and the socket carries it as
  `?contact=`, so an agent that declares `memory` can be made to remember somebody from a terminal.
- The console: a `memory.ops` and a `docs.sources` each read as one row of the live timeline, and
  Sessions prints a fill as `n sources · ms` with what was found one click under the turn.
- A `<Memory kinds>` naming a word the class never wrote under `memory.remember` is refused as the
  marker is written: `memory kinds: "preference" is not one of the words this class remembers
  (cómo prefiere que le llamen, alergias, su médico habitual)`. The recall filters by the word a
  fact was filed under, so any other word matched nothing for ever while looking like it worked.

### Changed
- `<Retrieved minScore>` writes `min_score` in its marker: the payload is the runtime's to read.
  Render props still travel by id; this release the runtime renders its own shape.
- Both examples say `docs = "<slug>"`, ask for `<Retrieved k={4} minScore={0.02} />`, and put a
  heading of their own above each marker, because the runtime renders bare lines.
- Both examples ask for `<Memory />` with no `kinds`: a clinic and a shop recall everything they
  said they keep, and the words they keep it under are their own, not `preference` and `health`.

- The framework, from zero: the `Agent` base whose fields are the state and whose every assignment
  is a change with an author; `@tool` with `when` / `stage` / `confirm` / `preview` / `pii` /
  `timeout`; docstrings read out of the class's own source; `@state({ visibility })`;
  `static events`; the four lifecycle hooks; `collapse`, `restore`, `startIn`, `last(contact)`.
- The views: JSX that renders to text, the prompt as named blocks in two regions in one order, the
  markers the gateway fills (`Memory`, `Retrieved`, `Knowledge`) and the render props one render
  leaves behind.
- Prompt blocks of the class's own: `static prompt = { static: ["faq"], dynamic: ["availability"] }`,
  one `views/<name>.tsx` each, sent by name and only when their text changed; the view stays the
  last block. A static block that reads the state is refused at render, naming the block and the
  field; a declared block with no file is refused at load.
- The live call as a value: the room reduced from its own entries, the turns, and the six verbs —
  `say`, `reply`, `send`, `mute`/`remove`, `invite` — each one command on the wire.
- `pinecall/client`: one socket, the agents on it, the tool calls it answers, and any log the key
  can read, folded by the protocol's own reducer. Plus `pinecall/client/testing`, a gateway and a
  log that are not there, so an app's own suite needs neither a network nor a key.
- The bridge: `mount()` — one live instance per call, the opening state seam, and a sync that
  sends only the block whose text actually changed.
- The CLI: `run`, `chat`, `ui`, `prompt`, `test`, `simulate`, `eval`, `runs`, `personas`, `login`,
  `whoami` — and `groups.ts`, which declares every verb the design names and this tree has not
  written, so a person is told what a verb *will* be instead of "unknown command".
- One resolution order for the gateway and the key (`cli/env.ts`), `~/.pinecall` at 0600, and a
  gateway on a dev key that ignores an exported `PINECALL_API_KEY` out loud.
- The console `pinecall ui` serves on 127.0.0.1 under a nonce: Talk, Calls (live), Sessions,
  Pipeline and Evals. The org key never reaches the browser.
- Two examples written the way a customer writes one — `clinica-norte`, `tienda-sur` — with their
  goldens, personas and prompt-blocks tests; CI (`scripts/check`) and a nightly that drives both
  on two models and watches each judge's drift.
- `ARCHITECTURE.md`, `docs/` (writing an agent, the prompt, testing, the CLI), and
  `.claude/skills/`.

### Changed
- The prompt is a list of named blocks in two regions instead of two strings: `identity`,
  `knowledge` and `tools` (static, cached), the history, then `view` (dynamic). `render()` returns
  `Blocks` — `{ blocks, history, fills }`, every block `{ name, region, text }` in send order — and
  takes the tenant's functions as `views: { view, … }` by block name; so do `mount()`, `load()` and
  `showPrompt()`, whose page now rules `── identity (static) ──` … `── history ──` …
  `── view (dynamic) ──`. `call.setPrompt(name, text)` names a block. The knowledge marker moved
  from between the docstring and the rules to its own block after them; both examples' captured
  prompts were retaken. Clínica Norte keeps its free slots in a block of its own, `availability`.
- The console's Live screen gained a `PROMPT` panel and the Sessions screen a section listing
  every block by name with its hash, length and seq, read from `state.prompt` by name.
- The licence is spelled out where a user of the package meets it: the Apache-2.0 copyright line
  is filled (`Pinecall`), `README.md` has a License section, `package.json` carries the author and
  the repository, and `CONTRIBUTING.md` says there is no CLA. npm ships `LICENSE` in the tarball.
- Comments naming a page of the runtime's engineering notebook now say **the runtime's**
  `docs/decisions/<page>.md`: read from this repository, the bare path pointed at a file that is
  not here.
- `pinecall simulate --judge` names `pinecall-runtime sessions show <id>` (and the console) when a
  call never seals. It used to name `pinecall sessions show`, a verb this CLI declares and has not
  written, so the sentence sent a person to a stub.

### Removed
- `Regions`, `staticRegion`, `historyRegion` and `dynamicRegion`: the blocks above are what they
  were, and `layoutOf` says the order. `setPrompt(region, …)` went with the wire's `region`.
- `@pinecall/web`, the browser package: nobody installed it and it read a projection nobody read.
