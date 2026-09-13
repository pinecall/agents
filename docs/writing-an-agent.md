# Writing an agent

An agent is a class. Its fields are what it remembers, its `@tool` methods are what the model may
do, its docstrings are the prompt, and its `render()` is what it says about right now. Everything
else — the audio, the rooms, the turn taking, the log, the memory, the judges — is the platform's,
and this class never imports any of it.

Both examples in `../examples/` are complete versions of everything below.

## The shape on disk

```
agent.tsx           the class: the state is fields, the tools are methods with a docstring,
                    and render() is the prompt as a function of the state
knowledge/          clinica.md, cached ahead of everything · docs/ pushed by name, retrieved per turn
lib/                the tenant's own systems: an agenda, a CRM, a catalogue
test/
  goldens/          one file per case: { state, input, expect }
  personas/         one file per synthetic caller: a goal, a way of speaking, the facts they know
  prompts/          the states `pinecall prompt` is checked against
  agent.test.ts     the class as software: ring 0, no network and no model
tsconfig.json       { "extends": "pinecall/tsconfig.tenant.json" }
```

The file is `agent.tsx` because the class renders JSX. That is the only reason, and it changes
nothing else: a class that writes no `render()` may stay in `agent.ts`, and the CLI finds either.

Two files carry the toolchain, and they are the only ceremony:

```jsonc
// tsconfig.json — everything the framework needs told to the compiler comes from the preset
{ "extends": "pinecall/tsconfig.tenant.json", "compilerOptions": { "noEmit": true, "types": ["node"] } }
```

```ts
// vitest.config.ts — vitest reads no tsconfig: its transform is oxc's, so the same two facts again
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
`node_modules` like any package, and a mapping hands `pinecall run` a second copy of the framework.

## The class

```ts
/**
 * Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas.
 * Todo lo que dices se lee en voz alta: sin listas, sin markdown, los números como se dicen.
 */
export default class ClinicaNorte extends Agent {
  phone = "+34910000000";
  web = true;
  voice = "carolina";
  llm = "haiku";
  language = "es";

  stage: Stages<"identify" | "choose" | "book" | "done"> = "identify";
  patient?: Patient | undefined;
  slots: Slot[] = [];
}
```

The **class docstring is the first thing the model reads** — it opens `identity`, the first cached
block of the prompt. It has to be above the class, in a `/** … */`, and the CLI is what makes that possible: it hands the
class its own source so the docstring survives compilation.

The class is the **default export** of `agent.tsx`. Its name gives the slug it registers under
(`ClinicaNorte` → `clinica-norte`), unless it declares `static slug`.

### Config, and state

A handful of field names configure the agent instead of remembering something. They are never
diffed, never rendered, never in a snapshot:

| field | what it means |
|---|---|
| `phone`, `whatsapp`, `web` | the doors this agent answers. A number, or `true` for a door with none |
| `voice` | a voice **by name** — the platform resolves it to a vendor and an id |
| `llm` | `"haiku"`, `"sonnet"`, `"opus"`, or `"provider/model"` |
| `language` | which standing rules the framework contributes (`es`, `en`) |
| `greeting` | how the call opens: the words, or what the model reads before finding its own |
| `says` | `{ DKV: "de ka uve" }` — how a word the voice would misread is said |
| `hears` | the words the ears must know: names, brands, the doctor's surname |
| `knowledge` | one file, read beside `agent.tsx` and sent whole: cached ahead of everything |
| `docs` | the knowledge base retrieved per turn, **by the name it was pushed under** |
| `memory` | what to remember about a caller across calls, and what never to |

**Everything else you put on the instance is state**, and so is every getter — `get identified()
{ return !!this.patient }` is exactly what a tool's `when` asks about. Two consequences worth
knowing before they surprise you:

- a **method** is not state, which is why a collaborator belongs in a method (`private agenda()`)
  and not in a getter: a getter ends up in the prompt and in a golden;
- with `exactOptionalPropertyTypes`, a field a tool can empty again is declared
  `patient?: Patient | undefined`.

**Tools are the only writers.** A field assigned outside a tool and outside a lifecycle hook throws
`UnauthoredWrite`. This is not a style rule: every change is recorded with the name of whoever
made it, and that is what the log, the console and a golden read.

### Opening the call

An agent that answers a phone speaks first. `greeting` says how, and there are exactly two ways:

```ts
// the words, read out as written — no model runs, so it is the same sentence every time
greeting = "Clínica Norte, buenos días. ¿En qué puedo ayudarle?";

// or: what the model is told before it finds its own words. The caller never hears this line
greeting = { reply: "saluda, di que eres la recepción y pregunta en qué puedes ayudar" };

// a notice nobody may talk over
greeting = { say: "Esta llamada será grabada.", allowInterruptions: false };
```

Declaring both, or neither, is refused when the class loads: a greeting is one of the two.
Declaring nothing at all is the third, quieter option — nobody speaks until the caller does.

The opening is a `turn.agent` like any other: it is on the log, the console draws it, and ring 4
judges the call it starts. `{ say }` costs nothing; `{ reply }` costs one model turn.

Two places it deliberately does **not** sound. A **golden** never hears it — a golden is one turn
under the state it declares, so the call it runs is already underway. And an **operator** can
replace it from the pipeline screen without a deploy; because that box takes words, turning it
also stops an agent that improvises.

Mid-call the same two verbs are methods, for when something happens that the caller should hear
now: `this.say("Se ha liberado una hora a las diez y cuarto.")` and
`this.reply("dile que acaba de liberarse una hora a las diez y cuarto")`.

### Knowledge, docs and memory

```ts
knowledge = "./knowledge/clinica.md";
docs = "clinica-norte";                       // or { base: "clinica-norte", k: 4, minScore: 0.5 }
memory = {
  remember: ["cómo prefiere que le llamen", "alergias", "su médico habitual"],
  forget: ["pagos"],
};
```

**`knowledge`** is the one file the agent knows by heart. The path is relative to `agent.tsx`; the
CLI reads it there and sends `{ path, text }` in the declaration, and the runtime writes the text
into the `knowledge` block, once per call, in the cached prefix. A file that is not there is
refused at load: `knowledge ./knowledge/nadie.md: no such file at /…/knowledge/nadie.md`.

**`docs`** names the knowledge base the agent answers from — the folder under `knowledge/docs/`,
pushed to the gateway under a name:

```bash
pinecall knowledge push                       # ./knowledge/docs beside agent.tsx, base = the slug
pinecall knowledge push ./knowledge/docs --base clinica-norte
pinecall knowledge list · pinecall knowledge drop clinica-norte
```

A push sends the folder whole and replaces the base; the class then says `docs = "clinica-norte"`,
or the object form when it wants to say how the chunks come back: `mode` (who calls `search` —
`retrieved`, the default, is the platform before the turn; `tool` is the model), `k`, `minScore`.
The glob the field used to hold is refused with the verb that replaces it: `docs name the base they
were pushed to: run \`pinecall knowledge push ./knowledge/docs --base <slug>\``. Both are typed —
`DocsDeclaration`, `MemoryDeclaration` — for a class that annotates its fields.

**What comes back is never spliced into your prompt.** A chunk of a document and a fact a model
kept from an earlier caller arrived from outside the conversation, and they reach the model as
`tool_result` blocks, JSON-encoded, where it can weigh them — never inside the words you wrote.
The rule and the vendor guidance behind it are a public contract:
`runtime/docs/security/prompt-injection.md`.

**`memory`** is the policy, in your own words: what the runtime extracts about a contact at
hang-up (one model call, after `call.ended` and before `call.summary`) and what it must never
write. The facts are recalled on every turn, filed under the very words you wrote here, and your
class asks about them with one question:

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
/** Horas libres de un día. Un día que nombre el paciente se consulta SIEMPRE. */
@tool({ stage: ["choose", "book"], preview: 2 })
async freeSlots(day: string): Promise<Slot[]> {
  this.slots = await this.agenda().free(day);
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

A tool that throws is not a crash: the rejection becomes one `tool.result` carrying `error`, which
the model reads and can act on. Throw a sentence a model can use (`NotOnTheTable(chosen, slots)`),
not a stack trace.

**Ask the model for a word, not for a record.** `book(chosen: string)` and then resolving `chosen`
against the slots on the table is the design a golden forced: asked for a whole `Slot`, a model
invents `{day, time, doctor}` and the agenda receives a slot it never offered.

## Stages

`stage` is a plain state field. What the type alias buys is that the class and every
`@tool({ stage })` name the same words:

```ts
stage: Stages<"identify" | "choose" | "book" | "done"> = "identify";
```

`pinecall run --show-prompt` and `pinecall prompt` print, under the blocks of the prompt, the stage
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

A `render()` reads it too — `this.call.channel` is how the same class says two of these hours out
loud and five of them in writing. It is only there while a call is being served: `pinecall prompt`
and `pinecall run --show-prompt` give the instance they print a line of their own, and a test that
renders gives one with `setCall(agent, new CallWorld(line, () => {}))`.

There is no LiveKit here and no escape hatch to it. A need the room cannot express is a new command
in the protocol, with a name.

## Hooks, and facts from outside

```ts
override async onCall(call: Call) { this.patient = await agenda.byPhone(call.from ?? ""); }
override onEnd(call: Call) { … }
override onMemory(ops: MemoryOp[], call: Call) { crm.apply(call.contact, ops); }
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
static visibility = { patient: "pii", stage: "public" };
```

`tenant` is the default and the wire's own, so a field with no declaration sends none. `public` is
what a browser widget may read; `pii` is masked in the log at write time. `pii: true` and a
`visibility` that says something else are refused when the class is defined, by name.

**Decorating one field decides them all.** A class that decorates NO field has every own field as
state, which is what both examples do. A class that decorates ANY field means *these, and nothing
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
pinecall login <gateway>           # once per machine; nothing is exported, nothing is in a file you edit
pinecall chat                      # the app in THIS terminal, and a written caller against it
pinecall chat --as +34600123456    # the same call, from somebody memory can file it under
pinecall prompt --state test/prompts/states.json    # what the model would read, offline
pinecall knowledge push            # ./knowledge/docs to the gateway, under the agent's slug
pinecall run                       # the app registered and answering: the process you deploy —
                                   # and it prints the console's URL: talk, calls, sessions, evals
```

`pinecall run` is the same process in development and in production: it runs the agent, binds no
port and serves no page. What a person looks at is `--ui` in the terminal, or the console.

Next: [the-prompt.md](the-prompt.md) for the view, and [testing-an-agent.md](testing-an-agent.md)
for the goldens.
