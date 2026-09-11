# Changelog

All notable changes to `pinecall`, the package a tenant writes an agent in. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers and tags are the
maintainer's call, so everything sits under Unreleased until one is cut.

## [Unreleased]

### Added
- **Simulate from the console.** Calls → Simulate: a persona from this directory's
  `test/personas`, written or spoken, judged or not, the line spoiled or clean — and the page goes
  to the call as it opens. Spoken, the listen button beside it is the speakers `simulate --listen`
  always refused to be. The `ui` process runs the same `aSimulation` the terminal verb runs and
  prints the turns; the page reads the log. Two doors of the console's own, `ui/personas` and
  `POST ui/simulate`, never the gateway's.
- **`Call.run`** — the eval run that opened this call, or null for a person, read off the same
  first entry the line is read from. `pinecall test` seeds a golden's state into the call that
  carries a run, and into no other; the `eval_` caller prefix it used to look for is gone.
- **`pinecall test --voice` in the docs**: ring 2 over the same goldens, and where a broken golden
  is written out (`.pinecall/evals/<run>/<golden>.json`) with the requests its model answered.
- **`greeting`: how a class opens a call**, without an `onCall` hook to do it.
  `greeting = "Clínica Norte, buenos días."` is the words, read out as written;
  `greeting = { reply: "saluda y preséntate" }` hands the model an instruction the caller never
  hears and lets it find its own opening. Exactly one of the two, refused at load when it is
  neither or both. `allowInterruptions: false` is the legal notice nobody talks over.
  Clínica Norte opens with words, Tienda Sur improvises — one of each, in the examples.
- **`pinecall sessions [call]`** — the calls this gateway has run, and what one of them came to.
  With nothing after it, one row per call newest first: when it came in, how long it lasted, why it
  ended, what it cost and the line the agent left as its outcome. With a call id, that call's
  **score**: the verdict, how many questions the judging put to a model and what they cost, then one
  line per judge with the question it answered — and, for a judge that did not hold, its own
  reasoning. `--agent`, `--limit`, `--json`. It reads ring 4's judging back; it runs nothing.

### Fixed
- **Clínica Norte's CRM is per call**, hung off the instance like its agenda, instead of one
  module-level map every call in the process wrote into. A `TODO` naming a bridge function that
  never existed is gone. `docs/the-cli.md` no longer lists `sessions` and `supervise` as unwritten.
  `testing-an-agent.md` is split: memory's and the index's goldens have their own page.
- **A reproduction says why there is no prompt, and only then.** `Cell.asked` is a list, or
  `null` when the runtime kept no requests; the file writes the sentence for `null` and an empty
  list for an empty list, where it used to read `[]` as "not recorded".
- **Clínica Norte's knowledge file stops giving procedure.** Three sentences that told the agent what
  to ask before checking the agenda contradicted `freeSlots`'s own description, which had to shout
  them down; the facts stay, the procedure lives in the tools.
- **`pinecall ui` served a blank page from a checkout, and had for as long as it has existed.** Two
  faults, one evening. The console's directory arrives as a URL's path and so ends in a separator,
  and the server guarded its own root with `files + sep` — which reads `…/console//`, which no file
  under it starts with, so every request fell through to the page and the browser parsed a megabyte
  of JavaScript as HTML. And beside the module sits `console/` twice: the built one in the package
  and the SOURCE in a checkout, whose `index.html` points at `main.tsx`, which no browser runs. The
  existence check could not tell them apart. Both are pinned by tests that fail without the fix.

### Added
- **`pinecall supervise <call>`** — a human at the desk, from this terminal. The call's transcript
  as it lands, and one line per move: `w <text>` whispers to the agent, `s <text>` puts a sentence
  in its mouth verbatim, `t` takes the line, `x` gives it back, `e [reason]` ends the call, `q`
  leaves and the call goes on. Every move lands in the caller's own log as its own `supervisor.*`
  entry with a seq, so what a human did is read the way what the agent did is read. The audio is
  `pinecall ui`, which has a room; a terminal has no speakers this process may reach.
- **`hangup = { when: "..." }`** on a class: the model may end the call itself, and you say in your
  own words when. The tool is livekit's own `end_call`, hidden while the agent is greeting, and the
  call's log gets `call.ended` with `agent_hung_up` rather than the drain its close reason would
  otherwise have looked like. A class that declares nothing cannot hang up: only the caller and a
  supervisor end a call. Clínica Norte declares one.

### Removed
- Clínica Norte's `transfer()` tool, which returned a sentence and did nothing. A tool the model can
  call that changes nothing is a trap, and this one was the tool a model reached for on the first
  real call of this project. What replaces it is real: the agent can now end the call.

### Changed
- An extraction golden is the schema's shape, not this package's: `ExtractionGolden`,
  `ExtractionExpected`, `ExtractionBroke`, `ExtractionJudged`, `ExtractionCases` and
  `ExtractionRun` come from `@pinecall/protocol` and are generated, so a case written in
  TypeScript, in Python or in Ruby is one contract and not three that drift. The file format
  is unchanged — a transcript stays a list of `[who, what]` pairs, which the schema now says
  in its own words.

### Added
- `pinecall memory eval [golden.json] [--k n]`: a memory golden, the read side of the table. A
  list of `{holds, asks, expects}` — what memory holds about a question's contact, what the caller
  said, and the fact or facts that should come back — asked of `recall` and answered as `recall@k`
  and `nDCG@10`, computed by code with no model in the loop. No contact of the org is read or
  written: each question's facts go to a scratch contact and are deleted again, which is what makes
  the figures the real ranking. A fact answers when what came back CONTAINS what was expected,
  folded for case, accents and whitespace, because a fact is a sentence a model wrote. Every
  question memory did not answer whole is printed with what came back instead, and the verb exits 1
  when anything did. `memory/golden.json` beside the agent file by default; Clínica Norte ships one
  of seven questions, eight or nine facts each.
- **`pinecall remember [paths]`** — the goldens `memory.remember` is held to, which is the write
  side and the half that persists. A case is one call already held (both speakers, in `said`), the
  facts memory already holds (`holds`), and what must come of the hang-up's one model call: which
  categories got a fact (`writes`), which never did (`never`), which values must not survive in any
  fact's text (`never_says`), and which held facts the call contradicted (`invalidates`) — its
  mirror included, so a model that supersedes whatever it touches is caught too. A case may
  `plants` sentences somebody tried to get into memory, and planting one IS the assertion that
  admission refuses it. Nothing asks a model whether two sentences mean the same thing: a category
  is your own word, a value is a literal, a supersession is an id. One model call per case, run in
  the gateway on the org's own keys against the class this terminal is holding; exits 1 when a case
  did not hold. `test/memory` beside the agent file by default; Clínica Norte ships three.
- A ring-1 golden may open its call already knowing things: `"memory": [...]` seeds the facts the
  `recall` tool answers for that call alone. It is how you test the one thing memory exists for —
  that the agent uses what it remembered — without a contact in a database and without leaving a
  fact behind. Clínica Norte ships one.
- `pinecall knowledge eval [golden.json] [--base <name>] [--k <n>]`: every question of a golden
  asked of the base, and `recall@k` and `nDCG@10` printed — computed by code with no model, so two
  runs answer the same numbers. Prints every question it missed with what came back instead and
  exits 1 when anything did, so a base can be held to its golden in CI. Clínica Norte ships one.
- **`@render(ThePrompt)` on the class, the other spelling of `render()`.** A prompt that has grown
  gets a function beside the class, and the props ARE the instance —
  `Prompt<T> = (agent: T) => Child`, so `({ stage, customer }: Support) => …` stays typed with no
  wrapper. It is exactly `render() { return ThePrompt(this); }` and produces the same block, byte
  for byte. A class that declares both spellings is refused when it is defined: `TiendaSur declares
  both @render(TiendaPrompt) and a render() method; two ways to answer one question — keep one`.
  Tienda Sur is written this way; Clínica Norte keeps the method.
- **`@state` in three spellings**: bare `@state`, `@state({ pii: true })` (sugar for
  `visibility: "pii"`), and `@state({ visibility })`. `pii: true` beside a `visibility` that says
  something else is refused by name.
- **Decorating one field decides them all.** A class that decorates no field has every own field as
  state, as before; a class that decorates any means *these, and nothing else*, so an undecorated
  field on it is the tenant's scratch space — out of the snapshot, out of the prompt, out of
  `state.changed`, and writable with no tool running. It is the first way to keep a helper field
  out of the log.
- **The view is a method of the class.** `render(): Child` on `Agent`, returning JSX, with `this`
  as the state — no view file, no props, no block a class declares of its own. A class with no
  `render()` sends an empty view. The file a tenant writes is `agent.tsx` for that reason; the CLI
  loads either name, and every default path, usage line and doc says `agent.tsx`.
- `Agent#remembers(text)`: whether memory has already told THIS call something under that word —
  the word a fact was filed under, or the fact itself. The bridge folds the call's own `memory.ops`
  entries into it (`runtime/recall.ts`) and re-renders, so a branch that asks about the caller
  follows what the runtime actually found. It replaces the old `memory.has()` of the view props.
- What the class knows, reads and remembers travels in the declaration: `knowledge` is read beside
  `agent.tsx` and sent whole as `{ path, text }` (a missing file is refused at load, with the path);
  `docs` names the base it was pushed under — `docs = "clinica-norte"` or
  `{ base, mode?, k?, minScore? }`, typed as `DocsDeclaration` — and the old glob form is refused
  with the verb that replaces it; `memory = { remember, forget }` is `MemoryDeclaration`.
- `pinecall keys add <vendor>` · `rm <vendor>` · `list`: the org brings its own provider key for
  a vendor without an operator, on its own API key. The key is read from stdin and never from the
  command line, it is echoed and printed nowhere, and `list` answers vendor names alone — no door
  of the runtime ever gives a provider key back. `keys` leaves the planned table.
- `pinecall knowledge push [dir] --base <name>` · `list` · `drop <base>`, and
  `pinecall memory <contact>` · `memory forget <contact>`: the folder of `*.md` to the gateway
  under a name, and one contact's facts read or erased. Both leave the planned table.
- `pinecall chat --as <contact>`: the written caller says who it is, and the socket carries it as
  `?contact=`, so an agent that declares `memory` can be made to remember somebody from a terminal.
- The console: a `memory.ops` and a `docs.sources` each read as one row of the live timeline, and
  Sessions prints a lookup as `n sources · ms` with what was found one click under the turn.

### Changed
- **Nothing the framework writes is a hole for somebody else to fill.** The view is one block, all
  of it the tenant's words: what memory recalled and what the knowledge base returned reach the
  model as `tool_result` blocks, JSON-encoded, where content from outside the conversation belongs
  (`runtime/docs/security/prompt-injection.md`). `pinecall prompt` and `pinecall run --show-prompt`
  print the three regions with no marker line anywhere.
- The `knowledge` block is the runtime's to write, from the `{ path, text }` the declaration already
  carries: the app sends nothing for it, because the same file twice is a worse bug than an empty
  block.
- Both examples are one `agent.tsx` with a `render()` and no `views/` directory, and they say how
  their chunks come back on the declaration — `docs = { base, k: 4, minScore: 0.5 }` — instead of
  inside the prompt. Their ring-0 suites and their captured prompts were retaken.
- `promptOf(agent)`, `showPrompt(agent)` and `mount(Class, { pc, … })` no longer take a `views`
  argument, and `load()` no longer resolves a view file. `describe(ctor, source, file)` takes the
  file name, because the parser reads the dialect off the extension.
- `render(agent)` is now `promptOf(agent)`: `render` is the decorator a class wears, and one name
  cannot be two things. `layout()` is no longer exported — `promptOf` is that function under the
  name a tenant reads it by.
- The class docstring survives a class decorator: the parser puts a decorated statement's start
  after the decorator, so a docstring read up to there found `@render(…)` in the way and gave up.
  It is read up to the first decorator now.
- `withAuthor`, `withAuthorAsync`, `currentAuthor` and `UnauthoredWrite` moved to
  `agent/authors.ts`. Who is writing the state is one idea, and `agent.ts` was at the 400-line
  ceiling the tree test holds.

- The framework, from zero: the `Agent` base whose fields are the state and whose every assignment
  is a change with an author; `@tool` with `when` / `stage` / `confirm` / `preview` / `pii` /
  `timeout`; docstrings read out of the class's own source; `@state({ visibility })`;
  `static events`; the four lifecycle hooks; `collapse`, `restore`, `startIn`, `last(contact)`.
- The views: JSX that renders to text, and the prompt as named blocks in two regions in one order —
  `identity`, `knowledge`, `tools`, then the view, which is the whole dynamic region.
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
  `knowledge` and `tools` (static, cached), the history, then `view` (dynamic). `render(agent)`
  returns `Blocks` — `{ blocks, history }`, every block `{ name, region, text }` in send order —
  and `showPrompt()` rules its page `── identity (static) ──` … `── history ──` …
  `── view (dynamic) ──`. `call.setPrompt(name, text)` names a block.
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
- `<Prompt>`, the tag that rendered its children as paragraphs: `<>` already does exactly that,
  and no example ever wrote one. The name is the type `Prompt<T>` now.
- The whole marker apparatus: `<Memory>`, `<Retrieved>`, `<Knowledge>`, `marker()`, `Fills`,
  `fills()`, `withFills()` and the `AsyncLocalStorage` that carried them; `ViewProps`, `View`,
  `Views`, `propsFor`, `viewFor`, `checkViews`, `layoutOf`, `declaredBlocksOf`, `PromptDeclaration`
  and `static prompt`. A view file, a prompt block a class declared for itself and a hole a
  gateway filled are all gone, with their tests. `PROMPT_BLOCKS` is the layout, and it is the
  framework's.
- `Regions`, `staticRegion`, `historyRegion` and `dynamicRegion`: the blocks above are what they
  were. `setPrompt(region, …)` went with the wire's `region`.
- `@pinecall/web`, the browser package: nobody installed it and it read a projection nobody read.
