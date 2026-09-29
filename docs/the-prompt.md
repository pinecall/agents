# The prompt

The prompt is `render()`, and `this` is the state. It is a list of **named blocks** in two regions, always in this
order, and the cut between the regions is where the cache is cut:

```
── identity (static) ──      the class docstring · <rules> · <protocols>
── knowledge (static) ──     what the world says the agent knows by heart, whole, once per call
── tools (static) ──         every tool the class declares, name and docstring, visible or not
── history ──                the runtime's turns, what a lookup answered, and the sentences a collapse() left
── view (dynamic) ──         what your `render()` says about NOW
```

A **static** block sits before the history and is cached by the provider; it never reads the
state. The **view** sits after the history and is rewritten every turn. The history in between is
append-only and never written by the app. Only the view may differ between two turns of one call:
everything above the history is a cached prefix, and rewriting one of those mid-call throws that
cache away.

Those four are the whole prompt. A class contributes exactly one of them — the view — and it
writes it as a method:

```tsx
export default class ClinicaNorte extends Agent {
  stage: Stages<"identify" | "choose" | "book"> = "identify";
  patient?: Patient | undefined;

  /** El prompt como función del estado: lo único que cambia entre dos turnos. */
  render() {
    return (
      <>
        {this.stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}
        {this.patient && <p>Hablas con {this.patient.name}, ya en la ficha.</p>}
        {this.remembers("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}
      </>
    );
  }
}
```

`render()` is JSX and renders to **text, never to DOM**. `this` is the state: the fields, the
getters, `this.call` and `this.remembers(…)`. A class that writes no `render()` sends an empty
view, which is a fine agent — its prompt is its docstring and its tools.

Because the class carries JSX, the file is **`agents/<name>/agent.tsx`**. Nothing else changes: the same `tsconfig.json`, the same decorators, the same imports.
`agent.ts` still loads, for a class that renders nothing.

Print any of it with no gateway, no key and no network:

```bash
pinecall prompt --state test/clinica-norte/prompts/states.json    # one state, or several
pinecall start --show-prompt                          # a fresh instance, then exit
```

Both print every block under its header, in send order, and beneath them the stage the instance
is in with the tools that stage shows.

## What the framework puts there for you

**`identity`** is the class docstring, then `<rules>` and `<protocols>` in the class's `language`
(`views/lang.ts` — invent nothing, one question per turn, talk like a person on the phone; to act
call a tool, read back an irreversible action, offer a person when you cannot help).

**`knowledge`** is what the agent knows by heart — the page the org wrote in the console's Settings
tab or with `pinecall agent knowledge edit` — once per call, in the cached prefix. It is the world's,
not the class's: the gateway writes the corner's text into this block, and the app sends nothing for
it. A world that wrote none leaves the block empty.

**`tools`** is every tool the class declares, name and docstring, **visible right now or not**. The
model reads a tool's docstring, never its JSON schema. Visibility is the wire's business
(`tools.set`), so a `when` flipping never touches this block.

**`history`** is the runtime's, not yours: it owns the turns, and it is where a lookup's answer
lives too (below). What this package contributes is the summaries `collapse()` left behind, and
they show on the printed page only — the history is never sent by the app.

**`view`** is your `render()`, and nothing else is ever mixed into it.

## What memory and the knowledge base are, and where they land

They are **tools the platform runs on your behalf** — `recall` and `search` — and their answers
reach the model as `tool_result` blocks, JSON-encoded, in the history where a lookup belongs. They
are never spliced into the view.

That is not a style choice. The view is the operator's words and carries the operator's authority;
a fact a model wrote down from an earlier caller, or a chunk of a document somebody else edited,
came from outside the conversation and carries none. Mixing them into one paragraph gives all of
them the same authority, which is exactly what both vendors tell you not to do. The rule, the
guidance it follows from and the tests that hold it are one page, and it is a public contract:
`runtime/docs/security/prompt-injection.md`.

What the class writes is nothing: which bases the agent searches and what memory keeps are the
world's, set beside the voice —

```console
$ pinecall docs attach clinica-norte --k 4 --min-score 0.5   # the base, how many chunks, how good
$ pinecall memory policy --remember "alergias" "su médico habitual" --forget "pagos"
```

`--mode` says who calls `search`: `retrieved` (the default) is the platform, before the turn;
`tool` is the model, when it decides to — and a tool of the class may search too,
`await this.knowledge.search(question, { k: 3 })`. The policy is what may be remembered about a
caller and what never may be.

What the class reads back is one question:

```tsx
{this.remembers("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}
```

`remembers(text)` answers whether memory has already told this call something under that word —
the word a fact was filed under, or the fact itself. The runtime supplies the facts; before it has
recalled anything it answers false, which is exactly what a caller nobody has met looks like. It is
a **question about the state of this call**, not a way to get the fact's text into the prompt: the
text is in the tool result, where the model can weigh it.

## The tags

`<p>` is a paragraph; siblings are separated by a blank line; `null`, `false` and `undefined`
render nothing, which is what makes `{condition && <p>…</p>}` the whole control flow. `<Rules>`,
`<Protocols>`, `<Rule>`, `<Section title>` and `<Example>` wrap prose the way the model should read
it. A `render()` may also return a plain string, which is a whole view for a class that has one
sentence to say.

A render that has grown past one screen is a render with two ideas in it. Give one of them a
private method and call it from the JSX — it is a method like any other, and the state is still
`this`:

```tsx
render() {
  return (
    <>
      {this.stage === "identify" && <p>Saluda y pide nombre y teléfono.</p>}
      {this.slots.length > 0 && this.hoursOnTheTable()}
    </>
  );
}
```

## The other spelling: `@render(Prompt)`

A prompt that has grown deserves a function of its own, beside the class. `@render` gives it one,
and passing props to it is ceremony you do not write — **the props ARE the instance**:

```tsx
/** El prompt como función del agente. */
const SupportPrompt = ({ stage, customer, hold }: Support) => (
  <>
    {stage === "identify" && <p>Pide el número de pedido. Nada más hasta tenerlo.</p>}
    {customer && <p>Hablas con {customer.name}. {hold && `Tiene una retención: ${hold}.`}</p>}
  </>
);

@render(SupportPrompt)
class Support extends Agent {
  stage: Stages<"identify" | "resolve"> = "identify";
  customer?: Customer | undefined;
  hold?: string | undefined;
}
```

`@render(SupportPrompt)` is exactly `render() { return SupportPrompt(this); }` and produces the
same block, byte for byte. The type is `Prompt<T> = (agent: T) => Child`, and the type of the props
is the class itself — no wrapper, no generic machinery, and destructuring `{ stage, customer }`
just works.

Two things follow from the instance being the props. A **getter** is read when you destructure it,
which is what you want; a **method** is not — `remembers` pulled out of the instance would have
lost its `this`, so a prompt that asks calls it on the agent:

```tsx
const ClinicaPrompt = (clinica: ClinicaNorte) => {
  const { stage, patient } = clinica;
  return <>{clinica.remembers("médico habitual") && <p>Ofrece primero las horas de su médico habitual.</p>}</>;
};
```

**A class writes one spelling or the other.** Declaring `@render(...)` on a class that also has a
`render()` method is refused when the class is defined: `ClinicaNorte declares both
@render(ClinicaPrompt) and a render() method; two ways to answer one question — keep one`.

## Where a rule belongs

The static blocks are read once and generically; the view is read in the turn it is about. The
example paid for this distinction with real calls:

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

### The turn the view is about

A view is rendered again when the caller's turn lands, so `this.call.history.last` inside
`render()` is **the turn being answered** and not the one before it:

```tsx
{this.call.history.last?.who === "user" && <p>Answer what they just asked, in one sentence.</p>}
```

It is the same point LiveKit gives an agent in `on_user_turn_completed` — after the words, before
the model is asked — and the same window the platform's own lookups run in, so what the view says
about the turn reaches the model that answers it. What is still the state's job is anything that
has to SURVIVE the turn: the history is the conversation, and a field written by a tool is the
decision.

## What it costs to get wrong

`sync()` in the bridge renders after every state change and compares each block with what this
call was last sent: one `prompt.set <name>` per block whose text differs, then `tools.set` only when
the visible list differs. So a render that produces the same text twice costs nothing — and a
static block that changes mid-call is a cache miss for every turn after it.
