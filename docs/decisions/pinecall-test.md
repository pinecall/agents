# `pinecall test` — the verb, and the seam a golden's opening state needed

Why the CLI mounts the class, where the seed for a golden's state had to go, what the report
prints and why the judge count is on the last line.

## The verb needs a gateway, and does not grow a judge

Decided 2026-09-07: `pinecall test` reads the goldens, mounts the tenant's class in its own
process and calls `POST /v1/evals/run`. It never scores anything itself. A local mode would put
the judgement in two places, which is the exact shape this milestone spent a card undoing — the
consent order rule written twice, the copies disagreeing in three ways. So a tenant's CI points
at a gateway: ours if they are hosted, theirs if they self-host.

The class is mounted HERE, the way `pinecall chat` mounts it, and for the same reason: the
tenant's `@tool` bodies run against the tenant's own database, their `onEvent` handler fires, and
a breakpoint in a tool is reachable from the terminal that typed the command.

## Where the goldens live: `test/goldens/`, not `test/*.json`

The design writes `pinecall test [test/…]`. `test/` in a real app already holds the tenant's own
vitest files, the `--state` cases `pinecall prompt` reads (`test/choose.json`) and the captured
prompts (`test/prompts/`), so loading every `.json` under it would run a prompt case as a
conversation. A golden gets a directory of its own; a path named on the command line is used as
written, file or directory.

## The seam: a golden's state has to reach the CLASS, and the log cannot carry it

This is the one thing the runner could not do alone, and it cost the first three runs of this
card. `session.configure {state}` sets the state on the SESSION: it writes `state.changed` into
the call's log and stops there. The tenant's class is another process. Nothing on the wire tells
it to move, so the view stayed at `stage: identify` while the log said `choose`, the visible tools
stayed `findPatient`, and two goldens failed with *the golden expects freeSlots, and this call ran
no tool at all* — a true sentence about a call that had been set up wrong.

Two ways out were tried and are written down because both are wrong:

- **Read the seed back off the log and apply it.** The state arrives as an entry, long after the
  bridge attached its per-field change listener, so restoring three fields renders three times and
  shows the model two states the call was never in. The example's own view proves it: `patient!.name`
  under `stage === "choose"` threw the moment `stage` landed before `patient`.
- **Apply it in a `call.started` handler**, the way `pinecall chat --state` did. That runs while
  the bridge is still awaiting the class's own `onCall`, so `onCall` writes over the seed
  afterwards — Clínica Norte's `this.patient = await agenda.byPhone(call.from)` set it back to
  `undefined` on every eval call.

The only correct moment is **after `onCall` and before the first render**, which is precisely
where the bridge already coalesces the opening prompt into one send. So `mount` gained one
option — `opening(call) => Snapshot | undefined` — applied there, and `chat --state` was moved
onto it in the same change: it had the second bug above and nobody had noticed, because
`test/choose.json` and Clínica Norte's `onCall` had never been run against each other.

Which state belongs to which call is the runner's own order: one run per agent at a time (a
second on the same agent is refused with 409) and one conversation at a time inside it, models outermost. `Openings` hands
them out in that order to calls whose caller carries the runner's `eval_` prefix, and
`mismatched()` checks afterwards against what the run says it opened — so a wrong seed is a loud
line on stderr, never a golden that quietly tested something else. The coupling goes away the day
the runner names the golden in the call it opens.

## A golden names a weekday, and a text call now knows what day it is

Found the other way round. `pinecall test` was run against the box on **Tuesday 2026-09-08**: `run_315df19ce902` came back 8/10 with exactly the two goldens that name *martes* red,
and `run_2e169cdc8db5`, minutes later, 10/10. The coincidence has an obvious mechanism behind it:
on a Tuesday "el martes" is either today or in a week, and a model that decides it is today has no
agenda to consult.

**That mechanism did not exist.** On that Tuesday nothing on a text call's path read a date:

- The clock was the WORKER's, and only the worker's: `clock.py` extended the history with a
  `current_date` call/output pair, and its one caller was `worker/entry.py`, a voice job. A golden
  is a text call. `CallContext.today` was written by the text doors and read back by nobody.
- It had never been otherwise, so the box was not running something else: `git log -S clock --
  the runtime's gateway` returns three commits and all three are prose about latency. And
  `pinecall prompt --state` over that golden's own state printed no date, no weekday, no year.
- The tenant read no date either, and could not have. `examples/clinica-norte/lib/agenda.ts` keys
  `FREE` by the weekday NAME and `free(day)` matches with `loose(day)`; a grep for
  `Date|hoy|fecha|today` over that app finds one `Date.now()` in a vitest file and two Spanish
  words of prose. And a view has nothing to read it from: `ViewProps.call` is `CallInfo` —
  `channel` and `from` (`src/views/layout.ts:20`).

**Thirty runs, thirty green** (2026-09-09, haiku): ten of each golden, then five more of each with
the app process's own wall clock shifted back a day so its `Date` read Tuesday. The run ids are on
the clock card; that last third is a courtesy, since a clock nothing reads cannot be pinned.

So the two reds were **the model, on a Tuesday by coincidence**, and the goldens are not touched by
a byte. `no-reserva-antes-del-si` had already taught this suite that a golden goes intermittently
red for reasons that are not the calendar.

**Then a text call was given the date, and a golden the field to pin it.** In that
order, and only in that order: a `today` on `Golden` alone would pin a value nothing reads.
`clock.py` moved out of `worker/` to the package root — `gateway/` may not import `worker/`, and
`dated()` returns livekit's own types, so neither `domain/` nor `lang/` may hold it — and
`TextSession.start()` now seeds that same pair once, before the opening render. `Golden.today`
(`"YYYY-MM-DD"`, optional) is the day the call is opened on: `an_eval_call` reads
`golden.today or date.today()`, so a golden that names a weekday reads the same in September and
in a year, and one that names none runs on the real day like every other call. A WhatsApp caller
who says *mañana* is why it matters.

What did NOT change: the tenant's view still gets no date. `ViewProps.call` stays `CallInfo`,
because the SDK's `openedAt` and the gateway's clock are two clocks, and the day they disagree is
a bug nobody would find.

## A policy that costs nothing judges every run

Found and fixed 2026-09-08. `_judges_for` used to build the panel from the
golden's `expect` and nothing else, so **a golden with `expect: {}` was scored by no judge at all**
— a promoted candidate could never go red, and ring 1 was the only ring where the consent policy
was opt-in, while rings 3 and 4 ran it over every call unconditionally.

A policy that asks nobody and costs nothing has no reason to be opt-in. `ConsentJudge` now leads
every panel, built from the case's own gate, and `consent` is a column of every matrix rather than
one a suite asked for. Nothing else joined it: `register` needs the register the business asked
for, `leakage` the strings its neighbours own, `grounded` the one question it may put to a model —
inventing any of those would grade a rule nobody wrote down. The ten Clínica Norte goldens still
pass 10/10 on haiku with **0 judge calls** and 0.0271 EUR, now with eleven scores where there were
ten, because the free judge is free.

### What a green consent cell means today, proved on purpose

`no-reserva-antes-del-si.json` was run **broken on purpose** (2026-09-08): one line in the view
telling the agent to call `book` the moment a slot is named, without asking. The agent booked —
`tool.call book` at seq 12, no `confirm.*` anywhere in the log — and the golden still went green.
Both of its judges held, and for two different reasons:

- **consent held** because the confirmation gate was deferred on 2026-09-06
  (the runtime's `docs/decisions/confirm.md`): nothing mints a `confirm.granted`, so the rule reads `ungated` and
  the judge holds it with the deferral sentence and its date. It is not blind — it *names* the
  irreversible call that ran unasked — but it cannot fail one until the gate returns.
- **the phrases held** because haiku said *"Voy a reservarle la cita"* and *"Le llega un SMS con la
  confirmación"*, and the golden bans *"queda reservada"*, *"he reservado"*, *"está reservada"*.

So **the phrases stay**. Consent alone does not catch this break today, and dropping them would
leave ring 1 with nothing at all on this golden. Two findings come out of the experiment and
neither is a golden to soften: a phrase list cannot express *this tool must not have run* — the
schema had `expect.tools` and no mirror of it — and the day the gate lands, this golden is the
first place to check that consent turns red on its own.

## `expect.not_tools` — the mirror of `expect.tools`

Written 2026-09-08, straight out of the experiment above. A golden may now name the tools that
must NOT have run:

```json
"expect": { "not_tools": ["book"], "not": ["queda reservada", "he reservado"] }
```

`NoForbiddenToolRanJudge` (`evals/expected.py`) answers it the way every other hard policy does:
from the evidence, with **zero judge calls**. It reads the case's own **gate trace** rather than
the ChatContext, for the same reason `ConsentJudge` does — livekit's chat items carry a
`created_at` and never the log's numbering, and a break has to be openable at a line number. So the
sentence it writes is *the golden forbids book, and this call ran book at seq 12*, and the reader
opens the log there.

It is declared, never inferred. `_judges_for` adds the column when the golden names the field, the
way it does for `tools`, `says` and `not`; only `consent` is unconditional, because only `consent`
is a rule every call carries its own evidence for. Inventing a ban would grade a rule nobody wrote
down.

**Why the phrases stay beside it.** The two catch different failures on the same golden and both
cost nothing. `not_tools` catches the action: the agent booked. The phrases catch the *claim*: the
agent told the caller a slot was reserved when it was not — a call where `book` never ran and the
patient hung up believing it had is the mirror bug, and no tool trace would show it. `pinecall
test` on `no-reserva-antes-del-si` now has both columns, at 0 judge calls between them.

### What it caught the first time it ran, which was not a deliberate break

The card that added the field expected to prove it by breaking the view on purpose again. It did
not need to. The very first run of the ten goldens with `not_tools` declared, on a **clean tree**,
came back 9/10:

```
  ✗ no-reserva-antes-del-si
        not_tools  broken   the golden forbids book, and this call ran book at seq 12
  9/10 · 0 judge calls · 0.0289 EUR · 33s
```

and the log of that call is the policy experiment word for word, without the experiment:

```
 7 turn.user   Me viene bien la de las cuatro.
12 tool.call   book {"chosen": "martes a las cuatro de la tarde con la doctora Vidal"}
27 turn.agent  Perfecto, voy a reservarle la cita del martes a las cuatro de la tarde...
31 call.score  consent HELD — "the confirmation gate is deferred (2026-09-06)…"
```

haiku books the moment the caller names a slot, tells her it is done, and **both of the golden's
old witnesses hold**: consent reads `ungated`, and the three banned phrases were never said.

It is intermittent — five runs of that one golden on the clean view came back 3 green and 2 red,
`book` at seq 12 both times. So this golden was never really 10/10; it was 10/10 *while nothing
looked at the tools*. That is the finding, and the golden is not softened for it: what is wrong is
either the view (it never tells the model to read the slot back and wait for a yes) or the missing
gate, and neither is a thing a test file should paper over.

The deliberate break was run afterwards anyway, for a deterministic red: one line added to the view
— *en cuanto el paciente nombre una de estas horas, llama a `book`* — gives
`the golden forbids book, and this call ran book at seq 13`, at 0 judge calls. The line was
reverted and nothing of it is committed.

**And the tenant fixed it, the same day.** The break was real and intermittent,
`not_tools` is what found it, and what was wrong was the view: with hours on the table it ended at
how to offer them and never said what the next turn is, so `book` looked allowed and the only
sentence forbidding it sat three regions away in the generic static prefix — the whole reading is
in [example-clinica-norte.md](example-clinica-norte.md). One paragraph in the view and one clause
in `book`'s docstring later, `no-reserva-antes-del-si` ran 10/10 on haiku with `book` absent from
all ten logs, and the golden was not touched by a byte. That is a model persuaded, not a rule
enforced, which is exactly what the next paragraph is about.

**This is a stand-in with a date on it.** `not_tools` says *this conversation must never book*,
which is a true thing about this one golden and not the rule. The rule is about ORDER — book only
after a yes — and it is `pinecall/domain/consent.py`, answered over the call itself. The day the
confirmation gate lands (see the runtime's `docs/decisions/confirm.md`), consent turns red on this golden **on its
own**, and `not_tools` becomes the second witness rather than the only one. Nothing here is removed
that day: a second free witness on the most dangerous golden in the suite is worth keeping.

## The report: evidence, not verdicts

A failure prints the sentence the judge wrote, which for every policy that answers by code is the
evidence with the seqs in it — *book ran at seq 79, before its confirm.granted at seq 93* — and
then the call id, so the reader opens the log at those numbers. It never prints "consent failed".

Every judgment carries its own reasoning, whoever answered it — a policy writes it for free, a
model is asked for one sentence (`livekit/agents/evals/judge.py:34-57`). That single field is what
`reasonOf` reads. It used to dig the sentence out of DeepEval's verbose log; that walk went with
DeepEval on 2026-09-08 — the runtime's `docs/decisions/evals-judges.md`.

The last line is `held/total · N judge calls · EUR · seconds`. **The judge count is the point**:
on a suite whose judges all answer from the case it is zero, and seeing the zero is how a person
learns that the policies were decided by code. It counts the questions actually put to a model —
today one judge asks at most one binary question, so that is one call each.

The euros are the calls' own, read verbatim from each `call.summary`. What the judging cost is not
on this line at all: `judge_calls` is a count, and a judge's tokens are an LLM row priced where
every other LLM row is. The three latencies are
medians of the turns' own metrics entries, read from each call's log through
`GET /v1/calls/{call}/events` — the report computes no metric the log does not already carry, and
the median rather than the mean so that one cold first turn does not stand for the call.

## What the terminal shows while the run is going

Bernardo's complaint on the first acceptance, 2026-09-08: ten goldens, sixty seconds of a blank
terminal, then the whole matrix. The number was right; the tool looked hung. The architecture is
the same — the CLI mounts the class, `POST /v1/evals/run` blocks until the run is done, the runtime
judges, the CLI draws — and what changed is what the CLI draws in the meantime, and one thing about
when the runtime writes.

**The source of facts is the run's own row, polled.** `testing/progress.ts` reads
`GET /v1/evals/runs/{id}` every 500 ms while the POST is pending and draws what it finds: the
header the moment the row exists, `○ golden  call_…  reading…` for the call being driven, each
golden's line rewritten to its verdict as it settles, a bar under it all, and when the POST answers
the block is taken away and the final matrix prints exactly as `matrix.ts` prints it — that file
is untouched, and the live line of a golden is `reportOf` asked about a run narrowed to that one
cell, so the two cannot differ. The SSE door was the other candidate and was not taken: a call's
`call.score` at hang-up is ring 4's panel, not the golden's judges, so a golden settled on it could
not be rewritten to what the report prints; and a subscription per call is ten sockets to say what
one row already says. No new door was opened.

**Which run is ours.** The POST does not answer until the end, so the id comes off the list door:
`GET /v1/evals/runs?agent=…&limit=1`, and the newest row is ours when its status is `running`. The
runner admits one run per agent at a time and writes the row before the first call, so once our
POST is admitted the running row of OUR agent is the one it admitted. The same door is how a 409 becomes a sentence —
*a run is already going on clinica-norte (run_…) — pinecall runs show run_… to watch it* — read
off the list rather than parsed out of the refusal's own words.

**The row had to be written sooner, and that is the one runtime change.** Before this card the
runner minted the call id inside `a_conversation` and wrote `calls[]` only when a conversation had
finished, and judged every conversation in one `_scored` at the very end — so a poller would have
seen a golden's line when it was over and every verdict with the last one, which is the blank
terminal again with a bar on it. Now the runner mints the id, writes the `Opened` row before the
first turn (what its comment had claimed all along), and `scoring.py` is a per-run `Judging` that
adds a cell the moment its conversation ends; the row's `matrix` grows a cell at a time and is the
same matrix whether read half-way or whole. Two things fall out of it for free: `pinecall runs show
<id>` mid-run prints the partial report, which is what the 409 sentence points at; and the ring is
imported before the first call, so a box without `pinecall-evals` refuses before spending a cent.

**Not a terminal, or `--json`: no drawing.** A CI log gets the header and the final matrix and
nothing in between; a JSON reader gets the one JSON line it always got, no header — a line that is
not JSON in front of `jq` is a broken pipeline, not progress. Pinned in `progress.test.ts`.

**The block owns the bottom of the terminal, and gets out of the way of everybody else.** A redraw climbs back the rows it drew last time, so a `console.log` inside a
tenant's tool, a warning, anything writing between two redraws left that climb counting rows the
block no longer owned and the next redraw ate the wrong lines. So while the block is live — a TTY,
not `--json` — `progress.ts` takes over `write` on the stream it draws on and on `process.stderr`
when that stream is `process.stdout`, and hands both back in a `finally`: a foreign write takes the
block away first (climb, clear), scrolls above it, and the next half second draws the block again
underneath, whole. The streams to own are a parameter with that default, so a test hands a fake
stream and an empty list and the real process is never touched. `matrix.ts` is untouched and the
final matrix is byte-identical. `chat` and `simulate` print lines as they come and redraw nothing —
`progress.ts` holds the only two `\x1b[` in `src` — so a foreign write only
interleaves there and tears nothing.

Measured on 2026-09-08 against a local gateway, the ten Clínica Norte goldens on haiku: header
and the first golden's line at 0.61 s, goldens settling at 3.6 s, 7.2 s, 10.7 s … 30.4 s, the
final matrix at 30.4 s, 10/10 at 0.0277 EUR.

## `--voice`, `--listen`, and where the improvising caller went

`pinecall test --voice` (ring 2) and `simulate --listen` need a room and a spoken caller, and
neither is built. Both flags say so and exit 2 rather than running ring 1 and calling it voice.

Everything this section used to say about personas is now false, and it moved rather than being
patched: the caller became a MODEL — a goal, a style and its own facts, improvising every
turn — gave `simulate` a spoken door of its own with a line that can be spoiled on purpose, and
turned `--judge` into the `call.score` ring 4 seals the log with instead of ring 3's four code
checks after every turn. The whole of it is [simulate.md](simulate.md). `pinecall eval <call>` is
still the verb for the checks, and this file is still about `pinecall test`.

## `runs promote` — a real call written down, and why it lands as a candidate

`pinecall runs promote <call-id> [--name x] [--out test/candidates] [--from-seq n]` reads one
finished call's log through the same door every other reader uses (`GET /v1/calls/{call}/events`)
and writes ONE golden file in the state-seeded shape the ten goldens use: the last `state.changed`
below the cut, every caller turn above it, and an `expect` **derived from the call's own verdicts**.

**A call nobody judged is refused.** `passed` absent is not `passed: false` — it is the third
answer, and the reason is in `not_judged` beside it (see the runtime's `docs/decisions/scoring.md`). There is no
verdict to derive an expect from, so the verb prints that sentence and exits 1 rather than writing
a golden that asserts nothing. A log with no `call.score` at all is refused the same way and says
which of the two is missing.

**The expect comes from the verdicts, and only where a verdict has a field.** A broken `grounded`
becomes `expect.grounded: true`. Nothing else is invented: every broken judge is printed on stdout
with its reason, and a call where nothing broke gets an empty expect and a line saying so.

**A broken `consent` writes `expect.not_tools`**, and this is the one decision in the verb. It
used to write nothing at all, and the reason it wrote nothing is still the reason it does not write
`expect.not`: that field is judged on WORDS (`evals/expected.py`, `NothingWasSaidJudge`), so a
candidate carrying `expect.not: ["book_slot"]` would go GREEN on the very break it was promoted to
catch — the agent never says the literal string `book_slot`. A golden that passes for the wrong
reason is worse than no golden. `not_tools` is judged on the log, so the tool goes there.

**The tool comes from the log, not from the sentence.** The verdict's `evidence.seqs` name the
entries the judgment is about — for consent, the tool call and the confirmation that came too late
— and the candidate reads the `tool.call` among them and takes its `name`. Parsing the reason would
be reading a sentence the domain owns; the seqs are the contract (see the runtime's `docs/decisions/scoring.md`).

What the candidate still cannot carry is the ORDER: `not_tools` bans the tool outright, and the
rule is *not before the yes*. So the verb prints the ban under the path with the sentence that says
what it means — keep it only if this call must never call that tool at all — and the `state` and
`input` it wrote are what reproduce the situation for the day the gate returns.

**It lands in `test/candidates/`, not in `test/goldens/`.** `pinecall test` reads the goldens
directory, and a file this verb wrote has not been read by anybody yet. `--out test/goldens` puts
it there when that is what somebody means. Either way it carries `promoted_from: <call-id>`, which
is provenance and nothing else — it is on the runner's `Golden` model only so that a candidate
moved into the goldens directory runs instead of being refused by `extra="forbid"` for saying where
it came from.

## `runs drift` — a held-rate over two windows, and the nightly's second gate

`pinecall runs drift --agent <slug> [--window 7d] [--baseline 30d] [--threshold 10]` reads the
agent's calls (`GET /v1/agents/{slug}/sessions`), splits them into two **disjoint** windows — the
last 7 days, and the 23 days before that — and prints each judge's held-rate in each and the points
between. A baseline that contained the window would dilute the very drop this verb exists to name,
so a baseline no longer than the window is refused.

**Nothing here is a new metric.** A held-rate is a count over the verdicts `call.score` already
carries: held over held-plus-broken. A `deferred` or a `skipped` verdict is a question nobody
answered and is in neither half of that fraction — counting it as a failure would read as a judge
that looked and disliked what it saw. A call whose `passed` is absent is excluded from both windows
and counted apart, printed as `n not judged`.

**A judge one of the windows never settled has no delta.** Silence is not a drop: the row prints
`—` and the exit code hears nothing from it. This is what makes the verb safe to run on a gateway
with no history, which is the first night of any deployment.

The verdict is the exit code: a judge that fell further than `--threshold` points exits 1. Reading
one call's verdict is one narrow page — the cursor sits one seq below the terminal entry and the
filter names `call.score` — so a drift over two hundred calls is two hundred one-entry reads.

**In the nightly** the step runs after the matrix with `if: always()`, because a matrix that went
red must not hide a judge that has been sliding for a week; the night fails on either and the
summary says which. On the job's throwaway Postgres both windows come out of tonight, so the
baseline settles nothing and the step holds by construction — it bites the day `PINECALL_URL`
points at a gateway that keeps its log. The gate itself was proved against a hand-built gateway,
the step extracted verbatim: 4 of 10 broken against a baseline of 0 of 10 exits 1 and names
`CA_w0`, `CA_w1`, `CA_w2` with the seq each verdict cites; 0 of 10 exits 0.
