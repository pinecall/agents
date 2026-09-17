# The console, screen by screen — what each one says, and every value it can say it with

Read off `agents/src/cli/ui/console/`, `runtime/src/pinecall/gateway/` and `protocol/schema/` on 2026-09-12, and brought up to date with the header, the rail, the Widget, Numbers and Chat screens on 2026-09-17 (the split repos under `~/pinecall-v2`). This is a **content** inventory for a
redesign: what each screen must be able to state, which door the fact comes from, and the values a
field can actually take. It says nothing about layout, hierarchy or visual direction — those are the
redesign's to decide.

## 0. The frame every screen hangs in

Seventeen screens behind the rail, one shell, one router (`agents/src/cli/ui/console/router.tsx`) — plus the
widget's blank preview, the `/cli` card and the two cards shown with no key. React 19 + react-router: **the URL is
the state** of what is on screen, so a reload lands on exactly the same thing, and no screen keeps a selection in
memory. What the browser keeps is who is signed in and where they are looking (below).

| URL | screen |
|---|---|
| `/` | Overview (the rail's word; the page is titled Agents) — the org's list, in this world. In the sandbox an admin sees every member's corner, whose each is, and a filter over the three |
| `/live` | Live — every call up on the floor, whichever agent has it |
| `/sessions` | Sessions — every agent's finished calls, one table, each naming its agent |
| `/numbers` | Numbers — the numbers people call and which agent picks up, in the world on screen; testing by phone; one more imported or bought; the carrier last |
| `/keys` | Keys — the API keys this org's machines run on |
| `/providers` | Providers — the vendor accounts this org brought |
| `/team` | Team — the org's people, invited and changed |
| `/usage` | Usage — what the org consumed, totals then rows |
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
| `/a/:agent/widget` | Widget — the tag a site embeds for this agent, its look, and a live preview |
| `/a/:agent/widget/preview?name=&company=&tagline=&phone=&accent=` | a blank page with nothing but the widget on it, outside the shell |
| `/cli?c=<word>` | the card a person opens from `pinecall login` to sign that terminal in |
| `/invitations/<token>` | with no key: the card where an invited person chooses a password |

A slug in the path that the gateway does not list for this org and world draws no agent screens: the shell says
*no agent called <slug> is held here — this org, in this world*, and names the org, the toggle and `pinecall run`.

**Signing in.** With no key the console is one card: email, password, the org only when the person belongs to
several (*the oldest of yours when left empty*), and the world — `sandbox` · `production`, the sandbox unless this
browser last looked at production. A `?login=<code>` that `pinecall run` printed skips the card and opens the world
that process's key was in. The keys are kept by the **browser** (`localStorage`, one per world, in one file:
`lib/session-key.ts`), so a second tab is the same person; the world last looked at is kept for the tab and for the
browser, so a new tab opens where the last one was. Signing out forgets every world's key.

The shell carries, on every screen:

- a brand mark and the two words `pinecall` / `console`;
- a breadcrumb, built from the path: `fleet / <agent> / <screen>`, last segment emphasised;
- **one Viewing control** (`shell/viewing.tsx`) — the header's single answer to *what am I looking at*. Its trigger
  reads the agent (or *choose an agent*), whose copy it is (`<person> · you`, a teammate's name, `<org> · deployed
  on the box`, or *not running*), the world, and the person's initials. Its panel holds:
  - **the person**: name, org and key id off `GET /v1/whoami` — never the key;
  - when an admin opened a teammate's copy, *Looking at <name>'s copy* and **back to yours**;
  - **the org switch**, for a person in two orgs or more: the orgs off `GET /v1/login/orgs`; picking one mints the
    same person's key there (`POST /v1/login/org`), replaces every key the browser held and reopens the console
    at its root. A person of one org, and a machine key, see nothing here;
  - **the world toggle** `production` · `sandbox`: a key kept for the other world, or one minted for the same person
    (`POST /v1/login/env`); a machine key's refusal is shown beside it, verbatim;
  - **every agent** the gateway holds in this org and world (`GET /v1/agents`, re-read when the panel opens), its
    channels, and under it **each copy**: the reader's own (*open*), the org's — in production the one *deployed on
    the box*, the only copy there is — and a teammate's. A teammate's copy is *theirs* and disabled, except to a key
    that opens `team` in the sandbox, which opens it: from then on every request the page makes carries the header
    `pinecall-corner: <member id>` (`shared/api.ts`, `headersFor`), kept for that tab alone
    (`keptCorner`), and the gateway answers each door in that member's corner. Picking another agent keeps the
    screen when it is one every agent has, and drops a call id;
  - with nothing held: *Nothing is running here. `pinecall run` in an agent's folder puts it on this list.*
- **sign out**, and a light/dark toggle;
- a rail (`shell/rail.tsx`) with two groups. **GATEWAY**: Overview, Live, Sessions, Numbers, Keys, Providers, Team,
  Usage; Overview carries the count of agents held. **AGENTS**: one row per agent the gateway holds (one per slug,
  however many copies), and the agent on screen stands open with its nine screens indented under it — Talk, Chat,
  Calls, Sessions, Pipeline, Knowledge, Memory, Evals, Widget. With none: *none held here*. Every screen is drawn
  only when the key's `scopes` open it (`lib/scopes.ts`: Talk, Chat and Widget need `talk`; Overview, Live, Calls
  and both Sessions `calls`; the rest their own name), so no click meets a 403 — plus a fixed foot:
  `web · whatsapp · phone` / `one agent, three doors`;
- when a screen has nothing to show it says so **in a sentence, never a spinner** (`shared/frame.tsx`, `Nothing`).

Data reaches it through the gateway's doors and one stream shape. What needs the agent's **directory** — its
goldens, personas, knowledge folder, memory goldens, a chat with the class — is asked of the gateway too, at
`POST /v1/agents/{slug}/dev/{family}/{verb}`, and the gateway relays it to the `pinecall run` holding the agent
(the runtime's `docs/protocol/dev-verbs.md`). Gateway doors:

| door | who reads it |
|---|---|
| `POST /v1/login` · `POST /v1/invitations/{token}` | the sign-in card, the invitation card |
| `GET /v1/login/orgs` · `POST /v1/login/org` · `POST /v1/login/env` | the Viewing panel: the org switch, the world toggle |
| `GET /v1/agents` | Overview, the Viewing panel, the rail |
| `GET /v1/agents/{slug}/sessions` | Calls list (re-asked every 3 s), Sessions, Evals ▸ calls — the corner's own |
| `GET /v1/calls/{call}/events` (SSE) | Talk, Calls, Chat, Sessions ▸ one |
| `GET /v1/calls/{call}/recording` (byte ranges) | the audio player |
| `GET /v1/agents/{slug}/config` | the state panel's visibility declarations |
| `GET /v1/agents/{slug}/pipeline` · `PUT …/pipeline/overrides` | Pipeline |
| `GET /v1/evals/runs?agent=&limit=200` | Evals |
| `POST /v1/tokens` · `POST /v1/calls/{call}/listen` · `POST /v1/calls/{call}/supervise` | Talk, the Widget preview, listen, the desk |
| `POST /v1/calls/{call}/verbs` | the desk's six verbs |
| `GET /v1/whoami` | the Viewing control, the rail's scopes |
| `GET/POST /v1/keys`, `POST /v1/keys/{fingerprint}/revoke` | Keys |
| `GET /v1/providers` · `GET/PUT/DELETE /v1/provider-keys[/{vendor}]` | Providers |
| `GET /v1/knowledge` · `DELETE /v1/knowledge/{base}` | Knowledge (push and golden go through `pinecall run`) |
| `GET/DELETE /v1/contacts/{contact}/memory` | Memory |
| `POST /v1/evals/replay/{call}` | Sessions ▸ one: re-check a call by code |
| `GET /v1/numbers` · `POST /v1/numbers[/buy]?dry_run=` · `DELETE /v1/numbers/{number}` · `GET /v1/numbers/available` · `GET/PUT/DELETE /v1/carrier` | Numbers |
| `GET /v1/sessions` · `GET /v1/events` · `GET/POST /v1/members`, `PATCH /v1/members/{id}` · `GET /v1/usage` | Live, Sessions, Team, Usage |
| `GET/POST /v1/login/pairings/{code}` | the `/cli` card |

The directory's verbs, through `pinecall run`: `chat` (roster, start, say, end) · `personas` + `simulate` ·
`goldens` + the suite run · `knowledge` (roster, push, eval) · `memory` (roster, recall eval, extraction) ·
`candidates` + `promote` · `drift` · `reproductions`.

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

## 2. Overview — `/`

The front page, titled Agents: which agents this gateway is holding right now, so the console offers a list and
not a URL shape. A row opens that agent's Calls.

- **Per row:** the agent's slug; the channels it answers on, sorted (`phone · web · whatsapp`); and, for a key the gateway answers with more than its own corner (an admin's, the operator's), **whose** copy it is — a member's name, or *the org's* — with a filter over *everything* · *mine* · *the team's*. Nothing else exists on this door.
- **Empty:** "No app is holding an agent on this gateway right now" — and the command that changes that: `pinecall run` in the app's directory. A filter that leaves nothing: *Nothing here is mine* / *the team's*.
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
`pinecall run` holding the agent, in the agent's directory (`test/personas`, or `test/personas/<name>/` in a
project of several): without a class there the form says so, and a process in another agent's directory is named.

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

Every conversation this agent has had, newest first, phone calls included — in the corner on screen. The door
answers per corner: in the sandbox a developer sees only their own copy's calls, and an admin who opened a
teammate's copy sees that copy's; production's calls are production's, and never mixed into the sandbox list.

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

- **Run a suite from here**: tick the goldens (each shown as its first line and what it expects — the keys of `expect`, or *consent only*), pick the model or keep the one the class declared, `voice` for ring 2, and on a spoken line the same noisy-line knobs as Simulate. The run is opened by the process holding the agent's directory and scored by the gateway; it appears in the table the moment it opens. Without goldens — none written, or no goldens folder at all, which is the same answer and not an error: *No goldens in test/goldens: write one, and it appears here.*
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
- **Recall golden** (`memory/golden.json`, or `memory/<name>.golden.json` in a project of several): N questions, scored by code with no model, on a scratch contact — `model · recall@k · nDCG@10 · N missed`, and each miss as *asks → wanted …, got …*.
- **Extraction golden** (`test/memory`, or `test/memory/<name>/`): one written call per case and one model call each — `model · held/cases · ms`, and each broken case with `check: detail`.
- Both goldens need the agent's directory.

## 7d. Chat — `/a/:agent/chat[/:call]`

The class talked to **in writing**, in the browser, on the call's own log — `pinecall chat` from a page,
so a breakpoint in a `@tool` is reachable in the terminal serving it.

- **Opening**: `as` (a phone number, a customer id — or nobody; it files the call under a contact so memory has a name) and `from` — the call's own opening, or **the state one of this directory's goldens declares** (a conversation opened part-way through). `start a chat` → the call id lands in the URL.
- **In the call**: the turns as bubbles — yours on the right (`you`), the agent's on the left (`agent`), a tool the model called between them as its name, a dot for `running · done · failed` and its outcome — read from the call's own log (the same rows `screens/live/timeline-rows.ts` builds), with the whole call (panels, desk) one link away on Calls (*the whole call, row by row*); plus a composer — `say`, and `hang up` as a button, never a navigation: hanging up seals the log and runs the judges, and leaving the page would keep the socket open. After hang-up it lands on the session.
- **A reply streams** (`screens/chat/streaming.ts`). A written call logs every model delta as its own `agent.transcript`, a piece of a word; the chat adds them up per `speech_id` and reveals the text toward that sum on `requestAnimationFrame` — at least a character a frame, and a share of what is still hidden, so a burst catches up in a few hundred milliseconds and a slow reply reads at the speed it arrives. A reply that reached `turn.agent` is settled and its own text wins, carrying on from the character the stream reached rather than drawing again. A caret stands at the end while it is still coming. A call opened after the fact draws every reply whole.
- **A line you send is on screen at once**, greyed as pending, until the log's `turn.user` with that text confirms it; a refusal takes it back and puts the words in the box again, with the gateway's sentence. While the agent is thinking and nothing has streamed yet, three typing dots stand in its column.
- Needs the `pinecall run` holding the agent, in its directory: without a class there, *No agent class in the directory the agent's `pinecall run` runs in*; a process in another agent's directory is named.

## 7e. Keys — `/keys` (org level)

The API keys this org's machines run on. A key a person holds by being logged in does not hold an
agent in production — the process on the box does — so the key that answers the org's numbers is
issued here.

- **Issue one for a machine**: a label (`prod server`) and a world; it holds the app socket and nothing else, and names nobody. The key comes back **once**, in a card that says so, and is kept by nothing.
- **The list**: label · world · whose (`a machine` when nobody) · scopes, each live row with `revoke`; a revoked row stays, dimmed, because the calls it wrote name it. Empty: *No key of this org yet: the first one is what a deploy runs on.*

## 7e′. Providers — `/providers` (org level)

The vendor accounts this org brought of its own; every vendor nobody brought runs on the box's key.

- **Bring one**: vendor (e.g. `elevenlabs`) + the key, `type=password`, sent once; the field empties the moment it left. **Nothing reads a key back** — not this page, not the CLI, not the log.
- **The list**: vendor names only, each with `give it back`. Empty: *No provider key brought: every call runs on the keys of the box.*

## 7f. The org's layer — `/live`, `/sessions`, `/numbers`, `/team`, `/usage`

Before anybody picks an agent. **Live**: every call still going across the org (`GET /v1/sessions`
filtered to `live`, re-asked on a clock and the moment `GET /v1/events` says the floor changed), a row per
call — channel mark, agent, who, status, id — linking into that agent's Calls. Empty: *Nothing live right
now. Leave this open — a call that reaches any agent shows up here as it rings.* **Sessions**: the very
table §5 draws, plus an `agent` column, off `GET /v1/sessions`. **Numbers** (`screens/numbers/`), in plain
words and in the order a person asks, titled *Phone numbers* — *The numbers people call, and which agent picks
up. You are looking at <world>.*:

1. **Numbers in <world>** — one card per number that rings in this world (`GET /v1/numbers`): the number as
   people dial it (a US number reads `+1 (417) 674-3169`), `→` the agent that answers, the world, `bought` when
   the box bought it, and `remove` on a row an operator made (*The number stops ringing this agent. It stays in
   your carrier account.*). Empty: *No phone number rings in <world> yet.* The agents answering on the web with
   no number are one line under the cards.
2. **Testing by phone** — in the sandbox only: *You do not need a sandbox number. Tell Pinecall which mobile is
   yours, keep `pinecall run` going, and call a production number from it: your copy answers. Everybody else
   who calls still reaches production.*, the two commands (`pinecall line from +1XXXXXXXXXX`, `pinecall run`),
   and production's number cards, read with the production key this browser holds — or, when it holds none,
   *Switch to production (top right) to see the numbers you can call.*
3. **Add a number to <world>** — two tabs, *Use one I already have* (a `<select>` of the carrier's numbers not
   imported yet, off `GET /v1/numbers/available`, with how many are free, or a typed E.164; disabled until a
   carrier is connected) and *Buy a new one* (country, area code, on the box's own account), each with the
   agent that answers. The first button is always **Review** (`?dry_run=true`): *Nothing changes yet* / *Nothing
   is bought yet*, then *This is what will happen … Nothing is deleted.* with the gateway's steps drawn verbatim,
   the first word of each as its kind, before **Confirm** / **Buy it and connect it** sends the same request
   for real. Done: *<number> now rings <agent> in <world>*, and the steps taken.
4. **Phone carrier**, last — standing: the kind, *Twilio account connected* or *SIP peer connected*, the
   account, `change` · `disconnect` (off `GET /v1/carrier`, never a secret); or *Connect your phone carrier*:
   Twilio (account SID, API key SID or the account SID again, secret) or SIP peer (username, password, the
   networks its calls come from as CIDRs), with what happens to the credentials said under the button.

A refusal is one line at the head, in the gateway's words. **Team**: every member (name, email, role,
agents, status) off `GET /v1/members`; an invite form (`POST /v1/members`) whose answer's token is shown
ONCE with the sentence that it is never shown again; role and agents edited in place, and one move on the
standing — disable, or bring back — never `active` by hand (`PATCH /v1/members/{id}`). **Usage**: the totals
(calls, minutes, messages, tokens in and out, characters, judge calls, cost) then every metered row with its
call linked, off `GET /v1/usage`, in the runtime's own field names; empty: *Nothing metered yet: the first
call to end writes the first row.*

## 7g. Widget — `/a/:agent/widget`

The button a site embeds for this agent: *One button on any page: the phone number with the call's live log, a
voice call from the browser, and a chat. This gateway serves the script; the site adds two endpoints of its own
that mint the visit token and relay the log with the org's key.*

- **1 · The tag** — the snippet to paste, with the gateway as the CDN: `<script type="module"
  src="https://<gateway>/widget/pinecall-widget.js">` and `<pinecall-widget agent= name= company= tagline= phone=
  token-url="/pinecall/token" log-url="/pinecall/log">`, plus a `<style>` line setting `--pc-accent` when the
  accent is not the first. Under it, what the site's two endpoints do: `token-url` posts `{agent, scope}` to
  `/v1/tokens` with a key holding `talk`; `log-url` relays the sessions list and a call's events with a key holding
  `calls`; ready-made PHP and Laravel endpoints at `github.com/pinecall/widget`.
- **2 · The look** — `name` (default *Assistant*), `company`, `tagline`, `phone` (*shows Call us*), and five
  accents to pick from. The note says every colour, the radius, the font and the offset are custom properties on
  the tag (`--pc-accent`, `--pc-radius`, `--pc-font`…), the button and the panel are parts (`::part(button)`), and
  the font is the page's own.
- **3 · On a blank page** — *Open the preview ↗*: `/a/:agent/widget/preview` in a new tab, the same attributes in
  the query, the button bottom-right on an empty page, the way a site has it.
- **The live preview**, beside the column (*preview · minting with this console's key*): the very file the snippet
  loads, imported from this gateway and mounted inline (`position="inline"`); every field redraws it. It mints
  its tokens through a `tokenProvider` that posts to `POST /v1/tokens` with the console's key (sixty seconds,
  labelled as the console preview) instead of a site's endpoint. A script that did not load says so, with the URL.

## 8. Doors that exist and have no screen

Everything below is already an authenticated door of the same gateway; nothing on it is drawn today.
They are the honest candidates for a console that grows:

- **The operator's tables** — `/ops/orgs`, `/ops/orgs/{org}/keys`, `POST /ops/keys/{fingerprint}/revoke`, `PUT /ops/orgs/{org}/quotas` (`minutes · messages · agents · concurrent_calls · memory_facts · knowledge_chunks`), `GET /ops/usage`, `GET/POST /ops/routes`: the box's key, never a tenant's.
- **Provider keys** — `GET/PUT/DELETE /ops/orgs/{org}/provider-keys/{vendor}`, and per agent `GET /v1/agents/{slug}/provider-keys`: managed vs BYOK, never the value.
- **The agent's own declaration** — `GET /v1/agents/{slug}/config`: the tools it declares, their stages (`read · write · irreversible`), the state fields and their visibility, the events it accepts. Only the visibility half is read today.
- **Fleet and callbacks** — `GET /v1/fleet/standing`, `GET/POST /v1/callbacks` (the numbers people left when every seat was taken), events `fleet.full` and `callback.requested`; `/{worker}/cordon`.
- **Routes** — `GET /v1/routes` on the tenant side too.
- **In the log, unread by any panel** — `memory.ops` (`recall · remember · forget`) and `docs.sources` (`retrieved · tool`).

## 9. What a redesign must keep true

Not a style rule among them — each is pinned by a test or by a decision doc.

1. **The page holds a person's key and never the org's, and one file touches the browser's storage.** `lib/session-key.ts` keeps one key per world, the world last looked at and the corner an admin opened; `test/cli/ui/pages/the-key-is-never-in-the-page.test.ts` fails the build if any other file reaches `localStorage` or `sessionStorage`. The key rides a header, never a URL.
2. **The URL is the state** of what is on screen. No selection in memory; a reload lands on the same thing; `?run=` and `#seq-` are links people paste.
3. **The console holds no truth of its own.** No reducer, no wire type: both come from `@pinecall/protocol`, the same reducer the runtime folds a log with in Python.
4. **A refusal is shown in the gateway's own words**, never rephrased, never swallowed.
5. **Nothing is invented.** A value that is not known is `—`, not a zero; a stage nobody measured says so; a judge that did not answer is not a pass.
6. **A screen's class carries the thing it belongs to** — one stylesheet per screen, no class defined twice: `test/cli/ui/pages/one-stylesheet-one-class.test.ts` fails the build otherwise.
7. **The desk sends one verb per move** (`test/cli/ui/console/the-desk-sends-one-verb.test.ts`), and **a supervisor's move reads as one line** wherever the log is drawn (`a-supervisor-reads-as-one-line.test.ts`).
8. **Empty is a sentence, never a spinner.**
9. Two irreversible verbs (transfer, end) never leave on a single click.
