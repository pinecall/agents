# Testing an agent

Four rings, and each one asks a different question. They are not levels of thoroughness: a green
ring 0 says nothing about ring 1, and a green ring 1 says nothing about a real line.

| ring | the question | what runs it | costs |
|---|---|---|---|
| 0 | does the class behave? | `vitest`, in the app's own repo | nothing |
| 1 | does the agent hold its goldens? | `pinecall test` | real model calls |
| 2 | does it hold on a spoken line? | `pinecall simulate --voice` | a call |
| 3 | what does one real call score? | `pinecall eval <call-id>` | a replay |
| 4 | what did **every** call score? | the runtime, at hang-up | it already happened |

## Ring 0 — the class as software

No network, no key, no model. Two kinds of test, both in `examples/*/test/`:

```ts
// the class in the hand: call a tool, read the state
const agent = seal(new ClinicaNorte());
await agent.findPatient("Ana", "+34 600 000 001");
expect(agent.stage).toBe("choose");
```

```ts
// the same walk against the gateway that is not there: the same tool.result a model would see
const gateway = await FakeGateway.start({ apiKey: KEY });
const pc = new Pinecall({ url: gateway.url, apiKey: KEY });
const mounted = mount(ClinicaNorte, { pc, source: SOURCE });
```

`pinecall/client/testing` is that fake: a gateway that answers the app socket, and a log nobody
stored. An app's own suite needs neither a network nor a key.

**Rendering in a test.** `promptOf(agent)` gives the blocks and `showPrompt(agent)` the printed page.
A `render()` that reads `this.call` needs a call, and a `remembers()` branch needs something to
have been recalled — both are one line, and both are the same doors the runtime uses:

```ts
setCall(agent, new CallWorld({ id: "CA_1", contact: ANA, from: ANA, channel: "phone" }, () => {}));
recalled(agent, ["su médico habitual es la doctora Vidal", "médico habitual"]);
```

The third test worth writing is a **prompt-blocks** test: render the class in three captured
states and assert every static block is byte-for-byte identical in all three and the view
changed in all three. That is the invariant the whole prompt cache rests on, and nothing else
notices when a render starts writing into the cached half.

## Ring 1 — the goldens

A golden is one conversation written down: where it starts, what the caller says, and what is
expected of it. One file per case, in `test/goldens/`, named after what it is about.

```jsonc
{
  "state":  { "stage": "book", "patient": { … }, "slots": [ { "when": "martes a las cuatro…" } ] },
  "input":  ["Esa me viene bien.", "Sí, confírmemela."],
  "expect": { "tools": ["book"] }
}
```

A golden may also open the call already knowing something about the person on the line, which is
the one question memory exists to answer — does the agent use it?

```jsonc
{
  "memory": ["Prefiere que le llamen por la mañana", "Su médico habitual es la doctora Vidal"],
  "state":  { "stage": "choose", "patient": { "name": "Marta Ruiz" } },
  "input":  ["¿Tenéis algo el martes?"],
  "expect": { "tools": ["freeSlots"], "not": ["¿cómo prefiere", "¿a qué hora le viene"] }
}
```

Those facts never reach the memory table: they are answered to the `recall` tool for this call
alone, and the tool call, its result and the request around them are the real ones. So a golden
about memory needs no contact in a database and leaves nothing behind.

| field | means |
|---|---|
| `state` | the state the call opens in — written over the class's own, not instead of it |
| `memory` | what memory already holds about this caller, in the words a fact is written in. The facts are answered to the `recall` tool for this call and nothing is written down — this is how you test that the agent USES what it remembered |
| `input` | the caller's turns, in order |
| `events` | facts from the backend, injected mid-conversation: `{ after_turn, name, data }` |
| `today` | `YYYY-MM-DD`, so a golden that names a weekday reads the same in a year |
| `expect.tools` / `not_tools` | these ran / none of these ran |
| `expect.says` / `not` | these words were said / never said |
| `expect.grounded` | nothing was said that did not come from a tool or the knowledge |
| `expect.register` | `tu` or `usted`, held for the whole call |
| `expect.replies` | the agent answered at all |

```bash
pinecall test                                  # every golden in test/goldens/
pinecall test test/goldens/reserva-*.json      # some of them
pinecall test --grep reserva --watch           # while writing one
pinecall test --model haiku --model openai/gpt-4.1-mini   # the matrix: models × goldens
pinecall test --json                           # for a pipe; the human matrix otherwise
pinecall test --voice --grep reserva           # ring 2: the same goldens, said out loud
```

**Where each half runs.** The class is mounted in *this terminal's own process*, exactly as
`pinecall chat` mounts it: your `@tool` bodies run against your database and a breakpoint in one
is reachable. The gateway drives the conversations and scores them, because the judges, the
provider keys and the log are its. So ring 1 needs a gateway and a key like any other verb — and
the gateway runs **one suite at a time**, answering a second with a 409 that names the run
already going.

The report is a matrix: a line per golden, the evidence under the ones that broke, and the median
latency each was answered with. `--voice` runs the same goldens as ring 2: each line is said out
loud by this machine's speech tool on a real line to a worker, and the same judges read the log
it leaves. It needs a worker running beside the gateway, and `--background-noise` and
`--packet-loss` spoil the line the way they do for `simulate`.

**A golden that broke is written out whole**, to `.pinecall/evals/<run>/<golden>.json` under the
directory the suite ran in: the golden as declared, every verdict with its reason, the call's log,
and `asked` — every request the model answered, verbatim, with its system blocks, tools and
messages. Nothing else keeps the prompt; the log holds a hash of each block on purpose. A spoken
run builds its requests in the worker and the file says so in place of the list.

## Ring 2 — a persona on the line

A persona is a caller, not a script: a goal, a way of speaking, and the facts they know about
themselves. A model improvises them turn by turn.

```ts
/** El que llama desde la calle, con prisa. */
export default {
  goal: "cambiar la cita al martes por la tarde sin dar más datos de los justos",
  style: "frases cortas, interrumpe, da el dato justo y pide la hora ya",
  facts: { "cómo se llama": "Ana García", "su teléfono": "600 000 001" },
  state: { stage: "choose", patient: { … } },   // where their call opens
};
```

```bash
pinecall personas list                      # one line each: the name, and the goal
pinecall personas show apurado              # the whole caller
pinecall personas try apurado               # simulate, without the judge
pinecall simulate --persona apurado --judge # …and the call.score at hang-up
pinecall simulate --persona apurado --voice --background-noise 12 --packet-loss 2
```

`--turns` bounds the improvisation (six by default: the length of the walkthrough, and long enough
for a booking to reach its confirmation). `--judge` waits for the log to seal on `call.score` and
prints what each judge said and what the asking cost. `--background-noise` and `--packet-loss` are
properties of audio and are refused without `--voice`.

## Ring 3 — one real call, replayed

```bash
pinecall eval CA_01J8… [--policy policy.json] [--json]
```

The call is re-evaluated by the runtime's own code checks — the words a business will not have its
agent say, the latencies it holds a call to — and the verb prints one line per check. Exit 0 when
it holds, 1 when it does not, so it belongs in a pipeline. The judgement runs in the runtime,
where the log and the store are; this verb builds the case and reads the answer, so nobody needs
Python to read a call.

## Memory has a golden of its own, and it is the write side

The ring-1 goldens above ask whether the agent USES what it remembered. Nothing there asks the
other half: at hang-up the runtime makes **one** model call over the whole call and decides what to
add, what to replace and what no longer holds. That call is the half that persists, and it can fail
in four ways that all cost a business:

| failure | what it does |
|---|---|
| misses what mattered | the next call asks the same question again |
| invents a fact | the agent asserts something the caller never said, forever |
| does not supersede | "prefiere la mañana" and "prefiere la tarde" both live, and the model picks |
| writes a `forget` category | you listed "pagos" as never-keep, and there it is |

An extraction golden is one call **already held** — both speakers, because nothing is re-run — the
facts memory already holds about that caller, and what must come of it. One file per case, in
`test/memory/`:

```jsonc
{
  "name": "anota la alergia y nunca la tarjeta",
  "said": [["caller", "Soy Marta, alérgica a la penicilina"],
           ["agent",  "Anotado. ¿Le va bien el martes?"],
           ["caller", "Sí. Y le paso la Visa, 4242 4242 4242 4242"]],
  "holds": [],
  "expect": { "writes": ["alergias"], "never": ["pagos"], "never_says": ["4242 4242 4242 4242"] }
}
```

| field | means |
|---|---|
| `said` | the call as it happened, `["caller" \| "agent", "…"]` per turn. Both speakers: this is a conversation already held, handed to the hang-up's one model call |
| `holds` | what memory already holds about this caller. They are shown to the model with ids, and nothing is written to or read from the memory table |
| `plants` | sentences somebody tried to get into memory. Planting one IS the assertion: admission must refuse every one of them |
| `channel` | `phone` (the default), `web` or `whatsapp`, as the model is told it |
| `expect.writes` | every category named got at least one fact. The words are your class's own `memory.remember` — a category you never declared is refused as a bug in the golden, not run |
| `expect.never` | no fact was written under any of these. Your class's own `memory.forget` words |
| `expect.never_says` | **the sharper one**: no fact CARRIES this value, under whatever category. Matched on the words as they fold and on the digits alone, so `4242 4242 4242 4242` catches `4242424242424242` too |
| `expect.invalidates` | every held fact named here was superseded — and, the mirror, **no other held fact was**. That is the half that catches a model which replaces whatever it touches |

```bash
pinecall remember                            # every case in test/memory/
pinecall remember test/memory/alergia.json   # one of them
pinecall remember --grep tarjeta             # while writing one
pinecall remember --json                     # for a pipe
```

```
clinica-norte · anthropic/claude-haiku-4-5 · 3 cases · 3 held · 3672 ms
  ✓ anota la alergia y nunca la tarjeta
  ✓ la mañana sustituye a la tarde, no convive con ella
  ✓ ni guarda un permiso ni borra lo que nadie desmintió
```

**Nothing here asks a model whether two sentences mean the same thing.** A fact is natural
language — "alérgica a la penicilina" and "tiene alergia a la penicilina" are one fact written
twice — so an exact-match assertion would make every golden brittle and useless. What is checked is
shape: a category is your own word, a value is a literal, a supersession is an id the model echoed
back. Every judgment is code, so two runs of one case answer the same thing and a change is a
change and not a mood.

**Where each half runs.** The class is mounted in *this terminal's own process*, exactly as
`pinecall test` mounts it, because the categories a golden may name and the tool names admission
refuses a fact for are your class's OWN declaration. The extraction itself runs in the gateway, on
the org's model and the org's provider keys — the very call a hang-up makes. **One model call per
case**, which is why this is a ring-1 verb and not something CI runs for free.

A case that did not hold prints what broke, then what memory would have kept and what admission
refused — the two together are the whole of why:

```
  ✗ anota la alergia y nunca la tarjeta
      writes  nothing was written under 'cómo prefiere que le llamen'; what was: ['alergias']
      kept      add · alergias · Es alérgica a la penicilina.
```

A golden is fixed and the extraction is the variable. **A case is never softened so a change can
pass** — the same rule everything else here is held to. Write the case in the category's own
words, though: a category whose name two readers read two ways is a category the model will file
under only half the time, and that is worth fixing in the class rather than in the case.

## And the read side: does recall bring back the right facts?

The golden above judges what a call TEACHES. This one judges what a turn GETS. They are the two
halves of one table and neither answers for the other: a call may extract the perfect fact and
never see it again, because six facts is what a turn is handed and the seventh is cut.

No ring can ask this one either. A ring watches a conversation, so it only ever sees the facts
memory handed over; whether a better one existed and was missed is invisible to it, and invisible
to the grounding judge at hang-up too, which weighs what the agent said against what it was given.

A memory golden is a list of questions, each bringing its own facts:

```json
[
  { "holds": ["Prefiere mañanas", "Paciente de la doctora Vidal desde 2024", "Alérgica a la penicilina"],
    "asks": "¿le va bien el martes?",
    "expects": ["Prefiere mañanas"] }
]
```

| field | means |
|---|---|
| `holds` | every fact memory holds about this question's contact, in the words a fact is written in |
| `asks` | what the caller just said, in their own words — this is the query `recall` is given |
| `expects` | the fact or facts that should come back |

**No contact of yours is read or written.** Each question's facts go to a scratch contact of your
org, `recall` runs, and they are deleted again before the next question — which is also what makes
the figures the real ranking: the same two index scans, the same fusion, the same embedder a call
uses, rather than an arithmetic in a test.

**A fact answers when what came back CONTAINS what you expected**, folded for case, accents and
whitespace. A fact is a sentence a model wrote and you know the substance, not the wording: so
`"Prefiere mañanas"` is answered by *"Prefiere mañanas, nunca después de comer"*, and an expected
`"Alérgica a la penicilina"` is not answered by *"Alérgica"*, which says less than you asked for.

```bash
pinecall memory eval                  # memory/golden.json beside the agent file
pinecall memory eval --k 1            # the best fact alone: is the right one first?
```

```
memory · pplx-embed-context-v1-0.6b · 7 questions · recall@6 1.00 · nDCG@10 0.78 · 11108 ms
```

| figure | means |
|---|---|
| `recall@k` | the share of the facts you asked for that came back at all. A fact the model never sees cannot be used, whatever its rank |
| `nDCG@10` | how high they ranked, discounted logarithmically. **For memory this is usually the figure that moves**, because a turn takes six facts and most contacts hold fewer than six |
| the model named | the embedder that wrote the vectors. Two scores are comparable only under one model |

**Write questions whose contact holds more facts than a turn asks for.** A contact with four facts
gets all four back whatever the ranking did, and `recall@6 1.00` then says nothing at all. Clínica
Norte's golden holds eight or nine per question for that reason — and the way to make recall bite
is a smaller `k`:

```
$ pinecall memory eval --k 1
memory · pplx-embed-context-v1-0.6b · 7 questions · recall@1 0.57 · nDCG@10 0.57 · 9167 ms
  missed: me han mandado una resonancia, ¿me la puedo hacer? → wanted Le pusieron un marcapasos en 2023, got Prefiere que le llamen don Julián
  missed: me han pedido una radiografía de la espalda → wanted Está embarazada de cinco meses, got Su médico habitual es el doctor Ferrán
  missed: llamadme mañana a las nueve para confirmar → wanted Trabaja de noche, Prefiere que le escriban por WhatsApp, got Prefiere que le llamen Aixa
```

Every question memory did not answer whole is printed with what came back instead, and the verb
**exits 1** when anything did. Both figures are computed by code with no model in the loop, so two
runs answer the same numbers; one embedding per fact and one per question is the whole cost, which
is why this belongs in CI beside the index's golden and the extraction golden does not.

A golden is fixed and the ranking is the variable. **A question is never softened so a change can
pass.** What you change instead is the words a fact is written in — `memory.remember` is that
vocabulary — the embedder, or `k`.

## The index has a golden of its own

The five rings test the agent. None of them tests the **index**, and they cannot: a ring watches a
conversation, so it only ever sees the passage retrieval handed over. Whether a better one existed
and was missed is a question no conversation can answer, because the model never saw the one it
missed.

That is what a knowledge golden is for. One file beside the documents it asks about, a question and
the chunk that should answer it:

```json
[
  { "asks": "¿cuánto tengo que pagar de copago?",
    "expects": "seguros-y-autorizaciones.md › Seguros, autorizaciones y facturación › Copagos" },
  { "asks": "¿tengo que ir en ayunas para el análisis?",
    "expects": "preparacion-de-pruebas.md › Preparación de las pruebas › Analíticas" }
]
```

`expects` is the heading path a chunk carries, which is what you can read off your own documents.
Naming a file alone accepts any chunk of it; naming a heading accepts that section and what is
under it. Fifty to a hundred questions per base is the size that stops being noise.

```bash
pinecall knowledge eval                        # knowledge/golden.json beside the agent file
pinecall knowledge eval --k 4                  # as many chunks as the class asks for
pinecall knowledge eval golden.json --base clinica-norte
```

```
clinica-norte · pplx-embed-context-v1-0.6b · 7 questions · recall@4 1.00 · nDCG@10 0.89 · 918 ms
```

| figure | means |
|---|---|
| `recall@k` | the share of questions whose chunk came back at all. **The one that matters**: a chunk the model never sees cannot be used, whatever its rank |
| `nDCG@10` | how high it ranked, discounted logarithmically. Two indexes that both find a passage are not equal if one puts it first and the other seventh, because `k` cuts |
| the model named | the embedder that wrote the vectors. Two scores are comparable only under one model |

Every question it missed is printed with what came back instead, and the verb **exits 1** when
anything did — so a base belongs in CI beside the unit tests. Both figures are computed by code,
with no model in the loop, so two runs over one base answer the same numbers and a change is a
change and not a mood.

A golden is fixed and the index is the variable. **A question is never softened so a change can
pass** — the same rule the conversation goldens are held to. What you change instead is the
documents, the chunking, `k`, `min_score`, or the embedder, and then you run it again.

## Is there a score for retrieval on a call?

No, and the reason is worth knowing rather than working around.

On a finished call, `call.score` carries the panel's verdicts, and the one that touches retrieval is
`grounded`: it checks that every price, hour, date and name the agent stated appears in the evidence
it was given — and since a lookup arrives as a tool result, that evidence **is** the chunks. So the
rate of `held` over calls that carry a `docs.sources` entry is the precision of retrieval, measured
on real traffic, for free.

What no live call can score is whether the index missed a **better** passage, because nobody knows
what the right passage was: there is no truth to compare against outside a golden. That is the
division of labour. The judge says the answer was grounded in what it was given; the golden says
what it was given was the best there was.

What a call does carry, per turn, is the fact of it: `docs.sources` with the query, every chunk and
its score, and `took_ms`; `memory.ops` with the facts recalled; `metrics.eou` with what the whole
lookup cost the caller in silence. `runtime/docs/retrieval/spec.md` is the contract for all of it,
with the four numbers worth watching and what each targets.

## Ring 4 — every call, judged at hang-up

The runtime writes a `call.score` entry on every finished call, with nobody watching. Read it:

```bash
pinecall runs list [--limit n]         # the suites this gateway has run
pinecall runs show <id>                # one whole run
pinecall runs diff <a> <b>             # what broke and what healed between two
pinecall runs promote <call-id>        # a real call written down as a golden candidate
pinecall runs drift --agent clinica-norte --window 7d --baseline 30d --threshold 10
```

`drift` is the one to put in CI: each judge's held-rate over two windows, and the delta. A judge
that has been sliding for a week is invisible in any single run.

Three states, never two: a call whose judges all held; a call a judge answered `broken` about; and
a call **nobody judged**, which is a third thing and exits neither green nor red.

`promote` is how the goldens grow: a real call that went well, written down from its own verdicts,
with `promoted_from` recording where it came from. Read it before you keep it — provenance is not
approval.

## What CI runs, and what the nightly runs

- **CI** (`.github/workflows/ci.yml`): `scripts/check` — build, lint, test — on every push. Ring
  0 only: no key, no model, no money. Both retrieval goldens belong here too when the gateway is
  reachable: `pinecall knowledge eval` and `pinecall memory eval` cost one embedding per question
  and no model at all.
- **The nightly** (`.github/workflows/nightly.yml`): rings 1 and 4 on real money, weekday nights.
  `pinecall remember` belongs here too — one model call per case is real money, and the extraction
  prompt is exactly the kind of thing that drifts without anybody touching the class.
  All three repositories checked out, a throwaway Postgres, a gateway on `PINECALL_DEV_KEY`, both
  examples, **two models** — and two gates: the goldens on the baseline model, and each judge's
  drift. A golden the two models disagree about fails nothing and is written into the summary as a
  finding; the answer to a divergence is a fix, never a softened golden.
