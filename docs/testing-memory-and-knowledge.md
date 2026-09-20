# Testing memory and the index

The goldens that are not about one call: what the agent writes down about a person, what it
brings back, and whether the index answers. Part of [testing-an-agent.md](testing-an-agent.md).

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
`test/<name>/memory/` — the agent's own folder, on the one layout every project has
([writing-an-agent.md](writing-an-agent.md)):

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
| `said` | the call as it happened, `["caller" | "agent", "…"]` per turn. Both speakers: this is a conversation already held, handed to the hang-up's one model call |
| `holds` | what memory already holds about this caller. They are shown to the model with ids, and nothing is written to or read from the memory table |
| `plants` | sentences somebody tried to get into memory. Planting one IS the assertion: admission must refuse every one of them |
| `channel` | `phone` (the default), `web` or `whatsapp`, as the model is told it |
| `expect.writes` | every category named got at least one fact. The words are the memory policy's own `remember` list (`pinecall memory policy`, or the Settings tab) — a category the world never declared is refused as a bug in the golden, not run |
| `expect.never` | no fact was written under any of these. The policy's own `forget` words |
| `expect.never_says` | **the sharper one**: no fact CARRIES this value, under whatever category. Matched on the words as they fold and on the digits alone, so `4242 4242 4242 4242` catches `4242424242424242` too |
| `expect.invalidates` | every held fact named here was superseded — and, the mirror, **no other held fact was**. That is the half that catches a model which replaces whatever it touches |

```bash
pinecall remember                                        # every case in test/<name>/memory/ (several agents: --agent <name>)
pinecall remember test/clinica-norte/memory/alergia.json # one of them
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
pinecall memory eval                  # test/<name>/goldens/memory.json (several agents: --agent <name>)
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
pass.** What you change instead is the words a fact is written in — the memory policy's `remember`
list is that vocabulary — the embedder, or `k`.

## The index has a golden of its own

The five rings test the agent. None of them tests the **index**, and they cannot: a ring watches a
conversation, so it only ever sees the passage retrieval handed over. Whether a better one existed
and was missed is a question no conversation can answer, because the model never saw the one it
missed.

That is what a retrieval golden is for: `test/<name>/goldens/docs.json`, beside the conversation
goldens, asking about the documents in `docs/<name>/` — a question and the chunk that should
answer it:

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
pinecall docs eval                             # test/<name>/goldens/docs.json against the base named after the agent
pinecall docs eval --k 4                       # as many chunks as the attachment asks for
pinecall docs eval questions.json --base clinica-norte
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
anything did — so a base belongs in CI beside the unit tests, before the release step that pushes
it to production (`pinecall docs push --prod`, [production.md](production.md)). Both figures are computed by code,
with no model in the loop, so two runs over one base answer the same numbers and a change is a
change and not a mood.

A golden is fixed and the index is the variable. **A question is never softened so a change can
pass** — the same rule the conversation goldens are held to. What you change instead is the
documents, the chunking, `k`, `min_score` (`pinecall docs attach`, or the Settings tab's Bases), or
the embedder, and then you run it again.

**What the agent knows by heart has no golden, because nothing ranks it.** The settings' knowledge
— the page the org writes in Settings ▸ Knowledge, or `pinecall agent knowledge edit` — reaches the
model whole, on every call, as the `knowledge` block. There is no index to miss a passage of; what a
call does with it is what the conversation goldens and the `grounded` judge ask.

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
