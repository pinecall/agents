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
| **`pinecall/agents`** (this one) | TypeScript, Node ≥ 24 | the class a tenant writes, the prompt as a function of its state, the CLI, and the console that CLI serves |

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
| `agent.ts` | the `Agent` base: the Proxy that turns an assignment into an authored change, the internals kept off the instance, `seal`, `collapse`, `restore`, `startIn`, `log`, `say`/`reply`, `this.call`, `render()`, `remembers()`, the four hooks |
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
| `call.ts` | `CallWorld`: the line, the room, the history, `say`/`reply` (which settle on the turn they land as), `send`, `participant()`, `invite`, and `take()` — one entry folded in |
| `room.ts` | `Room` and `Participant` reduced from the room's own entries; `ParticipantHandle.mute()/remove()`; `invite` |
| `history.ts` | `History` and `Turn`: the finished turns, and the sentence a `collapse()` left in their place |

### `src/client/` — `pinecall/client`, the socket and nothing above it

| file | what it is |
|---|---|
| `client.ts` | `Pinecall`: one socket, the agents on it, `observe`/`history` over any log the key can read |
| `connection.ts` | the WS to the gateway: the key at the door, backoff on the way back, a ping while it is up |
| `agent.ts` | one agent from the app's side: `open()` (register + configure), the tool calls it answers, the two commands it awaits |
| `calls.ts` | `Call` (everything read off the log; every method one command) and `CallBook` |
| `frames.ts` | one command frame, checked against the schema its type names |
| `listeners.ts` | who is listening for what, per agent and per call; `camelEvent` |
| `observe.ts` | reading a log: the same URL as a JSON page and as SSE, folded by the protocol's reducer |
| `endpoints.ts` | one base URL, three doors — the only place a path is written |
| `testing/` | a gateway that is not there (`FakeGateway`), a log nobody stored, and the loopback address they use |

### `src/runtime/` — the bridge

| file | what it is |
|---|---|
| `connect.ts` | `mount()`: the class registered once, one live instance per call, and the sync that sends only what changed. Also `slugOf`, `modelOf`, `optionsFor` |
| `recall.ts` | a `memory.ops` entry → the words this call has been told about the caller, which is what `remembers()` answers from |
| `channels.ts` | `phone` / `whatsapp` / `web` fields → the routes the agent registers |
| `grounding.ts` | `knowledge` / `docs` / `memory` fields → what the declaration carries: the file read beside the agent, the base by name (the old glob refused), the policy |
| `dispatch.ts` | an outside fact off the wire, gated by the declaration and handed to `onEvent` — one at a time, in order |
| `run-tool.ts` | one tool call: the args checked against the spec, the method run through the instance, the result cut to its `preview` |

### `src/cli/` — `pinecall <verb>`, and the page one of them serves

| file | what it is |
|---|---|
| `index.ts` | the dispatcher: one lazy import per group, and the whole CLI on one screen |
| `groups.ts` | the `Group` contract, and `PLANNED` — every verb the design declares that this tree has not written |
| `env.ts` | where the CLI is pointed and what opens the door: the one resolution order, for every verb |
| `credentials.ts` | `~/.pinecall/`: the `credentials` file (0600) and the local gateway's `dev` file |
| `load.ts` | a tenant's `agent.tsx` (or `agent.ts`) loaded with tsx, handed its own source, and `instanceFor` — one instance with a line to answer on, for the pages that print a prompt |
| `run.ts` · `chat.ts` · `prompt.ts` | the app, the app in this terminal, the prompt offline |
| `test.ts` · `simulate.ts` · `eval.ts` · `runs/` | ring 1, a live persona, ring 3, and what the gateway has run |
| `knowledge.ts` · `memory.ts` | the folder pushed whole under a name, listed, dropped · one contact's facts, and the right to be forgotten. Each also holds its golden's verb: `eval` prints `recall@k` and `nDCG@10`, computed in the gateway by code with no model, and exits 1 on a miss |
| `keys.ts` | the provider keys this org brought of its own: one added from stdin, one taken back, the vendors read by name — never a value |
| `personas.ts` · `machine.ts` · `view.ts` | the synthetic callers, the state machine on one page, the terminal view as a pure function |
| `login.ts` · `whoami.ts` · `secret.ts` | the key typed once, which key a verb would use, and the one place a secret is read without echoing it |
| `testing/` | what those verbs need: the gateway's eval doors, goldens off disk, latency, the matrix, the progress screen, the score, the seeding check, the voice door |
| `ui/` | what `pinecall run` answers the console with, by the wire's verb (`doors.ts`, one module per verb family: a chat, a simulation, a suite, the knowledge and memory goldens, a promotion, drift, a reproduction), and `ui/console/` — the page itself, served by the gateway |

Beside `src/`:

| | |
|---|---|
| `examples/clinica-norte`, `examples/tienda-sur` | two tenants, written the way a customer writes one |
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
| `CallWorld` | `call/call.ts` | `id`, `contact`, `from?`, `channel?`, `room`, `history`, `cause`, `numbered()` |
| `Room` | `call/room.ts` | `participants`, `caller`, `has(kind)`, `get(identity)`, `invite()` |
| `Participant` | `call/room.ts` | `identity`, `kind` (`caller` · `agent` · `supervisor` · `listener` · `sip`), `name?`, `joinedAt`, `speaking` |
| `History` / `Turn` | `call/history.ts` | `turns`, `length`, `summary`, `last` / `who`, `text`, `speechId`, `interrupted`, `at` |

### The prompt

| entity | where | fields |
|---|---|---|
| `Blocks` / `Block` | `views/layout.ts` | `blocks` in send order, each `name`, `region` (`static` · `dynamic`), `text`; `history` |
| `PROMPT_BLOCKS` | `views/layout.ts` | the four, in the one order they are sent: `identity` · `knowledge` · `tools` static, then `view` dynamic |
| `DocsDeclaration` / `MemoryDeclaration` | `agent/agent.ts` | what `docs` and `memory` may hold: `base`, `mode?`, `k?`, `minScore?` · `remember?`, `forget?` |
| `Grounding` | `runtime/grounding.ts` | the three as the wire carries them: `knowledge {path, text}`, `docs {base, …}`, `memory {remember, forget}` |
| `Child` | `views/jsx-runtime.ts` | what a `render()` hands back: an element, a string, a number, nothing, or an array of those |
| `Prompt<T>` | `agent/decorators.ts` | `(agent: T) => Child` — a prompt written beside the class, which `@render` hands the instance |

### The socket

| entity | where | fields |
|---|---|---|
| `Pinecall` | `client/client.ts` | `sdk`, `url`, `apiKey`, `agent()`, `connect()`, `close()`, `connected`, `on`/`onAny`/`onErrors`, `observe`, `history` |
| `Agent` (client) | `client/agent.ts` | `slug`, `calls`, `config`, `app`, `open()`, `configure()`, `declare(tools)`, `command()`, `take(entry)`, `ping()` |
| `Call` (client) | `client/calls.ts` | `id`, `status`, `channel`, `from`, `to`, `contact`, `state`, `today`, and one method per command |
| `CallBook` | `client/calls.ts` | `live`, `of(id, at)`, `forget(call)` |

## 4. The class a tenant writes

Two kinds of field live on the instance, and the difference is the whole model.

**Config** — the names in `CONFIG_FIELDS` (`agent/agent.ts`). They configure the agent; they
are not state. They are never diffed, never rendered by a view, never in a snapshot, and assigning
one does not go through the change recorder.

| field | becomes |
|---|---|
| `phone`, `whatsapp`, `web` | the routes in `agent.register` (`runtime/channels.ts`); truthy means "this agent answers there" |
| `voice` | `VoiceConfig` — a **name**, resolved to a vendor and an id by the platform, never sent as an id |
| `llm` | `ModelConfig` — `"haiku"`/`"sonnet"`/`"opus"` are lowered to real model ids; `"provider/model"` names both halves |
| `says` | `Pronunciation[]` — `{ Vidal: "bidál" }` written as a map, carried as a list |
| `hears` | the words the ears must know |
| `language` | which of `views/lang.ts`'s two word-sets the `identity` block carries |
| `greeting` | `GreetingConfig` — how the call opens: `"words"` (or `{ say }`) is read out as written, `{ reply }` is what the model is told before it finds its own. Exactly one of the two, refused at load otherwise. `runtime/connect.ts:greetingOf` |
| `knowledge` | one file, relative to `agent.tsx`: read there by `runtime/grounding.ts` and sent whole as `{path, text}`. The runtime writes its text into the `knowledge` block, once per call; the app sends nothing for that block. A missing file is refused at load |
| `docs` | the knowledge base **by the name it was pushed under** (`pinecall knowledge push --base`): `"clinica-norte"` or `{ base, mode?, k?, minScore? }`. The old glob form is refused with the verb that replaces it |
| `memory` | `{ remember, forget }`, in the tenant's words: what the runtime extracts at hang-up and what it never writes. Each fact is filed under the word it was remembered by, and `this.remembers(word)` is how a `render()` asks whether this call has been told one |

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
| `knowledge` | static | nothing from the app: the runtime writes the file the declaration carried | never |
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
already seen (`runtime/recall.ts`) — a fact of the call's state, never the fact's text.

`pinecall prompt` and `pinecall run --show-prompt` print exactly these blocks, each under
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
   compilation; the file name is what says whether that text is `.ts` or `.tsx`). One **probe** instance is built, read for its tools and its config, and thrown
   away; `file` is where the class came from, so the knowledge file it names is read beside it.
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
- **Two commands are awaited** (`agent.register` → `agent.registered`, `agent.configure` →
  `agent.configured`), each answered by the event it lands as or by an `error` naming its id.
  Everything else is fire-and-read-the-log.
- **The log is read, never invented.** `observe()` and `history()` fold entries with the protocol's
  own reducer, so the same golden log reduces to the same state here and in Python.
- `client/testing/` is the same surface with no network: a `FakeGateway` an app's own tests mount
  against, and a log nobody stored.

## 10. The CLI

`pinecall <group> [args]`. One module per group, imported only when it is asked for — `pinecall
prompt` must not pay for a websocket client.

| verb | what it is | needs a gateway |
|---|---|---|
| `run` | the app registered and answering: **the process you deploy**. Binds no port, serves no page | yes |
| `chat` | the same app in this terminal's own process, and a written caller against it | yes |
| `ui` | the console on 127.0.0.1 for the life of the command | yes |
| `prompt` | the exact prompt a state would produce | **no** |
| `test` | ring 1: the goldens, through the app in this process, scored by the runtime | yes |
| `simulate` | a model plays one persona, live; `--judge` prints the `call.score` | yes |
| `eval` | ring 3: one real call re-evaluated by the runtime's code checks | yes |
| `runs` | `list · show · diff · promote · drift` — what this gateway ran, and what moved | yes |
| `personas` | `list · show · try` the synthetic callers in `test/personas` | for `try` |
| `knowledge` | `push [dir] --base <name>` · `list` · `drop <base>`: the folder of `*.md` sent whole to `PUT /v1/knowledge/{base}` | yes |
| `memory` | `<contact>` · `forget <contact>`: one contact's facts, current first, and the right to be forgotten · `eval [golden.json] [--k n]`: every question of `memory/golden.json` asked of `recall`, each bringing its own facts, and the two figures a golden answers | yes |
| `login` | the key typed once, proved at the gateway, kept in `~/.pinecall/credentials` (0600) | yes |
| `whoami` | which gateway, which org, and **where this terminal's key came from** | yes |

`groups.ts` also declares every verb the design names and this tree has not written — `new`, `g`,
`sessions`, `observe`, `costs`, `supervise`, `call`, `keys`, `tokens`, `phones`, `agents`,
`deploy`. Typing one prints what it *will* be and exits 0. A verb leaves that table in the commit
that writes it.

**Where the key comes from** (`cli/env.ts`, the one place that decides it, for every verb):

1. the URL: `PINECALL_URL` → the local gateway's `~/.pinecall/dev` → the single row `login` kept →
   `http://localhost:8080`;
2. the key: **if the URL is the local dev gateway, its own dev key** — and an exported
   `PINECALL_API_KEY` is then ignored **out loud**, because that gateway honours its own key and no
   other, and a bare `403` with no sentence in it cost this project an afternoon twice;
3. otherwise `PINECALL_API_KEY` → the `credentials` row for that URL → `PINECALL_DEV_KEY`;
4. nothing: the verb says `pinecall login <url>` and exits 2.

`~/.pinecall/` is 0700, every file 0600, and the `dev` file is trusted only when this account owns
it and nobody else can read it. The `credentials` file keeps v1's top-level `api_key` untouched.

## 11. The console

The console is served by the **gateway**, at `/`, and this CLI opens no port at all. Everything
about the page is a containment decision:

- **The org key never reaches the browser.** The page holds a PERSON's scoped key, minted for it
  at login and kept in `sessionStorage` for the tab's life (`lib/session-key.ts`, the one file
  that touches storage). `pinecall run` mints a one-use code standing for its key and prints
  `/a/<agent>?login=<code>`; the page spends it for a key of its own and takes it out of the
  address bar before rendering (`main.tsx`, `lib/login.ts`). Cold, it asks for org, email and
  password (`screens/login/`). `test/cli/ui/console/the-key-is-never-in-the-page.test.ts` pins it:
  one file reaches `sessionStorage`, none reaches `localStorage`, only `lib/api.ts` writes the
  `authorization` header, and the bundle carries no key and no key's name.
- **Nothing rides a URL.** The log stream is `fetch` reading `text/event-stream` by hand
  (`lib/stream.ts`, `SseParser`), with the key on the header and `Last-Event-ID` sent by the
  reader on a reconnect; the recording is fetched with the header and played from an object URL.
- **What only the agent's directory can answer** — the class for a written call, the personas, the
  goldens, the knowledge folder — the page asks the gateway, and the gateway asks the `pinecall
  run` standing there (`lib/dev.ts`; the runtime's `docs/protocol/dev-verbs.md`).
- **The page may not import the framework** (§13). None of it would run in a browser, and a build
  that pulled a TypeScript parser into the bundle is a build nobody would notice.

| screen | what it reads |
|---|---|
| `agents/` | which agents this gateway holds — so `/` offers a list and not a URL shape |
| `calls/` + `live/` | the calls happening now; one watched call: transcript, marks — a `memory.ops` and a `docs.sources` each one row, `op · n facts · ms` and `n sources · ms`, what was found under it — `STATE`, `PROMPT` (every block by name, hash and length), `ROOM`, `METRICS`, and the supervisor's six verbs |
| `sessions/` | every finished call; one of them read whole — envelope, latency, consent join, score, the prompt block by block, then every entry in `seq`, a lookup's sources one click under the turn it answered |
| `evals/` | every run this agent's suites scored, the diff between two runs, and what each finished call was sealed with |
| `pipeline/` | the three providers of a voice turn, the anatomy of a turn as a waterfall, and the overrides an operator may change between two calls |
| `talk/` | a person reaches the agent from this tab, with this browser's microphone |

Its own laws. Three are held by a test of their own: vite bundles every screen's stylesheet into
one file, so **a class name is global** whatever directory it was written in
(`one-stylesheet-one-class`); the desk sends **one** verb per gesture and one seat request
(`the-desk-sends-one-verb`); a supervisor's six entries each read back as **one sentence**
(`a-supervisor-reads-as-one-line`), and so do a lookup's two (`a-lookup-reads-as-one-line`, off
`lib/lookups.ts`, which both timelines print from). Two more are conventions the reader enforces:
`lib/api.ts` is the only place a request to the gateway is built, and `lib/metrics.ts` the only
file that names a metric — Sessions must print the same digits as `pinecall-runtime sessions show`.

## 12. LiveKit: where it is, and where it is not

The runtime is built on livekit-agents. **This package is not.** The word `livekit` appears in
exactly three files of `src/`, all of them inside the browser page:

| file | why |
|---|---|
| `cli/ui/console/screens/talk/use-room.ts` | the Talk screen joins the room with the browser's microphone: `Room`, `RoomEvent`, `Track`, `TextStreamReader` |
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
| 2 | does it hold on a real line? | `pinecall simulate --voice`: a model plays a persona in a room. `pinecall test --voice` says plainly that it is not built |
| 3 | what does one real call score? | `pinecall eval <call-id>`: one call re-evaluated by the runtime's code checks |
| 4 | what did every call score? | `call.score`, written by the runtime at hang-up with nobody watching; read here by `runs drift`, `runs promote` and the console's Evals screen |

The nightly (`.github/workflows/nightly.yml`) is rings 1 and 4 on real money: both examples,
two models, all three repositories checked out, a throwaway Postgres, a gateway on
`PINECALL_DEV_KEY` — and two gates, the baseline model's goldens and each judge's drift.

## 16. Packaging: one distribution, no build between a change and a test

- `package.json` `exports` point at **`src/`**; `publishConfig` swaps them for `dist/` at publish
  time. So this checkout — and both examples, which resolve `pinecall` through `node_modules` like
  any customer — imports the sources. Nothing is aliased and nothing is path-mapped anywhere: a
  path mapping would hand `pinecall run` a second copy of the framework.
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
