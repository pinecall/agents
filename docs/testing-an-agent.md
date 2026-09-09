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
const mounted = mount(ClinicaNorte, { pc, view, source: SOURCE });
```

`pinecall/client/testing` is that fake: a gateway that answers the app socket, and a log nobody
stored. An app's own suite needs neither a network nor a key.

The third one worth writing is a **prompt-regions** test: render the class in three captured
states and assert the static region is byte-for-byte identical in all three and the dynamic one
changed in all three. That is the invariant the whole prompt cache rests on, and nothing else
notices when a view starts writing into the static half.

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

| field | means |
|---|---|
| `state` | the state the call opens in — written over the class's own, not instead of it |
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
```

**Where each half runs.** The class is mounted in *this terminal's own process*, exactly as
`pinecall chat` mounts it: your `@tool` bodies run against your database and a breakpoint in one
is reachable. The gateway drives the conversations and scores them, because the judges, the
provider keys and the log are its. So ring 1 needs a gateway and a key like any other verb — and
the gateway runs **one suite at a time**, answering a second with a 409 that names the run
already going.

The report is a matrix: a line per golden, the evidence under the ones that broke, and the median
latency each was answered with. `--voice` is ring 2 and says so rather than running ring 1 and
calling it voice.

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

- **CI** (`.github/workflows/ci.yml`): `scripts/check` — build, lint, test — on every push. Rings
  0 only: no key, no model, no money.
- **The nightly** (`.github/workflows/nightly.yml`): rings 1 and 4 on real money, weekday nights.
  All three repositories checked out, a throwaway Postgres, a gateway on `PINECALL_DEV_KEY`, both
  examples, **two models** — and two gates: the goldens on the baseline model, and each judge's
  drift. A golden the two models disagree about fails nothing and is written into the summary as a
  finding; the answer to a divergence is a fix, never a softened golden.
