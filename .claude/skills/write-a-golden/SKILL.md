---
name: write-a-golden
description: Write, run or debug the goldens and personas of an agent — ring 1 and ring 2. Use for `pinecall test`, `pinecall simulate`, a golden that will not hold, a suite refused with a 409, or promoting a real call into a case.
---

# Goldens, personas, and the rings

A golden is one conversation written down; a persona is a caller, not a script. Ring 1 runs the
class **in this terminal's own process** and lets the gateway drive and judge the conversation —
so your `@tool` bodies run against your database, and the judges, the keys and the log are the
gateway's. The whole picture is `docs/testing-an-agent.md`.

## NEVER

- **Never soften a golden to make it green.** A golden two models disagree about is the reason
  there are two models; the answer is a fix in the class or the view. The nightly writes the
  divergence into its summary rather than failing on it, precisely so nobody is tempted.
- **Never run `pinecall test --voice`.** It is ring 2 and is not built; the flag says so instead
  of running ring 1 and calling it voice. Spoken checks are `pinecall simulate --voice`.
- **Never assume a golden failed because the model is bad.** Read the prompt first —
  `pinecall prompt --state <the golden's state>` costs nothing and answers half of them.
- **Never keep a promoted call unread.** `pinecall runs promote` writes provenance
  (`promoted_from`), not approval.
- Never start a second suite while one is running: the gateway answers a 409 naming the run
  already going. Wait, or read it with `pinecall runs show <id>`.

## Writing one

One file per case in `test/goldens/`, named after what it is about — the file name is what the
report prints: `no-reserva-antes-del-si.json`, `no-inventa-horas-de-un-dia-sin-agenda.json`.

```jsonc
{
  "state":  { "stage": "book", "patient": { … }, "slots": [ … ] },   // where the call opens
  "input":  ["Esa me viene bien.", "Sí, confírmemela."],              // the caller's turns
  "today":  "2026-09-08",                                             // pin a weekday if you name one
  "events": [{ "after_turn": 1, "name": "cart.changed", "data": { … } }],
  "expect": { "tools": ["book"], "not": ["gratis"], "grounded": true }
}
```

`expect` fields, each one question: `tools` (these ran) · `not_tools` (none of these ran) ·
`says` / `not` (words) · `grounded` (nothing said that did not come from a tool or the knowledge) ·
`register` (`tu` / `usted`, held all call) · `replies`.

The `state` is written **over** the class's own initial state, not instead of it: name what the
case is about and nothing else.

## Running

```bash
pinecall test                                   # every golden
pinecall test --grep reserva --watch            # one, while writing it
pinecall test --model haiku --model openai/gpt-4.1-mini   # the matrix
pinecall test --json                            # for a pipe
pinecall runs list · show <id> · diff <a> <b>   # what this gateway ran
```

The report is a line per golden with the evidence under the ones that broke, and the median
latency each was answered with — read from each turn's own metrics entry, never recomputed.

## When one will not hold

| what you see | look at |
|---|---|
| the tool never ran | is it **visible** in that state? `pinecall prompt --state …` prints the stage and its tools |
| the wrong tool ran | two docstrings that read alike; every tool's docstring is in the static region whether or not it is visible |
| it said something nobody wrote | `grounded` is the check; the cause is usually a view branch offering data the state no longer has |
| it acted before the yes | the view has to say that **this** turn is the one to wait in; `confirm` travels in the declaration, not in the prompt text |
| it holds on one model only | a finding, not a flake. Fix the view or the docstring, never the golden |

## Personas — ring 2

```ts
export default {
  goal: "cambiar la cita al martes por la tarde sin dar más datos de los justos",
  style: "frases cortas, interrumpe, da el dato justo y pide la hora ya",
  facts: { "cómo se llama": "Ana García", "su teléfono": "600 000 001" },
  state: { stage: "choose", patient: { … } },
};
```

A model improvises them turn by turn — six turns by default, `--turns` to change it. A caller with
no `facts` is not broken: they are somebody who will invent nothing, and that is a case.

```bash
pinecall personas list · show <name> · try <name>
pinecall simulate --persona apurado --judge
pinecall simulate --persona apurado --voice --background-noise 12 --packet-loss 2
```

`--judge` waits for the log to **seal** on `call.score` and prints what each judge said and what
the asking cost. A call that never seals says so and names how to read it; it does not print a
verdict nobody wrote. `--background-noise` and `--packet-loss` are properties of audio and are
refused without `--voice`.

## The three states of a judged call

Green, broken, and **nobody judged** — `passed` absent on `call.score` is a third thing. It exits
neither zero nor one, is counted apart in `runs drift`, and is drawn as neither on the Evals
screen. Any code you write that reads a verdict handles all three.

## Verify

```bash
pnpm test                                        # ring 0 first: it is free and it is fast
pnpm exec pinecall test --grep <the new one>     # then the golden, once
pnpm exec pinecall runs drift --agent <slug> --window 7d --baseline 30d --threshold 10
```
