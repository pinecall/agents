# The console, screen by screen — what each one says, and every value it can say it with

Read off `agents/src/cli/ui/console/`, the runtime's `docs/protocol/` and `protocol/schema/` on
2026-09-17, after the redesign (the split repos under `~/pinecall-v2`). This is a **content**
inventory: what each screen states, which door the fact comes from, and the values a field can
actually take. How it looks is `ui/tokens.css` and `ui/ui.css`; this page is what it says.

## Two consoles, one bundle

The same page is served in two places, and it is a different product in each:

| | the gateway's — **hosted** | a developer's machine — **local** (`pinecall serve`, `http://localhost:4100`) |
|---|---|---|
| looks at | production, and only production | the sandbox: the reader's own corner |
| who uses it | whoever runs the org: the owner, a supervisor, qa | whoever writes the agent |
| signing in | email and password; a key kept by the browser | none: the sidecar signs what the page asks, the page holds no key, and there is no sign out |
| sidebar ▸ Gateway (local: *Sandbox*) | Home `/`, Overview `/overview`, Live, Sessions, Usage | Home, Overview, Live, Sessions |
| sidebar ▸ Settings | Numbers, Keys, Providers, Team | Phone testing |
| outside the sidebar | `/cli` | — |
| an agent's tabs | Talk, Chat, Calls, Sessions, Pipeline, Knowledge, Memory, Evals (scored calls, drift), Widget | the same, plus **Dev chat**, Evals ▸ runs and *Run all* |
| copies | one: the org's, *deployed on the box* | the reader's; a key with `team` opens a teammate's |

Which is which is a `<meta name="pinecall-console" content="local">` the sidecar puts in the page
(absent: hosted), read once in `lib/mode.ts`, where **one table** lists every screen with its path,
its sidebar group (`gateway` · `settings`), its icon and the modes that have it. The sidebar draws
that table and the router routes it; a screen a console does not have is neither linked nor
reachable. Everything below describes a screen once, and says when it belongs to one console only.

## 0. The frame every screen hangs in

One shell (`shell/shell.tsx`), one router (`router.tsx`). React 19 + react-router: **the URL is the
state** of what is on screen, so a reload lands on exactly the same thing. What the browser keeps is
who is signed in and whose copy is open (`lib/session-key.ts`); a folded sidebar, an open switcher
and the ⌘K box are the tab's and die with it.

| URL | screen |
|---|---|
| `/` | Home — how today is going |
| `/overview` | Overview — the agents held, the numbers, keys and vendors behind them |
| `/live[/:call][?agent=]` | Live — the floor's calls, one watched, the desk |
| `/sessions` · `/sessions/:call` | Sessions — every agent's calls; one read whole |
| `/usage` | Usage (hosted) |
| `/numbers` | Numbers (hosted) · `/phone` Phone testing (local) |
| `/keys` · `/providers` · `/team` | Keys, Providers, Team (hosted) |
| `/a/:agent/talk` | Talk |
| `/a/:agent/chat` | Chat |
| `/a/:agent/chat[/:call]` | Chat (local) |
| `/a/:agent/calls[/:call]` | Calls — the inbox; a call in the path opens the thread holding it |
| `/a/:agent/sessions[/:call]` | the agent's sessions; one read whole (deep-linkable to a line: `#seq-93`) |
| `/a/:agent/pipeline` · `knowledge` · `memory` · `widget` | one tab each |
| `/a/:agent/evals?view=runs\|calls\|drift&run=<id>` | Evals |
| `/a/:agent/widget/preview?name=&company=&tagline=&phone=&accent=&greeting=` | a blank page with nothing but the widget on it, outside the shell |
| `/cli?c=<word>` | hosted: the card a person opens from `pinecall login` to sign that terminal in |
| `/invitations/<token>` | with no key: the card where an invited — or reset — person chooses a password |

A path nobody routes lands on `/`. A slug the gateway does not list for this org and world draws no
agent screens: *No agent called <slug> is held here*, and then — hosted — that nothing by that name
is deployed and a copy of one's own is on `pinecall serve`, or — local — that no copy of the
reader's is running, and `pinecall run` starts one.

**The sidebar** (`shell/sidebar.tsx`, 244px, folds to 62px of icons; folded by itself under 720px):

- **the workspace**: the org's word (`whoami.slug`, else its id) on a tile with its first letter, and
  *N agents*. Hosted, for a person of two orgs or more, it opens *Your organizations* — each with the
  person's role, the current one marked *here* — and picking one mints their key there (`POST
  /v1/login/org`), replaces every key the browser held and reopens the console at `/`;
- **Search ⌘K** — the palette, below;
- **Agents**: one row per slug the gateway holds (one per slug however many copies — `lib/corners.ts`),
  opening its Talk; a green icon and a `live` badge while any call of it is up. None: *none held here*;
- **Gateway** (local: **Sandbox**) and **Settings**: the table's rows, each drawn only when the key's
  scopes open it (`lib/scopes.ts`: Talk, Chat and Widget need `talk`; Overview, Live, Calls and both
  Sessions `calls`; the rest their own name; Home and Phone testing are ungated). Badges: Overview
  the agents held · Live `N live` · Sessions the corner's total (`insights.sessions_total`, else the
  rows the floor read, `200+` at the door's cap);
- **the foot**: the person's initials and name (`whoami.name`, else the key's label), their role in
  this org (off `GET /v1/login/orgs`; *A machine's key* for a key that names nobody), and the fold.

**The top bar** (`shell/top.tsx`, 54px): `<org> /` or `<agent> /`, then the page's title (*Phone
numbers* for Numbers, *Session* one level under Sessions, *Sign in a terminal* at `/cli`); on the
right **the switcher** and — hosted only — **Sign out**, which forgets every key.

**The switcher** (`shell/switcher.tsx`) is the one answer to *what am I looking at*. Its trigger: a
dot and a pill in the world's colour (green `production`, amber `sandbox`), the agent or *choose an
agent*, the person's initials. Its panel:

- **the person**: name, org and `key <key_id>` off `GET /v1/whoami` — never the key;
- when an admin opened a teammate's copy: *Looking at <name>'s copy* · **Back to yours**;
- **Organization** — hosted, two orgs or more: one chip each, the same move as the workspace menu;
- **Environment** — two chips, and they are the two consoles, not a toggle: the one this tab is
  stands selected, and the other **opens the other console at the same path in a new tab** —
  `http://localhost:4100` from the gateway's page, the gateway (`lib/mode.ts`, `gatewayOrigin`) from
  the sidecar's. Under them, where the other world is watched;
- **agents in <org> · <world>**: one card per copy — slug, whose it is (`<person> · you`, `<name> ·
  theirs`, `<org> · deployed on the box`, `<org> · shared`) and its channels, ending *Viewing* ·
  *Open* · *Theirs*. A teammate's copy is disabled except to a key that opens `team` in the sandbox:
  opening it makes every request carry `pinecall-corner: <member id>` (`shared/api.ts`,
  `headersFor`), kept for the browser (`keptCorner`). Picking another agent keeps the tab when every
  agent has it, and drops a call id. With nothing held, the sentence says what would put one there.

**An agent's head** (`shell/agent-head.tsx`), over every `/a/:agent/…`: a dot, the slug, `on a call`
/ `on N calls` (green) or `idle`, its channels (`web · phone · whatsapp`, or *no doors*), and the
tabs — the table's agent rows this console has and the key opens.

**⌘K** (`shell/palette.tsx`; Ctrl-K too): screens, agents, the current agent's tabs, and — once
something is typed — the sessions the floor has listed, matched on id, agent, channel, who and
outcome. A whole call id pasted opens that session even when no list holds it. Arrows, Enter,
Escape. It asks no door of its own.

**The shared org** (`lib/org.tsx`): the shell reads the floor once — `GET /v1/sessions?limit=200`
every 3 s and the moment `GET /v1/events` says something moved — plus `GET /v1/agents` (re-read when
an agent registers or detaches), `GET /v1/login/orgs` and `GET /v1/insights` (every 15 s), and every
screen that needs them reads that one copy (`useOrg`).

When a screen has nothing to show it says so **in a sentence, never a spinner**.

Data reaches it through the gateway's doors and one stream shape. What needs the agent's
**directory** — its goldens, personas, knowledge folder, memory goldens, a chat with the class — is
asked of the gateway too, at `POST /v1/agents/{slug}/dev/{family}/{verb}`, and the gateway relays it
to the `pinecall run` holding the agent (the runtime's `docs/protocol/dev-verbs.md`). Gateway doors:

| door | who reads it |
|---|---|
| `POST /v1/login` · `POST /v1/login/orgs {email,password}` · `POST /v1/invitations/{token}` | the sign-in card and its workspaces, the password card |
| `GET /v1/login/orgs` · `POST /v1/login/org` | the workspace menu, the switcher, the role in the sidebar's foot (hosted) |
| `POST /v1/login/env` | the boot, once: a sandbox key left in the browser becomes the same person's production one |
| `GET /v1/whoami` | the person, the scopes every screen is gated by |
| `GET /v1/agents` · `GET /v1/sessions` · `GET /v1/events` (SSE) · `GET /v1/insights[?day=]` | the shared org: sidebar, Home, Overview, Live, Sessions, ⌘K |
| `GET /v1/org/judging` · `PUT /v1/org/judging {on}` | Home's setup step |
| `GET /v1/agents/{slug}/sessions[?q=&channel=&limit=]` | Calls, the agent's Sessions, Evals ▸ scored calls — the corner's own |
| `GET /v1/agents/{slug}/threads` · `POST …/threads/{contact}/read` · `POST …/threads/{contact}/messages` | Calls: names and unread, read marks, a message into a WhatsApp thread |
| `GET /v1/calls/{call}/events` (pages, then SSE) | Talk, Live, Calls, Chat, one session |
| `GET /v1/calls/{call}/recording` | the audio player |
| `GET /v1/agents/{slug}/config` | the state pane's visibility declarations |
| `POST /v1/tokens` · `POST /v1/calls/{call}/listen` · `POST /v1/calls/{call}/supervise` · `POST /v1/calls/{call}/verbs` | Talk, the Widget preview; the desk's ear, its seat and its verbs; *write as the agent* |
| `POST /v1/evals/replay/{call}` · `POST /v1/evals/judge/{call}` | one session: re-check by code, attach a judge |
| `GET /v1/evals/runs?agent=&limit=200` | Evals |
| `GET /v1/agents/{slug}/pipeline` · `PUT …/pipeline/overrides` | Pipeline |
| `GET /v1/knowledge` · `DELETE /v1/knowledge/{base}` | Knowledge (push and golden go through `pinecall run`) |
| `GET /v1/agents/{slug}/memory` · `DELETE /v1/memory/facts/{id}` · `GET/DELETE /v1/contacts/{contact}/memory` | Memory |
| `GET/PUT /v1/agents/{slug}/widget` · `GET /widget/pinecall-widget.js` | Widget |
| `GET /v1/numbers` · `POST /v1/numbers[/buy]?dry_run=` · `DELETE /v1/numbers/{number}` · `GET /v1/numbers/available` · `GET/PUT/DELETE /v1/carrier` | Numbers, Overview, Home's setup |
| `GET /v1/line/numbers` | Phone testing (local) |
| `GET/POST /v1/keys`, `POST /v1/keys/{fingerprint}/revoke` | Keys, Overview |
| `GET /v1/providers` · `GET/PUT/DELETE /v1/provider-keys[/{vendor}]` | Providers, Overview |
| `GET/POST /v1/members`, `PATCH /v1/members/{id}`, `POST /v1/members/{id}/reset` | Team, Home's setup |
| `GET /v1/usage` | Usage |
| `GET/POST /v1/login/pairings/{code}` | the `/cli` card |

The directory's verbs, through `pinecall run`: `chat` (roster, start, say, end) · `personas` + `simulate` ·
`goldens` + the suite run · `knowledge` (roster, push, eval) · `memory` (roster, recall eval, extraction) ·
`candidates` + `promote` · `drift` · `reproductions`.

**A door a gateway does not have yet is an element not drawn.** Insights, judging, threads, the
agent's memory, the widget's settings and the workspaces a password opens are each probed; a `404`
(for the keyless one, a `405` too) means the older reading below it, never an error on screen.

The stream has four honest states and never guesses: `connecting · live · reconnecting · ended`. It
paints at most ten times a second; a burst of interim transcripts inside one turn is one repaint.
Reconnection resumes on the reader's own `Last-Event-ID`, so a gap is a fact the log carries
(`log.gap`), not a hole the page invents. An entry whose seq is not past the last one kept is
dropped (`use-watched-call.ts`), so a remount never doubles a row.

### 0.1 What it is drawn with — `ui/`

`ui/tokens.css` is the only file of the console with a colour in it: seven inks (`--ink` …
`--ink-7`), the lines, six grounds, the accent `#5b3df5` with its hover, soft, selected, second and
third steps and its focus ring, the tints (green, amber, red, indigo, pink, teal), five shadows,
Inter and a system monospace, the sidebar's two widths and the top bar's height. **Light only.**
`ui/ui.css` is the vocabulary and `ui/*.tsx` its parts, imported as one (`../../ui`):

| part | what it is |
|---|---|
| `Page` · `PageHead` | the scrolling column (max 1180 · 1060 · 900 · 760) with its title, lede, a back link and actions |
| `Card` · `CardHead` · `CardAction` · `CardFoot` · `Row` · `Item` · `Empty` · `Refused` | a bordered card; a list row with a lead, a name, a tag, a line under it and an end; the compact side-card row; the sentence for nothing; a door's refusal in its own words |
| `Stats` · `Stat` | the numbers across a page, four sizes: `big` (Home, with a delta `up · down · flat`), `medium` (Overview, with *of N*), `small` (Usage, Evals; `accent` for cost), `fact` (a session's words) |
| `TableHead` · `TableRow` | a grid table: grey labels (a label ending `>` is right-aligned) and rows on the same columns; under 720px a table scrolls inside its card |
| `Button` (`secondary · primary · dashed · danger`; 28–42px) · `ButtonLink` · `TextAction` · `Field` · `Label` · `Input` · `Select` · `TextArea` · `Segmented` · `Chips` · `Choice` · `Switch` · `Check` | the controls |
| `Pill` | seven tones: `green · amber · red · indigo · violet · gray · muted` |
| `Tag` · `Dot` · `Avatar` · `Bar` · `SectionLabel` · `KV` · `Icon` | a channel tag; a status dot (green, amber); initials on a tint (a name always wears the same one — `tintOf`; a list hands them out in order — `tintAt`); a share bar; a pane's label; a key beside its value; twelve stroke icons drawn in the repo |

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

## 2. Home — `/`

How today is going, UTC like every clock here. Titled *Good morning* · *afternoon* · *evening*, the
person's first name when the key names one; the lede is one sentence: calls on the floor, how many
need a look, *everything else handled*.

- **Four numbers.** *Conversations* today with the change against yesterday (`+18%`, `−4%`,
  *steady*); *Resolved without a human* as a percent with the change in points; *Median answer* (the
  day's median `e2e_latency`, against yesterday's, to a tenth of a second); *Spend today* with *of
  €N* when the org has a budget, else *today*. They are `GET /v1/insights` — the gateway's count of
  every call of the day. **A gateway without the door**: the same numbers folded from the floor's 200
  rows (resolved = ended neither `transferred` nor `supervisor_ended`; spend = the rows' `cost.eur`),
  and no Median card at all.
- **Needs a look** — *N of M today*: a row per call with who was on, a flag, its one-line reason,
  `channel · duration` and how long ago, opening the session. Flags: `escalated` (red), `low score`
  (amber), `promise made` (indigo) — the gateway's `flags` on the row (`escalated · low_score ·
  promise`), the reason its `score.reason`, else the outcome. From an older gateway: the end reason
  for escalated, and the first `broken` judge of the first twenty scores read (`lib/use-scores.ts`)
  for low score. None: *Nothing today needs a look: no call went to a person, and no judge said no.*
  Foot: *N more handled cleanly* · *See all sessions*.
- **On the floor now** — up to four live calls: who, `agent · channel · m:ss`, and **Listen**, which
  opens that call on Live. None: *Nobody is on a call. A call that rings appears here the moment it does.*
- **Where calls arrive** — Phone · Web · WhatsApp as shares of the day (insights' `channels`, else
  the rows; with no call today, the rows the floor holds).
- **Finish setting up** — drawn until every step is done, each only for a key that opens its door:
  *Connect a phone carrier* and *Point a number at an agent* (`numbers`, hosted) → Numbers; *Add a
  judge so calls get scored* — shown when `GET /v1/org/judging` answers and the key opens `usage`,
  and **Turn on** is `PUT /v1/org/judging {on:true}`, right there; *Invite your team* (`team`,
  hosted; done when two members are not disabled) → Team.

## 2b. Overview — `/overview`

Which agents this gateway is holding right now. **Issue a key** in the head (hosted, a key that
opens `keys`) goes to Keys.

- **Four numbers**, each only for a key that may read it: *Agents up* `N of M` (M counts the slugs
  held and the agents a number routes to); *Numbers ringing* `N · F free` (what the carrier owns and
  this org has not imported) — else *Calls live*; *Active keys* `N · R revoked` — else *Calls
  today*; *Providers ready* `N of M`.
- **Agents** — *watching* while the floor's stream is live, else the connection's word. Per row: a
  lettered tile and the slug; `1 call live` / `N calls live` in green, or `idle · last call <ago>`
  (whose copy first, for a key that sees the team's); its channels as tags; the numbers routed to
  it; **Today** (insights' count for the slug, else the rows'); **Score** — the share of judges that
  held over the agent's judged calls today, as a percent: green from 90, amber from 70, red under —
  `—` when nothing was judged or the gateway does not count. A row opens Talk. A key the gateway
  answers with more than its own corner gets chips: *everything* · *mine* · *the team's*.
  Empty, local: *Nothing of yours is running. `pinecall run` in a project puts its agents here.*;
  hosted: *Nothing is deployed here yet…*; a filter that leaves nothing: *Nothing here is mine*.
- **Keys in use** (four, live ones first): label, `a machine` or the holder's name, what it may do
  (`everything`, or the scopes; `sandbox` for a sandbox key), `active` / `revoked`. **Manage** → Keys.
- **Providers** — *N ready · M need a key*; four ready vendors, the org's own first, then the box's
  defaults: `decides · hears · speaks`, *the default* when the box names it for that job, and `ready`
  (the org brought its key) or `box key`. **Bring one** → Providers.

## 3. Live — `/live[/:call]`

The floor. Three columns: the calls, the one watched, and what that call holds.

**Left.** `N calls up` · *re-asked every 3 s*; **Simulate a caller**; then *Sessions*: the org's
calls, live first, eighty at most — who is on (name, else the number as people dial it, else the
visitor id), and `m:ss` counting up, the status word while it is not active yet, or `ended`.
`?agent=` keeps one agent's and says so, with *every agent* to clear it. No call in the path
watches the newest live call, else the newest. Empty: *No calls yet. Leave this open — a call that
reaches any agent shows up here as it rings.*

**Simulate** (`calls/simulate-form.tsx`; here with an agent picker, on Calls for that agent): a
synthetic caller — `pinecall simulate` with the same defaults. Persona (one file per caller in
`test/personas`, its goal shown), turns (1–30, default 6), `voice` (a real line), `judge at
hang-up`; on a spoken line, `noisy line` with noise in dB under (0–60, default 15) and packets lost
% (0–100, default 0). The call opens on `/live/:call`. Needs the `pinecall run` holding the agent,
in its directory: without a class there the form says so, and a process in another agent's
directory is named.

**Centre — one call** (`live/live.tsx`; Talk's inspector and Chat read the same hook).

*Head:* the call id · tags for channel and direction · `on a call · m:ss` in green, the status word
before that, or the end reason in words · `<who> → <agent> · seq N · agent <state> · caller <state>
· <connection, or the refusal>` · **Listen in** (a key that opens `supervise`; disabled once the
call is over).

*The rows.* Every row carries the seq it happened at and nothing invented:

| row | what it carries |
|---|---|
| turn | who spoke (`caller` · `agent`), the text, the speech id, its latencies, `interrupted` on an agent turn, the language on a user turn, and every metrics block joined to it by `speech_id`, one click under it, field by field under livekit's own names |
| tool | `name(arg=value, …)`, the outcome or `…` while running; one click under it the arguments whole, the output whole, the error, the duration. `running · done · failed` |
| state | which of the app's fields changed here, and what moved them: a tool's result or a fact from outside |
| lookup | a `memory.ops` or a `docs.sources` as one line — `op · n facts · ms`, `n sources · ms` — and what was found under it |
| confirm | the tool that needed a yes, what the agent read back, and how it went |
| event | a fact that arrived from outside the conversation: its name, its source (`app` / `participant`), its data |
| supervisor | one sentence: *supervisor whispered: …* / *made the agent say: …* / *took the line* / *handed the line back* / *transferred the call to …* / *ended the call: …*, and who made it |
| quiet | a stretch of entries nobody needs to read line by line, folded, one click open |

Under the rows, the words being said **right now**, cleared the moment their turn is final; and at
the end, when the summary points at audio, the recording.

*The desk* (`live/desk.tsx`) opens under the head from **Listen in**, and opening it takes a
hidden, silent seat in the room. Two seats, not one: the ear, and — minted the first time the line
is taken — a seat that publishes a microphone.

- **listen**: `Listen` (off, or after a failure) · `Joining…` · in the room and muted → `Hear it` +
  `Stop` · hearing → `Listening · mute` + `Stop`.
- **Whisper | Say** — one box, one segment. Whisper: the agent is told something the caller never
  hears. Say: the agent says it to the caller, verbatim. Enter or **Send**.
- **Take the line** / **Hand back** — `holding` is the one piece of state the desk keeps, because
  the log cannot tell it fast enough to keep a button honest.
- **Transfer** — irreversible, so it never leaves on a stray click: the button becomes a field, the
  number is typed and entered. Escape or *Cancel* takes it back.
- **End call** → `End · sure?` → sent; looking away disarms it.
- On a call that is over: *The call is over: nothing is left to supervise. Read its log below, or
  play its recording.*
- **A refusal is never rephrased**: the gateway's own sentence is what the desk shows. Nothing here
  draws the state of the call — what a verb did is its `supervisor.*` row.

**Right — four sections.** **STATE**: the app's declared fields by name, the value as the tenant
projection left it, and `public` or `pii` beside a field that declared one (*The app has declared no
state yet.*). **ROOM**: *Audio room open · N participants*, the number a phone call rang, each
participant and its kind (*No room: this session carries no media.*). **PROMPT**: each block by
name with its hash and length — never its text — and the cost so far (*The app has written no block
yet.*). **METRICS**: the medians as bars, then every raw block by kind (*Nothing measured yet: the
first turn fills this in.*).

## 4. Calls — `/a/:agent/calls[/:call]`

This agent's conversations as an inbox: one thread per person, what was said, and a way to answer.

- **Threads** are the agent's sessions (re-asked every 3 s) grouped by contact — the id the app
  resolved (`caller.id`), else the caller's phone, else the address the call came from — newest
  first. A row: a round avatar (two letters of a name, `W` for a web visitor, a number's last two
  digits), the name or handle, the time (`13:24` today, *Yesterday*, then the day), the latest
  outcome — *On a call now* in green — and the **unread** count. Names and unread come from `GET
  /v1/agents/{slug}/threads` (unread is per person: what arrived since they last opened the thread),
  and opening a thread with some posts `…/read`. A search box filters by name, handle and last line;
  **+** opens Simulate for this agent — and, once the org can dial out, *Call a number* beside it (a
  number written whole, `+14176743169`, the number to call **From** when the org has several, **Call**). Empty: *No conversations yet. The first call to reach <agent>
  opens a thread here as it rings.*
- **The open thread**: the avatar, the name, `handle · channel · handled by <agent>`; **Watch live**
  while its latest call is up (→ Live) and **Session** (→ that call's session). Messages are read
  from each call's own log, the thread's twelve newest calls at most, re-read only when a call's
  last seq moves: day pills (*Today*, *Yesterday*, a date), the contact's turns on the left, the
  agent's — and a sentence a supervisor made it say — on the right, each with its time, and a
  spoken call as one centred pill, *Voice call · answered · 2m 34s*, followed by its turns.
- **The composer** writes **as the agent**, in exactly two cases: the latest call is live and a text
  one → `POST /v1/calls/{call}/verbs {verb:"say"}`; the latest call is over and WhatsApp, on a
  gateway with the threads door → `POST …/threads/{contact}/messages`, which the gateway refuses
  (`409`, in its words) once WhatsApp's 24 h window closed or the conversation sealed. Otherwise it
  is disabled and its placeholder says why: *A live voice call — Listen in on Live to speak into
  it* · *The conversation is closed — nothing can be written into it from here*.
- **Call back**, in the head of a thread whose contact is a phone number, and *Call a number* under
  **+**, are drawn only when `GET /v1/carrier/outbound` says `ready` (read once per screen; absent
  or not ready, neither is drawn and nothing is said). It confirms first — *Call <number> as
  <agent>?*, **From** when there are several numbers, **Call** · Cancel — then `POST
  /v1/agents/{slug}/dial {to, from?}` and the call it became opens on Live. A refusal (a number
  that never called, a rate, a country) is the gateway's sentence. A contact the app filed under an
  id of its own, not a number, has no Call back.

## 5. Sessions — `/sessions`, `/a/:agent/sessions`

Every conversation, newest first, live ones first with a green dot — in the corner on screen: a
developer sees their own copy's calls, an admin who opened a teammate's copy sees that copy's, and
production's are never mixed into the sandbox list.

- **Filters**: *Search a session id, number or outcome*; on the org's list, *Every agent* and
  *Every channel*. A whole call id and Enter opens it, on the page or not.
- **The table**: Session (the id, and who was on under it) · Agent (the org's list) · Channel ·
  Started (`hh:mm:ss`) · Duration (`1m 04s`, `live` while it runs) · Outcome (the agent's one line,
  else the end reason). A row opens the session.
- **Who searches.** The list asks the sessions door with `q`, `agent`, `channel` and `limit` (fifty
  a page, 250 ms after the last key). A gateway that answers a `total` is believed: its rows, *N of
  total* in the foot and **Load more** (the limit grows; the door caps it at 200). One that does not
  is never asked again, and the rows the screen already follows are filtered in the browser —
  *No session here matches. The search reads the sessions this page has listed.*
- Empty: *No session recorded yet. The log is written during the call, so one appears here the
  moment it starts — from the browser, from `pinecall chat`, or from the telephone.*

### 5.1 One session — `…/sessions/:call`

*← Sessions*, the call id, and two moves: **Re-check by code** (`POST /v1/evals/replay/{call}`:
each check as a pill with its line) and **Promote to a golden** (the directory's `promote`: the
path written, and its notes). Then, in an auditor's order:

1. **Seven facts**: Agent · Channel (`· outbound` when it was) · Started (`16 Sep, 15:10`) ·
   Duration (*still going*) · Ended (the end reason in words, *not yet*) · Cost · Turns · events.
2. **Outcome**, when the summary wrote one.
3. **Listen to this call**, when the summary points at a recording: the player, and nothing else.
4. **Transcript · N turns** *with <caller>* — beside it **Latency across this call** (per measure
   the median and the max, LLM first token and End to end first; when nothing was measured it says
   why) and **Score**: *Passed* / *Did not pass* with `N of M held`, judge by judge — name, verdict
   pill (`held` green · `broken` red · `deferred` amber · `skipped` muted), the sentence it answered
   with, the seqs it cites as links into the log — a judge of the panel that answered nothing drawn
   as *on the panel*, never as a pass, and what the opinions cost. *No judge was given to this
   session* (with the log's own reason) and *Not scored yet* both carry **Attach a judge** for a key
   that opens `evals`, once the call has ended: `POST /v1/evals/judge/{call}` runs the hang-up's
   judges now, under the same ceiling, and the verdict replaces the card's at once.
5. **Cost by model**: model · unit, quantity, euros, the total, the USD→EUR rate and its date, any
   unpriced model named.
6. **Details** — *consent, prompt blocks, the full log* — one card, closed until asked (*Show ▾*),
   and opened by a `#seq-N` in the address. Under it: **Consent proof**, when the call asked for any: per tool call, the join from the request to the
   grant or the decline, and to the tool call it authorised — seq to seq; **The prompt, block by
   block** — name, hash, length; the text never enters the log; and **The log** — every entry in seq order, the metric fields one click under the turn they timed,
   each row an anchor (`#seq-N`).

While it reads: *Reading <call>…*; nothing there: *No call <call> in the log.*; a refusal in the
gateway's words.

## 6. Talk — `/a/:agent/talk`, and Chat — `/a/:agent/chat`

Two tabs, the two ways into the gateway's room, on the same log everything else reads. A call this
tab starts never pops a corner window (`lib/ours.ts`): it is not news to whoever started it.

- **Talk** (voice, a `talk` token): the round **Call** button → *Joining the room…* → red **Hang
  up** with the clock inside; **Mute/Unmute** beside the five moving bars; *Speaking as* and *Lands
  in*; the conversation as a card of bubbles with a **composer** at its foot — what is typed goes
  into the same call (`sendText` on `lk.chat`). A call that ends gives the page back, with **Open
  the session**.
- **Chat** (written, a `chat` token — no microphone, no voice): one bar (*Chat with <agent>*, how it
  stands, **Start a chat** / **End chat**, **Open the session** once ended), the conversation
  filling the page, the composer at its foot.
- **The Inspector** (`talk/inspector.tsx`, Dev chat's too), beside both: a pill for the stream's
  state and four tabs — **Call** (*This session*, or *Last session* before one is made: Turns, ttft
  and e2e medians, Cost, Tokens in and out, the call id), **Turns**, **Tools** and **State**.

## 6b. Dev chat — `/a/:agent/dev-chat[/:call]` (local)

The class talked to **in writing**, on the call's own log — `pinecall chat` from a page, so a
breakpoint in a `@tool` is reachable in the terminal serving it.

- **Start a conversation**: `As` (a phone number, a customer id — or nobody; it files the call under
  a contact so memory has a name) and `From` — the call's own opening, or **the state one of this
  directory's goldens declares**. *Start the chat* → the call id lands in the URL.
- **In the call**: your turns on the right in the accent, the agent's on the left, a tool the model
  called between them as a centred pill (`name · running|done|failed`); **Session** and **Hang up**
  in the head — a button, never a navigation: hanging up seals the log and runs the judges. After
  it, the session. **A chat that has ended reads as a transcript**: no Hang up, no box — *This chat
  has ended — it is on the session, whole.*
- **A reply streams** (`chat/streaming.ts`): every model delta is its own `agent.transcript`; the
  chat adds them up per `speech_id` and reveals the text toward that sum on `requestAnimationFrame`.
  A reply that reached `turn.agent` is settled and its own text wins, carrying on from the character
  the stream reached. A call opened after the fact draws every reply whole.
- **A line you send is on screen at once**, pending, until the log's `turn.user` confirms it; a
  refusal takes it back and puts the words in the box again, with the gateway's sentence. Three dots
  stand in the agent's column while it thinks.
- The Inspector beside it. Needs the `pinecall run` holding the agent, in its directory.

## 7. Pipeline — `/a/:agent/pipeline`

The three legs of a voice turn as data, with this agent's overrides already applied — so the screen
cannot show a pipeline the next call will not run.

- **Three cards**, `hears` / `decides` / `speaks`, each headed by its vendor, with a `turned` pill
  when an operator moved it and the gateway's reason in red when the leg cannot run. Hears:
  Language, Model, *Switchable to*. Decides: Model, Prompt (`identity · knowledge · tools · history
  · view`), Tools. Speaks: Voice, Model, Aligned transcript. An unset value reads *the vendor's default*.
- **Anatomy of a turn** — *medians over the last N calls · M turns*: Transcription · End of turn ·
  LLM first token · Speech starts · End to end, a bar each scaled to the slowest, and the
  milliseconds. A stage nobody measured is `—`, never a zero-width bar read as instant.
- **Control** — *applies to the next session*: Hears, Decides and Speaks as vendor plus model (the
  vendors off `GET /v1/providers`, ready ones first), the voice (a list for the vendor this build
  curates, else that vendor's own id), the tts model, and the greeting — *spoken verbatim as the
  call opens — said, never generated*. *An empty field gives the knob back to what the app
  declared.* Saving answers with the whole report, so the cards above are the gateway's answer.
- **Turned**: what is overridden right now, apart from the form.

## 7b. Knowledge — `/a/:agent/knowledge`

*What this agent answers from. The folder is pushed whole and the base is replaced, never merged.*

- **This directory** (the directory's `knowledge.roster`): the base name (editable), the folder's
  path, *N markdown files*, **Push the folder**, *N questions*, **Run the golden**. While asking:
  *Asking the process that holds <agent>…*; when it does not answer, the sentence says so — and the
  bases below still load.
- **The golden**, after a run: `base · embedder · N questions · ms`, `recall@k`, `nDCG@10`, and
  every miss: the question, what it wanted, what came back first.
- **Every base this org has pushed**: Base · Chunks · Embedder · Pushed · **Drop** (asks first).
  Empty: *No base pushed yet…*

## 7c. Memory — `/a/:agent/memory`

*What this agent carries between calls with the same caller.*

- **Callers.** On a gateway with `GET /v1/agents/{slug}/memory`: every **current** fact this agent's
  calls taught, across every caller, newest first — Caller · Remembered · Written · **Drop**, which
  ends that one fact (`DELETE /v1/memory/facts/{id}`; the contact's history still shows it,
  superseded). The box in the head filters them by caller as it is typed; entered, it reads that one contact (and offers **Forget**, the contact whole). Both drops ask first.
  On an older gateway the box is the only way in: *Look up a caller…* → that contact's facts with
  their category, superseded ones dimmed with the day they stopped holding (`GET
  /v1/contacts/{contact}/memory`), and **Forget** the contact whole, after a confirm.
  Empty: *Memory keeps nothing about any caller of this agent yet.*
- **Recall** (`memory/golden.json`, or `memory/<name>.golden.json` in a project of several): N
  questions, scored by code with no model on a scratch contact — `recall@k · nDCG@10`, each miss.
- **Extraction** (`test/memory`, or `test/memory/<name>/`): one written call per case and one model
  call each — `held/cases`, each broken case with `check: detail`.
- Both goldens are the directory's; when its process does not answer, the card says so.

## 7d. Evals — `/a/:agent/evals`

*A golden is fixed and the agent is the variable: never soften a golden so a change can pass.*

- **Four numbers**: Goldens (the directory's roster) · Passing · Failing (the latest run) · Last run.
- **Golden questions**: each golden as the caller's first line, the kind of check its `expect`
  implies — `tool call` (tools, not_tools) · `exact phrase` (says, not) · `judge` (grounded,
  register) · `a reply` · `consent` (nothing declared) — and `pass` · `fail` · `not run` from the
  latest run (held = every judgment on it, under every model, held). **Run all** (local) opens a
  suite with every golden.
- Under them a segment, addressable as `?view=`: **Runs** (local) — *Run a suite* (tick the goldens,
  name the models or keep the class's, `voice` for ring 2 and its noisy-line knobs), the runs table
  (run · started · status `running · done · failed` · goldens · models · held · judge calls · since
  the run before: `broke: <golden>`, `held again: <golden>`, `±0`, `first of its kind`), and one run
  opened by `&run=`: the matrix judgment by judgment with the judge's own sentence and the call it
  opened, and the **reproductions** a broken run left on disk. **Scored calls** — what the judges
  sealed each finished call with, with re-check and promote. **Drift** — each judge's held-rate over
  two windows (a week against a month unsaid), the delta, and one threshold: a drop past it is the
  one coloured number on the screen.

## 7e. Widget — `/a/:agent/widget`

*The web door for <agent> — one script tag on your site, and the call lands in the same log as the phone.*

- **Embed**: the snippet to paste, with the gateway as the CDN — `<script type="module"
  src="<gateway>/widget/pinecall-widget.js">` and `<pinecall-widget agent= name= company= tagline=
  phone= greeting= autostart token-url="/pinecall/token" log-url="/pinecall/log">`, plus a `<style>`
  line setting `--pc-accent` when the accent is not the first — and **Copy**. Under it, what the
  site's two endpoints do (`token-url` mints a visit token with a key holding `talk`; `log-url`
  relays the call's log with a key holding `calls`), and `github.com/pinecall/widget`.
- **Appearance**: Name (default *Assistant*), Tagline, **Greeting** (what the widget says before the
  call starts), Company, Phone, four accents (and the kept one, when it is none of them), **Open
  with the microphone ready** (`autostart`). Greeting and autostart are drawn only on a gateway that
  keeps widget settings — the widget that reads them ships with it. **Save** (a key that opens
  `pipeline`, enabled once something differs) replaces the set at `PUT /v1/agents/{slug}/widget`
  (`title · tagline · greeting · accent · autostart`, per org, world and agent); company and phone
  live in the snippet only. The gateway keeps the words and injects nothing: the snippet is where
  they become attributes.
- **Preview**: the very file the snippet loads, mounted inline and minting through `POST
  /v1/tokens` with this console's key; every field redraws it. *Open on a blank page ↗* is
  `/a/:agent/widget/preview`, the same attributes in the query.

## 8. The org's settings

**Numbers** — `/numbers` (hosted), titled *Phone numbers*: **Numbers in <world>** — the number as
people dial it (`+1 (417) 674-3169`) `→` the agent, `bought` when the box bought it, **Remove** on a
row an operator made; the agents answering on the web with no number, one line under. **Add a
number** — *One I already have · N* (the carrier's numbers not imported yet) or *Buy a new one*
(country, area code), each with the agent that answers; the first button is always **Review**
(`?dry_run=true`: *Nothing changes yet — you will see exactly what is going to happen, and
confirm.*), the gateway's steps verbatim, then **Confirm**. **The carrier** last: a `TWILIO` / `SIP`
badge, *Account connected*, the account, **Change** · **Disconnect** — or *Connect your phone
carrier*: Twilio (account SID, API key SID, secret) or a SIP peer (username, password, the networks
its calls come from, and an **Outbound** group — host, transport `auto · udp · tcp · tls`, username,
password: *Where this box sends a call it places. Leave empty for a peer you only receive from.*).
Between the two, **Outbound calls** — *an agent calling somebody back* (`GET /v1/carrier/outbound`;
not drawn without the door, the scope or a carrier): `ready` green or `not ready` amber, *Calls are
placed from* the org's numbers, the gateway's sentence for each step still missing, and **Set up
outbound** (**Repair** once ready) — plan first like a number: `POST …?dry_run=true`, the steps
verbatim, **Confirm**, then the state re-read. Under it the **Guards**, read-only: who may be called
(*only numbers that have already called or written to you*, or *any number*), per minute, per day,
countries (*the countries of your own numbers* when none is named), the longest call — *Set by
whoever runs this gateway: `pinecall-runtime orgs dialling`.*

**Phone testing** — `/phone` (local): *Call the number your customers call, from your own mobile,
and your copy answers.* The commands (`pinecall line from +1XXXXXXXXXX` once per machine; `pinecall
run --serve`, `pinecall line forget` while you work); **The numbers to call** off `GET
/v1/line/numbers`, each `→` its agent with one pill — green *your copy answers <your phone>* · amber
*production answers: say which phone is yours* · gray *production answers: you are not running it*;
and **What a call from your phone reaches right now**, in a sentence.

**Keys** — `/keys`: **Issue one for a machine** — a label and a world; *It will hold the app socket
and nothing else, and name nobody.* The key comes back **once**, in a card with Copy, and is kept by
nothing. The table: Name · Env · Who holds it (`a machine` when nobody) · May do (`everything`, or
the scopes) · Status (`active` green, `revoked` gray, the name dimmed); **Revoke** on a live row,
pressed twice. Empty: *No key of this org yet: the first one is what a deploy runs on.*

**Providers** — `/providers`: **Bring one** — a vendor and *the key, sent once* (`type=password`,
emptied the moment it left; nothing reads a key back). Chips *All N · LLM n · STT n · TTS n*. Per
vendor: its name, what it is or what it still wants (*the box needs <ENV>*, *livekit-agents[<extra>]*),
its kinds, and `your key` · `ready` · the standing in gray (`no key · no plugin · its own`);
**Give back** on a vendor the org brought.

**Team** — `/team`: **Invite** — Email, Name, Role (`qa · supervisor · manager · admin ·
developer`), Agents (*every agent* when empty), and a pointer to the Roles table; the answer's link is shown **once**, in a card with
Copy. The table: Name · Email · Role and Agents (each edited in place on a click) · Status
(`active` green · `invited` amber · `disabled` gray) and one move — **Resend invite** (the same
invitation again: a fresh one-use link, no second seat), **Reset password** and **Disable** on an
active member, **Bring back** on a disabled one. **Reset password** is `POST
/v1/members/{id}/reset`: a one-use link, shown once in the same card (*A new password for <name>*),
handed on by the admin because this box sends no email; it opens the password card and spends every
older link of theirs. **Roles** — Role · Who · Opens, one row per role off one constant
(`team/roles.tsx`): *a preset of what a person's keys open — changing one changes their next key,
not a door*. **Single sign-on** (`GET /v1/org/sso`; not drawn without the door, and a `503` is the
gateway's sentence about its vault): unset, a form — Issuer URL, Client ID, *Client secret, sent
once*, Allowed domains, *Role for people who arrive new* (`nobody: invite first` among them), the
switch *Passwords stop working for this org* — and **Save**, the gateway asking the issuer for its
discovery document before it keeps anything; set, the same values with the secret *kept, and never
shown*, **Change** and **Remove** (pressed twice). Either way the `redirect_uri` to register at the
identity provider, with Copy.

**Usage** — `/usage`: Calls · Minutes · Messages · Judge calls · Cost, added up over the pages read;
then every metered row — At · Agent · Call (a link to the session) · Type (`call.summary` ·
`call.score`) · Min · Cost — and **Load more** while the door has a `next`. Empty: *Nothing metered
yet: the first call to end writes the first row.*

## 9. The way in

Every card of it wears one frame (`screens/login/way-in.tsx`): the logo, the form, a line at the
foot, and on the right half an illustration of the inbox — drawn, not data.

- **Sign in** (hosted, no key): Email, Password, **Sign in**. Leaving the password asks `POST
  /v1/login/orgs {email, password}` — which orgs those open, no key minted, the login's own throttle
  — and a **Workspace** select appears with them (one org: shown, not a choice). A gateway without
  that door gets the old free-text field, *only if you belong to several*. **Forgot password** says
  who to ask: an admin of the workspace hands a one-use link from Team. Under an *or*, **Continue
  with SSO** — drawn only on a gateway with `POST /v1/login/sso/discover`: the email typed is asked
  which workspaces sign in with a provider for its domain; one → the browser goes to `GET
  /v1/login/sso?org=<slug>`, several → a select, none → *No workspace signs in with a provider for
  that address.* The provider sends the person back to `/?login=<code>`, the one-use code this
  page already spends — no key is ever in a URL. It signs in to production;
  a refusal is the gateway's one sentence for every wrong thing. A `?login=<code>` that a production
  `pinecall run` printed skips the card. The key is kept by the **browser** (`lib/session-key.ts`),
  so a second tab is the same person; signing out forgets every key.
- **Choose your password** — `/invitations/<token>`: the link an invitation or a reset is. Password
  (the box's own minimum, read off `/.well-known/pinecall`) and again; **Join**. It knows the token
  and nothing else about the person.
- **This machine is not signed in** (local, the sidecar's key refused): `pinecall login`, then
  `pinecall serve`. There is no form: the page holds no key to fix.
- **`/cli?c=<word>`** (hosted, signed in): *Sign this terminal in?* — a terminal calling itself
  <device> asked to be signed in as you — **Yes, that is my terminal**; then *Your terminal is
  signed in*. No word: *No terminal is asking*; a dead one: *That link is no good*. What the
  approval mints is the terminal's own key, and it never travels through this page.

## 10. Doors that exist and have no screen

- **What an org may dial** — `PUT /v1/ops/orgs/{org}/dialling` is the operator's; the console shows the guards and never sets them.
- **A number moved between worlds** — `PUT /v1/numbers/{number}/env` (`pinecall numbers move`).
- **The operator's tables** — `/ops/orgs`, their keys, quotas (the budget among them), usage and routes: the box's key, never a tenant's; the admin page's.
- **The agent's own declaration** — `GET /v1/agents/{slug}/config`: tools, stages, state fields, events. Only the visibility half is read today.
- **Fleet and callbacks** — `GET /v1/fleet/standing`, `GET/POST /v1/callbacks`, events `fleet.full` and `callback.requested`.
- **`GET /v1/calls/{call}/state`**, `GET /v1/evals/runs/{id}`, `POST /v1/evals/run`, `PUT /v1/knowledge/{base}` and the two goldens' own doors: the console goes through the log, the runs list and `pinecall run` instead.

## 11. What the console must keep true

Not a style rule among them — each is pinned by a test or by a decision.

1. **The page holds a person's key and never the org's, and one file touches the browser's storage.** `lib/session-key.ts`; `test/cli/ui/pages/the-key-is-never-in-the-page.test.ts` fails the build if any other file reaches `localStorage` or `sessionStorage`, or writes `authorization` outside `shared/api.ts`. The key rides a header, never a URL. Local holds none at all.
2. **Which screens a console has is one table** — `lib/mode.ts`, drawn by the sidebar and routed by the router; `each-console-has-its-own-screens.test.ts` pins its names and order. No screen asks which mode it is in to decide whether it exists.
3. **The URL is the state** of what is on screen. A reload lands on the same thing; `?run=`, `?view=`, `?agent=` and `#seq-` are links people paste.
4. **The console holds no truth of its own.** The reducer and the wire types are `@pinecall/protocol`'s. The one exception is named and temporary: `lib/sessions-wire.ts` reads a session list with the `score`, `flags`, `total` and `next` a newer gateway adds, all optional, because the protocol this package depends on is strict and predates them — a list read with it would be refused whole. It goes the day that protocol is published.
5. **A refusal is shown in the gateway's own words**, never rephrased, never swallowed; **a door that is not there is an element not drawn**, never an error.
6. **Nothing is invented.** A value that is not known is `—`, not a zero; a stage nobody measured says so; a judge that did not answer is not a pass; a number the gateway does not count is folded from rows the page holds, and says nothing it cannot.
7. **Light only, and one file holds the colours**: `ui/tokens.css`. Every other stylesheet names a token.
8. **A class lives in one stylesheet** — vite bundles them into one file, so a class name is global: `test/cli/ui/pages/one-stylesheet-one-class.test.ts`. A screen's classes carry its prefix (`fl-`, `lv-`, `ib-`, `ui-`…).
9. **No dependency for looks**: the icons are paths in `ui/icon.tsx`, the fonts one request to Google Fonts; `test/the-imports.test.ts` lists what the page may import.
10. **The desk is whole, whatever a design draws**: listen, whisper, say, take the line, hand back, transfer, end. It sends one verb per move (`the-desk-sends-one-verb.test.ts`), a supervisor's move reads as one line wherever the log is drawn (`a-supervisor-reads-as-one-line.test.ts`), and the two irreversible verbs never leave on a single click.
11. **Empty is a sentence, never a spinner.**
