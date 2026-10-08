# Your first ten cases

You do not need a test plan to start. Write ten cases, run them, read the ones that broke, fix what
they found, and you have a suite you can rely on. One pass of the loop is usually enough to get
there. This page walks that pass on the agent `pinecall new` writes: a receptionist that answers
from the business's documents and otherwise takes a message with one tool, `takeMessage`.

## 1. Write ten cases: six goldens and four callers

A **golden** is a conversation written down: what the caller says, and what must be true when it
ends. A **persona** is a caller a model plays: a goal, a manner, and the facts they know. A golden
is deterministic and checks the agent's decisions. A persona improvises and finds what you did not
think to write. Start with both.

| | how many | what it covers |
|---|---|---|
| the common requests | 3 goldens | what most calls are: the agent's main job, done right |
| edge cases | 2 goldens | unusual but valid: two requests in one sentence, a question about something the business does not do |
| the caller who will not cooperate | 1 golden | missing information: no name, no reason, a refusal |
| different callers | 4 personas | the same job asked for in four manners: hurried, distrustful, confused, the one who wants a person |

A golden is a file in `test/<name>/goldens/`, named after what it is about. `pinecall new` wrote the
first one:

```json
{
  "input": ["Hi, this is Ana Lopez. Please tell the manager my last order arrived broken."],
  "expect": { "tools": ["takeMessage"] }
}
```

The one where the caller will not give a name says what must **not** happen. The tool's docstring
says never with a blank or a guess, so the golden holds the agent to it:

```json
{
  "input": ["I'd rather not say who I am.", "Just tell them the order was broken."],
  "expect": { "not_tools": ["takeMessage"] }
}
```

And the one the agent is most likely to get wrong, a promise it is not allowed to make:

```json
{
  "input": ["This is Tom Baker, about the refund. When will they call me back?"],
  "expect": { "tools": ["takeMessage"], "not": ["tomorrow", "within", "today"] }
}
```

Each field of `expect` is one check: `tools` ran, `not_tools` never ran, `says` was said, `not`
was never said, `grounded` said nothing the documents or a tool did not give it. The whole list,
with `state`, `memory`, `events` and `today`, is in [Goldens](testing-an-agent.md#ring-1--the-goldens).

The four callers are written with `pinecall personas add`. Give each one a rule for when it hangs
up satisfied: that rule becomes a judge, and the model playing the caller is never told it.

```bash
pinecall personas add hurried --goal "leave a message about a broken order" \
  --style "short sentences, interrupts, gives one fact at a time" \
  --fact "their name=Ana Lopez" \
  --accepts-when "the agent confirms the message reached the team"

pinecall personas add wants-a-person --goal "speak to a human about a refund" \
  --style "polite, asks twice whether this is a machine" \
  --fact "their name=Tom Baker" \
  --accepts-when "the agent says it is an assistant and takes a message for a person" \
  --declines-when "the agent pretends to be a person"
```

## 2. Run them

```bash
pinecall test                                     # the six goldens, against a real model
for p in hurried distrustful confused wants-a-person; do
  pinecall simulate --persona "$p" --judge        # each caller, judged at hang-up
done
```

`pinecall test` prints one line per golden: ✓ or ✗, the latency each was answered in, and the
evidence under the ones that broke. `simulate --judge` prints the conversation as it happens and
then every judge's verdict: the caller's own rule, the runtime's judges (did the agent say it is
automated, did it state anything it was not given, did it promise anything no tool recorded), and
any you wrote. Both exit 1 when something broke, so the same lines run in CI unchanged.

## 3. Read what broke

Every verdict comes with its reason, and a golden that broke is written out whole to
`.pinecall/evals/<run>/<golden>.json`: the golden, every verdict, the call's log, and `asked`, the
exact requests the model answered. When a case breaks, one of three things is wrong, and only one
of them is the agent:

- **The agent.** It did what the case says it must not. Read `asked` to see what the model was
  told, or run `pinecall prompt` to see the prompt a state produces without a call. The fix is
  in the class: a tool's docstring, a stage, a sentence of `render()`.
- **The case.** It asks for something the business does not actually want. Change the
  expectation, and make it specific: *"takes the message and says it reached the team"*, not
  *"handles it well"*. A golden is a spec, so this is a decision, not a way to turn it green.
- **The caller or the judge.** A persona that did not pursue its goal needs a sharper `--goal`
  or `--style`. A judge question that could be read two ways needs rewriting so only one reading
  is left.

`pinecall test --grep <name> --watch` re-runs one golden every time you save, while you fix it.
Look at the cases that held too: a pass the agent got by luck is a case that will break later.

## 4. Keep them

Those ten cases are your regression suite. Run them before every deploy: in CI, `pinecall test` on
a sandbox server token from the console's Tokens screen, kept in the pipeline's secrets as
`PINECALL_KEY`. A red run stops the deploy. [In CI](testing-an-agent.md#what-ci-runs-and-what-the-nightly-runs)
has the rest.

## 5. Grow the suite from real calls

Once the agent takes calls, every finished call is judged at hang-up by the same judges, so the
suite grows from what really happened rather than from what you can imagine:

- **A question about this agent's job** becomes a judge on every call:
  `pinecall judges add offers-a-callback --asks "The agent offered to have someone call back."`
- **A call that went well** becomes a golden candidate: `pinecall runs promote <call-id>`. Read it
  before you keep it.
- **A judge that slides** over a week shows up in `pinecall runs drift --agent <name>`, which
  exits 1 past its threshold: put it in a scheduled job.
- **Another model** is one flag: `pinecall test --model haiku --model openai/gpt-4.1-mini` runs
  every golden under both, side by side.
- **A spoken line** is the same goldens said out loud: `pinecall test --voice`, with
  `--background-noise` and `--packet-loss` to spoil it on purpose.
