# Architecture — `pinecall`, the package a tenant writes an agent in

What this repository is, file by file, and where each piece meets the other two: the wire
(`pinecall/protocol`) and the runtime (`pinecall/runtime`). Read it before changing anything;
the why behind a single decision is a page in `docs/decisions/` on the maintainer's laptop, and
how to build an agent is `docs/`.

**The thesis.** An agent is an object. Fields are state. Methods are capabilities. Docstrings are
prompts. Types are contracts. The prompt is `render(state)`. Tools are the only thing that changes
state. The log is the truth.

---

## 1. Three repositories, one product

| repository | language | what it owns |
|---|---|---|
| `pinecall/protocol` | JSON Schema → Python + TypeScript | the wire: envelope, events, commands, verbs, metrics, state, the log reducer, the golden fixtures |
| `pinecall/runtime` | Python, on livekit-agents | the real time: LiveKit rooms and SIP, STT/LLM/TTS, the gateway's doors, the log in Postgres, memory and retrieval, the judges, the box |
| **`pinecall/agents`** (this one) | TypeScript, Node ≥ 24 | the class a tenant writes, the prompt as a function of its state, the CLI, and the console — one bundle the gateway serves for production and `pinecall serve` for a developer's sandbox |

The line between this package and the runtime is a **socket**. This package never imports the
runtime, never speaks HTTP to a vendor, never sees audio, and holds no key of its own beyond the
one the person typed. It sends **commands** and it reads **entries**; both shapes come from
`@pinecall/protocol`, which is generated and never hand-edited.

```
   a tenant's app.ts                    this package                     pinecall/runtime
   ───────────────────                  ────────────                     ────────────────
   class ClinicaNorte      ──mount()──▶  src/runtime/  ──WS /v1/apps──▶  gateway ──▶ LiveKit
     fields = state                      src/client/   ◀──entries─────   worker  ──▶ STT·LLM·TTS
     @tool  = verbs                                                      log     ──▶ Postgres
     render() = the view   ──render()─▶  prompt.set                       judges
```

## 2. The tree

`src/` is the package: six directories, and `test/the-imports.test.ts` is what keeps them apart —
a directory earns its place there by having a line in that table (§13).

### `src/agent/` — the class a tenant extends

| file | what it is |
|---|---|
| `agent.ts` | the `Agent` base: the Proxy that turns an assignment into an authored change, the internals kept off the instance, `seal`, `collapse`, `restore`, `startIn`, `log`, `say`/`reply`, `this.call`, `this.knowledge`, `render()`, `remembers()`, the four hooks. `CONFIG_FIELDS` is the four names that configure and are not state: the three doors and `language` |
| `knowledge.ts` | `Knowledge`: what a class reaches its bases through — `this.knowledge.search(query, {k})`, one verb the gateway answers for the call in hand |
| `searching.ts` | whether a class searches at all: its source read with oxc for a `this.knowledge` member expression — never a regex, because the words inside a string or a comment are not a search. What it answers travels as `uses_knowledge` in the declaration |
| `decorators.ts` | `@tool({…})`, which registers a method and wraps it so every write inside it carries its name, and `@render(Prompt)`, which gives the class a prompt written beside it. `Prompt<T> = (agent: T) => Child` |
| `authors.ts` | who is writing the state right now: the `AsyncLocalStorage` the author rides, `withAuthor`, `withAuthorAsync`, `currentAuthor`, and `UnauthoredWrite` |
| `tools.ts` | the tool registry: `ToolOptions`, `ToolDeclaration`, the wire `ToolSpec` built and cached per class, `visibleToolsOf`, `DeclarationRefused` |
| `docstrings.ts` | a class's own source read with oxc: the JSDoc above the class, above each method, and the parameter names and types |
| `state.ts` | `snapshot` (fields + getters, never config, never methods), `diff`, `restore`, `collapse`, `Snapshot<T>` |
| `stages.ts` | `Stages<"a"|"b">`, `StageOf<T>`, and `lowerStage` — `stage:` is sugar over `when(state)` |
| `visibility.ts` | `@state` in its three spellings — bare, `{ pii: true }`, `{ visibility }` — which fields are the state (`declaredStateOf`) and who may see them (`visibilityOf`, plus `static visibility = {…}`) |
| `accepts.ts` | `static events = {…}`: which outside facts this class takes, and from whom |
| `lifecycle.ts` | the hooks as a type (`onCall`, `onEnd`, `onMemory`, `onEvent`) and `runHook`, which authors their writes |

### `src/views/` — JSX that renders to text

| file | what it is |
|---|---|
| `jsx-runtime.ts` | the element factory and the renderer: a tree of tags becomes TEXT, never DOM. `renderToText`, `renderInline`, `blocks`, `Fragment`, the `JSX` namespace |
| `jsx-dev-runtime.ts` | the same factory under the name a dev-mode transform imports |
| `components.ts` | the tags a view is written in: `Rule`, `Rules`, `Protocols`, `Section`, `Example`, `p`, and `tagged` |
| `layout.ts` | the prompt as named blocks in two regions: `PROMPT_BLOCKS` (the four, in send order) and `layout` → `Blocks` |
| `lang.ts` | the framework's own words — the standing rules and the protocols, `es` and `en`, chosen by the class's `language` |
| `render.ts` | `promptOf()`, `headerFor()`, `showPrompt()` (what `--show-prompt` prints) |

### `src/call/` — the live call as a value

| file | what it is |
|---|---|
| `call.ts` | `CallWorld`: the line, the room, the history, `say`/`reply` (which settle on the turn they land as), `send`, `participant()`, `invite`, `search()` — the gateway's search of the bases the world attached, answered as `Found[]`; a call nobody serves through a gateway refuses it with `NO_GATEWAY_TO_SEARCH` — and `take()`, one entry folded in |
| `room.ts` | `Room` and `Participant` reduced from the room's own entries; `ParticipantHandle.mute()/remove()`; `invite` |
| `history.ts` | `History` and `Turn`: the finished turns, and the sentence a `collapse()` left in their place |

### `src/client/` — `pinecall/client`, the socket and nothing above it

| file | what it is |
|---|---|
| `client.ts` | `Pinecall`: one socket, the agents on it, `observe`/`history` over any log the key can read, and `search(call, query, k)` — one search of the bases the agent reads, run by the gateway for a call this client serves (`POST /v1/calls/{call}/lookup`), answered as `Found[]`. `env: "production"` names production for a person's key; a server's token needs none |
| `signed.ts` | what every request and socket carries: the key as a Bearer, and `pinecall-env` when a world was named; the `World` type |
| `connection.ts` | the WS to the gateway: the key at the door, backoff on the way back, a ping while it is up |
| `agent.ts` | one agent from the app's side: `open()` (register + configure), the tool calls it answers, the two commands it awaits |
| `calls.ts` | `Call` (everything read off the log; every method one command) and `CallBook` |
| `frames.ts` | one command frame, checked against the schema its type names |
| `listeners.ts` | who is listening for what, per agent and per call; `camelEvent` |
| `observe.ts` | reading a log: the same URL as a JSON page and as SSE, folded by the protocol's reducer |
| `endpoints.ts` | one base URL, four doors — the apps socket, a call's log, an agent's log, a call's lookup — the only place a path is written |
| `testing/` | a gateway that is not there (`FakeGateway`, which also answers a search with what `finds()` was told and keeps what was `searched`), a log nobody stored, and the loopback address they use |

### `src/runtime/` — the bridge

| file | what it is |
|---|---|
| `connect.ts` | `mount()`: the class registered once, one live instance per call, and the sync that sends only what changed. `optionsFor` is the declaration read off a probe instance — the routes, the tools, the language, whether it searches, the state fields, the events — and the first thing it does is refuse a field of the world's. Also `slugOf` |
| `recall.ts` | a `memory.ops` entry → the words this call has been told about the caller, which is what `remembers()` answers from |
| `channels.ts` | `phone` / `whatsapp` / `web` fields → the routes the agent registers |
| `environment.ts` | `THE_WORLDS`: the fields a class may no longer declare — `voice`, `llm`, `stt`, `greeting`, `hangup`, `says`, `hears`, `memory`, `knowledge`, `docs` — each with the verb that sets it in the world, and `refuseTheEnvironment`, which stops a class still carrying one at load, naming that verb |
| `dispatch.ts` | an outside fact off the wire, gated by the declaration and handed to `onEvent` — one at a time, in order |
| `run-tool.ts` | one tool call: the args checked against the spec, the method run through the instance, the result cut to its `preview` |

### `src/cli/` — `pinecall <verb>`, and the page `serve` and the gateway both serve

| file | what it is |
|---|---|
| `index.ts` | the dispatcher: one lazy import per group, and the whole CLI on one screen |
| `groups.ts` | the `Group` contract, and `PLANNED` — every verb the design declares that this tree has not written |
| `env.ts` · `dotenv.ts` | where the CLI is pointed and what opens the door, for every verb: `PINECALL_KEY` and `PINECALL_URL` from the environment, else from the nearest `.env` up from the cwd — read, and written by `link`, as plain dotenv lines — and the `NO_KEY` refusal |
| `linking.ts` | `pinecall link`: this project's folder tied to one of the person's orgs — signs the machine in if it is not, picks the org (`GET /v1/login/orgs`), mints the person's key there (`POST /v1/login/org`) and writes it into `./.env` |
| `signed-in.ts` | `~/.pinecall/session.json` (0600, `PINECALL_HOME` moves it): the machine's sign-in per gateway, which only `link` mints from, and the phone `pinecall line from` kept |
| `world.ts` | which of the two worlds a verb works in: `--prod`, taken out of argv before any group sees it, names production for that one command; nothing named is the sandbox |
| `client-for.ts` | the SDK client a verb holds: the door's gateway, its key, and the world the command named |
| `connected.ts` | the one line `start` prints when the socket is up: who registered, whose org took it, which world, and where the key came from |
| `load.ts` | a tenant's class loaded with tsx and handed its own source: the file named, else the one `agents/<name>/agent.tsx` (or `.ts`) of the project this terminal stands in — a project of several is told to name one with `--agent`. `instanceFor` is one instance with a line to answer on, for the pages that print a prompt |
| `home.ts` | **the one layout**, and an agent's *home* in it: `agents/<name>/agent.ts` (with whatever only that class uses beside it), `lib/` for what agents share, `docs/<name>/` for the documents the agent searches, `test/<name>/agent.test.ts`, `test/<name>/goldens/` (the conversations, and beside them `docs.json` and `memory.json`, the retrieval and recall goldens), `test/<name>/memory/`. No verb computes a path of its own; `--agent` resolves here. What the agent knows by heart is in no folder: it is a setting |
| `serve.ts` · `serve/` | `pinecall serve`, the sandbox's console on this machine. `serve/server.ts` is `LocalConsole`: the built page and `/v1/*` forwarded to the gateway with the project's key, on the loopback, refusing a foreign `Host` or `Origin`, marking the page `local`. `serve/sidecar.ts` is one per machine: open it, or find the one already up for this gateway and org (`/.pinecall/serve`). **The only code under `cli/` that binds a port** (`test/cli/verbs.test.ts` pins it) |
| `start-console.ts` · `start-screens.ts` | the `console` line `start` prints — the sidecar's URL or the verb that opens one in the sandbox, the gateway's link with a one-use code in production — and the three ways `start` shows a log: plain, `--ui`, `--events` |
| `start.ts` · `chat.ts` · `prompt.ts` | the app, the app in this terminal — or a written call at an agent somebody else is holding, named by slug — and the prompt offline |
| `test.ts` · `simulate.ts` · `eval.ts` · `runs/` | ring 1, a live persona, ring 3, and what the gateway has run |
| `agent.ts` · `agent-lines.ts` · `agent-versions.ts` · `agent-files.ts` · `agent-knowledge.ts` · `agent-processes.ts` | **the settings**: what the org set over the class — yours, the team's, production's — on one page (`agent-lines.ts`, a row per field, `knowledge` as a count of characters and `bases` by name); the whole set written with the version it was read at, or fields cleared; the versions — history, diff, rollback — and a corner as a file for CI; `agent knowledge` prints what the agent knows by heart and `agent knowledge edit` opens it in `$EDITOR` and keeps what was written as the next version; `agent list` and `agent stop` are the processes holding the org's agents. `--prod` writes production's corner directly, while the person's org lets them act there: history and rollback are the safety, and the goldens run in CI before a deploy. `pipeline.ts` only reads now |
| `lexicon.ts` · `memory-policy.ts` | the org's words, whole and versioned per corner — production's with `--prod` · the memory field of the settings on its own |
| `docs.ts` · `docs-attach.ts` · `memory.ts` · `remember.ts` | **the documents the agent searches** — `docs/<name>/` pushed whole under a name, listed, dropped — and `attach`/`detach`/`attached`: which bases an agent reads, which is one field of its settings (`bases`) written as the next version · one contact's facts, the right to be forgotten, and `memory policy` · the extraction goldens. `docs eval` and `memory eval` each hold a golden: `recall@k` and `nDCG@10`, computed in the gateway by code with no model, exit 1 on a miss |
| `numbers.ts` | which number reaches which agent: the org's doors listed, one imported off its carrier, one MOVED between the worlds — an org buys one number, so that move is what makes a staging run cost nothing — one let go |
| `providers.ts` | the provider keys this org brought of its own: one added from stdin, one taken back, the vendors read by name — never a value |
| `personas.ts` · `machine.ts` · `view.ts` | the agent's synthetic callers — listed, written, renamed, dropped and tried against the class here, all of them kept by the gateway beside the agent's settings (`push` is the one-time migration for a project that still has the files) — the state machine on one page, the terminal view as a pure function |
| `login.ts` · `browser.ts` · `whoami.ts` · `secret.ts` | the browser dance that signs this machine in (a word asked for, a link opened, the key collected once — kept for `link` to mint from, never run on), how a URL is put in front of a person, which key a verb would use and whether it acts in production, and the one place a terminal is read |
| `testing/` | what those verbs need: the gateway's eval doors, goldens off disk, latency, the matrix, the model a short name means, for `test --model` and for `agent set --llm` alike (`models.ts`), the progress screen, the score, the seeding check — which golden's state a starting call opens in — the voice door, the callers as the gateway keeps them (`personas.ts`) and the files a project pushed them from, read once (`caller.ts`) |
| `ui/` | what `pinecall start` answers a console with, by the wire's verb (`doors.ts`, one module per verb family: a chat, a simulation, a suite, the docs and memory goldens, a promotion, drift, a reproduction) — and beside those node modules the two directories that are the BROWSER: `ui/shared/` and `ui/console/`, never imported by anything here: the gateway serves the page, and `serve/` serves the same build |

Beside `src/`:

| | |
|---|---|
| `examples/clinica-norte` | one tenant, written the way a customer writes one, on the one layout |
| `test/` | mirrors `src/`, plus the three that pin the shape: the tree, the imports, the two public surfaces |
| `bin/pinecall.js` | the bin of a checkout: the CLI from source through tsx. npm installs `dist/cli/index.js` instead |
| `scripts/build`, `scripts/check` | what is published, and what CI runs |
| `docs/` | how to build an agent · `docs/decisions/` is the maintainer's notebook and **git-ignored** |

## 3. The entities

### The class, at runtime

| entity | where | fields |
|---|---|---|
| `Agent` | `agent/agent.ts` | the tenant's own fields, plus `doc()`, `tools()`, `visibleTools()`, `render()`, `remembers()`, `collapse()`, `restore()`, `startIn()`, `last()`, `log()`, `call`, `say()`, `reply()`, `on()`, and the four hooks |
| `Internals` | `agent/agent.ts` | `changes`, `log`, `listeners`, `logListeners`, `eventListeners`, `seq`, `sealed`, `target`, `call`, `last`, `recalled` — kept in a `WeakMap`, never on the instance, so they are not state |
| `Change` | `agent/agent.ts` | `seq`, `field`, `prev`, `next`, `author`, `at` |
| `LogEntry` | `agent/agent.ts` | `seq`, `name`, `data?`, `at` — what `this.log(name, data)` writes |
| `Snapshot<T>` | `agent/state.ts` | the state as a plain object: own enumerable fields **and getters**, minus the config names, minus methods |
| `FieldDiff` | `agent/state.ts` | `field`, `prev`, `next` |
| `Collapsed` | `agent/state.ts` | `summary`, `seq`, `at` — one sentence standing in for every change before it |

### What a class declares

| entity | where | fields |
|---|---|---|
| `ToolOptions<T>` | `agent/tools.ts` | `when(state)`, `stage`, `confirm`, `preview`, `pii`, `timeout`, `params` |
| `ToolDeclaration` | `agent/tools.ts` | `name`, `options`, `method`, `owner`, `spec` |
| `ToolSpec` | `@pinecall/protocol` | `name`, `description`, `parameters`, `side_effect`, `confirm?`, `pii?`, `timeout_s?` — the wire's own shape, imported, never copied |
| `StateFieldSpec` | `agent/visibility.ts` | `name`, `visibility` (`public` · `tenant` · `pii`) |
| `EventSpec` / `EventDecl` | `agent/accepts.ts` | `name`, `from: ("app"|"participant")[]` |
| `EventMeta` | `agent/accepts.ts` | `source`, `identity?`, `seq` — `seq` numbered by **this call's** stream of events, not by the wire |
| `Call` (hook) | `agent/lifecycle.ts` | `id`, `contact`, `from?`, `channel?` |
| `MemoryOp` | `agent/lifecycle.ts` | `op: "remember"|"forget"`, `key`, `value?` |

### The call

| entity | where | fields |
|---|---|---|
| `CallWorld` | `call/call.ts` | `id`, `contact`, `from?`, `channel?`, `room`, `history`, `cause`, `numbered()`, `search()` |
| `Found` | `call/call.ts` | one chunk a search found, as the model reads it: where it came from, and its text |
| `Knowledge` | `agent/knowledge.ts` | `search(query, {k?})` — what `this.knowledge` is |
| `Room` | `call/room.ts` | `participants`, `caller`, `has(kind)`, `get(identity)`, `invite()` |
| `Participant` | `call/room.ts` | `identity`, `kind` (`caller` · `agent` · `supervisor` · `listener` · `sip`), `name?`, `joinedAt`, `speaking` |
| `History` / `Turn` | `call/history.ts` | `turns`, `length`, `summary`, `last` / `who`, `text`, `speechId`, `interrupted`, `at` |

### The prompt

| entity | where | fields |
|---|---|---|
| `Blocks` / `Block` | `views/layout.ts` | `blocks` in send order, each `name`, `region` (`static` · `dynamic`), `text`; `history` |
| `PROMPT_BLOCKS` | `views/layout.ts` | the four, in the one order they are sent: `identity` · `knowledge` · `tools` static, then `view` dynamic |
| `THE_WORLDS` | `runtime/environment.ts` | the fields a class may no longer declare, each with the verb that sets it in the world |
| `Child` | `views/jsx-runtime.ts` | what a `render()` hands back: an element, a string, a number, nothing, or an array of those |
| `Prompt<T>` | `agent/decorators.ts` | `(agent: T) => Child` — a prompt written beside the class, which `@render` hands the instance |

### The socket

| entity | where | fields |
|---|---|---|
| `Pinecall` | `client/client.ts` | `sdk`, `host`, `url`, `apiKey`, `env`, `agent()`, `connect()`, `close()`, `connected`, `on`/`onAny`/`onErrors`/`onStopped`, `observe`, `history` |
| `Agent` (client) | `client/agent.ts` | `slug`, `calls`, `config`, `app`, `open()`, `configure()`, `declare(tools)`, `command()`, `take(entry)`, `ping()` |
| `Call` (client) | `client/calls.ts` | `id`, `status`, `channel`, `from`, `to`, `contact`, `state`, `today`, and one method per command |
| `CallBook` | `client/calls.ts` | `live`, `of(id, at)`, `forget(call)` |

## 4. The class a tenant writes

Two kinds of field live on the instance, and the difference is the whole model.

**Config** — the names in `CONFIG_FIELDS` (`agent/agent.ts`): `phone`, `whatsapp`, `web` and
`language`. They configure the agent; they are not state. They are never diffed, never rendered by
a view, never in a snapshot, and assigning one does not go through the change recorder.

| field | becomes |
|---|---|
| `phone`, `whatsapp`, `web` | the routes in `agent.register` (`runtime/channels.ts`); truthy means "this agent answers there" |
| `language` | which of `views/lang.ts`'s two word-sets the `identity` block carries |

**The class is code; the world is environment.** Everything else an agent runs on is not the
class's to say: it varies between the sandbox and production, it is the org's to change without a
deploy, and it is kept **per world, per corner, versioned** in the agent's settings on the gateway
(the runtime's `docs/protocol/settings-api.md`). A class that still carries one of these fields is
refused at load, before a prompt is printed or a gateway is knocked at, with the verb that sets it
(`runtime/environment.ts`):

| field | is now | set by |
|---|---|---|
| `voice`, `llm`, `stt` | the settings' vendors and models | `pinecall agent set --voice · --llm · --stt`, or the Settings tab |
| `greeting`, `hangup` | how the call opens and whether the model may end it | `pinecall agent set --greeting · --reply · --hangup` |
| `says`, `hears` | the org's lexicon, shared by every agent of the org | `pinecall lexicon add <word> --say`, `pinecall lexicon hear` |
| `memory` | what is remembered about a caller and what never is | `pinecall memory policy --remember · --forget` |
| `knowledge` | **what the agent knows by heart**: Markdown, read whole into the `knowledge` block on every call | `pinecall agent knowledge edit`, or the Settings tab's Knowledge — never a file in the repository |
| `docs` | **the bases the agent searches** — the RAG — as the settings' `bases`, each with `k`, a mode and a score | `pinecall docs push` from `docs/<name>/`, then `pinecall docs attach <base>`, or the Settings tab's Bases |

Knowledge and bases are two things and never one: what the agent knows by heart is a page the
org writes and the model reads entire; a base is a folder of documents chunked and embedded, of
which a turn sees the `k` best. The class reaches the bases through `this.knowledge.search()`
(`agent/knowledge.ts`): the gateway runs the search for the call in hand and logs what it found,
and a world that attaches no base to a class that searches refuses the registration at boot,
naming `pinecall docs` — not on a call, where the search would find nothing.

**State** — everything else the app puts on the instance, plus its getters. The rules, enforced in
code:

- **Tools are the only writers.** The constructor returns a `Proxy`; a write after `seal()` with no
  author throws `UnauthoredWrite`. An author is set by `@tool` (the tool's own name), by `runHook`
  (`hook:onCall`), by `dispatch` (`event:<name>`) or by `restore`.
- **The author rides `AsyncLocalStorage`,** never a module-level stack: one process serves many
  calls at once, and two tools awaiting at the same time must not read each other's name.
- **A getter is state.** `get identified() { return !!this.patient }` is exactly what a `when` asks
  about, so `snapshot()` walks the prototype chain — stopping at `Agent`, so the framework's own
  accessors never leak into the tenant's state.
- **`this.call` is a getter on the base class,** not a field: it never looks like state and never
  reaches a snapshot. A `render()` may read it — `this.call.channel` is how one class answers a
  phone call and a chat differently — and it throws outside a call, so the pages that print a
  prompt give their instance a line of its own (`cli/load.ts:instanceFor`).
- **`render()` and `remembers()` are methods of the base,** so neither is state either. `render()`
  returns nothing by default; `remembers(text)` answers from what the runtime has recalled about
  this caller in this call, and false before anything has.
- **`@state` decides which fields are state at all.** A class that decorates none has every own
  field as state, as it always did. A class that decorates any means *these, and nothing else*: an
  undecorated field on it is the tenant's scratch space — no snapshot, no change, no author asked
  for, nothing on the wire. `declaredStateOf(ctor)` is that answer, read once per class, and the
  Proxy, `snapshot()` and `restore()` all ask it. A getter is derived and is always state.

## 5. From a method to a tool the model may call

```
@tool({ stage: "book", confirm: "…" })   →  register(prototype, {name, options, method})
  async book(chosen: string)                 lowerStage() turns `stage` into a `when(state)`
  /** docstring */                           the wrapper authors every write inside the method
                                          ↓
                        docstrings.ts (oxc) reads the class's own SOURCE:
                          the JSDoc above the method  → spec.description
                          the parameter list + types  → spec.parameters (JSON Schema)
                                          ↓
                        specFor() → ToolSpec, cached per prototype until the source changes
                                          ↓
                        mount(): every spec + its `run` → agent.register
                        sync():  the VISIBLE subset → tools.set, on every state change
```

What the declaration refuses, before a model ever sees it (`DeclarationRefused`):

- a tool with **no docstring** — without one no model can choose it;
- a tool name that is not one word a model can call (`/^[A-Za-z][A-Za-z0-9_]*$/`);
- `pii: […]` naming a parameter the tool does not have;
- `stage:` on a class that declares no `stage` field (the compiler says so first, via `StageOf<T>`).

`confirm` is what makes a tool `side_effect: "irreversible"` on the wire: the platform reads the
sentence back, hears the yes, and only then runs. `preview: n` cuts what the **model** sees of an
array result; the state field keeps every row.

## 6. The prompt: named blocks in two regions, in one order, always

`promptOf(agent)` → `Blocks`: every block in send order, each with its name, its region and its
text. Nothing may reorder them; the cut between the regions is where the cache is.

| block | region | what is in it | when it changes |
|---|---|---|---|
| `identity` | static | the class docstring · `<rules>` and `<protocols>` from `views/lang.ts` | never during a call — it is the cached prefix |
| `knowledge` | static | nothing from the app: the runtime writes what the world says the agent knows by heart — the settings' `knowledge`, whole | never |
| `tools` | static | every tool's name and docstring, visible or not | never |
| — | the history | the runtime's turns and what a lookup answered; on the printed page, the summaries a `collapse()` left. Never sent by the app | when the app collapses |
| `view` | dynamic, LAST | what the class's `render()` said about this turn, and nothing else | on every state change |

The layout is the framework's, always: `PROMPT_BLOCKS` is the four in order, it travels once in
`agent.configure`, and every block is written by name with `prompt.set`. A class contributes one of
them — the view — as a `render()` method, or as `@render(ThePrompt)` with the prompt written beside
the class; the decorator is exactly `render() { return ThePrompt(this); }` and a class that
declares both spellings is refused when it is defined. Either way there is no view file to resolve,
no props to pass and no way for a tenant to declare a block of its own.

**Nothing this package writes is a hole for somebody else to fill.** There are no markers: what
memory recalled and what the knowledge base returned reach the model as `tool_result` blocks,
JSON-encoded, in the history where a lookup belongs — never spliced into the tenant's own words,
which carry operator authority. That rule, the vendor guidance it follows from and the tests that
hold it are a public contract, `runtime/docs/security/prompt-injection.md`. What a class reads back
is one question, `this.remembers(word)`, answered from the `memory.ops` entries this call has
already seen (`runtime/recall.ts`) — a fact of the call's state, never the fact's text — and one
verb, `this.knowledge.search(query)`, whose answer is a tool's result too.

`pinecall prompt` and `pinecall start --show-prompt` print exactly these blocks, each under
`── <name> (<region>) ──` with `── history ──` between the two regions, and the stage and the
visible tools beneath. Neither needs a gateway, a key or a network.

## 7. The call, and the six things a class may do to it

Everything on `this.call` was reduced from entries the client already receives; every verb is one
command on the wire. There is no LiveKit here and no escape hatch to it — a need the room cannot
express is a new command with a name.

| the class writes | the command | it lands as |
|---|---|---|
| `this.say(text)` / `call.say` | `agent.say` | `turn.agent` — the promise settles on it, or `false` after 30 s |
| `this.reply(instructions)` | `agent.reply` | `turn.agent` |
| `call.send(topic, data, {to})` | `room.send` | a payload in a browser; the log keeps its size, never the payload |
| `call.participant(id).mute()` / `.remove()` | `participant.mute` / `participant.remove` | removing the caller ends the call |
| `call.invite(to, {kind})` | `room.invite` | a second SIP leg, or a seat |
| `this.log(name, data)` | `call.log` | a `custom` entry with a `seq` like anything else |

And what the call learns, in `CallWorld.take()`: `participant.joined|left|speaking` fold into the
room; `turn.user` and `turn.agent` fold into the history, and `turn.agent` settles whoever was
waiting on a `say`.

## 8. The bridge, step by step

`mount(Class, { pc, source, file, slug, last, opening, takesUnclaimed })` is the only place
the class and the socket know about each other.

1. **At mount** — `describe(ctor, source, file)` gives the class its own text back (a docstring sits
   *above* the class, where `toString()` cannot see it, and parameter types are gone after
   compilation; the file name is what says whether that text is `.ts` or `.tsx`). One **probe** instance is built, refused if it still carries a field of the world's
   (`runtime/environment.ts`), read for its doors, its language, its tools, its state fields and its
   events, and thrown away; the source is read once more for `this.knowledge`, so the declaration
   says whether the class searches (`uses_knowledge`).
   `pc.agent(slug, options)` declares it. Nothing is sent until `pc.connect()`.
2. **`call.started`** → `start()`: a fresh instance, `seal`ed; `setLast` and `setCall` hand it the
   store and its `CallWorld`; `runHook(onCall)`; then `opening?.(call)` applies the state a golden
   or `--state` asked for — after `onCall` so it is not overwritten, before the first render so the
   model never reads a state the call was not in.
3. **The opening send** — `call.setState(snapshot)`, then `sync()`. Only after that does the bridge
   start listening, so `onCall` writing five fields is one prompt and not five.
4. **On every change** — `state.set` with the field that moved; when the write came from an event,
   one `state.cause` line naming it; then `sync()`.
5. **`sync()`** renders and compares each block against what **this call** was last sent under
   that name: one `prompt.set <name>` per block whose text differs (a block never sent counts as
   empty, so an empty block is never sent), then `tools.set` only if the visible list differs.
   Re-sending identical text is a cache miss for nothing.
6. **A tool call** — the SDK routes it to the instance serving that call; unknown call, unknown
   tool and a failed tool all come back as one `tool.result` carrying `error`, because a turn that
   never gets one waits forever.
7. **An outside fact** — `dispatch.ts` checks the **pair** (name, source) against `static events`.
   An event declared `from: ["app"]` that arrives from a browser is somebody else's event with our
   name on it, and the hook never sees it (one warning per call and name, not one per second).
   Events run **one at a time, in wire order**, so `call.cause` names the event actually running.
8. **`call.ended`** → the listeners are dropped, `onEnd` runs, `this.call` is cleared.

## 9. `pinecall/client` — the socket alone

A second, smaller door for an app that has its own way of deciding what to answer: no `Agent`
class, no view, no CLI. It knows two things — `@pinecall/protocol` and `ws`.

- **Registration is memory, not a database.** `open()` runs again on every reconnect. Many sockets
  may hold one agent at once; a call that named no app goes to the **newest** registration that
  takes unclaimed calls, and a call keeps the socket it opened on for its whole life. That is what
  makes a rolling deploy work and what makes `pinecall chat` a console: it registers with
  `takesUnclaimed: false` and its caller socket names `?app=<its own id>`.
- **A stop is the one close that is not retried.** Every other close is a blip and is redialled
  with jittered backoff for ever. An `error` coded `stopped` for no agent — a member of the org
  pressed Stop (`POST /v1/apps/{app}/stop`) — closes the connection for good and is handed to
  `onStopped`; `pinecall start` prints it and exits. `agent.register` names the machine (`host`),
  so the gateway's list of processes (`GET /v1/apps`) says where each one runs.
- **Two commands are awaited** (`agent.register` → `agent.registered`, `agent.configure` →
  `agent.configured`), each answered by the event it lands as or by an `error` naming its id.
  Everything else is fire-and-read-the-log.
- **The log is read, never invented.** `observe()` and `history()` fold entries with the protocol's
  own reducer, so the same golden log reduces to the same state here and in Python.
- **It reads nothing from the environment.** `new Pinecall({ url, apiKey, env? })` is given all
  three; `env: "production"` names production for a person's key (`pinecall-env`, `signed.ts`),
  and a server's token needs none. With `mount` from `pinecall`, that is how an app runs the agent
  inside its own server instead of under `pinecall start` (`docs/production.md`).
- `client/testing/` is the same surface with no network: a `FakeGateway` an app's own tests mount
  against, and a log nobody stored.

## 10. The CLI

`pinecall <group> [args]`. One module per group, imported only when it is asked for — `pinecall
prompt` must not pay for a websocket client.

| verb | what it is | needs a gateway |
|---|---|---|
| `link` | this project's folder tied to one of the person's orgs: their key for it, written to `./.env` | yes |
| `start` | the app registered and answering: **the process you deploy**. Binds no port, serves no page. `--prod` for production | yes |
| `serve` | the sandbox's console on `http://localhost:4100` for the life of the command: a sidecar that signs what the page asks with the project's key. `start --serve` is both in one terminal | yes |
| `line` | which phone is yours — it reaches your sandbox copy on the production number too — and whose terminal anybody else's call rings in; `claim` takes it | yes |
| `chat` | the same app in this terminal's own process, and a written caller against it | yes |
| `prompt` | the exact prompt a state would produce | **no** |
| `test` | ring 1: the goldens, through the app in this process, scored by the runtime | yes |
| `simulate` | a model plays one persona, live; `--judge` prints the `call.score` | yes |
| `eval` | ring 3: one real call re-evaluated by the runtime's code checks | yes |
| `runs` | `list · show · diff · promote · drift` — what this gateway ran, and what moved | yes |
| `personas` | `list · show · add · edit · rm · try · push` the agent's synthetic callers, kept by the gateway | yes |
| `agent` | the settings, three corners side by side · `set` · `clear` · `knowledge [edit]` — what the agent knows by heart, printed or opened in `$EDITOR` · `history` · `diff` · `rollback` · `pull` · `push` · `list` · `stop` | yes |
| `lexicon` | the org's words — said and heard — versioned per corner | yes |
| `docs` | `push [dir] [--base <name>]` · `list` · `drop <base>`: the folder of `*.md` under `docs/<name>/` sent whole to `PUT /v1/knowledge/{base}` · `eval`: `test/<name>/goldens/docs.json` asked of the base · `attach <base> [--k n] [--mode …] [--min-score x]` · `detach` · `attached`: which bases the agent reads, one field of its settings | yes |
| `memory` | `<contact>` · `forget <contact>`: one contact's facts, current first, and the right to be forgotten · `policy`: what is remembered and what never is · `eval [--k n]`: every question of `test/<name>/goldens/memory.json` asked of `recall`, each bringing its own facts, and the two figures a golden answers | yes |
| `remember` | the extraction goldens in `test/<name>/memory/`: one written call each, one model call each, judged by code | yes |
| `login` | a link printed and opened; the page signs this machine in and mints it a key of its own, proved at the gateway and kept in `~/.pinecall/session.json` (0600) for `link` to mint from — no verb runs on it | yes |
| `whoami` | which gateway, which org, whether the key acts in production, and **where it came from** | yes |

`groups.ts` also declares every verb the design names and this tree has not written — `new`, `g`,
`observe`, `costs`, `call`, `tokens`, `deploy`. Typing one prints what it *will* be and exits 0. A verb leaves that table in the commit
that writes it.

**Where the key comes from** (`cli/env.ts`, the one place that decides it, for every verb):
`PINECALL_KEY` and `PINECALL_URL` from the process's environment — a server's secrets, a CI job's —
else from the nearest `.env` walking up from the cwd (`cli/dotenv.ts`), which `pinecall link`
wrote. The gateway is `https://box.pinecall.io` unless one of the two names another. A project
folder is the org it was linked to; a second org is a second folder, and nothing is switched. With
no key the verb stops on `NO_KEY`, naming `pinecall link`. Every verb that connects opens with
`doorLine`: `gateway <url> · key from <the environment | the .env's path>`, and `· production
(--prod)` when the command named it.

**Which world** is the command's, not the key's: a person holds one key, and `--prod` anywhere on
the line (`cli/world.ts`, taken out of argv before the group parses it) puts `pinecall-env:
production` on every request and socket (`client/signed.ts`). The gateway lets it through only
while the person's `production` switch is on — an admin's always is — and otherwise answers `403`
in a sentence. Nothing named is the sandbox. A server's token was made for one world and needs no
flag.

It was four files, three variables and then a file of profiles, and each time the one that won was
the one you had not chosen: v1's `PINECALL_API_KEY` beat what `pinecall login` had just kept, and a
profile switched in one terminal moved every other. `PINECALL_API_KEY` is never read. The only
file under `~/.pinecall/` is `session.json` (0700 directory, 0600 file): the machine's sign-in,
which `link` mints from and no verb runs on.

## 11. The two pages

Two browser programs live under `src/cli/ui/`, each with its own bundle, its own router and its own
credential. The gateway serves both; the console is also served by `pinecall serve`, the one place
this CLI opens a port:

| | mounted at | the credential it holds | who |
|---|---|---|---|
| `ui/console/` | the gateway's `/` — **hosted**, production | a PERSON's scoped key, minted at login | whoever runs the org |
| `ui/console/` | `http://localhost:4100` — **local**, the sandbox | none: the sidecar signs what the page asks | whoever writes the agent |
| `ui/shared/` | — | the fetch (`api.ts`) and the credentials context, which the page is built on; `/.well-known/pinecall` (`the-floor.ts`), read by the console's password card; and the theme (`theme.ts`: the system's light or dark, and a flip kept until the system changes) | the console |

They are two programs and not two sections of one, because the ops key **belongs to no org** and
must never reach a tab that holds a tenant's: two bundles, two storage names, and an import table
that lets neither page name the other (`test/the-imports.test.ts`). `ui/shared/` names neither, so
nothing reaches one page through the other.

### The console

**One bundle, two consoles.** The sidecar marks the page it serves (`<meta name="pinecall-console"
content="local">`); a page nobody marked is the gateway's. `lib/mode.ts` reads that once and holds
the tables of screens — the org's (`ORG_SCREENS`), the box's (`BOX_SCREENS`, each row an operator's) and an agent's tabs
(`AGENT_SCREENS`), each row a path, a name, a sidebar group, an icon and the modes that have it: the sidebar draws them and the router routes them,
so a screen a console does not have is neither linked nor reachable, and no screen asks which mode
it is in to decide whether it exists (`test/cli/ui/console/each-console-has-its-own-screens.test.ts`).
Both open on Home (`/`) and have Overview (`/overview`), Live and Sessions, then Personas and
Simulations — the agent's synthetic callers, and the one place a call is simulated from — and
Evals, Memory and Docs, every base of the world and who searches it. Hosted looks at production and runs the org — Usage, Numbers, Tokens, Providers, Team — and edits production's Settings and Lexicon directly. Local looks at
the reader's corner of the sandbox and is the workshop — Dev chat, Evals ▸ runs, Phone testing — with no
login, no sign out and no key in the page: `headersFor` sends no `authorization` when the key is
empty, and a refused sidecar key shows one card — *this project is not linked* — naming `pinecall link`, then `pinecall serve`. An admin opens a
colleague's copy from local only (`pinecall-corner`, forwarded by the sidecar as the page set it).

What follows is the hosted page, where a key IS held. Everything about it is a containment decision:

- **The org key never reaches the browser.** The page holds a PERSON's scoped key, minted for it
  at login and kept by the browser (`lib/session-key.ts`, the one file that touches storage) —
  ONE key, not one per world: the page names production on every request (`pinecall-env`,
  `shared/api.ts:headersFor`), and a person whose production switch is off is shown *No
  production access* (`screens/login/no-production.tsx`) with the gateway's sentence. Signing out
  (`shell/top.tsx`, `lib/leaving.tsx`) forgets the key. A production `pinecall start` mints a one-use code standing for its key and prints
  `/a/<agent>?login=<code>`; the page spends it for a key of its own and takes it out of the
  address bar before rendering (`main.tsx`, `lib/login.ts`). Cold, it asks for email and password, offers the workspaces those open once the password is typed
  (`POST /v1/login/orgs`, which mints nothing; a free-text org on a gateway without the door), says who hands out a forgotten password's link (an admin, from Team), and signs in to production (`screens/login/`, every card in `way-in.tsx`'s frame). Opened from an invitation or a reset link — `/invitations/<token>`, the one an
  admin's Team screen or the operator's `orgs invite` hands out — it shows the card where the
  person chooses their password and takes their first key (`screens/login/accept.tsx`), and the
  token leaves the address the moment it is spent. At `/cli?c=<code>` it is the card that signs a
  TERMINAL in (`screens/terminal/`): `pinecall login` holds no key and the person at it has none
  to paste, so the terminal prints that link and this page — which does hold a key — approves it.
  What the approval mints is the terminal's own key, and it never travels through this page. **It signs a person IN and never makes an org**: this page ships
  inside the runtime every self-hoster serves, so a registration form in it would be one flag away
  from open registration on somebody else's box, and making an org is not what a control plane for
  an existing org is for. `POST /v1/signup` is knocked at by an API caller alone — the CLI has no
  `signup` verb since 0.4.0 — and never by this page —
  `test/cli/ui/console/the-console-never-makes-an-org.test.ts` pins that by reading the sources
  with the comments stripped. It is also why the runtime sends no CORS header: the one door this
  page opens with no key is `/v1/login`, on its own origin. `test/cli/ui/pages/the-key-is-never-in-the-page.test.ts` pins it:
  one file PER PAGE reaches a browser's storage, and only `shared/api.ts` writes the
  `authorization` header. The sidecar's own test (`test/cli/serve/the-sidecar.test.ts`) pins the
  other half: the page it serves carries no key, and the key is spent only on a request that came
  from this machine's own page.
- **Nothing rides a URL.** The log stream is `fetch` reading `text/event-stream` by hand
  (`lib/stream.ts`, `SseParser`), with the key on the header and `Last-Event-ID` sent by the
  reader on a reconnect; the recording is fetched with the header and played from an object URL.
- **What only the agent's directory can answer** — the class for a written call or a simulation,
  the goldens, the docs folder — the page asks the gateway, and the gateway asks the `pinecall
  start` standing there (`lib/dev.ts`; the runtime's `docs/protocol/dev-verbs.md`). The callers
  are not among them: they are the gateway's own, read and written over its doors.
- **The page may not import the framework** (§13). None of it would run in a browser, and a build
  that pulled a TypeScript parser into the bundle is a build nobody would notice.

| screen | what it reads |
|---|---|
| `home/` | `/`: today at a glance — the gateway's count (`GET /v1/insights`, `lib/insights.ts`) or, from a gateway without it, a fold of the floor's rows; the calls that need a look (the rows' `flags`, else end reasons and the first scores read); who is on the floor; the channels; and the setup steps, judging among them (`setup.tsx`, `GET/PUT /v1/org/judging`) |
| `agents/` | `/overview`: which agents this gateway holds, the numbers routed to each, today's calls and the share of judges that held, and the keys and vendors behind them — each read only by a key that opens it |
| `floor/` + `live/` | `/live[/:call]`: the org's calls down the left (`floor/live.tsx`), one watched (`live/live.tsx`): the log's rows — a `memory.ops` and a `docs.sources` each one row — the `STATE · ROOM · PROMPT · METRICS` pane, and the supervisor's desk (`live/desk.tsx`: listen, whisper, say, take the line, transfer, end). `/sessions` is `floor/sessions.tsx` over the same `sessions/list.tsx` an agent's draws |
| `calls/` | an agent's calls as an inbox: threads grouped by contact in the browser (`threads.ts`), their messages read from each call's log (`use-thread.ts`), and what the gateway keeps per contact — names, unread, a message into a WhatsApp thread — behind a probe (`inbox-door.ts`). `dial.tsx` is *Call back* and *Call a number*, drawn once the org's outbound trunk is ready. Nothing here simulates: that is the Simulations screen |
| `personas/` · `simulations/` | `/personas[/:name]`: the agent's callers down the left and the one chosen read beside them, written and dropped over the gateway's own doors (`personas/door.ts`, `GET`·`PUT`·`DELETE /v1/agents/{slug}/personas[/{name}]`), never through the directory. `/simulations[/:call]`: the form (`simulations/simulate-form.tsx`) that puts one of them on the class the `pinecall start` in its directory holds (`simulate.start`), and the call heard live beside it |
| `sessions/` | every call, searched by the gateway when its door can (`search.ts`: a `total` in the answer) and in the browser when it cannot; one read whole — facts, the recording, transcript, latency, score with a judge attached later (`POST /v1/evals/judge/{call}`), cost, and folded under Details the consent join, the prompt block by block and every entry in `seq` |
| `talk/` · `chat/` | `talk/` is the agent's **Chat** tab (its path is still `talk`): one screen, two ways into the gateway's room — **Call**, this browser's microphone over WebRTC with the agent's voice back, or **Write**, a written session with no audio — and on a call the composer types into the same room (`use-room.ts` `open(mode)` and `write`). `chat/` is **Dev chat**, local only: a written call through the class in `pinecall start`'s directory. Both beside `talk/inspector.tsx`, the call's log as numbers, turns, tool calls and state |
| `evals/` | the goldens and how the latest run left each, every run this agent's suites scored and the diff between two, what each finished call was sealed with, and the drift |
| `pipeline/` | the three providers of a voice turn, the anatomy of a turn as bars, and the overrides an operator may change between two calls |
| `settings/` | the agent's settings as **one tab a section** (`form.tsx`: STT, LLM, Voice, Conversation, Memory, Knowledge, Bases — the tab in `?section=`), each choice picked from values that actually run; **Knowledge** is what the agent knows by heart, a Markdown textarea every key that opens the tab may write, a `words` key included, and **Bases** which it searches, a `pipeline` key. Saved over the version it was read at. Beside the form, a pane a person drags (`settings.now`): what is set now, a corner at a time (`now.tsx` — yours, the team's, production's in the sandbox; production alone on the gateway's page) and the history with a roll back (`history.tsx`) |
| `docs/` · `org-docs/` | an agent's Docs tab: the directory's folder pushed and its golden run through `pinecall start`, every base the org pushed in this world, and **Attached bases** — which this agent reads, off its settings (`attached.tsx`); and the org's Docs screen: every base, its chunks, its embedder, when it was pushed and which agents read it (`GET /v1/knowledge`, `GET /v1/knowledge/attached`), a base opened onto its files and **New base** (`new-base.tsx`) begun here from a name and its first documents — there is no empty base, so the form asks for both at once — with no project to push |
| `memory/` · `widget/` | every current fact an agent's calls taught, one dropped (`GET /v1/agents/{slug}/memory`, `DELETE /v1/memory/facts/{id}`), or one contact read and forgotten; the tag, the look the gateway keeps per agent and world (`GET/PUT /v1/agents/{slug}/widget`), and the widget itself mounted as a preview |
| `numbers/` · `tokens/` · `providers/` · `team/` · `usage/` | **numbers, whole**: the carrier — a Twilio account or a SIP peer — shown by kind and account and never a secret (`carrier.tsx`); the numbers, one let go; one added, imported or bought, **always the plan first** (`?dry_run=true`, the gateway's own steps in its words) and the same request again on confirm (`adding.tsx`); the outbound trunk set up the same way, with the operator's guards read-only (`outbound.tsx`); local's `phone.tsx` is Phone testing. Tokens (`/tokens`, open to every key): the person's own keys, and the org's server tokens — made for one world (production only by somebody with production access), shown once as `PINECALL_KEY=…`, listed with whose each is and when it was last used, revoked; the vendors and the keys the org brought; the people, invited or reset with a link shown once and changed in place, each person's Production switch (an admin's reads *always*; the invite form has one too), what each role opens (`roles.tsx`) and the org's single sign-on (`sso.tsx`); what the org consumed |
| `login/` · `terminal/` | the way in: sign in, choose a password, *this machine is not signed in*; and `/cli`, the card that signs a terminal in |
| the shell | `shell/shell.tsx` mounts `lib/org.tsx` — ONE read of the floor (`GET /v1/sessions`, `GET /v1/events`), the agents, the person's orgs and the day's insights, shared by every screen — around `sidebar.tsx` (the workspace and its org menu, the table's groups gated by the key's scopes off `GET /v1/whoami`, one row per slug — `lib/corners.ts`), `top.tsx` (where you are, the theme's sun or moon — `theme-button.tsx` — and sign out), `switcher.tsx` (the person, the org, the two environment chips that open the OTHER console, every copy and — for a `team` key in the sandbox — a colleague's opened, `lib/world.tsx`), `agent-head.tsx` (an agent's standing and its tabs) and `palette.tsx` (⌘K) |

**What it looks like** is the redesign, taken literally: `ui/tokens.css` is the one file of the
console allowed to hold a hex — the inks, the lines, the grounds, the accent `#5b3df5` and its steps,
the tints a pill wears, the shadows, the two faces. Every colour is a `light-dark(daylight, dark)` pair,
so the page follows the system through `color-scheme` before any script runs, and `shared/theme.ts`
stamps `data-theme` when a person flips it from the top bar; the flip is kept in the browser until the
system's own theme changes. The widget's blank page is a customer's site and stays daylight in both.
`ui/ui.css` is the vocabulary (the page, the card, the stat, the grid table, the controls, the
pill) and `ui/*.tsx` its parts — `Page`, `Card`, `Stat`, `TableHead`/`TableRow`, `Button`, `Field`,
`Segmented`, `Chips`, `Pill`, `Avatar`, `Icon` and the rest — imported as one from `ui/`; each
screen's own stylesheet holds only what is that screen's, under its own prefix. `lib/format.ts` is
how a duration, a sum of money, a moment and a phone number are written, UTC like the log.
`lib/sessions-wire.ts` reads a session list with what a newer gateway adds to it (`score`, `flags`,
`total`, `next`, all optional), because the published protocol's schemas are strict and predate
them; it goes when that protocol is published. The face is Inter, fetched from Google Fonts by
`index.html` with a system fallback — the one request the page makes to anything but the gateway —
and anything a machine wrote is the system's monospace. The icons are paths in `ui/icon.tsx`, so the
page depends on no icon set. The logo is `public/pinecall-logo.png` (`pinecall-logo-dark.png`, its wordmark drawn light, in the
dark theme), its mark `pinecall-mark.png` and the favicon cut from it. `ui/shared/styles/` and `frame.tsx` were the operator
page's and went with it.

Its own laws. Three are held by a test of their own: vite bundles every screen's stylesheet into
one file, so **a class name is global** whatever directory it was written in
(`one-stylesheet-one-class`); the desk sends **one** verb per gesture and one seat request
(`the-desk-sends-one-verb`); a supervisor's six entries each read back as **one sentence**
(`a-supervisor-reads-as-one-line`), and so do a lookup's two (`a-lookup-reads-as-one-line`, off
`lib/lookups.ts`, which both timelines print from). Two more are conventions the reader enforces:
`shared/api.ts` is the only place a request to the gateway is built, and `lib/metrics.ts` the only
file that names a metric — Sessions must print the same digits as `pinecall-runtime sessions show`.

### The box, from inside the console

There is no operator page. The box is operated from the console's **Box** group — Organizations
and their quotas, the keys of each, the people of each (**read only**: who works at a tenant is
the tenant's to decide, and a box that could edit a member could put itself in somebody's org),
Routes, the Fleet with its cordons, Box usage folded off the log, and Box settings. It is drawn
only for a person the box made an operator (`lib/operator.ts` asks `GET /v1/ops/whoami`), and it
is that person's own key that opens `/v1/ops/*` — the box's ops key is never typed into a
browser, and the second bundle that once asked for it is gone.

**Nothing about a PLAN is on it.** What an org is charged, what it is owed, what it signed up to:
none of that is the runtime's, and none of it is here. The screens read quotas — the mechanism —
and the package that charges is what turns a plan into a row (the runtime's `extensions/`).

## 12. LiveKit: where it is, and where it is not

The runtime is built on livekit-agents. **This package is not.** The word `livekit` appears in
exactly three files of `src/`, all of them inside the browser page:

| file | why |
|---|---|
| `cli/ui/console/screens/talk/use-room.ts` | the Chat screen joins the room — with the browser's microphone on a call, for its text alone when it is written: `Room`, `RoomEvent`, `Track`, `TextStreamReader` |
| `cli/ui/console/lib/use-listen.ts` | a supervisor's ear: a hidden, silent seat in the room |
| `cli/ui/console/lib/use-supervise.ts` | a supervisor's hands: the microphone that takes the line |

All three receive a **seat** minted through the CLI's own door — the page never holds a key and
never talks to LiveKit's API, only to a room it was given a token for. Everything else in this
repository — the class, the views, the call, the bridge, the client, every verb — knows only the
wire. A tenant never imports LiveKit, and the class does not know it exists: `call.room` is
reduced from entries, and `room.invite` is a command, not an SDK call.

## 13. The import table, and the rules of the tree

`test/the-imports.test.ts`. Read top to bottom it *is* the architecture; a line nobody uses is a
line the test deletes.

| part of `src/` | may import |
|---|---|
| `client/` | `@pinecall/protocol`, `ws` |
| `agent/` | `call`, `views`, `@pinecall/protocol`, `oxc-parser`, `zod` |
| `call/` | `agent`, `@pinecall/protocol` |
| `views/` | `agent` |
| `runtime/` | `agent`, `call`, `views`, `client`, `@pinecall/protocol` |
| `cli/` | `agent`, `call`, `views`, `runtime`, `client`, `@pinecall/protocol`, `ws` |
| `cli/ui/console/` | `@pinecall/protocol`, `react`, `react-dom`, `react-router`, `livekit-client`, `vite`, `@vitejs/plugin-react`, `zod` |
| `src/index.ts` | `agent`, `call`, `views`, `runtime` |

`test/the-tree.test.ts`, over `src/`, `test/` and `examples/`: no `.ts` at the repo root, no file
over **400 lines**, every file opens with a line saying what it is, and no two names in one
directory one letter apart (a Levenshtein pass over the basenames).

`test/index.test.ts` and `test/client/index.test.ts` pin the two public surfaces **by name**.
Adding an export means editing a list on purpose — which is the point.

## 14. The wire

`@pinecall/protocol` is generated from JSON Schema in `pinecall/protocol` and committed there;
nothing here runs a generator. This package imports from it types (`Entry`, `Event`, `Command`,
`ToolSpec`, `AgentConfig`, `Camel<T>`, `CallScore`, …), the zod schemas a frame is checked
against, `eventOf` / `toCamel` / `isEventType`, and the log reducer (`reduce`, `apply`,
`initialState`). `EPHEMERAL_EVENTS` and `TERMINAL_EVENT` say which entries are not durable and
which one seals a log.

`pnpm-workspace.yaml` names `../protocol/typescript` as a workspace package — a path today because
nothing is published, a version range the day it is. `test/cli/runs/candidate.test.ts` reads
`@pinecall/protocol/fixtures/call-log-golden.json`: the golden log folded here is the one Python
folds there.

## 15. The four rings, and where each of them runs

| ring | what it asks | where it runs |
|---|---|---|
| 0 | does the class behave? | `vitest`, in the tenant's own repo. No network, no key, no model — `pinecall/client/testing` gives it a gateway that is not there |
| 1 | does the agent hold its goldens? | `pinecall test`: the class mounted **in this terminal's process**, the conversations driven and judged by the gateway (the judges, the keys and the log are its) |
| 2 | does it hold on a real line? | `pinecall simulate --voice`: a model plays a persona in a room, read out in an ElevenLabs voice the agent does not have, in the agent's language, and waiting for the greeting before it says anything. `pinecall test --voice` sends the same goldens spoken, to `POST /v1/evals/run` with `voice: true` |
| 3 | what does one real call score? | `pinecall eval <call-id>`: one call re-evaluated by the runtime's code checks |
| 4 | what did every call score? | `call.score`, written by the runtime at hang-up with nobody watching; read here by `runs drift`, `runs promote` and the console's Evals screen |

The nightly (`.github/workflows/nightly.yml`) is rings 1 and 4 on real money: the example,
two models, all three repositories checked out, a throwaway Postgres the schema is migrated into,
a gateway and a `pinecall-runtime init` — and two gates, the baseline model's goldens and each
judge's drift.

## 16. Packaging: one distribution, no build between a change and a test

- `package.json` `exports` point at **`src/`**; `publishConfig` swaps them for `dist/` at publish
  time. So this checkout — and the example, which resolves `pinecall` through `node_modules` like
  any customer — imports the sources. Nothing is aliased and nothing is path-mapped anywhere: a
  path mapping would hand `pinecall start` a second copy of the framework.
- **Three doors out:** `pinecall` (the framework and `mount`), `pinecall/client` (the socket
  alone), `pinecall/tsconfig.tenant.json` (the compiler flags an agent needs, so a tenant writes
  none) — plus `pinecall/views/jsx-runtime` for the JSX transform and `pinecall/client/testing`.
- **Four tsconfigs:** `tsconfig.json` builds `dist/`; `tsconfig.lint.json` checks `src` and `test`;
  `tsconfig.console.json` checks the browser page against the DOM; `tsconfig.tenant.json` is the
  preset a tenant extends (it carries `experimentalDecorators`, because oxc implements only the
  legacy decorators today — the day it ships the TC39 ones the flag leaves the preset and no
  tenant file changes — and `jsx: react-jsx` with `jsxImportSource: pinecall/views`). Those two
  facts are what let one `agent.tsx` carry `@tool` methods and a JSX `render()` at once: tsc, oxc
  and tsx each take both from the preset, and a tenant adds nothing. The one thing `.tsx` costs is
  the angle-bracket cast — `<Slot>row` is JSX there, so a class that wants one writes `row as Slot`.
- **The console is the one thing that must be built**: a browser reads no TypeScript, so
  `scripts/build` runs `vite build` into `dist/cli/ui/console`. The runtime's `scripts/console`
  copies that directory into the gateway as package data, and the gateway serves it at `/`.
- `scripts/check` is build → lint → test, in that order, for the package and for every workspace
  package; CI runs exactly that, with `pinecall/protocol` checked out beside it.
