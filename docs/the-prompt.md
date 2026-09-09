# The prompt

The prompt is `render(state)`. It is a list of **named blocks** in two regions, always in this
order, and the cut between the regions is where the cache is cut:

```
── identity (static) ──      the class docstring · <rules> · <protocols>
── knowledge (static) ──     <!-- knowledge: … -->, the file the class named
── tools (static) ──         every tool the class declares, name and docstring, visible or not
── history ──                the runtime's turns, and the sentences a collapse() left in them
── view (dynamic) ──         the memory marker, the retrieval marker, and what the view says about NOW
```

A **static** block sits before the history and is cached by the provider; it never reads the
state. A **dynamic** block sits after the history and is rewritten every turn. The history in
between is append-only and never written by the app. Only a dynamic block may differ between two
turns of one call: everything above the history is a cached prefix, and reordering the blocks or
rewriting a static one mid-call throws that cache away.

The four above are the framework's, and they are the whole prompt when the class declares nothing.
A class adds blocks of its own:

```ts
export default class ClinicaNorte extends Agent {
  static override prompt = { static: ["faq"], dynamic: ["availability"] };
  …
}
```

Each one is `views/<name>.tsx` beside the class, a default-exported function like the view. The
send order is the framework's, not the tenant's: the framework's static blocks, then the tenant's
static blocks, the history, the tenant's dynamic blocks, and the view **last** — the view is always
the last thing the model reads. A name that is one of the framework's four is refused at load; a
declared block whose file is not there is refused too, because a block nobody wrote is a typo,
not an empty block.

A static block of the tenant's is prose: it is called against props that throw on the first
property read — `a static block cannot read the state: faq.tsx reads slots` — so the law "nothing
static reads the state" is an exception and not a review comment.

Print any of it with no gateway, no key and no network:

```bash
pinecall prompt --state test/prompts/states.json    # one state, or several
pinecall run --show-prompt                          # a fresh instance, then exit
```

Both print every block under its header, in send order, and beneath them the stage the instance
is in with the tools that stage shows.

## What the framework puts there for you

**`identity`** is the class docstring, then `<rules>` and `<protocols>` in the class's `language`
(`views/lang.ts` — invent nothing, one question per turn, talk like a person on the phone; to act
call a tool, read back an irreversible action, offer a person when you cannot help).

**`knowledge`** is one marker, `<!-- knowledge: ./knowledge/clinica.md -->`, when the class named a
file; empty otherwise. The gateway replaces the line with the text.

**`tools`** is every tool the class declares, name and docstring, **visible right now or not**. The
model reads a tool's docstring, never its JSON schema. Visibility is the wire's business
(`tools.set`), so a `when` flipping never touches this block.

**`history`** is the runtime's, not yours: it owns the turns. What this package contributes is the
summaries `collapse()` left behind, and they show on the printed page only — the history is never
sent by the app.

**`view`** is your view, plus a memory marker when the class configured `memory` and the view did
not place one itself.

## The view

A view is a function from the state to text. It is JSX, and it renders to **text, never to DOM**.

```tsx
export default ({ stage, patient, slots, proposed, memory, call }: ViewProps<ClinicaNorte>) => (
  <>
    <Memory kinds={["preference", "health"]} />
    <Retrieved minScore={0.4} />

    {stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}

    {slots.length > 0 && (call.channel === "phone"
      ? <p>Ofrece como máximo dos de estas horas.</p>
      : <p>Muestra hasta cinco horas, una por línea.</p>)}
  </>
);
```

`ViewProps<YourClass>` is the state and its getters, typed, plus three things the state never
stores: `call` (`{ channel, from? }`), `resumed`, and `memory` (`memory.has("médico habitual")`).
A dynamic block of the tenant's is called with exactly the same props.

The tags: `<p>` is a paragraph; siblings are separated by a blank line; `null`, `false` and
`undefined` render nothing, which is what makes `{condition && <p>…</p>}` the whole control flow.
`<Rules>`, `<Protocols>`, `<Rule>`, `<Section title>` and `<Example>` wrap prose the way the model
should read it.

### A block of your own

Clínica Norte keeps the hours on the table in a block of their own, `views/availability.tsx`:

```tsx
export default ({ stage, slots }: ViewProps<ClinicaNorte>) => (
  <>
    {(stage === "choose" || stage === "book") && slots.length > 0 && (
      <>
        <p>Horas libres, en orden:</p>
        {slots.map((slot) => <p>{slot.when} con {slot.doctor}</p>)}
      </>
    )}
  </>
);
```

The list is data and changes when `freeSlots` runs; what to do with it is the view's, which comes
after and changes on every turn. A block that has nothing to say renders empty and is not sent.

### Markers: what the view asks for and never resolves

`<Memory>`, `<Retrieved>` and `<Knowledge>` render one line of the form
`<!-- memory: {"kinds":["preference"]} -->`. This package never opens a file, never searches a
memory, never retrieves a passage: the gateway reads the marker, does the work, and replaces the
line with text. A view may also shape what comes back:

```tsx
<Memory kinds={["preference"]}>{(facts) => <p>Recuerda: {facts.join(", ")}</p>}</Memory>
```

The function cannot travel inside a comment, so it stays in this render's registry under an id the
marker carries, and the filler asks for it by id.

## Where a rule belongs

The static blocks are read once and generically; the view is read in the turn it is about. Both
examples paid for this distinction with real calls:

- A rule that exists only in `identity` — "before an irreversible action wait for an explicit
  yes" — does not tell the model that *booking* is one. `side_effect` and `confirm` travel in the
  declaration, not in the text.
- A rule for "the caller has just named a slot" is the **opposite** of the rule for "the caller
  has just said yes". A view that says only the first makes a model read the same slot back
  forever; that is why the class carries a `proposed` field whose only job is to let the view tell
  the two turns apart.
- Every tool's docstring is in `tools` whether or not the tool is visible. So a view that does not
  say "you already know who you are talking to" is a view where the model sees `findPatient` in
  the list and asks a patient it has on file for their name again.

The short rule: **the state says where the conversation is; the view says what to do about it in
this turn.**

## What it costs to get wrong

`sync()` in the bridge renders after every state change and compares each block with what this
call was last sent: one `prompt.set <name>` per block whose text differs, then `tools.set` only when
the visible list differs. So a view that produces the same text twice costs nothing, a tenant
block its tool did not touch costs nothing — and a static block that changes mid-call is a cache
miss for every turn after it.
