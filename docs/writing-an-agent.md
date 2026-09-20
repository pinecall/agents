# Writing an agent

An agent is a class. Its fields are what it remembers, its `@tool` methods are what the model may
do, its docstrings are the prompt, and its `render()` is what it says about right now. Everything
else — the audio, the rooms, the turn taking, the log, the memory, the judges — is the platform's,
and this class never imports any of it.

`../examples/clinica-norte` is a complete version of everything below.

## The shape on disk

One layout, whether the project holds one agent or five: the class under `agents/<name>/`, and
every folder that belongs to that agent under its name.

```
agents/clinica-norte/
  agent.tsx           the class: the state is fields, the tools are methods with a docstring,
                      and render() is the prompt as a function of the state
  agenda.ts, crm.ts   what only this agent uses: its systems, a callbacks file
lib/                  what two or more agents share
docs/clinica-norte/   the documents the agent SEARCHES per turn — the RAG, and nothing else
test/clinica-norte/
  agent.test.ts       the class as software: ring 0, no network and no model
  goldens/            one file per conversation: { state, input, expect } — and beside them
                      docs.json, the retrieval golden, and memory.json, the recall golden
  memory/             the extraction cases `pinecall remember` runs: one written call each
  prompts/            the states `pinecall prompt` is checked against
tsconfig.json         { "extends": "pinecall/tsconfig.tenant.json" }
```

**The synthetic callers are not in the repository either.** A persona — a goal, a way of speaking,
the facts they may state — is the ORG's, kept by the gateway: `pinecall personas`, or the
console's Personas screen. A project that still has `test/<name>/personas/` sends them once with
`pinecall personas push` and deletes the folder.

**What the agent knows by heart is not in the repository.** Hours, prices, what needs an
authorisation: that is the business, and the business describes itself — in the console's Settings
tab, under Knowledge, or in `pinecall agent knowledge edit`. It is a setting of the world, versioned
like the voice, and a deploy never changes it. The same goes for the voice, the model, the greeting,
the lexicon and the memory policy: the class is code, the world is environment. [The class](#the-class)
says which is which.

A second agent is a second folder under `agents/`, and the same folders under its name. At the root
`pinecall start` holds every agent on one socket, and every verb acts on each agent against its own
folders, or on the one `--agent <name>` names; a verb about one agent — `chat`, `simulate`, `prompt`,
`remember`, `line`, among others — needs `--agent` when there are several. A folder nobody has
written yet is empty, not an error. The CLI's page, [the-cli.md](the-cli.md), says which verb
does what.

The file is `agent.tsx` because the class renders JSX. That is the only reason, and it changes
nothing else: a class that writes no `render()` may stay in `agent.ts`, and the CLI finds either.

Two files carry the toolchain, and they are the only ceremony:

```jsonc
// tsconfig.json — everything the framework needs told to the compiler comes from the preset
{ "extends": "pinecall/tsconfig.tenant.json", "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["agents", "test"] }
```

```ts
// vitest.config.ts — vitest reads no tsconfig: its transform is oxc's, so the same two facts again
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    decorator: { legacy: true },
    jsx: { runtime: "automatic", importSource: "pinecall/views" },
  },
  test: { include: ["test/**/*.test.ts", "test/**/*.test.tsx"] },
});
```

`experimentalDecorators` is in the preset because oxc implements only the legacy decorators today.
The day it ships the TC39 ones, the flag leaves `pinecall/tsconfig.tenant.json` and no tenant file
changes. **Never add a `paths` mapping for `pinecall`**: the app resolves it through
`node_modules` like any package, and a mapping hands `pinecall start` a second copy of the framework.

## The class

```ts
/**
 * Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas.
 * Todo lo que dices se lee en voz alta: sin listas, sin markdown, los números como se dicen.
 */
export default class ClinicaNorte extends Agent {
  phone = "+34910000000";
  whatsapp = "+34910000000";
  web = true;
  language = "es";

  stage: Stages<"identify" | "choose" | "book" | "done"> = "identify";
  patient?: Patient | undefined;
  slots: Slot[] = [];
}
```

The **class docstring is the first thing the model reads** — it opens `identity`, the first cached
block of the prompt. It has to be above the class, in a `/** … */`, and the CLI is what makes that possible: it hands the
class its own source so the docstring survives compilation.

The class is the **default export** of `agents/<name>/agent.tsx`. Its name gives the slug it registers under
(`ClinicaNorte` → `clinica-norte`), unless it declares `static slug`.

### Config, and state

Four field names configure the agent instead of remembering something. They are never diffed,
never rendered, never in a snapshot:

| field | what it means |
|---|---|
| `phone`, `whatsapp`, `web` | the doors this agent answers. A number, or `true` for a door with none |
| `language` | which standing rules the framework contributes (`es`, `en`). The prompt is written in it |

Everything the agent **runs on** is the world's, not the class's: set per world and per corner,
versioned, with who set it and why, and changed without a deploy — by `pinecall agent set`, the
console's Settings tab, or the verb the table names. A class that still declares one of these
fields is refused when it loads, before a prompt is printed or a gateway is knocked at, with the
verb that sets it now:

```
`voice` is the world's now, not the class's: pinecall agent set --voice <name> — remove it from the class
```

| field | what it is | where it is set |
|---|---|---|
| `voice` | a voice **by name** — the platform resolves it to a vendor and an id | `pinecall agent set --voice` |
| `llm` | `haiku`, `sonnet`, `opus`, or `vendor/model` | `pinecall agent set --llm` |
| `stt` | the ears: `deepgram` (Flux), `soniox`, or `vendor/model`. Unsaid, the runtime's own | `pinecall agent set --stt` |
| `greeting` | how the call opens: the words, or what the model reads before finding its own | `pinecall agent set --greeting '…'` · `--reply '…'` |
| `hangup` | whether the model may end the call itself, and when, in your words | `pinecall agent set --hangup '…'` |
| `says` | how a word the voice would misread is said: `Vidal` → `Bidal` | the org's lexicon: `pinecall lexicon add <word> --say '…'` |
| `hears` | the words the ears must know: names, brands, the doctor's surname | the org's lexicon: `pinecall lexicon hear <word> …` |
| `memory` | what to remember about a caller across calls, and what never to | `pinecall memory policy --remember '…' --forget '…'` |
| `knowledge` | what the agent knows by heart: a page of Markdown, read whole on every call | `pinecall agent knowledge edit`, or Settings ▸ Knowledge |
| `docs` | the bases the agent searches per turn, and how many chunks a turn reads | `pinecall docs push`, then `pinecall docs attach <base>` |

**Everything else you put on the instance is state**, and so is every getter — `get identified()
{ return !!this.patient }` is exactly what a tool's `when` asks about. Two consequences worth
knowing before they surprise you:

- a **method** is not state, which is why a collaborator belongs in a method (`private agenda()`)
  and not in a getter: a getter ends up in the prompt and in a golden;
- a field a tool can empty again is declared `patient?: Patient` — and
  `patient?: Patient | undefined` if you turn on `exactOptionalPropertyTypes`, which the tenant
  preset does not and this framework's own build does.

**Tools are the only writers.** A field assigned outside a tool and outside a lifecycle hook throws
`UnauthoredWrite`. This is not a style rule: every change is recorded with the name of whoever
made it, and that is what the log, the console and a golden read.

### Opening the call

An agent that answers a phone speaks first, and the world says how. There are exactly two ways:

```console
$ pinecall agent set --greeting "Clínica Norte, buenos días. ¿En qué puedo ayudarle?"   # the words, read out as written
$ pinecall agent set --reply "saluda, di que eres la recepción y pregunta en qué puedes ayudar"   # what the model reads first
```

The first costs nothing and is the same sentence every time; the second costs one model turn and
the caller never hears the line itself. Setting neither is the third, quieter option — nobody
speaks until the caller does. Because words are words, a supervisor's key may set them, and setting
them also stops an agent that improvises.

The opening is a `turn.agent` like any other: it is on the log, the console draws it, and ring 4
judges the call it starts. A **golden** never hears it — a golden is one turn under the state it
declares, so the call it runs is already underway.

Mid-call the same two verbs are methods of the class, for when something happens that the caller
should hear now: `this.say("Se ha liberado una hora a las diez y cuarto.")` and
`this.reply("dile que acaba de liberarse una hora a las diez y cuarto")`.

### Knowledge: by heart, and searched

Two different things, and the class holds neither.

**What the agent knows by heart** — the hours, the prices, which tests need an authorisation — is
a page of Markdown the org writes in the console, Settings ▸ Knowledge, or in its own editor:

```console
$ pinecall agent knowledge                 # print the corner's text
$ pinecall agent knowledge edit            # $EDITOR on it; what you save is the next version
$ pinecall agent knowledge edit --team     # the team's corner; --prod, production's
```

The gateway writes that text, whole, into the `knowledge` block of the prompt: once per call, in
the cached prefix, so the model has it on every turn and you pay for it once. The class sends
nothing for that block. Use it for what is small, stable and always relevant — a page is fine, a
hundred documents are not.

**What the agent searches** is the folder of Markdown under `docs/<name>/`, pushed to the gateway
as a **base** and attached to the agent in the world that reads it:

```console
$ pinecall docs push                                   # docs/clinica-norte/ → the base clinica-norte
$ pinecall docs attach clinica-norte --k 4             # this agent reads it, four chunks a turn
$ pinecall docs list · pinecall docs attached · pinecall docs detach clinica-norte
```

A push replaces the base whole. `attach` is one field of the agent's settings — `bases`, a new
version — with how a turn reads it: `--k` chunks, `--mode retrieved` (the platform searches before
the turn, the default) or `--mode tool` (the model decides when), `--min-score`. An agent may read
several, and then a turn searches **all of them at once** — one ranking over the lot, so a
collection with nothing to say about the question takes none of the turn's chunks. From inside the
class, a tool may search the attached bases itself:

```ts
/** Busca en la documentación de la clínica lo que el paciente pregunta y devuelve los párrafos que lo responden. */
@tool()
async lookUp(question: string): Promise<Found[]> {
  return await this.knowledge.search(question, { k: 3 });
}
```

`Found` is `{ path, heading, text }`, one per chunk. A class that reaches `this.knowledge` is read
as one that searches — off its source, by the parser, not by a regex — and a world that attaches it
no base refuses it at registration, before a call where the search would find nothing:
`clinica-norte searches its bases, and none is attached to it in sandbox: pinecall docs attach
<base> --agent clinica-norte`.

**What comes back is never spliced into your prompt.** A chunk of a document and a fact a model
kept from an earlier caller arrived from outside the conversation, and they reach the model as
`tool_result` blocks, JSON-encoded, where it can weigh them — never inside the words you wrote.
The rule and the vendor guidance behind it are a public contract:
`runtime/docs/security/prompt-injection.md`.

### Memory

The policy — what the runtime extracts about a contact at hang-up and what it must never write —
is the org's, in its own words:

```console
$ pinecall memory policy --remember "cómo prefiere que le llamen" "alergias" "su médico habitual" --forget "pagos"
```

The extraction is one model call, after `call.ended` and before `call.summary`. The facts are
recalled on every turn, filed under the very words the policy uses, and your class asks about them
with one question:

```tsx
{this.remembers("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}
```

`remembers(text)` is true when memory has already told THIS call something under that word — the
word a fact was filed under, or the fact itself — and false until it has, which is exactly what a
caller nobody has met looks like. A person reads or erases the facts with `pinecall memory
<contact>` and `pinecall memory forget <contact>`, and `onMemory` still hears every op the runtime
wrote, so a CRM of your own can keep a copy.

A phone call names its caller; a written one does not, so `pinecall chat --as +34600123456` is how
you say who is calling from this terminal and the only way to exercise memory before there is a
token. Without it the caller is a visitor and the agent remembers nothing of them, which is right.

## Tools

```ts
/** Horas libres de un día, para una especialidad. Un día que nombre el paciente se consulta SIEMPRE. */
@tool({ stage: ["choose", "book"], preview: 2 })
async freeSlots(day: string, specialty: string): Promise<Slot[]> {
  // El día se resuelve a una FECHA aquí, no en la cabeza del modelo: «el martes» dicho un
  // viernes es una fecha y sólo una, y una cita sin fecha no es una cita.
  const date = dayNamed(day, this.today());
  if (!date) throw new NotADay(day);
  this.day = date;
  this.slots = await this.agenda().free(date, specialty);
  this.stage = this.slots.length > 0 ? "book" : "choose";
  return this.slots;
}
```

The docstring is the tool's description and **is required** — without one no model can choose it,
so the declaration is refused before a call ever happens. The signature is the schema: parameter
names and types become the JSON Schema the model fills.

| option | what it does |
|---|---|
| `when: (s) => …` | the only visibility there is: a question asked of the state on every change |
| `stage: "book"` / `["choose","book"]` | sugar, lowered to a `when` at declaration time. Type-checked against your own `stage` field, so a misspelling is a compile error |
| `confirm: "Reservado: el {{result.when}}."` | makes the tool `irreversible`: the platform **reads the sentence back in your words** once the tool has run, so the caller hears what was done and not the model's paraphrase of it. It does **not** hold the tool: the gate is deferred, the call has already happened, and a sentence written as a question (`¿Lo confirmo?`) will be spoken after the thing it asks about is done. Write it as a receipt |
| `preview: 2` | how many rows of an array result the **model** sees; the state field keeps them all |
| `pii: ["name", "phone"]` | parameters masked in the log by declaration |
| `timeout: 8` | how long the platform waits for this method |
| `params: z.object({…})` | an explicit schema, when the signature is not enough |

Three of these are checked when the class is DECLARED or mounted, long before a call, and each
refuses in a sentence that says what to write: a name that is not one word a model can call
(`a tool name is one word a model can call, not …`); a `pii` naming a parameter the tool does not
have (`tool X: pii names parameters the tool has; unknown: …`); and `stage` on a class with no
`stage` field of its own (`tool X: stage names a value of this agent's own stage field, and C
declares none; add \`stage: Stages<"…"> = "…"\` to the class, or ask when(state) instead`).

A tool that throws is not a crash: the rejection becomes one `tool.result` carrying `error`, which
the model reads and can act on. Throw a sentence a model can use (`NotOnTheTable(chosen, slots)`),
not a stack trace.

**Ask the model for a word, not for a record.** `book(slot: string)` and then resolving that word
against the slots on the table is the design a golden forced: asked for a whole `Slot`, a model
invents `{day, time, doctor}` and the agenda receives a slot it never offered.

## Stages

`stage` is a plain state field. What the type alias buys is that the class and every
`@tool({ stage })` name the same words:

```ts
stage: Stages<"identify" | "choose" | "book" | "done"> = "identify";
```

`pinecall start --show-prompt` and `pinecall prompt` print, under the blocks of the prompt, the stage
the instance is in and the tools that stage shows. That page is how a state machine is read.

## The prompt: `render()`

The class writes one block of the prompt, the last one the model reads, as a method:

```tsx
/** El prompt como función del estado: lo único que cambia entre dos turnos. */
render() {
  return (
    <>
      {this.stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}
      {this.patient && <p>Hablas con {this.patient.name}, ya en la ficha.</p>}
      {this.call.channel === "phone" && <p>Ofrece como máximo dos horas.</p>}
    </>
  );
}
```

`this` is the state, and JSX renders to **text, never to DOM**: `<p>` is a paragraph, siblings are
one blank line apart, and `null`/`false`/`undefined` render nothing — which is what makes
`{condition && <p>…</p>}` the whole control flow. A class with no `render()` sends an empty view.

A prompt that has grown deserves a function of its own, and `@render` gives it one — the props ARE
the instance, so there is nothing to pass and nothing to type:

```tsx
/** El prompt como función del agente. */
const SupportPrompt = ({ stage, customer }: Support) => (
  <>{stage === "identify" && <p>Pide el número de pedido.</p>}</>
);

@render(SupportPrompt)
class Support extends Agent { … }
```

It is exactly `render() { return SupportPrompt(this); }`, byte for byte. Write one spelling or the
other: a class with both is refused when it is defined. The whole of it, with where a rule belongs
and what it costs to get wrong, is [the-prompt.md](the-prompt.md).

## The call

Inside a tool or a hook, `this.call` is the one call being served:

```ts
await this.say("Un momento, lo miro.");         // said word for word; resolves when the turn lands
await this.reply("Discúlpate y ofrece otra hora.");  // the model speaks, guided by words nobody hears
this.call.room.has("supervisor");                // who is in the room, reduced from its own entries
this.call.participant(identity).mute();
this.call.invite("+34910000099", { kind: "sip" });
this.call.send("cart", { total: 42 }, { to: identity });   // a payload to a browser in the room
this.log("appointment.booked", booking);          // one named fact in the call's log
```

Two more it carries, which a view and an agenda both want: `this.call.today` is the day this call
opened, `YYYY-MM-DD`, and it is what "today" and "el martes" have to be counted from — never the
machine's clock, which on a box is a different day in a different timezone. `this.call.history` is
the conversation so far, `turns`, `last`, `length` and `summary`, for a tool that needs what was
already said.

A `render()` reads it too — `this.call.channel` is how the same class says two of these hours out
loud and five of them in writing. It is only there while a call is being served: `pinecall prompt`
and `pinecall start --show-prompt` give the instance they print a line of their own, and a test that
renders gives one with `setCall(agent, new CallWorld(line, () => {}))`.

There is no LiveKit here and no escape hatch to it. A need the room cannot express is a new command
in the protocol, with a name.

## Hooks, and facts from outside

```ts
override async onCall(call: Call) { this.patient = await this.agenda().byPhone(call.from ?? ""); }
override onEnd(call: Call) { … }
override onMemory(ops: MemoryOp[], call: Call) { crmFor(this).apply(call.contact, ops); }
```

Writes inside a hook are authored by the hook, which is why `onCall` may restore last week's
conversation while a stray assignment elsewhere is refused.

An agent can also be told things while a call is going on — a payment cleared, a cart changed —
but only what it **declares**, and only from where it declared:

```ts
static events = { "cart.changed": { from: ["app"] } };

override onEvent(name: string, data: Record<string, unknown>, meta: EventMeta) { … }
```

The pair is the gate: an event declared `from: ["app"]` that arrives from a participant's browser
is somebody else's event with your name on it, and the hook never sees it. Events run one at a
time, in the order the wire delivered them.

## Who may see a field, and which fields are the state

```ts
@state stage: Stages<"identify" | "resolve"> = "identify";   // state, nothing said about who sees it
@state({ pii: true }) patient?: Patient | undefined;         // sugar for visibility: "pii"
@state({ visibility: "public" }) total = 0;
// or, for a class that would rather write a map:
static visibility = { patient: "pii", stage: "public" } as const;
```

`tenant` is the default and the wire's own, so a field with no declaration sends none. `public` is
what a browser widget may read; `pii` is masked in the log at write time. `pii: true` and a
`visibility` that says something else are refused when the class is defined, by name.

**Decorating one field decides them all.** A class that decorates NO field has every own field as
state, which is what the example does. A class that decorates ANY field means *these, and nothing
else*: an undecorated field on it is your own scratch space — out of the snapshot, out of the
prompt, out of `state.changed` and out of the console, and writable from anywhere, since "tools are
the only writers" is a rule about state. It is the one way to keep a helper field out of the log. A
getter is derived, not scratch, and is always state; `static visibility` answers who may see a
field and never whether it is one.

## Long calls, and callers who come back

- `this.collapse("Reservado el martes a las 16:00, confirmado.")` drops the change log and keeps
  one sentence in its place. The state itself is untouched, and the call log keeps every turn.
- `this.last(contact)` reads what this contact left behind last time — it needs a store, wired
  where the agent is mounted (`mount(Class, { pc, last })`), never a global.
- `this.restore(snapshot)` puts a whole state back; `this.startIn(partial)` writes only the fields
  a case names over the ones the class gave itself.

## Running it

```bash
pinecall link                      # once per project folder: your key for its org, written to ./.env
pinecall chat                      # the app in THIS terminal, and a written caller against it
pinecall chat --as +34600123456    # the same call, from somebody memory can file it under
pinecall prompt --state test/clinica-norte/prompts/states.json    # what the model would read, offline
pinecall docs push                 # docs/<name>/ to the gateway, as the base named after the agent
pinecall docs attach clinica-norte --k 4      # the agent reads it, in your corner
pinecall agent knowledge edit      # what it knows by heart, in $EDITOR
pinecall start                     # the app registered and answering: the process you deploy
pinecall start --serve             # the same, and your console on http://localhost:4100:
                                   # chat (call or write), dev chat, calls, sessions, settings,
                                   # pipeline, docs, memory, evals, widget
```

`pinecall start` is the same process in the sandbox and in production (`--prod`, on a server's
token): it runs the agent, binds no port and serves no page. What a person looks at is `--ui` in the
terminal, or a console — the sandbox's on their own machine (`pinecall serve`, which `--serve` opens
beside the agent), and production's on the gateway. An app that would rather hold the agent in its
own Node server mounts the class there instead: [production.md](production.md).

And two flags of `agent set` the pipeline section above does not name — `--tts`, `--tts-model`,
`--endpointing-ms`, `--min-interruption-words` — plus `pinecall docs drop <base>`, which takes a
base out of the world altogether.

**What the package hands a test**, beyond the class itself: `describe(Class, source)` gives a class
its own source, so parameter types and docstrings survive a transpiler — without it the first tool
spec built is refused for want of a docstring, and every ring-0 suite opens with it; `seal(new C())`
is the instance a test drives; `runTool(agent, toolNamed(agent, "book"), args)` runs one tool the
way the bridge would, `ToolFailed` is what it throws; `snapshot(agent)` is the state a golden
carries, with `diff(before, after)` and `changes(agent)` over it; `logOf(agent)` and
`onLog(agent, …)` are what the class wrote; `agent.on("state" | "event", …)` watches it in process;
and `static doc` is the class's description for a build that strips comments. `mount` takes `slug`,
`file`, `opening` and `takesUnclaimed` besides `pc` and `source` — `opening` is the seam
`pinecall chat --state` opens a call in a declared state through.

Next: [the-prompt.md](the-prompt.md) for the view, and [testing-an-agent.md](testing-an-agent.md)
for the goldens.
