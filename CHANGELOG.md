# Changelog

All notable changes to `pinecall`, the package a tenant writes an agent in. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version numbers and tags are the
maintainer's call, so everything sits under Unreleased until one is cut.

## [Unreleased]

### Added
- **Personas opens on a standing, not on a page about callers.** Where the screen used to explain
  what a persona is, it now reads like Overview: how many callers there are and how many have
  never been called, how many runs between them, when the last one was — then **Latest runs**, the
  newest simulations of the whole org whichever caller ran them, each row the session it was, and
  **Never called**, which is the one thing on the screen somebody can act on. The explanation is
  one line, and in full only where it is needed: an org with no callers yet.
- **What a caller has actually done, beside the caller.** The Personas screen has a third pane:
  every simulation that persona has run, newest first — which agent answered, when, how many
  turns it took, how it ended, what the judges said, what it cost — and a row opens the session it
  was. It reads `GET /v1/personas/{name}/runs` in the key's own corner, a screenful at a time,
  and a caller nobody has called yet says so and points at Simulations.

### Fixed
- **Back goes back.** A screen reached from several places — a session from Live, from Personas,
  from Evals, from the palette — had one back link written into it, so it was wrong from
  everywhere but one: "← Sessions" after arriving from Personas. The frame remembers the screen it
  left (`lib/whence.tsx`), the detail page asks, and the link says where it actually goes —
  "← Live", "← Personas" — falling back to its own list on a reload or a pasted URL. The same for
  a knowledge base, which is opened from the org's Docs and from an agent's.
- **The Chat screen stops scrolling twice.** The transcript's height was the viewport minus a
  guess at everything above it (`100vh - 490px`), so a head of two lines pushed the window past
  the bottom and the page grew a second scrollbar beside the transcript's. The window takes what
  the page has left, and the lines inside it are the only thing that scrolls.

### Changed
- **The simulate form reads as a list of options.** Three switches with their sentences beside
  them wrapped mid-word in a 340px pane — "Noisy / line" — and read as one grey smear. Each is a
  line of its own now, with what it does under its name, and Max turns says what it counts where
  it is typed: the lines the CALLER says, which is what the cap has always been.
- **Whisper and Say are two boxes, not one behind a switch.** A supervisor on a live call should
  never have to check which mode they are in before pressing Enter: one of the two is heard by
  the customer. Each has its own line and its own button, and the caller's is the loud one.

### Fixed
- **The desk knows a chat from a call.** A conversation with no room — the widget's chat,
  WhatsApp — opened the desk by taking a seat in a room that does not exist and asked the browser
  for a microphone to take it over. It does neither now: no ear, no seat, no microphone, and no
  Transfer, which the gateway refuses on a thread anyway. The same Whisper · Say · Take · Hand
  back · End, typed. What says which is the call's own state: `room` is null for a text session.

### Removed
- **The operator's page is gone.** `/admin` was a second bundle with a second credential — the
  box's ops key, typed into a browser — doing a poorer version of what the console's **Box**
  group already does: Organizations, Fleet, Routes, Box usage and Box settings, drawn for a
  person the box made an operator and opened by that person's own key. One page, one build, one
  credential. A box's first org is made where it always was, on the box:
  `pinecall-runtime init --org … --email … --person …`.

## 0.8.4 — A corner that reads no base says so

### Fixed
- **A corner that reads no base says so.** The gateway resolves an agent's settings knob by knob
  now, so a missing field means "not set here" and the corner below supplies it. Settings' Bases
  section and `pinecall docs detach` both dropped the field when the last base went, which read
  as "not set" and handed the agent the team's bases instead of detaching it. Both send an empty
  list.

## 0.8.3 — Personas of their own, one Chat, and a CLI that refuses in words

### Changed
- **Talk and Chat are one tab, called Chat.** The agent had two tabs for the same room — the
  microphone, or writing. Now one screen offers both ways in: **Call** (the microphone, over
  WebRTC, and the agent answers out loud) or **Write** (text, no audio), with the conversation as
  the page's tall window, the call's own controls in its head, and the Inspector beside it as
  before. Its path stays `/a/<slug>/talk`, so links made before still land.
- **Settings keeps what is set in a pane of its own.** The corner-by-corner table left the page for
  a pane at its right, of the Inspector's kind: full height, its own scroll, dragged wider, one
  corner at a time (yours, the team's, production's) with the history under it.
- **Lexicon is two tabs.** *Pronunciation* — how the voice says a word, as a table of written and
  said — and *Recognition* — the words the ears must expect, as chips — each with what it does to a
  call in one line, over a switch saying which copy is being edited, and a save bar that says when
  there is something unsaved.
- **Docs creates a base.** **New base** on the org's Docs screen: a name, and the first documents
  picked off the disk or written there; the base is begun with them, as the gateway begins one.
- **Sessions is grouped by day.** *On a call now*, *Today*, *Yesterday*, then each date with how
  many sessions it holds; the time column says it is UTC.
- **A persona is the agent's, not the project's.** The synthetic callers left
  `test/<agent>/personas/*.ts` for the gateway, beside the agent's settings: `pinecall personas`
  (list · show · add · edit · rm · try) writes them, the console's Personas screen writes the same
  ones — in production as in the sandbox — and `pinecall simulate --persona` reads them from there.
  `pinecall personas push` sends a project's remaining files up once, evaluating each so a caller
  whose state came from `lib/` lands as the value it produced; the folder is then yours to delete.
  The dev verb `simulate.roster` is gone with them, and the class in the directory is still what a
  simulation is put on.

### Added
- **Personas, a screen of their own, above Simulations.** An agent's callers down the left, the
  one chosen read beside them — what they want, how they talk, what they know — with **Use in a
  simulation**, **Edit** and **Delete**, and **New persona**. Each field says what it does to the
  call. The page reads and writes the gateway's own doors (`GET`·`PUT`·`DELETE
  /v1/agents/{slug}/personas[/{name}]`), the same callers `pinecall personas` reads, so it works
  in production as in the sandbox and needs no `pinecall start` in a directory. Simulations'
  Persona field links to it (**Manage**).

### Fixed
- **A simulated caller no longer talks over the agent's greeting.** The first line waits for the
  opening to be said (runtime).
- **`pinecall agent set --llm haiku` no longer stores a model nobody answers to.** A short name —
  `haiku`, `sonnet`, `opus` — is expanded to the id its provider takes, through the same table
  `pinecall test --model` reads, instead of being written as typed and read by the gateway as
  `anthropic/haiku`; a word that names no model at all is refused with exit 2 and never written.
- **`pinecall personas` says what happened, and leaves with the right code.** `--agent` may be an
  agent of this project by its name and is resolved to the slug the gateway files its callers
  under; `rm`, `show`, `edit` and `try` on a caller nobody wrote all end in the same sentence and
  exit 2, as does a name the gateway's rule refuses (lower-case letters and digits joined by
  hyphens); `--json` and `--file` are documented and honoured by every verb that prints what the
  gateway answered — `try`, which prints a call as it happens, refuses `--json`; a `push` that is
  refused halfway names what landed and what is still only a file and exits 2; and a verb nobody
  wrote prints the usage without loading the agent's class.
- **The console no longer loses work without saying so.** Lexicon asks before a corner switch
  throws away unsaved words instead of dropping them silently; Settings' *What is set now* follows
  the corner the form is on; Docs' **New base** names the files that did land when an upload stops
  halfway, and says when nothing was made under the name; **Delete** on a persona sends one
  `DELETE` however often it is pressed; Simulations keeps the chosen agent in `?agent=`, so a
  reload lands on the same one; and the fields of Lexicon, Docs, Sessions, Settings, Simulations,
  Personas and Chat each have a name a screen reader can say.

## 0.8.2 — The console in the dark

### Added
- **The console has a dark theme.** It follows the system's light or dark, and the sun or moon in
  the top bar flips it; the flip is kept in the browser until the system's own theme changes.

## 0.8.1 — Docs you edit from the console, and a simulation that says why it cannot start

### Fixed
- **A spoken simulation the gateway refused no longer leaves the console waiting.** The call's id
  was handed to the page before the gateway had accepted the call, so a refusal — a server token
  without `evals`, no worker — left Simulations on *Waiting for the call's room to open…* for
  good. The id is handed over with the call's first log entry, and a refusal comes back to the
  form in the gateway's own words.

### Added
- **Docs: a base opens onto its files, and a person changes them from the console.** The org's
  Docs table opens a base (`/docs/<base>`) onto its files — File · Characters · Chunks · Arrived —
  with **Add files…** (a picker, several `.md` at once), **Write one** (a path and an editor),
  each file opened to read and edit and saved with **Save**, and **Take out**. Every change is
  searchable on the next call. A base pushed before the gateway kept its files says so, and a
  push again from the project keeps them from then on. The agent's Docs tab opens the same page
  from its rows.

### Changed
- **`--voice` says what the caller sounds like now.** The gateway reads a simulated caller's lines
  in an ElevenLabs voice the agent does not have, in the agent's language (runtime); `simulate
  --help` and the testing page no longer speak of the box's speech tool.

## 0.8.0 — Simulations you hear, Settings you pick from

### Changed
- **Simulations is a screen of its own, under Sessions.** The Simulate button left the Live floor:
  the screen starts a simulation and stays on it, and a spoken one is heard live, the caller and
  the agent, the moment its room opens. Voice starts on there, and the turns field is *Max turns*.
  The agent's Calls tab no longer simulates: its **+** is *Call a number*, once the org dials out.
- **Settings, rebuilt for the person setting it.** One tab a section — STT, LLM, Voice,
  Conversation, Memory, Knowledge, Bases — and every choice a list of values that run: a vendor
  appears only when the box has its key and runs models at it, the model is picked from those, the
  voice from the curated names, the turn's silence and interruption words and a base's chunks from
  values the runtime takes. Nothing is typed that could name something that does not exist. The
  form opens on what the agent runs on (your corner before you set it is the team's), and the
  corner-by-corner comparison sits under it.

### Fixed
- **A settings write no longer erases the corner it lands in.** The gateway writes the org's own
  corner for a key that holds none — a production token, a person acting in production, a CI key —
  and `agent set`, `agent clear`, `agent knowledge edit` and `docs attach|detach` were building the
  whole set on an empty row, so each one took out what the last one had written: on the box,
  writing the knowledge dropped the base attached a minute earlier, and setting a voice dropped the
  knowledge. Every write now reads the corner the door will write, as `agent pull` already did, and
  the line it prints names that corner and its version instead of "your corner v?".

## 0.7.0 — The class is code, the world is environment

### Changed
- **The class is code, the world is environment.** A class declares the contract — its doors,
  `language`, state, `@tool`s, events, `render()` — and nothing it runs on. `voice`, `llm`, `stt`,
  `greeting`, `hangup`, `says`, `hears`, `memory`, `knowledge` and `docs` on a class are refused at
  load, before a prompt is printed or a gateway is knocked at, and the refusal names the verb that
  sets each (`pinecall agent set --voice <name>`, `pinecall lexicon add`, `pinecall memory policy`,
  `pinecall agent knowledge edit`, `pinecall docs attach`). Nothing is seeded from the class any
  more and `pinecall start` prints no "the world wins" lines: there is no class value to differ from.
- **Knowledge and bases are two things.** What the agent knows by heart is `knowledge`: a page of
  Markdown in its settings, per world and corner, versioned, read whole into the prompt's static
  block on every call — written in the console's Settings ▸ Knowledge or with `pinecall agent
  knowledge edit` (`$EDITOR`), and open to a supervisor's or manager's key (`words`). What a turn
  searches is `bases`: the documents pushed with `pinecall docs push` and attached with `pinecall
  docs attach <base> --k <n>`. A class reaches them from a tool with `await
  this.knowledge.search(query, { k })`, and a class that searches in a world where no base is
  attached is refused at registration naming `pinecall docs attach`.
- **`pinecall knowledge` is `pinecall docs`** — `push`, `list`, `drop`, `eval`, and now `attach`,
  `detach`, `attached`. `pinecall agent` prints two rows, `knowledge` as a size and `bases` by
  name; `clear` takes either.
- **One project layout.** `agents/<name>/agent.tsx` and beside it only what that agent uses;
  `lib/` shared; `docs/<name>/` the documents it searches and nothing else; `test/<name>/goldens/`
  the conversations `pinecall test` runs with `docs.json` and `memory.json` — the retrieval and
  recall goldens — beside them; `test/<name>/personas/`; `test/<name>/memory/` the extraction
  cases. A directory holding a bare `agent.tsx` is no longer a project: the verbs look for
  `agents/<name>/agent.tsx` and say so. Business knowledge is not in the repository.
- `examples/clinica-norte` is the one example, on that layout; `examples/tienda-sur` is gone.
- `pinecall pipeline` and the console's Pipeline screen read the three legs as the next call is
  built and mark nothing as `turned` or `← set`: with no class value to differ from, every value is
  the world's, and Settings is where it is changed.

### Fixed
- `pinecall agent stop ""` asks which app, as a bare `stop` does, instead of posting to
  `/v1/apps//stop` and printing the gateway's 405.

## 0.6.0 — What is running, where, and a stop it obeys

### Added
- **What is running, and a stop.** `pinecall agent list` prints every process holding the org's
  agents in the world asked — the agents, whose corner, the machine and address, the SDK, since
  when — and `pinecall agent stop <app>` closes one: the process prints `stopped by <name>` and
  exits instead of dialling back. The console's Overview gains the same list, with a Stop per row.
  The SDK sends the machine's name at `agent.register` and hears a stop on `pc.onStopped`.

## 0.5.0 — One key a person, a project linked to its org, `pinecall start`, and nothing promoted

### Added
- **`pinecall link`: a project's folder is linked to one org.** In the project's folder it signs
  the machine in through the browser if it is not, asks which of your orgs this is (`--org`
  names it), mints your key there and writes `PINECALL_KEY` — and `PINECALL_URL` when the gateway
  is not the cloud — into `./.env`, leaving every other line as it was, and warns when `.env` is
  not in `.gitignore`. A second org is a second folder.
- **One key per person, and `--prod` on any verb.** Your role says what you do; a per-person
  **production** switch, set by an admin (an admin's is always on), says whether you may do it in
  production. `--prod` anywhere on the line sends `pinecall-env: production` for that command; the
  gateway answers `403 <name> has no production access: an admin gives it in Team` when the switch
  is off. Nothing named is the sandbox. `pinecall whoami` ends `· production: yes|no`.
- **`pinecall agent`: what the org set over the class, per world and per corner, a version a row.**
  The three corners on one page — yours, the team's, production's — `set` with the version it
  was read at (a corner that moved is told so, never written over), `clear`, `history`, `diff`,
  `rollback`, and `pull`/`push` for whoever keeps a corner in git; `--team` writes the team's,
  `--prod` production's. `list` prints the agents held. The class's own `voice`, `llm`, `stt`,
  `greeting`, `hangup`, `memory` and `docs` seed a world that has nothing set, once; after that
  **the world wins**, and `pinecall start` prints one line per field the class still says
  differently, with what to delete.
- **`pinecall lexicon`**: the org's words — how the voice says a brand, what the ears must know —
  laid over every agent's own `says` and `hears`, whole and versioned per corner, production's with
  `--prod`. A supervisor's or a manager's key opens it (`words`). **`pinecall memory policy`** is
  the memory field of the settings on its own.
- **Agent ▸ Settings and Org ▸ Lexicon in the console.** The corners, the form, the history with
  roll back. On the gateway's console both are **editable**: they write production's corner
  directly, with its history and rollback. A `words` key sees the opening and the memory as fields
  and nothing else.
- **Tokens, where Keys was** (`/tokens`, open to every key): your own keys, and **New server
  token** — a label and a world, production's only for somebody with production access — shown
  once as `PINECALL_KEY=…` for the server's secrets. A server token (`pc_live_`/`pc_test_`) is the
  org's and outlives whoever made it; the list says which world, whose ("the org's · made by Ana",
  "Bruno · their own"), when it was last used, and revokes. Overview says "New server token" and
  "Tokens in use".
- **Team ▸ Production**: a switch per person (an admin's reads *always*), and one in the invite
  form. A person without it who opens the gateway's console sees **No production access**.
- **The SDK takes the world.** `new Pinecall({ url, apiKey, env: "production" })` for a person's
  key; a server's token needs none. `World` is exported from `pinecall/client`. With `mount`, an
  app runs the agent inside its own server — `docs/production.md`.

### Changed
- **`pinecall run` is `pinecall start`.** `pinecall start --prod` runs production's agent, on a
  person's key with production access or on a server's token; `--serve` stays the sandbox's.
- **The key is the project's.** Every verb reads `PINECALL_KEY` and `PINECALL_URL` from the
  environment, else from the nearest `.env` up from where it runs; the gateway is
  `https://box.pinecall.io` unless one names another. v1's `PINECALL_API_KEY` is never read. The
  first line says `key from the environment` or the `.env`'s path.
- **`pinecall login` only signs the machine in**, kept in `~/.pinecall/session.json` (0600,
  `PINECALL_HOME` moves it) with the phone `pinecall line from` said; no verb runs on that key,
  `link` mints from it.
- **The local console, refused, says** *This project is not linked*: `pinecall link`, then
  `pinecall serve`.
- **`pinecall pipeline` reads.** `set` and `clear` say where they went (`pinecall agent set`) and
  exit 2; the Pipeline tab lost its form and points at Settings. The hold melody stays where it was.
- **`agents` left the planned verbs**: it is `pinecall agent list`.
- **Team ▸ Roles says `supervisor` and `manager` open memory**, as the runtime's presets now do.
- **Memory in the sidebar, beside Evals.** What every agent of the org carries between calls, on
  one page: each fact with the agent whose call taught it (a link to that agent's Memory tab), a
  search the gateway runs across every page, **Drop**, and **Load more**. `GET /v1/memory`.
- **Pipeline ▸ Hold melody.** What the caller hears while a tool runs, on the phone and on the
  web: the runtime's own melody, a file of yours (**Upload a file…**, converted by the gateway),
  or off, with **Listen** before a caller does. It has its own doors (`…/pipeline/hold-audio`) and
  is saved when chosen, never by the knobs' Save, which replaces their whole set.

### Removed
- **Profiles**: `~/.pinecall/config.json`, `pinecall config`, `pinecall use`, `pinecall gateway`,
  `--profile`, `pinecall login --key-stdin`/`--as`, and the `"pinecall": { "org" }` field of a
  package.json. A project is linked instead; a server keeps its token in its secrets.
- **`pinecall keys`**: a server's token is made in the console's Tokens screen.
- **`--env` on `start` and `chat`**: `--prod` says the world. `numbers move --env` is unchanged.
- **Promote, for settings and words**: `pinecall agent promote`, `pinecall lexicon promote` and
  the console's Promote buttons. `--prod` writes production directly, history and rollback are the
  safety, and the goldens (`pinecall test`, `pinecall knowledge eval`) run in CI before a deploy.
  `pinecall runs promote`, a call written down as a golden candidate, is unchanged.

## 0.4.0 — The project names its org, `--prod` looks at production, and no signup

### Added
- **A project names its org, and every verb inside it takes that org's profile.** `"pinecall": {
  "org": "<slug>" }` in a package.json; the nearest one that names an org wins, `--profile` still
  wins over it, and a machine holding no profile of that org is refused rather than handed the
  active one. Outside a project nothing changes. Four checkouts of four orgs need no `pinecall use`.
- **`--prod` looks at production for one command.** Any verb, anywhere on the line: it takes the
  profile's production key for that command and keeps nothing, so the next one is in the sandbox
  again — no `pinecall use <org> production` and back. `--env` keeps its meaning where a verb
  takes it.

### Removed
- **`pinecall signup`.** A terminal no longer makes an org: whoever runs the gateway makes it and
  invites people, who arrive with `pinecall login`. The gateway's `POST /v1/signup` door is not
  changed.

### Changed
- **`pinecall config rm` keeps the gateway this machine is pointed at.** It forgets the profile
  named, and the active mark when that was the one, and no longer drops what `pinecall gateway
  <url>` wrote.
- **The console's Live and Chat read the reply in flight from `@pinecall/protocol` 0.3.0's
  reducer.** `agent.transcript` is a delta — one word with its timings on a voice call, one model
  token on a written one — and the reducer joins them into `state.live.agent`, cleared by
  `turn.agent`; the console keeps no joining of its own. The dependency is `^0.3.0`.
- **The console's Live screen.** The words being said are the call's last row, word by word, and
  the list follows them down; the pane is 320 to 400px and every pane is dragged wider or narrower
  and found as it was left; a measurement is a ruled row that never breaks a number.
- **A session with no audio to play draws no player** — a written call keeps no recording.
- **Team draws no Disable and no Remove on your own row.** The gateway refuses both for the person
  asking; the screen no longer offers them.
- **No country codes in the console.** The dial guards are four; which countries a dial may reach is
  the carrier account's own setting.
- **The console carries the new logo and mark.**

## 0.3.1 — One login for every org and both worlds, and the console redesigned

### Added
- **`pinecall gateway [url]`** — where this machine is pointed, and one word to point it somewhere
  else. Every verb goes to `https://box.pinecall.io` until it says otherwise, so a person on the
  cloud types `pinecall login` and nothing else; a box of your own is named ONCE and every verb
  after it goes there. A URL on `pinecall login` still wins for that one command.

- **One login keeps every org and both worlds.** `pinecall login` writes a profile per org the
  person belongs to, named after the org, each holding their sandbox AND production key (the
  gateway mints them from the one in hand). `pinecall use <org>` moves between orgs and `pinecall
  use <org> production|sandbox` between worlds, with no second login; `pinecall config` says which
  worlds a profile holds. A person still only LOOKS at production: `app` there is a machine's key.

- `pinecall signup` asks for a password in the GATEWAY's own rule, read from
  `/.well-known/pinecall`, instead of a number of its own that could refuse what the box accepts.

### Changed
- **A machine with no profile is on the cloud, not on localhost.** `pinecall login` with no URL was
  already the cloud's; now the same is true of every verb that runs before a key is kept, and the
  refusal says *not signed in to <gateway>* with the one-word verb that fixes it.
- **The console, redesigned.** One light theme in Inter, its colours in one file
  (`ui/tokens.css`) and its parts in `ui/` — page, card, stat, grid table, controls, pill, icons
  drawn in the repo. A sidebar in three groups (Agents, Gateway or Sandbox, Settings) with live and
  count badges, folding to icons; a top bar with a switcher whose two environment chips open the
  OTHER console at the same path; an agent's head and tabs; ⌘K over screens, agents and listed
  sessions. **Overview moved to `/overview`**; `/` is Home. The table in `lib/mode.ts` now carries
  each screen's group and icon. The dark theme is gone.
- **Live is the org's floor in three columns** — the calls, one watched, what it holds — with the
  whole supervisor's desk under the call's head; a simulated call opens there. **Calls is an
  inbox**: an agent's sessions grouped by contact, their messages read from each call's log, and a
  composer that writes as the agent into a live text call.
- Sessions search by id, number, caller and outcome, filter by agent and channel, and open a call id
  pasted whole; Talk and Chat sit beside an Inspector of the call's log; a chat that has ended reads
  as a transcript.

### Added
- **Home**: today against yesterday, the calls that need a look, who is on the floor, where calls
  arrive, and what is left to set up.
- **On a gateway with the console's doors** (the runtime's `docs/protocol/console-api.md`; each is
  probed, and an element whose door answers 404 is not drawn): the day's numbers, the median answer
  and the budget (`GET /v1/insights`); `escalated · low score · promise made` on a row; judging
  turned on from Home; sessions searched, counted and paged by the gateway; unread and names in
  Calls, and a message into a WhatsApp thread inside its window; every fact an agent remembers, one
  dropped; a judge attached to a finished call; the widget's title, tagline, greeting, accent and
  autostart kept per agent and world; the workspaces a password opens, offered on the sign-in card;
  a member's password reset by a one-use link from Team, and *Forgot password* saying so.
- **Talk takes writing beside the voice**: a composer under the conversation sends what is typed
  into the same call (LiveKit's `lk.chat` text input), and the transcript reads as bubbles.
- **A session opens on its recording**; consent proof, the prompt's blocks and the full log fold
  under one *Details* card that a `#seq-N` link opens.
- **Team**: a Roles table — what each role opens — and **Single sign-on**, an org's own OpenID
  Connect provider set from the console (`GET`/`PUT`/`DELETE /v1/org/sso`); the sign-in card offers
  *Continue with SSO* on a gateway that has it, finding the workspace by the email's domain.
- **Outbound calls**: Numbers sets the org's outbound trunk up plan-first and shows the guards an
  operator set (`GET`/`POST /v1/carrier/outbound`), a SIP carrier declares where the box sends the
  calls it places, and the Calls inbox gains *Call back* and *Call a number* (`POST
  /v1/agents/{slug}/dial`) once the org can dial.
- `lib/sessions-wire.ts`: session lists read with `score`, `flags`, `total` and `next` optional,
  until the protocol that carries them is published.

## 0.3.0 — The sandbox's console on your machine

### Added
- **`pinecall serve`: the sandbox's console, on your machine.** `http://localhost:4100` is the
  console for what YOU are running — your copies, their calls, chat, suites, knowledge, memory, the
  widget, phone testing. It is a sidecar: every request is forwarded to the gateway with the
  profile's sandbox key, which never reaches the browser, so there is no login. One per machine (a
  second one for the same gateway and org points at the first), loopback only, and a foreign `Host`
  or `Origin` is refused. `pinecall run --serve` is both in one terminal; a plain `run` names a
  sidecar that is up. A production key is refused with where production is watched.
- **Phone testing**, a screen of the local console: the org's production numbers, the agent each
  reaches, and whether the gateway knows which phone is yours (the runtime's `GET /v1/line/numbers`).
- `Pinecall#onConnected(listener)`: heard on the first connect and on every reconnect.

### Changed
- **The gateway's console shows production, and only production.** The world toggle, the world
  choice at sign-in and the copies per person are gone from it; Chat and running a suite are the
  local console's. One bundle, two modes, and which screens each has is one table
  (`src/cli/ui/console/lib/mode.ts`). A browser that held a sandbox key from before is moved to the
  same person's production key.
- `pinecall run` in the sandbox prints the local console's URL, or the verb that opens it, instead
  of a gateway link with a login code. In production it prints the gateway's, as before.
- The phone `pinecall line from` kept is re-sent on **every** connect, in every mode, not once per
  start in the plain log only.

### Fixed
- `pinecall knowledge push <dir> --agent <name>` (and `eval <golden> --agent`) ignored `--agent` at a
  project's root; the agent named gives the base.
- The usage of `chat`, `prompt` and `line` says `--agent`, and `line` says it works on a production
  number. Evals' empty roster names the goldens folder of a project, not only `test/goldens`.
- A gateway that restarted printed a stack per redial under `pinecall run`. It is one line now,
  `gateway  … — reconnecting`, and `gateway  back`.
- **Test on the production number.** `pinecall line from <+your-phone>` now reaches your sandbox
  copy on a production number too (the runtime's `rings-for` door): your phone reaches the agent
  you are running, every other caller reaches production. `pinecall run` re-sends the phone when
  it starts, for every agent, not only one that declares a number, so a gateway that lost it learns
  it back from the next run instead of quietly sending your test call to production.

## 0.2.0 — A project of several agents

### Added
- **A project of several agents.** `agents/<name>.tsx` at a repository's root, with every folder
  the verbs read shared by name — `knowledge/<name>.md` and `knowledge/<name>/`,
  `test/goldens/<name>/`, `test/personas/<name>/`, `memory/<name>.golden.json`. At that root
  `pinecall run` holds every agent on one socket, each line prefixed by its slug; `test`,
  `knowledge push|eval` and `personas list` act on each agent against its own folders; `chat`,
  `simulate`, `prompt`, `remember`, `memory eval` and `line` take `--agent <name|slug>`. One agent in
  its own folder reads beside its `agent.tsx` as before. The paths are one function,
  `src/cli/home.ts`, and every console door (goldens, chat, simulate, knowledge, memory) reads the
  agent's home.
- **No goldens is none, not an ENOENT**: an agent with no `test/goldens` yet has an empty roster.
- **0.1.0, and the wire comes from the registry.** `@pinecall/protocol` is `^0.1.0` instead of
  `workspace:*`: pnpm rewrites a workspace range to the version of the checkout next door, which
  is not a version anyone can install. The sibling checkout stays in `pnpm-workspace.yaml` so a
  clone of the three repos still builds both, but the dependency resolves from npm.
- **A release is a tag, and the tag has a guard in front of it.** `release.yml` fires on `v*`:
  `guard` refuses unless the tag and `package.json` say the same number, `gates` runs the same
  `ci.yml` every push runs — a tag is not a branch, so without that the release path had no gate
  at all — and only then does `publish-npm` touch the registry, over OIDC with no token stored
  anywhere. The package is packed with `pnpm pack` and published with `npm publish <tgz>`, because
  `npm pack` does not apply `publishConfig`: the manifest it builds still points `main` and `bin`
  at `src/` and `bin/`, neither of which `files: ["dist"]` ships. `scripts/the-version` refuses
  while `@pinecall/protocol` is `workspace:*` — pnpm would rewrite it to the version of the
  checkout next door, which is not a version anyone can install. Protocol publishes first, always.
- **`pinecall numbers`, and `numbers move` crosses the two worlds.** An org buys ONE number, so a
  team wanting to try a new agent on the real line had nowhere to try it: a second number is a
  second bill, and a third world would be a third of everything. `pinecall numbers move +34… --env
  sandbox` points the org's own number at the sandbox for an afternoon and back again — one row,
  in effect on the next call, with the carrier untouched because a call arrives at this box
  whichever world answers it. Beside it: `list` for the key's world, `import` off the org's
  carrier account (`--dry-run` prints the steps and writes nothing) and `drop`. It replaces
  `phones` in the planned table, because the door, the console's screen and the runtime's CLI all
  say numbers.
- **The front page says whose corner each agent is, and filters by it.** The sandbox holds one
  agent per person, and a key that opens `team` — an admin's, the operator's — is now answered
  every member's corner rather than only its own, so the same slug arrives several times. The page
  gains a WHOSE column and a choice of *everything* / *mine* / *the team's*; the selector and the
  rail's count stay one row per slug, because a screen is addressed by slug alone and the door
  behind it answers in the corner this key opens. A developer sees none of it: there is one corner
  and nothing to filter.
- **The console signs out.** A way out beside whose console it is, which the page had none of:
  a key is the tab's and dies with it, so closing the tab was the only way to stop being signed
  in — no use at all to somebody who wants to come back as somebody else. It forgets every world's
  key rather than the one on screen, because the toggle mints the second from the first.

### Changed
- **`pinecall keys revoke` takes the fingerprint `keys list` prints.** The listing shows the first
  twelve characters, because a full sha256 is unreadable in a column, and the door matches the
  whole hash — so revoking the word on the screen answered `404 no live key of this org has the
  fingerprint …` for every key there was. `revoke` resolves what you typed against the org's own
  rows first: the whole hash still works, a word that names two keys is refused with both, and one
  that names none says which verb lists them.
- **The nightly bootstraps the way a person does.** It ran on `PINECALL_DEV_KEY: dev` and
  `PINECALL_URL` — one key that needed no `api_keys` row, and a variable the CLI no longer reads —
  so it would have failed every night from now on, and for a reason that had nothing to do with
  the goldens. It now does the three steps the walkthrough does: `migrate up`, the gateway, then
  `keys issue` piped straight into `pinecall login --key-stdin`, with `PINECALL_HOME` saying where
  that profile goes. The key never becomes a variable, a file of its own, or a line in the log.
- **La agenda de `clinica-norte` lee la hora en la zona del centro.** `new Date(startsAt).getHours()`
  da la hora de la MÁQUINA: en un runner en UTC el hueco de las trece era el de las once, así que
  la regla que lo rechaza se aplicaba a otro hueco y el que dos pruebas buscaban no existía. Verde
  en un portátil en +02:00 y rojo en CI, que es la peor forma de fallar. `hourOf(startsAt)` lo lee
  del texto, que lleva la zona escrita.
- **Nothing tells you to type `pinecall ui` any more.** The verb was deleted when the console
  became the gateway's page, and eleven places went on naming it: the supervise desk's own line,
  `pipeline --help`, the sentence a simulation prints when it ends, and the console's Evals page,
  in a `<code>` a person reads on screen. A test pins the prose now, the way one already pinned
  the group list.
- **`pinecall --help` names every verb there is, and only those.** It advertised `ui` for four
  days after that verb was deleted — typing it answered `no such group: ui` while the help said it
  was there — and it never grew a row for `line`, built and documented all along. The table is
  hand-written and had drifted both ways; a test now pins it against `builtNames()`. `chat --env`
  is in `docs/the-cli.md` too, which it was not.
- **`pinecall config rm <name>`.** A profile is a key in a file and there was no way to take one
  out: a gateway that had moved and a key that had been revoked both stayed on the list for good.
  It forgets the row and takes the active mark with it rather than leaving it pointing at nothing.
- **`~/.pinecall/dev` is gone, with the runtime's dev key.** A local gateway used to write that
  file at every start and this CLI folded it in as a profile nobody had kept — the one source that
  beat both `pinecall login` and an exported key, so a verb could land somewhere nobody chose. A
  local gateway runs the same Postgres and the same issued keys a box does now, so it is
  `pinecall login http://localhost:8080` like any other gateway.
- **`--env` asserts which world you are in, and never selects one.** A key opens one world, so a
  flag that CHOSE would be a flag that lies; `pinecall run --env production` says which world you
  believe the key in hand opens, and the verb stops when it opens the other. Nothing said means
  the sandbox — a deployment types it out loud, which is the deliberate act it should be. The run
  asks the gateway BEFORE the socket rather than reporting where it landed after.
- **The world things are written in is the `sandbox`, not `development`.** One word was naming a
  world and naming "mine" at the same time, and `env: development` did not say whether it was a
  laptop or a box.
- **`pinecall chat [agent]` takes a slug, and `--file` takes the file.** Named an agent, chat
  mounts nothing and is only the caller's side: a written call at whatever is already holding that
  slug — your own `run` in the other terminal, or a colleague's. `--agent` used to mean a slug in
  three verbs and a FILE in six, which is a flag with two meanings and no way to tell which one
  you got: it is a slug everywhere now, and `test`, `simulate`, `remember`, `personas`,
  `knowledge` and `memory` take `--file`. A path typed where a slug goes is told so.
- **A free slot in `clinica-norte` has an id, a real date and a specialty.** Reserving used to
  mean repeating a phrase back — a slot was `{ when: "martes a las diez", doctor: "…" }` and
  `book` took the sentence — so choosing was comparing text, and text comparison failed both ways
  it can: two slots at the same hour with different professionals were indistinguishable (a caller
  picked five o'clock with one physiotherapist and was booked with a different doctor), and a
  recogniser that mishears the hour left nothing to identify a slot by at all. `book` and
  `propose` now take the id the agenda gave, and nothing else. `startsAt` carries the date and the
  zone, because "martes a las diez" does not say which Tuesday. And `freeSlots` asks what the
  appointment is FOR: the agenda held three names and no specialties while the knowledge base
  described nine professionals with theirs, so the model was left to join the two itself.
- **Talk is two columns.** The door and the words on the left, the call's own log on the right,
  instead of the log stacked underneath: a person talking to an agent and the log of that same
  call were never both on screen without scrolling. Stacks again under a laptop's width.

### Added
- **The console accepts an invitation.** `/invitations/<token>` is a card where the person the
  link names chooses their password and takes their first key; until now the Team screen showed
  the raw token and told them to `POST` it with curl. Team hands out the link instead, and so does
  the operator's `orgs invite`. The card knows the token and nothing about the person — the token
  is the right, and a card that said whose it was would tell a stranger who found the link.
- **An admin page for the operator, at `/admin`.** A second browser program beside the console,
  with its own bundle, its own router and its own credential: the box's ops key, typed in and
  proved at `GET /v1/ops/whoami` before it is kept, under a storage name of its own. Four screens
  — Orgs (every tenant, and one of them whole: its quotas against what it is holding, its keys,
  its people read-only, the vendors it brought), Routes, Fleet with its cordons, and Usage folded
  off the log. Nothing about a plan is on it: what an org is charged is not the runtime's to know.
  Two programs and not two sections of one, because the ops key belongs to no org and must never
  reach a tab holding a tenant's — the import table lets neither page name the other.
- **`src/cli/ui/shared/`.** What both pages wear, defined once: the fetch to the gateway and its
  one error shape, the credentials context, the theme, the frame (the shell, the brand, the
  crumbs, the rail, the empty state) and the style vocabulary. The console was where all of it
  lived; it now imports it, and its own stylesheet holds only what is the console's — the agent it
  is looking at, and the two worlds.
- **`docs/worlds-and-teams.md`.** The model as a developer walks it, on one page: the two worlds
  and what is yours against what is the org's, the path from the sign-up to the deploy, the roles
  and the seats, two developers on one agent, and the four traps. Linked from the README, the
  tutorial and the CLI page.
- **`pinecall whoami` and `login` say the world.** `org clinica · key k_1 · sandbox · laptop`:
  where you are is the key you hold, so the verb that says which key you hold says which world.
- **`pinecall keys`, and a Keys screen.** `issue | list | revoke` the API keys this org's machines
  run on, and the same three in the console. A key issued there is a machine's: it holds `app` in
  production unless `--scope` says otherwise, names nobody, and is printed once. It is the last
  step before a deploy, because a key a person holds by being logged in no longer holds an agent
  in production — the process on the box does.
- **Numbers, the whole screen.** The org's carrier brought from the console — a Twilio account,
  verified once, or a SIP peer with its own networks — shown by kind and account and never a
  secret, replaced or forgotten; a number imported from what that account owns, picked from a
  list, or bought on the box's account by country and area code; every write preceded by the
  gateway's own plan (`?dry_run=true`) drawn step by step and confirmed by a second click; a
  bought number marked; one let go from its row. Before this the screen only listed.
- **`pinecall signup`.** The one verb that needs no key: it makes an org (at
  `https://box.pinecall.io` unless another gateway is named) with you as its admin — allowed
  whatever that gateway's people decided for a new one. The sign-up answers a production key; a
  terminal is a laptop, so it asks `/v1/login/env` for the same person's DEVELOPMENT key and keeps
  that one in `~/.pinecall/credentials` exactly as `login` keeps one — `pinecall run` and
  `pinecall chat` work straight after, and the console link it prints signs the browser in to
  production, where the org's numbers, people and usage are. A gateway that mints no second world
  is said out loud and the production key is kept. The password is typed in silence or read from
  stdin, never a flag. It prints a console link that signs a browser in once. Both it and `login`
  now say out loud when an exported `PINECALL_API_KEY` would shadow the key they just kept, and
  `signup` asks `GET /.well-known/pinecall` first so a gateway that opens no sign-up is named
  before anybody types a password, not after.
- **The console signs a person in and never makes an org.** Making one is `pinecall signup` or
  `POST /v1/signup`; the console's login card asks for an org, an email and a password, and points
  at the verb for anybody without one. The page ships inside the runtime every self-hoster serves,
  so a registration form in it would be one flag away from open registration on somebody else's
  box. A test reads the console's sources, comments stripped, and fails if any file knocks at the
  sign-up door.
- **The console's org layer.** Before anybody picks an agent: Live (every call up across the org,
  repainted as `GET /v1/events` says the floor changed), Sessions across every agent, Numbers,
  Team (invite, change, the invitation token shown once), Usage. An agent selector in the header,
  a Production / Sandbox toggle that holds one key per world and mints the other for the same
  person, and a rail that draws only what the key's scopes open.

### Added
- **`pinecall line`: whose terminal the sandbox number rings in.** An org shares one
  sandbox number, so with three developers on one agent it used to ring wherever somebody had
  restarted last — you would dial it to test your change and be answered in a colleague's
  scrollback. The first `pinecall run` to hold an agent takes its line and a second developer
  claims it on purpose; `claim` and `release` are the two moves, and `run` prints the line under
  the console's URL for any agent that answers at a number. With one developer nothing changes and
  the word never appears.

### Changed
- **`pinecall login` signs you in through a browser.** It asked for an API key, and a person has
  none — the console mints theirs into the tab and never shows it, so there was nowhere to copy
  one from. It now prints a link and opens it: you sign in on the page, where a password belongs,
  and the page hands this terminal a key of its **own** — minted for you, labelled as this
  machine, revoked on its own from Keys. No password ever reaches a shell, and the day an org
  signs in with Google this verb does not change. **With no URL it is `https://box.pinecall.io`
  and it says so** before anything is kept. `--key-stdin` is still the machine's way in.
- **The console has a `/cli` screen**: the card a person opens from their own terminal, naming
  the machine that asked and approving it once.

### Removed
- **`pinecall ui`.** The gateway serves the console now; nothing in this CLI opens a port.

### Added
- **`pinecall run` prints the console's URL** — `https://<gateway>/a/<agent>?login=<code>` — with
  a one-use code that signs the browser in for a key of its own. A gateway that refuses the code
  is one line, and the app runs on.

### Changed
- **`knowledge push` and a contact's memory are your key's world's.** A push with the sandbox
  key a login keeps replaces the sandbox base and never the one the telephone answers from;
  promoting is the same push with the machine's key. A test call's facts stay in the sandbox.
  Nothing in the verbs changed — the gateway reads the world off the key it always sent.
- **Two developers of one tenant no longer take each other's agent.** The gateway holds a
  sandbox agent per person, so `pinecall run` on your laptop and your colleague's are two
  agents: each `pinecall chat`, each suite and each console reaches its own. Nothing in this CLI
  changed for it — what says whose corner you are in is the key, and `pinecall signup` and
  `pinecall login` already keep one per person. The org's sandbox *number* stays one door,
  answered by whichever run started last.
- **`pinecall keys` is now `pinecall providers`.** The verb for the vendor keys an org brought
  takes the name of the scope that opens it (`providers`), and `keys` means the org's own API
  keys, here and at the gateway. The console screen follows: `/providers` is the vendor accounts,
  `/keys` the API keys.
- **The console wears the design canvas.** IBM Plex Sans and Mono, the pink accent on four
  near-blacks (and the paper theme under it), panels with hairlines, the header strip with the mark
  and the breadcrumb, a 204px rail with the accent bar on the screen you are on. Every screen
  redrawn on the canvas's own measures: Calls edge to edge with the list, the head strip, the desk
  and the seq · kind · text timeline; Talk as one centred column with the round door; Chat as
  bubbles off the call's log; Sessions, Evals, Pipeline, Knowledge, Memory, Keys and the org's
  screens in the same panels and tables. Nothing a screen states changed — only how it is drawn.
### Changed
- **The console is served by the gateway at `/`** and holds a person's scoped key, never the
  org's: spent from `?login=`, or asked for as org, email and password, and kept in
  `sessionStorage` for the tab's life. The log stream and the recording carry the key on a header,
  so nothing rides a URL. The header shows who is signed in and which world the key opens.
- **`pinecall run` answers the console for its directory.** A written call to the class, the
  personas and a simulation, the goldens and a suite, the knowledge folder and its golden, the
  memory goldens, a promoted candidate, drift and the reproductions are asked of the gateway,
  which relays them to the `pinecall run` holding the agent (`dev.request` → `dev.answer`). The
  console's screens no longer call `pinecall ui`'s own `/ui/*` server for any of it; the sentence
  for another directory's agent now says `pinecall run`. `Agent.onDev` and `DevRefused` join the
  client's surface.

### Added
- **A chat can open part-way through.** The Chat screen offers the states this directory's goldens
  declare, which is `pinecall chat --state` by name; a conversation that opens in one gets a mount
  of its own, because the opening is applied where the class is held.
- **A broken run's reproductions, in the console.** Evals → a run → the goldens that did not hold,
  each opened whole: the golden as written, every verdict on it, and the requests the model
  actually answered. The log keeps only a hash of each prompt block on purpose, so that file is
  the one place the text is, and `ui/reproductions` is how a page reaches a file on this disk.
- **A model matrix from the console.** The suite form takes models, comma by comma, the way
  `pinecall test --model` is repeated — and a call read on the Sessions screen carries the same
  two buttons the Evals screen has: re-check by code, and promote.
- **The console does what the terminal does.** Five screens landed at once, and every one of them
  runs the very code its verb runs: **Knowledge** (the folder pushed from this directory, the
  bases listed and dropped, the golden asked), **Memory** (one contact read and forgotten, the
  recall golden, the extraction goldens), **Keys** (the provider accounts this org brought),
  **Evals → drift** (each judge's held-rate over two windows) and, on any judged call, **re-check
  by code** (ring 3) and **promote to a golden candidate**. The header says whose gateway this is.
  The console's own doors are a table now (`ui/doors.ts`): a screen that needs something only the
  terminal in the agent's directory can do is one module and one row, and the server that serves
  them knows nothing but their paths.
- **`pinecall simulate --listen` works.** The call comes out of this machine's speakers while it
  happens: the same hidden `observe` seat the console's listen button takes, joined from Node with
  `@livekit/rtc-node` (an optional dependency) in a process of its own, both tracks through
  livekit's own `AudioMixer`, written to whichever of `ffplay`, `play`, `aplay` or `pw-play` is on
  the PATH. The seat is
  knocked for until the room opens, so the ear lands on the greeting. `--listen` turns `--voice`
  on, out loud: a written call has no audio in it.
- **Chat from the console.** A screen of its own: the class of the directory `pinecall ui` runs in,
  mounted once in that process as `pinecall chat` mounts it, one socket per conversation, the tools
  running in that terminal. `--as` is the `as` field of the form. Three doors of the console's own:
  `ui/chat`, `POST ui/chat/say`, `POST ui/chat/end`.
- **`pinecall pipeline`.** What the agent hears, decides and speaks with as the next call would be
  built, the class's opening, the medians livekit measured, and which of the five knobs is turned.
  `set` and `clear` turn the same knobs the console's Pipeline screen turns, over the same door —
  and `set` sends the whole set, so turning one knob never gives another back to the class.
- **Run the goldens from the console.** Evals → Run a suite: every golden of this directory as a
  checkbox, with the caller's first line and what it expects; voice and a noisy line beside; the
  run appears in the table as the gateway opens it. `ui/goldens` and `POST ui/test` are the
  console's own doors, and the suite they run is the one `pinecall test` runs — its orchestration
  moved to `testing/suite.ts` so it is written once.
- **Simulate from the console.** Calls → Simulate: a persona from this directory's
  `test/personas`, written or spoken, judged or not, the line spoiled or clean — and the page goes
  to the call as it opens. Spoken, the listen button beside it is the speakers `simulate --listen`
  always refused to be. The `ui` process runs the same `aSimulation` the terminal verb runs and
  prints the turns; the page reads the log. Two doors of the console's own, `ui/personas` and
  `POST ui/simulate`, never the gateway's.
- **`Call.run`** — the eval run that opened this call, or null for a person, read off the same
  first entry the line is read from. `pinecall test` seeds a golden's state into the call that
  carries a run, and into no other; the `eval_` caller prefix it used to look for is gone.
- **`pinecall test --voice` in the docs**: ring 2 over the same goldens, and where a broken golden
  is written out (`.pinecall/evals/<run>/<golden>.json`) with the requests its model answered.
- **`greeting`: how a class opens a call**, without an `onCall` hook to do it.
  `greeting = "Clínica Norte, buenos días."` is the words, read out as written;
  `greeting = { reply: "saluda y preséntate" }` hands the model an instruction the caller never
  hears and lets it find its own opening. Exactly one of the two, refused at load when it is
  neither or both. `allowInterruptions: false` is the legal notice nobody talks over.
  Clínica Norte opens with words, Tienda Sur improvises — one of each, in the examples.
- **`pinecall sessions [call]`** — the calls this gateway has run, and what one of them came to.
  With nothing after it, one row per call newest first: when it came in, how long it lasted, why it
  ended, what it cost and the line the agent left as its outcome. With a call id, that call's
  **score**: the verdict, how many questions the judging put to a model and what they cost, then one
  line per judge with the question it answered — and, for a judge that did not hold, its own
  reasoning. `--agent`, `--limit`, `--json`. It reads ring 4's judging back; it runs nothing.

### Fixed
- **Clínica Norte's CRM is per call**, hung off the instance like its agenda, instead of one
  module-level map every call in the process wrote into. A `TODO` naming a bridge function that
  never existed is gone. `docs/the-cli.md` no longer lists `sessions` and `supervise` as unwritten.
  `testing-an-agent.md` is split: memory's and the index's goldens have their own page.
- **A reproduction says why there is no prompt, and only then.** `Cell.asked` is a list, or
  `null` when the runtime kept no requests; the file writes the sentence for `null` and an empty
  list for an empty list, where it used to read `[]` as "not recorded".
- **Clínica Norte's knowledge file stops giving procedure.** Three sentences that told the agent what
  to ask before checking the agenda contradicted `freeSlots`'s own description, which had to shout
  them down; the facts stay, the procedure lives in the tools.
- **`pinecall ui` served a blank page from a checkout, and had for as long as it has existed.** Two
  faults, one evening. The console's directory arrives as a URL's path and so ends in a separator,
  and the server guarded its own root with `files + sep` — which reads `…/console//`, which no file
  under it starts with, so every request fell through to the page and the browser parsed a megabyte
  of JavaScript as HTML. And beside the module sits `console/` twice: the built one in the package
  and the SOURCE in a checkout, whose `index.html` points at `main.tsx`, which no browser runs. The
  existence check could not tell them apart. Both are pinned by tests that fail without the fix.

### Added
- **`pinecall supervise <call>`** — a human at the desk, from this terminal. The call's transcript
  as it lands, and one line per move: `w <text>` whispers to the agent, `s <text>` puts a sentence
  in its mouth verbatim, `t` takes the line, `x` gives it back, `e [reason]` ends the call, `q`
  leaves and the call goes on. Every move lands in the caller's own log as its own `supervisor.*`
  entry with a seq, so what a human did is read the way what the agent did is read. The audio is
  `pinecall ui`, which has a room; a terminal has no speakers this process may reach.
- **`hangup = { when: "..." }`** on a class: the model may end the call itself, and you say in your
  own words when. The tool is livekit's own `end_call`, hidden while the agent is greeting, and the
  call's log gets `call.ended` with `agent_hung_up` rather than the drain its close reason would
  otherwise have looked like. A class that declares nothing cannot hang up: only the caller and a
  supervisor end a call. Clínica Norte declares one.

### Removed
- Clínica Norte's `transfer()` tool, which returned a sentence and did nothing. A tool the model can
  call that changes nothing is a trap, and this one was the tool a model reached for on the first
  real call of this project. What replaces it is real: the agent can now end the call.

### Changed
- An extraction golden is the schema's shape, not this package's: `ExtractionGolden`,
  `ExtractionExpected`, `ExtractionBroke`, `ExtractionJudged`, `ExtractionCases` and
  `ExtractionRun` come from `@pinecall/protocol` and are generated, so a case written in
  TypeScript, in Python or in Ruby is one contract and not three that drift. The file format
  is unchanged — a transcript stays a list of `[who, what]` pairs, which the schema now says
  in its own words.

### Added
- `pinecall memory eval [golden.json] [--k n]`: a memory golden, the read side of the table. A
  list of `{holds, asks, expects}` — what memory holds about a question's contact, what the caller
  said, and the fact or facts that should come back — asked of `recall` and answered as `recall@k`
  and `nDCG@10`, computed by code with no model in the loop. No contact of the org is read or
  written: each question's facts go to a scratch contact and are deleted again, which is what makes
  the figures the real ranking. A fact answers when what came back CONTAINS what was expected,
  folded for case, accents and whitespace, because a fact is a sentence a model wrote. Every
  question memory did not answer whole is printed with what came back instead, and the verb exits 1
  when anything did. `memory/golden.json` beside the agent file by default; Clínica Norte ships one
  of seven questions, eight or nine facts each.
- **`pinecall remember [paths]`** — the goldens `memory.remember` is held to, which is the write
  side and the half that persists. A case is one call already held (both speakers, in `said`), the
  facts memory already holds (`holds`), and what must come of the hang-up's one model call: which
  categories got a fact (`writes`), which never did (`never`), which values must not survive in any
  fact's text (`never_says`), and which held facts the call contradicted (`invalidates`) — its
  mirror included, so a model that supersedes whatever it touches is caught too. A case may
  `plants` sentences somebody tried to get into memory, and planting one IS the assertion that
  admission refuses it. Nothing asks a model whether two sentences mean the same thing: a category
  is your own word, a value is a literal, a supersession is an id. One model call per case, run in
  the gateway on the org's own keys against the class this terminal is holding; exits 1 when a case
  did not hold. `test/memory` beside the agent file by default; Clínica Norte ships three.
- A ring-1 golden may open its call already knowing things: `"memory": [...]` seeds the facts the
  `recall` tool answers for that call alone. It is how you test the one thing memory exists for —
  that the agent uses what it remembered — without a contact in a database and without leaving a
  fact behind. Clínica Norte ships one.
- `pinecall knowledge eval [golden.json] [--base <name>] [--k <n>]`: every question of a golden
  asked of the base, and `recall@k` and `nDCG@10` printed — computed by code with no model, so two
  runs answer the same numbers. Prints every question it missed with what came back instead and
  exits 1 when anything did, so a base can be held to its golden in CI. Clínica Norte ships one.
- **`@render(ThePrompt)` on the class, the other spelling of `render()`.** A prompt that has grown
  gets a function beside the class, and the props ARE the instance —
  `Prompt<T> = (agent: T) => Child`, so `({ stage, customer }: Support) => …` stays typed with no
  wrapper. It is exactly `render() { return ThePrompt(this); }` and produces the same block, byte
  for byte. A class that declares both spellings is refused when it is defined: `TiendaSur declares
  both @render(TiendaPrompt) and a render() method; two ways to answer one question — keep one`.
  Tienda Sur is written this way; Clínica Norte keeps the method.
- **`@state` in three spellings**: bare `@state`, `@state({ pii: true })` (sugar for
  `visibility: "pii"`), and `@state({ visibility })`. `pii: true` beside a `visibility` that says
  something else is refused by name.
- **Decorating one field decides them all.** A class that decorates no field has every own field as
  state, as before; a class that decorates any means *these, and nothing else*, so an undecorated
  field on it is the tenant's scratch space — out of the snapshot, out of the prompt, out of
  `state.changed`, and writable with no tool running. It is the first way to keep a helper field
  out of the log.
- **The view is a method of the class.** `render(): Child` on `Agent`, returning JSX, with `this`
  as the state — no view file, no props, no block a class declares of its own. A class with no
  `render()` sends an empty view. The file a tenant writes is `agent.tsx` for that reason; the CLI
  loads either name, and every default path, usage line and doc says `agent.tsx`.
- `Agent#remembers(text)`: whether memory has already told THIS call something under that word —
  the word a fact was filed under, or the fact itself. The bridge folds the call's own `memory.ops`
  entries into it (`runtime/recall.ts`) and re-renders, so a branch that asks about the caller
  follows what the runtime actually found. It replaces the old `memory.has()` of the view props.
- What the class knows, reads and remembers travels in the declaration: `knowledge` is read beside
  `agent.tsx` and sent whole as `{ path, text }` (a missing file is refused at load, with the path);
  `docs` names the base it was pushed under — `docs = "clinica-norte"` or
  `{ base, mode?, k?, minScore? }`, typed as `DocsDeclaration` — and the old glob form is refused
  with the verb that replaces it; `memory = { remember, forget }` is `MemoryDeclaration`.
- `pinecall keys add <vendor>` · `rm <vendor>` · `list`: the org brings its own provider key for
  a vendor without an operator, on its own API key. The key is read from stdin and never from the
  command line, it is echoed and printed nowhere, and `list` answers vendor names alone — no door
  of the runtime ever gives a provider key back. `keys` leaves the planned table.
- `pinecall knowledge push [dir] --base <name>` · `list` · `drop <base>`, and
  `pinecall memory <contact>` · `memory forget <contact>`: the folder of `*.md` to the gateway
  under a name, and one contact's facts read or erased. Both leave the planned table.
- `pinecall chat --as <contact>`: the written caller says who it is, and the socket carries it as
  `?contact=`, so an agent that declares `memory` can be made to remember somebody from a terminal.
- The console: a `memory.ops` and a `docs.sources` each read as one row of the live timeline, and
  Sessions prints a lookup as `n sources · ms` with what was found one click under the turn.

### Changed
- **Nothing the framework writes is a hole for somebody else to fill.** The view is one block, all
  of it the tenant's words: what memory recalled and what the knowledge base returned reach the
  model as `tool_result` blocks, JSON-encoded, where content from outside the conversation belongs
  (`runtime/docs/security/prompt-injection.md`). `pinecall prompt` and `pinecall run --show-prompt`
  print the three regions with no marker line anywhere.
- The `knowledge` block is the runtime's to write, from the `{ path, text }` the declaration already
  carries: the app sends nothing for it, because the same file twice is a worse bug than an empty
  block.
- Both examples are one `agent.tsx` with a `render()` and no `views/` directory, and they say how
  their chunks come back on the declaration — `docs = { base, k: 4, minScore: 0.5 }` — instead of
  inside the prompt. Their ring-0 suites and their captured prompts were retaken.
- `promptOf(agent)`, `showPrompt(agent)` and `mount(Class, { pc, … })` no longer take a `views`
  argument, and `load()` no longer resolves a view file. `describe(ctor, source, file)` takes the
  file name, because the parser reads the dialect off the extension.
- `render(agent)` is now `promptOf(agent)`: `render` is the decorator a class wears, and one name
  cannot be two things. `layout()` is no longer exported — `promptOf` is that function under the
  name a tenant reads it by.
- The class docstring survives a class decorator: the parser puts a decorated statement's start
  after the decorator, so a docstring read up to there found `@render(…)` in the way and gave up.
  It is read up to the first decorator now.
- `withAuthor`, `withAuthorAsync`, `currentAuthor` and `UnauthoredWrite` moved to
  `agent/authors.ts`. Who is writing the state is one idea, and `agent.ts` was at the 400-line
  ceiling the tree test holds.

- The framework, from zero: the `Agent` base whose fields are the state and whose every assignment
  is a change with an author; `@tool` with `when` / `stage` / `confirm` / `preview` / `pii` /
  `timeout`; docstrings read out of the class's own source; `@state({ visibility })`;
  `static events`; the four lifecycle hooks; `collapse`, `restore`, `startIn`, `last(contact)`.
- The views: JSX that renders to text, and the prompt as named blocks in two regions in one order —
  `identity`, `knowledge`, `tools`, then the view, which is the whole dynamic region.
- The live call as a value: the room reduced from its own entries, the turns, and the six verbs —
  `say`, `reply`, `send`, `mute`/`remove`, `invite` — each one command on the wire.
- `pinecall/client`: one socket, the agents on it, the tool calls it answers, and any log the key
  can read, folded by the protocol's own reducer. Plus `pinecall/client/testing`, a gateway and a
  log that are not there, so an app's own suite needs neither a network nor a key.
- The bridge: `mount()` — one live instance per call, the opening state seam, and a sync that
  sends only the block whose text actually changed.
- The CLI: `run`, `chat`, `ui`, `prompt`, `test`, `simulate`, `eval`, `runs`, `personas`, `login`,
  `whoami` — and `groups.ts`, which declares every verb the design names and this tree has not
  written, so a person is told what a verb *will* be instead of "unknown command".
- One resolution order for the gateway and the key (`cli/env.ts`), `~/.pinecall` at 0600, and a
  gateway on a dev key that ignores an exported `PINECALL_API_KEY` out loud.
- The console `pinecall ui` serves on 127.0.0.1 under a nonce: Talk, Calls (live), Sessions,
  Pipeline and Evals. The org key never reaches the browser.
- Two examples written the way a customer writes one — `clinica-norte`, `tienda-sur` — with their
  goldens, personas and prompt-blocks tests; CI (`scripts/check`) and a nightly that drives both
  on two models and watches each judge's drift.
- `ARCHITECTURE.md`, `docs/` (writing an agent, the prompt, testing, the CLI), and
  `.claude/skills/`.

### Changed
- The prompt is a list of named blocks in two regions instead of two strings: `identity`,
  `knowledge` and `tools` (static, cached), the history, then `view` (dynamic). `render(agent)`
  returns `Blocks` — `{ blocks, history }`, every block `{ name, region, text }` in send order —
  and `showPrompt()` rules its page `── identity (static) ──` … `── history ──` …
  `── view (dynamic) ──`. `call.setPrompt(name, text)` names a block.
- The console's Live screen gained a `PROMPT` panel and the Sessions screen a section listing
  every block by name with its hash, length and seq, read from `state.prompt` by name.
- The licence is spelled out where a user of the package meets it: the Apache-2.0 copyright line
  is filled (`Pinecall`), `README.md` has a License section, `package.json` carries the author and
  the repository, and `CONTRIBUTING.md` says there is no CLA. npm ships `LICENSE` in the tarball.
- Comments naming a page of the runtime's engineering notebook now say **the runtime's**
  `docs/decisions/<page>.md`: read from this repository, the bare path pointed at a file that is
  not here.
- `pinecall simulate --judge` names `pinecall-runtime sessions show <id>` (and the console) when a
  call never seals. It used to name `pinecall sessions show`, a verb this CLI declares and has not
  written, so the sentence sent a person to a stub.

### Removed
- `<Prompt>`, the tag that rendered its children as paragraphs: `<>` already does exactly that,
  and no example ever wrote one. The name is the type `Prompt<T>` now.
- The whole marker apparatus: `<Memory>`, `<Retrieved>`, `<Knowledge>`, `marker()`, `Fills`,
  `fills()`, `withFills()` and the `AsyncLocalStorage` that carried them; `ViewProps`, `View`,
  `Views`, `propsFor`, `viewFor`, `checkViews`, `layoutOf`, `declaredBlocksOf`, `PromptDeclaration`
  and `static prompt`. A view file, a prompt block a class declared for itself and a hole a
  gateway filled are all gone, with their tests. `PROMPT_BLOCKS` is the layout, and it is the
  framework's.
- `Regions`, `staticRegion`, `historyRegion` and `dynamicRegion`: the blocks above are what they
  were. `setPrompt(region, …)` went with the wire's `region`.
- `@pinecall/web`, the browser package: nobody installed it and it read a projection nobody read.
