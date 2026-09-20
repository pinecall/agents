# Testing an agent

Five rings, and each one asks a different question. They are not levels of thoroughness: a green
ring 0 says nothing about ring 1, and a green ring 1 says nothing about a real line.

| ring | the question | what runs it | costs |
|---|---|---|---|
| 0 | does the class behave? | `vitest`, in the app's own repo | nothing |
| 1 | does the agent hold its goldens? | `pinecall test` | real model calls |
| 2 | does it hold on a spoken line? | `pinecall simulate --voice` | a call |
| 3 | what does one real call score? | `pinecall eval <call-id>` | a replay |
| 4 | what did **every** call score? | the runtime, at hang-up | it already happened |

## Ring 0 — the class as software

No network, no key, no model. Two kinds of test, both in `test/<name>/agent.test.ts` — the
example's is `examples/clinica-norte/test/clinica-norte/`:

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
expected of it. One file per case, in `test/<name>/goldens/` — the agent's name, whether the
project holds one or five — named after what it is about. Beside them live two goldens of another
kind, `docs.json` and `memory.json`, which the last section is about. An agent with no goldens yet
has none, which is an answer and not an error: the console's roster is empty and `pinecall test`
says where to write the first.

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
pinecall test                                  # every agent's test/<name>/goldens/
pinecall test --agent sales                    # one agent's
pinecall test test/clinica-norte/goldens/reserva-*.json   # some of them
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
loud on a real line to a worker, in an ElevenLabs voice the agent does not have and in its language, and the same judges read the log
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

```console
$ pinecall personas add apurado \
    --about "El que llama desde la calle, con prisa" \
    --goal "cambiar la cita al martes por la tarde sin dar más datos de los justos" \
    --style "frases cortas, interrumpe, da el dato justo y pide la hora ya" \
    --fact "cómo se llama=Ana García" --fact "su teléfono=600 000 001"
clinica-norte · apurado written · 4 persona(s)
```

**A caller is the agent's, kept by the gateway** — this verb, or the console's Personas screen —
beside its settings, and read by name when a simulation asks for it. Nothing of them is in the
repository: a project that still has `test/<name>/personas/` sends those files once with
`pinecall personas push`, which also carries the `state` a caller the business already knows opens
its call in — and which stops at the first caller the gateway refuses, naming what landed and what
is still only a file, rather than leaving half a migration in silence.

A caller's name is lower-case letters and digits joined by hyphens (`apurado`, `price-shopper`):
anything else is refused by the verb, with exit 2, before it travels.

```bash
pinecall personas                           # one line each: the name, and the goal
pinecall personas show apurado              # the whole caller
pinecall personas add apurado --goal '…' --style '…' --fact 'su teléfono=600 000 001'
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

## Memory and the index have goldens of their own

The write side of memory (`pinecall remember`, the cases in `test/<name>/memory/`), the read side
(`pinecall memory eval`, the golden `test/<name>/goldens/memory.json`), the index (`pinecall docs
eval`, `test/<name>/goldens/docs.json`) and why a call has no retrieval score are in
[testing-memory-and-knowledge.md](testing-memory-and-knowledge.md).

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

**The goldens are the gate before production, and CI is where they run.** Nothing between the
sandbox and production checks the agent at the gateway — there is no promote: a change to the class
reaches production by a deploy, and a tenant's pipeline runs `pinecall test` (and the retrieval
goldens) before it, on a sandbox server token from the console's Tokens screen kept in the CI's
secrets as `PINECALL_KEY`. A red run stops the deploy. [production.md](production.md) is the rest.
What this repository's own CI runs:

- **CI** (`.github/workflows/ci.yml`): `scripts/check` — build, lint, test — on every push. Ring
  0 only: no key, no model, no money. Both retrieval goldens belong here too when the gateway is
  reachable: `pinecall docs eval` and `pinecall memory eval` cost one embedding per question and
  no model at all.
- **The nightly** (`.github/workflows/nightly.yml`): rings 1 and 4 on real money, weekday nights.
  `pinecall remember` belongs here too — one model call per case is real money, and the extraction
  prompt is exactly the kind of thing that drifts without anybody touching the class.
  All three repositories checked out, a throwaway Postgres with the schema migrated, a gateway, the
  example, **two models** — and two gates: the goldens on the baseline model, and each judge's
  drift. A golden the two models disagree about fails nothing and is written into the summary as a
  finding; the answer to a divergence is a fix, never a softened golden.
