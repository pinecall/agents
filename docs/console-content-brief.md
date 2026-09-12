# The console, screen by screen — what each one says, and every value it can say it with

Read off `agents/src/cli/ui/console/`, `runtime/src/pinecall/gateway/` and `protocol/schema/` on 2026-09-12 (the split repos under `~/pinecall-v2`). This is a **content** inventory for a
redesign: what each screen must be able to state, which door the fact comes from, and the values a
field can actually take. It says nothing about layout, hierarchy or visual direction — those are the
redesign's to decide.

## 0. The frame every screen hangs in

Eleven screens, one shell, one router (`agents/src/cli/ui/console/router.tsx`). React 19 + react-router, no state of
its own: **the URL is the state**, so a reload lands on exactly the same thing, and no screen keeps a
selection in memory.

| URL | screen |
|---|---|
| `/` | Agents — the fleet's list |
| `/keys` | Keys — the provider accounts this org brought |
| `/a/:agent/talk` | Talk |
| `/a/:agent/chat[/:call]` | Chat — the class talked to in writing |
| `/a/:agent/calls` | Calls, watching every live call at once |
| `/a/:agent/calls/:call` | Calls, watching that one |
| `/a/:agent/sessions` | Sessions — the finished ones |
| `/a/:agent/sessions/:call` | One session, read whole (deep-linkable to a line: `#seq-93`) |
| `/a/:agent/pipeline` | Pipeline |
| `/a/:agent/knowledge` | Knowledge |
| `/a/:agent/memory` | Memory |
| `/a/:agent/evals?view=runs\|calls\|drift&run=<id>` | Evals |

The shell carries, on every screen:

- a brand mark and the two words `pinecall` / `console`;
- a breadcrumb, built from the path: `fleet / <agent> / <screen>`, last segment emphasised;
- **whose gateway this is**: the org, key id and label off `GET /v1/whoami` — never the key;
- one switch: a light/dark toggle that lives as long as the tab;
- a rail with two groups — the agent's eight screens (Talk, Chat, Calls, Sessions, Pipeline, Knowledge, Memory, Evals), under
  the agent's slug; and `Gateway` with `Agents` and `Keys` in it — plus a fixed foot: `web · whatsapp · phone` /
  `one agent, three doors`;
- when a screen has nothing to show it says so **in a sentence, never a spinner** (`shell/nothing.tsx`).

Data reaches it through the gateway's doors, one stream shape, and — today — a second server: the
CLI's own (`/ui/*`), which answers for whatever needs the agent's **directory** (its goldens,
personas, `knowledge/docs`, `test/memory`). That second server is the thing the move to the gateway
has to replace (see the plan). Gateway doors:

| door | who reads it |
|---|---|
| `GET /v1/agents` | Agents |
| `GET /v1/agents/{slug}/sessions` | Calls list (re-asked every 3 s), Sessions, Evals ▸ calls |
| `GET /v1/calls/{call}/events` (SSE) | Talk, Calls, Sessions ▸ one |
| `GET /v1/calls/{call}/recording` (byte ranges) | the audio player |
| `GET /v1/agents/{slug}/config` | the state panel's visibility declarations |
| `GET /v1/agents/{slug}/pipeline` · `PUT …/pipeline/overrides` | Pipeline |
| `GET /v1/evals/runs?agent=&limit=200` | Evals |
| `POST /v1/tokens` · `POST /v1/calls/{call}/listen` · `POST /v1/calls/{call}/supervise` | Talk, listen, the desk |
| `POST /v1/calls/{call}/verbs` | the desk's six verbs |
| `GET /v1/whoami` | the header |
| `GET/PUT/DELETE /v1/provider-keys[/{vendor}]` | Keys |
| `GET /v1/knowledge` · `DELETE /v1/knowledge/{base}` | Knowledge (push and golden go through the CLI's server) |
| `GET/DELETE /v1/contacts/{contact}/memory` | Memory |
| `POST /v1/evals/replay/{call}` | Sessions ▸ one: re-check a call by code |

The CLI's own doors, `/ui/*`: `chat` (roster, start, say, end) · `personas` + `simulate` · `goldens` + the
suite run · `knowledge` (roster, push, eval) · `memory` (roster, recall eval, extraction) · `candidates` +
`promote` · `drift` · `reproductions`.

The stream has four honest states and never guesses: `connecting · live · reconnecting · ended`. It
paints at most ten times a second; a burst of interim transcripts inside one turn is one repaint.
Reconnection resumes on the browser's own `Last-Event-ID`, so a gap is a fact the log carries
(`log.gap`), not a hole the page invents.

## 1. The vocabulary — values shared by more than one screen

Straight out of `protocol/schema/defs.json` and `state.json`. Every one of these can appear on
screen, and each has a default reading when it is not known yet (`null` → `—`).

| what | values |
|---|---|
| channel | `phone` · `web` · `whatsapp` (null until known) |
| direction | `inbound` · `outbound` |
| call status | `idle` · `ringing` · `dialing` · `active` · `ended` |
| end reason | `caller_hung_up` · `agent_hung_up` · `supervisor_ended` · `transferred` · `no_answer` · `busy` · `dial_failed` · `timeout` · `drained` (the platform took the worker down mid-call) · `app_detached` (the app's socket closed mid-call) · `error` |
| ended by | `caller` · `agent` · `supervisor` · `platform` |
| agent state | `initializing` · `idle` · `listening` · `thinking` · `speaking` |
| user state | `listening` · `speaking` · `away` |
| participant kind | `caller` · `agent` · `supervisor` · `listener` · `sip` |
| tool run status | `running` · `done` · `failed` |
| confirm status | `pending` · `granted` · `declined` (reason: `no` · `timeout` · `changed` · `cancelled`) |
| transfer mode / status / by | `cold` · `warm` / `requested` · `done` · `failed` / `agent` · `supervisor` |
| judge verdict (a finished call) | `held` · `broken` · `deferred` (asked, could not settle) · `skipped` (nobody asked: no model inside the budget) |
| eval run status | `running` · `done` · `failed` — the RUN failing, never a golden failing |
| state field visibility | `public` · `tenant` (the default for anything undeclared) · `pii` |
| a masked value | the literal `***`, everywhere on the platform. The console recognises it and never unmasks |
| event source | `app` (the tenant's backend) · `participant` (a browser's DataChannel) |
| metrics blocks | `llm` · `stt` · `tts` · `vad` · `eou` · `eot` · `interruption` · `realtime` · `avatar` |
| the five latencies, in the order a turn happens | `transcription_delay` · `end_of_turn_delay` · `llm_node_ttft` · `tts_node_ttfb` · `e2e_latency` |
| money | euros, four decimals — a whole call costs less than a cent, and `0.00 €` is a lie |
| time | unix seconds; a live call's timer is `m:ss`, a finished one's duration is `1m 04s` |
| seq | an integer per call, monotonic, written before control returns. Every row of every log view is addressable by it |

## 2. Agents — `/`

The front page: which agents this gateway is holding right now, so the console offers a list and not
a URL shape.

- **Per row:** the agent's slug; the channels it answers on, sorted (`phone · web · whatsapp`). Nothing else exists on this door.
- **Empty:** "No app is holding an agent on this gateway right now" — and the command that changes that: `pinecall run` in the app's directory.
- **Refused:** the gateway's own sentence, verbatim.
- Read once, not polled: the list changes when a socket connects.

## 3. Talk — `/a/:agent/talk`

A person reaches the agent from this tab, with this machine's microphone, and reads the call
underneath as the log carries it.

- **The door:** one button. `Talk` → `joining…` (disabled) → `Hang up`; after the call, `Talk again`.
- **Phase, and the sentence each one gets** (`idle · connecting · live · ended · failed`):
  `not connected` · `joining the room…` · `on the call · speak` · `hung up` · `the room did not open`.
  The empty transcript carries the same five as a hint: *press Talk: the browser asks for the microphone, and the agent answers* / *listening — say something* / *the call ended* / …
- **The call id**, once there is one.
- **The transcript**, drawn word by word as the voice says it: a line per speaker, interim lines grey with a cursor, final lines solid, and a word already on screen never re-animates. Between the lines, the supervisor's marks (below) as single sentences.
- **The whole call underneath**: the same Live panel the Calls screen draws (§4.2), because it is the same log.
- **Errors:** whatever refused, in its own words.

## 4. Calls — `/a/:agent/calls[/:call]`

The floor: this agent's calls on the left, and the ones being watched beside them. No call in the
path watches **every live call at once**; a call in the path watches that one alone.

### 4.0 Simulate (above the list)

A synthetic caller put on this agent from the page — `pinecall simulate` with the same defaults. Persona
(one file per caller in `test/personas`, with its goal shown), `voice` (a real line, and the listen button
beside it), `judge at hang-up`, turns (1–30, default 6); on a spoken line, `noisy line` with noise in dB
under (0–60, default 15) and packets lost % (0–100, default 0). The call opens in Calls by its id. Needs the
agent's directory: without it the form says whose directory this console runs in.

### 4.1 The list (left)

Re-asked every 3 s. Two groups, `Live` first, then `Recent`; a group with nothing in it is not drawn.

Per line: the channel as one mark (`phone ☎` · `web ◍` · `whatsapp ✉` · unknown `–`); **who is on** —
the contact's name when the platform recognised the caller, the number it came from when it did not,
the call id when neither; and **when** — a live call counts up `m:ss`, a call that is not live shows
its status word instead (`ringing`, `dialing`, `ended`). A standing line at the top says `live` or
what the door refused with. Empty: *No calls yet. The first one to reach this agent appears here as
it rings.*

### 4.2 One call being watched (the Live panel — also used by Talk)

**Head, in one strip:** the call id · `channel · direction · status` · `from → to` ·
`agent_state · user_state` · `seq N · <connection or error>` · the desk (§4.3).

**Recording:** when the call's summary points at audio, a player.

**Centre — the timeline.** Every row carries the seq it happened at and nothing invented. Seven row kinds:

| row | what it carries |
|---|---|
| turn | who spoke, the text, the speech id, up to five latency chips, `interrupted` on an agent turn, the language on a user turn, and every metrics block joined to it by `speech_id`, one expand away, field by field under livekit's own names |
| tool | `name(arg=value, …)`, the outcome or `…` while running, and one expand away: the arguments whole, the output whole, the error, the duration. Status colours the row: `running · done · failed` |
| state | which of the app's fields changed here, and what moved them: a tool's result or a fact from outside |
| confirm | the tool that needed a yes, what the agent read back, and how it went |
| event | a fact that arrived from outside the conversation: its name, its source (`app` / `participant`), its data |
| supervisor | one sentence: *supervisor whispered: …* / *supervisor made the agent say: …* / *supervisor took the line* / *supervisor handed the line back* / *supervisor transferred the call to …* / *supervisor ended the call: …*, and who made it |
| quiet | a stretch of entries nobody needs to read line by line, folded |

Under the rows, the words being said **right now** — the caller's and the agent's interim
transcripts, cleared the moment the turn they belong to is final.

**Four panels beside it:**

- **STATE** — the app's own declared fields, by name, sorted, with the value as the tenant projection left it and, per field, who may see it: `public` · `tenant` · `pii masked`. Empty: *The app has declared no state yet.*
- **ROOM** — the room name and sid, the number a phone call rang, and every participant: identity or display name, kind, whether the room reports them speaking right now, and livekit's attributes verbatim one expand away (for a phone call, that is where the SIP headers are). A text session has no room and says so.
- **PROMPT** — which blocks the app has written on this call, by name, each with its hash, its length and the seq it was written at — never its text (the text stays out of the log by design). Empty: *The app has written no block yet.*
- **METRICS** — first the medians (per measure: the seconds, and over how many turns), because they are the answer; then every raw block by kind with a count, expandable field by field, because they are the truth. Empty: *Nothing measured yet: the first turn fills this in.*

### 4.3 The desk — the supervisor's moves, in the head of the call being watched

Two seats, not one: **listen** mints a hidden, silent ear; the five verbs mint a seat that publishes a
microphone, and it is minted the first time the line is taken.

- **listen** has five states and a label for each: `listen` (off, or after a failure) · `joining…`
  (disabled) · in the room but muted → `hear it` + `stop` · hearing → `listening · mute` + `stop`.
  On a call that is over the button is disabled and says why: *the call is over: read its log, or
  play its recording.*
- **whisper / say** — one box, one toggle. `whisper` = the agent is told something the caller never
  hears; `say` = the agent says it to the caller, verbatim. The placeholder is whichever is armed.
- **take over / hand back** — the button says which is possible; `holding` is the one piece of state
  the desk keeps, because the log cannot tell it fast enough to keep a button honest.
- **transfer** — irreversible, so it never leaves on a stray click: the button becomes a field, the
  number is typed (E.164 or a SIP URI) and entered. Escape cancels.
- **end** — irreversible: `end` → `end · sure?` → sent.
- **A refusal is never rephrased.** The gateway's own sentence is what the strip shows (`409 the call
  has ended`, `ONLY_COLD`, `call.transfer: this call has no SIP leg…`).
- Nothing here draws the state of the call: what a verb did is the `supervisor.*` line in the timeline.

Empty state for the screen: *Nothing live right now. Open a call from the list to read it, or leave
this open — a call that arrives shows up here on its own.*

## 5. Sessions — `/a/:agent/sessions`

Every conversation this agent has had, newest first, phone calls included.

**The table, eight columns:** session (the call id, a link) · channel · from (name, else number, else
`—`) · started · duration · outcome (the agent's one line, e.g. *booked*, *no slot*, *wrong number*,
else the end reason) · score · cost.

**The score cell has four readings, and they are four different facts:**
`…` (nobody has read that call's log yet) · `—` (its log carries no verdict) · `not judged` (with the
reason: the judges are not installed on this box, or judging failed) · `passed` / `did not pass` with
`held/total`, and every judge's verdict in the tooltip.

Also: a box to **open a call by id** (a call older than the door's screenful is still readable), a
count line, and the note that these are the same rows `pinecall-runtime sessions list` prints.
Empty: *No session recorded yet* — the log is append-only and written during the call, so a session
appears the moment one ends, from the browser, from `pinecall chat`, or from the telephone.

### 5.1 One session — `/a/:agent/sessions/:call`

The order is an auditor's: what this call was, how fast it was, what it was allowed to do, what the
judges made of it, and only then the rows that prove all of it.

1. **Eleven facts:** agent · channel · from · started · duration · ended (the end reason, or `running`) · outcome · cost · score · turns · events.
2. **The recording**, when the summary points at one, with the path on the box that took the call.
3. **Latency across this call** — per measure: the median, the max, and `n=` how many turns carried it. When nothing was measured it says why: a chat session times nothing, and a voice call that dropped before its first answer has nothing to time.
4. **Consent proof**, when the call asked for any: per tool call, the join from the request to the grant or the decline, and to the tool call it authorised — seq to seq. Matched by `call_id`, so two bookings in one call each have their own.
5. **Score** — judge by judge: the judge's name (`consent`, `grounded`, `register`, `leakage`), its verdict, the question it was asked, the sentence it answered with, and the seqs it cites as evidence — each of them a link into the log below (`#seq-93`). A judge of the declared panel that answered nothing is drawn as such rather than as a pass. Plus what the opinions cost and how many model calls they took (zero is the happy path: a policy answers by code). No score at all: *ask for one with `pinecall eval <call>`.*
6. **Cost by model**, when the summary priced any: provider · model · unit · quantity · euros, plus the USD→EUR rate and its date, and any unpriced model named.
7. **What to do with it** — two moves on a call just read: re-check it by code (`POST /v1/evals/replay/{call}`, answers passed / did not pass with the judges' lines) or write it down as a golden candidate.
8. **The prompt, block by block** — when the log carries blocks: name, hash, length, seq.
9. **The log** — every entry in seq order, one row each, the metric fields one click under the turn they timed, an "expand all", and a count line: *N entries, append-only, numbered by seq. Live ≡ stored.*

Failure states: *That session did not load* with the gateway's sentence; and, while it is reading,
`reading <call>…` versus `no call <call> in the log`.

## 6. Evals — `/a/:agent/evals`

Two halves, both of ONE agent, both addressable in the URL so a regression is a link you can paste to
whoever wrote it.

**Runs** (`?view=runs`, `&run=<id>` opens one):

- **Run a suite from here**: tick the goldens (each shown as its first line and what it expects — the keys of `expect`, or *consent only*), pick the model or keep the one the class declared, `voice` for ring 2, and on a spoken line the same noisy-line knobs as Simulate. The run is opened by the process holding the agent's directory and scored by the gateway; it appears in the table the moment it opens. Without goldens: *No goldens in test/goldens: write one, and it appears here.*
- **The table:** run id · started · status (`running · done · failed`) · goldens · models · held (`held/total`, marked when not all held) · judge calls · **since the run before**.
- That last column is never an average: it names the judgments that changed hands — `broke: <golden>`, `held again: <golden>`, `±0`, or `first of its kind`.
- **One run opened:** run · started · finished · status (with its error, when it failed) · what changed since the run before; then the matrix, one row per judgment: golden · model · metric · score · held · **the judge's own sentence** · the call it opened (a link into that call's log). A run with no matrix says why: still opening its calls, or it failed before a judge answered.
- **Reproductions**: what a broken run left on disk — one file per golden that did not hold, opened from the run. A run with no folder is every green run.
- Empty: *No run has been stored yet* — one appears the moment it opens, from a laptop or from CI.

**Calls** (`?view=calls`): ring four — what the judges sealed each finished call with, within a minute
of the caller hanging up. Same score vocabulary as §5. Empty: *No call of this agent has finished yet.*

**Drift** (`?view=drift`): each judge's held-rate over two windows of finished calls — a week against a
month when nobody names one — as `percent (held/settled)`, the delta between them, and one threshold:
a drop past it is the one coloured number on the screen, because it means somebody does something
tonight. Empty: *No finished call of this agent carries a verdict in either window.*

## 7. Pipeline — `/a/:agent/pipeline`

The three legs of a voice turn as data, with this agent's overrides already applied — so the screen
cannot show a pipeline the next call will not run.

- **Providers, three panels:** `hears` / `decides` / `speaks`, each with its vendor, its model (or *the provider's default*), and the rows that matter to it — the ear's language; the prompt's three regions (`static · history · view`, in that order, never reordered) and where the tools come from; the voice by name and the aligned transcript. A leg that cannot run right now carries the reason, in the gateway's words.
- **Anatomy of a turn:** one bar per stage over the agent's recent calls, in seconds, in the order a turn happens, with the count of calls behind the medians. A stage nobody measured says so in words — never a zero-width bar, which reads as instant. The stages overlap in real time; they are laid out to show proportion, not to claim they sum.
- **Control — five knobs**, applied to the NEXT session, never to a call already running:
  `stt` (vendor/model, or a model alone to keep the vendor) · `llm` (same) · `voice` (a name from the list this build curates, never a pasted vendor id) · `tts_model` · `greeting` (spoken verbatim as the call opens — said, never generated).
  A field left empty **gives the knob back to the app**, and the placeholder says what the app declared for it, so an empty field never reads as a blank. Saving answers with the whole report, so the panels above are the gateway's answer and not a local guess. A refusal is the gateway's sentence (a model this build has no file for is a 422, in its own words), and the console hides nothing to prevent one.
- **What is turned right now**, listed apart from the form.
- While it is asking: *Asking the gateway what `<agent>` runs on…*

## 7b. Knowledge — `/a/:agent/knowledge`

What this agent answers from. *The folder is pushed whole and the base is replaced, never merged. A
golden is fixed and the index is the variable.*

- **This directory**: the path, how many markdown files, the base name (editable), `push the folder`; the golden beside it (`N questions`, or *no golden beside it*) and `run the golden`.
- **After a push**: `base · files · chunks · ms`.
- **After the golden**: base · embedder model · questions · `recall@k` · `nDCG@10` · ms, and every miss: the question, what it wanted, what came back first (or *nothing*). All found: *Every question found what it asked for.*
- **Every base this org has pushed**: base · chunks · embedder · pushed (day and minute) · `drop`. Empty: *No base pushed yet.*
- Needs the agent's directory for push and golden; the list and drop are the gateway's.

## 7c. Memory — `/a/:agent/memory`

What the agent keeps about one contact, the right to be forgotten, and the two goldens it is held to.

- **A contact** (a phone number, a customer id): `read` → every fact, its category, and *superseded <when>* on the ones a later fact replaced; `forget` → a confirm in place (*There is no undo*), then `forgotten: N`. Empty: *Memory keeps nothing about <contact>.*
- **Recall golden** (`memory/golden.json`): N questions, scored by code with no model, on a scratch contact — `model · recall@k · nDCG@10 · N missed`, and each miss as *asks → wanted …, got …*.
- **Extraction golden** (`test/memory`): one written call per case and one model call each — `model · held/cases · ms`, and each broken case with `check: detail`.
- Both goldens need the agent's directory.

## 7d. Chat — `/a/:agent/chat[/:call]`

The class talked to **in writing**, in the browser, on the call's own log — `pinecall chat` from a page,
so a breakpoint in a `@tool` is reachable in the terminal serving it.

- **Opening**: `as` (a phone number, a customer id — or nobody; it files the call under a contact so memory has a name) and `from` — the call's own opening, or **the state one of this directory's goldens declares** (a conversation opened part-way through). `start a chat` → the call id lands in the URL.
- **In the call**: the same Live panel as Calls, plus a composer — `say`, and `hang up` as a button, never a navigation: hanging up seals the log and runs the judges, and leaving the page would keep the socket open. After hang-up it lands on the session.
- Needs the agent's directory: without it, whose directory this console runs in.

## 7e. Keys — `/keys` (org level)

The provider accounts this org brought of its own; every vendor nobody brought runs on the box's key.

- **Bring one**: vendor (e.g. `elevenlabs`) + the key, `type=password`, sent once; the field empties the moment it left. **Nothing reads a key back** — not this page, not the CLI, not the log.
- **The list**: vendor names only, each with `give it back`. Empty: *No provider key brought: every call runs on the keys of the box.*

## 8. Doors that exist and have no screen

Everything below is already an authenticated door of the same gateway; nothing on it is drawn today.
They are the honest candidates for a console that grows:

- **Numbers / routes** — `GET /v1/routes`, and on the operator API `GET/POST /ops/routes`, `DELETE /ops/routes/{number}`: which number reaches which agent.
- **Orgs, keys, quotas, usage** — `/ops/orgs`, `/ops/orgs/{org}/keys`, `POST /ops/keys/{fingerprint}/revoke`, `PUT /ops/orgs/{org}/quotas` (`minutes · messages · agents · concurrent_calls · memory_facts · knowledge_chunks`), `GET /ops/usage`.
- **Provider keys** — `GET/PUT/DELETE /ops/orgs/{org}/provider-keys/{vendor}`, and per agent `GET /v1/agents/{slug}/provider-keys`: managed vs BYOK, never the value.
- **Whoami** — `GET /v1/whoami`: the org, the key id, the label.
- **The agent's own declaration** — `GET /v1/agents/{slug}/config`: the tools it declares, their stages (`read · write · irreversible`), the state fields and their visibility, the events it accepts. Only the visibility half is read today.
- **Fleet and callbacks** — `GET /v1/fleet/standing`, `GET/POST /v1/callbacks` (the numbers people left when every seat was taken), events `fleet.full` and `callback.requested`; `/{worker}/cordon`.
- **Routes** — `GET /v1/routes` on the tenant side too.
- **In the log, unread by any panel** — `memory.ops` (`recall · remember · forget`) and `docs.sources` (`retrieved · tool`).

## 9. What a redesign must keep true

Not a style rule among them — each is pinned by a test or by a decision doc.

1. **The page holds no key and stores nothing.** `console/test/the-key-is-never-in-the-page.test.ts`. Whatever serves the console signs the requests in front of it.
2. **The URL is the state.** No selection in memory; a reload lands on the same thing; `?run=` and `#seq-` are links people paste.
3. **The console holds no truth of its own.** No reducer, no wire type: both come from `@pinecall/protocol`, the same reducer the runtime folds a log with in Python.
4. **A refusal is shown in the gateway's own words**, never rephrased, never swallowed.
5. **Nothing is invented.** A value that is not known is `—`, not a zero; a stage nobody measured says so; a judge that did not answer is not a pass.
6. **A screen's class carries the thing it belongs to** — one stylesheet per screen, no class defined twice: `console/test/one-stylesheet-one-class.test.ts` fails the build otherwise.
7. **The desk sends one verb per move** (`console/test/the-desk-sends-one-verb.test.ts`), and **a supervisor's move reads as one line** wherever the log is drawn (`a-supervisor-reads-as-one-line.test.ts`).
8. **Empty is a sentence, never a spinner.**
9. Two irreversible verbs (transfer, end) never leave on a single click.
