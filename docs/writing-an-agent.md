# Writing an agent

An agent is a class. Its fields are what it remembers, its `@tool` methods are what the model may
do, its docstrings are the prompt, and its `.tsx` view is what it knows right now. Everything
else — the audio, the rooms, the turn taking, the log, the memory, the judges — is the platform's,
and this class never imports any of it.

Both examples in `../examples/` are complete versions of everything below.

## The shape on disk

```
agent.ts            the class: the state is fields, the tools are methods with a docstring
views/agent.tsx     the view: the prompt as a function of the state, the last thing the model reads
views/<name>.tsx    one per block the class declares in `static prompt` — optional
knowledge/          clinica.md, cached ahead of everything · docs/ pushed by name, retrieved per turn
lib/                the tenant's own systems: an agenda, a CRM, a catalogue
test/
  goldens/          one file per case: { state, input, expect }
  personas/         one file per synthetic caller: a goal, a way of speaking, the facts they know
  prompts/          the states `pinecall prompt` is checked against
  agent.test.ts     the class as software: ring 0, no network and no model
.env                PINECALL_URL and PINECALL_API_KEY
tsconfig.json       { "extends": "pinecall/tsconfig.tenant.json" }
```

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

The class is the **default export** of `agent.ts`. Its name gives the slug it registers under
(`ClinicaNorte` → `clinica-norte`), unless it declares `static slug`.

### Config, and state

Eleven field names configure the agent instead of remembering something. They are never diffed,
never rendered, never in a snapshot:

| field | what it means |
|---|---|
| `phone`, `whatsapp`, `web` | the doors this agent answers. A number, or `true` for a door with none |
| `voice` | a voice **by name** — the platform resolves it to a vendor and an id |
| `llm` | `"haiku"`, `"sonnet"`, `"opus"`, or `"provider/model"` |
| `language` | which standing rules the framework contributes (`es`, `en`) |
| `says` | `{ DKV: "de ka uve" }` — how a word the voice would misread is said |
| `hears` | the words the ears must know: names, brands, the doctor's surname |
| `knowledge` | one file, read beside `agent.ts` and sent whole: cached ahead of everything |
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

### Knowledge, docs and memory

```ts
knowledge = "./knowledge/clinica.md";
docs = "clinica-norte";                       // or { base: "clinica-norte", k: 4, minScore: 0.5 }
memory = {
  remember: ["cómo prefiere que le llamen", "alergias", "su médico habitual"],
  forget: ["pagos"],
};
```

**`knowledge`** is the one file the agent knows by heart. The path is relative to `agent.ts`; the
CLI reads it there and sends `{ path, text }` in the declaration, and the runtime puts the text
where the `knowledge` marker is, once per call, in the cached prefix. A file that is not there is
refused at load: `knowledge ./knowledge/nadie.md: no such file at /…/knowledge/nadie.md`.

**`docs`** names the knowledge base the agent answers from — the folder under `knowledge/docs/`,
pushed to the gateway under a name:

```bash
pinecall knowledge push                       # ./knowledge/docs beside agent.ts, base = the slug
pinecall knowledge push ./knowledge/docs --base clinica-norte
pinecall knowledge list · pinecall knowledge drop clinica-norte
```

A push sends the folder whole and replaces the base; the class then says `docs = "clinica-norte"`
and the view places `<Retrieved k={4} minScore={0.5} />` where the chunks should land. The object
form sets the defaults the marker may still override: `mode` (`retrieved` today), `k`, `minScore`.
The glob the field used to hold is refused with the verb that replaces it: `docs name the base they
were pushed to: run \`pinecall knowledge push ./knowledge/docs --base <slug>\``. Both are typed —
`DocsDeclaration`, `MemoryDeclaration` — for a class that annotates its fields.

**`memory`** is the policy, in your own words: what the runtime extracts about a contact at
hang-up (one model call, after `call.ended` and before `call.summary`) and what it must never
write. The facts are recalled on every turn into the `<Memory kinds>` marker, and a person reads or
erases them with `pinecall memory <contact>` and `pinecall memory forget <contact>`. `onMemory` still
hears every op the runtime wrote, so a CRM of your own can keep a copy.

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
| `confirm: "Le reservo el {{result.when}}. ¿Lo confirmo?"` | makes the tool `irreversible`: the platform reads it back and waits for an explicit yes |
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

## Who may see a field

```ts
@state({ visibility: "pii" }) patient?: Patient;
// or, for a class that would rather write a map:
static visibility = { patient: "pii", stage: "public" };
```

`tenant` is the default and the wire's own, so a field with no declaration sends none. `public` is
what a browser widget may read; `pii` is masked in the log at write time.

## Long calls, and callers who come back

- `this.collapse("Reservado el martes a las 16:00, confirmado.")` drops the change log and keeps
  one sentence in its place. The state itself is untouched, and the call log keeps every turn.
- `this.last(contact)` reads what this contact left behind last time — it needs a store, wired
  where the agent is mounted (`mount(Class, { pc, last })`), never a global.
- `this.restore(snapshot)` puts a whole state back; `this.startIn(partial)` writes only the fields
  a case names over the ones the class gave itself.

## Running it

```bash
cp .env.example .env               # PINECALL_URL and PINECALL_API_KEY
pinecall chat                      # the app in THIS terminal, and a written caller against it
pinecall chat --as +34600123456    # the same call, from somebody memory can file it under
pinecall prompt --state test/prompts/states.json    # what the model would read, offline
pinecall knowledge push            # ./knowledge/docs to the gateway, under the agent's slug
pinecall run                       # the app registered and answering: the process you deploy
pinecall ui                        # the console on 127.0.0.1: talk, calls, sessions, evals
```

`pinecall run` is the same process in development and in production: it runs the agent, binds no
port and serves no page. What a person looks at is `--ui` in the terminal, or the console.

Next: [the-prompt.md](the-prompt.md) for the view, and [testing-an-agent.md](testing-an-agent.md)
for the goldens.
