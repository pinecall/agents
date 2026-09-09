# The prompt

The prompt is `render(state)`. It is cut into three regions, always in this order, and the cut is
where the cache is cut.

```
── static ──     the class docstring · <!-- knowledge: … --> · <rules> · <protocols> · every tool
── history ──    the sentences a collapse() left where a stretch of the call used to be
── dynamic ──    the memory marker, the retrieval marker, and whatever the view says about NOW
```

Only `dynamic` may differ between two turns of one call. That is the whole reason for the split:
everything above it is a cached prefix, and reordering the regions or rewriting the static text
mid-call throws that cache away.

Print any of it with no gateway, no key and no network:

```bash
pinecall prompt --state test/prompts/states.json    # one state, or several
pinecall run --show-prompt                          # a fresh instance, then exit
```

Both print the three regions under their headers, and beneath them the stage the instance is in
with the tools that stage shows.

## What the framework puts there for you

**`static`** carries, in this order: the class docstring; a `knowledge` marker if the class named a
file; `<rules>` and `<protocols>` in the class's `language` (`views/lang.ts` — invent nothing, one
question per turn, talk like a person on the phone; to act call a tool, read back an irreversible
action, offer a person when you cannot help); and every tool the class declares, name and
docstring, **visible right now or not**. The model reads a tool's docstring, never its JSON schema.

**`history`** is the runtime's, not yours: it owns the turns. What this package contributes is the
summaries `collapse()` left behind.

**`dynamic`** is your view, plus a memory marker when the class configured `memory` and the view
did not place one itself.

## The view

A view is a function from the state to text. It is JSX, and it renders to **text, never to DOM**.

```tsx
export default ({ stage, patient, slots, proposed, memory, call }: ViewProps<ClinicaNorte>) => (
  <>
    <Memory kinds={["preference", "health"]} />
    <Retrieved minScore={0.4} />

    {stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}

    {slots.length > 0 && (
      <>
        <p>Horas libres, en orden:</p>
        {slots.map((slot) => <p>{slot.when} con {slot.doctor}</p>)}
        {call.channel === "phone"
          ? <p>Ofrece como máximo dos de estas horas.</p>
          : <p>Muestra hasta cinco horas, una por línea.</p>}
      </>
    )}
  </>
);
```

`ViewProps<YourClass>` is the state and its getters, typed, plus three things the state never
stores: `call` (`{ channel, from? }`), `resumed`, and `memory` (`memory.has("médico habitual")`).

The tags: `<p>` is a paragraph; siblings are separated by a blank line; `null`, `false` and
`undefined` render nothing, which is what makes `{condition && <p>…</p>}` the whole control flow.
`<Rules>`, `<Protocols>`, `<Rule>`, `<Section title>` and `<Example>` wrap prose the way the model
should read it.

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

The static prefix is read once and generically; the view is read in the turn it is about. Both
examples paid for this distinction with real calls:

- A rule that exists only in the static region — "before an irreversible action wait for an
  explicit yes" — does not tell the model that *booking* is one. `side_effect` and `confirm`
  travel in the declaration, not in the text.
- A rule for "the caller has just named a slot" is the **opposite** of the rule for "the caller
  has just said yes". A view that says only the first makes a model read the same slot back
  forever; that is why the class carries a `proposed` field whose only job is to let the view tell
  the two turns apart.
- Every tool's docstring is in the static region whether or not the tool is visible. So a view
  that does not say "you already know who you are talking to" is a view where the model sees
  `findPatient` in the list and asks a patient it has on file for their name again.

The short rule: **the state says where the conversation is; the view says what to do about it in
this turn.**

## What it costs to get wrong

`sync()` in the bridge renders after every state change and compares the result with what this
call was last sent: `prompt.set static` only when the static text differs, `prompt.set view` only
when the view's text differs, `tools.set` only when the visible list differs. So a view that
produces the same text twice costs nothing — and a static region that changes mid-call is a
cache miss for every turn after it.
