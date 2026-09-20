# The CLI

`pinecall <group> [args]`. Every verb, what it is for, what it takes, and what it prints. The doors
underneath are the gateway API — the **runtime** repo's `docs/protocol/gateway-api.md` — and this
CLI is a client of that contract and of nothing else, so anything here is something your own code
can do too. Which world a verb acts in, and what is yours against what is the org's, is one page:
[worlds-and-teams.md](worlds-and-teams.md).

One module per group, imported only when it is asked for: `pinecall prompt` must not pay for a
websocket client. `pinecall` with nothing after it prints the whole CLI on one screen, built verbs
and planned ones alike, and `pinecall <group> --help` prints that group's flags.

```bash
pinecall start               # in an app's directory: the process you deploy
npx pinecall start           # from a project that installed the package
pnpm exec pinecall start     # inside this workspace
```

In a checkout the CLI runs from source through tsx (`bin/pinecall.js`); what npm installs is the
compiled `dist/cli/index.js` and needs no loader.

Running the gateway yourself, from nothing? The runtime repo's `docs/from-zero.md` is that
path end to end, with every output under it.

## The map

| verb | what it is | needs the gateway |
|---|---|---|
| [`link`](#link) | this project's folder to one of your orgs: your key, written to its `.env` | yes |
| [`start`](#start) | the app registered and answering — **the process you deploy** | yes |
| [`serve`](#serve) | the sandbox's console on this machine, `http://localhost:4100`: your copies, your calls | yes |
| [`chat`](#chat) | the same app in this terminal, and a written caller against it | yes |
| [`prompt`](#prompt) | the exact prompt a state would produce, offline | **no** |
| [`test`](#test) | ring 1 (and ring 2 with `--voice`): the goldens through this process | yes |
| [`simulate`](#simulate) | a model plays one caller, live, and the call is judged at hang-up | yes |
| [`eval`](#eval) | ring 3: one real call re-checked by code | yes |
| [`sessions`](#sessions) | the calls this agent has run, and one of them whole | yes |
| [`runs`](#runs) | the suites: list, show, diff, promote a call, watch the drift | yes |
| [`agent`](#agent) | the agent's settings — yours, the team's, production's — set, knowledge, history, diff, rollback, pull, push | yes |
| [`lexicon`](#lexicon) | the org's words: how the voice says them and what the ears must know, shared by every agent | yes |
| [`pipeline`](#pipeline) | what it hears, decides and speaks with, as the next call would be built | yes |
| [`line`](#line) | which phone is yours, and whose terminal a call from anybody else's rings in | yes |
| [`numbers`](#numbers) | which number reaches which agent, and the world it answers in | yes |
| [`personas`](#personas) | the org's synthetic callers, kept by the gateway: list, show, add, edit, rm, try, push | yes |
| [`docs`](#docs) | the documents the agent searches: push, list, drop, eval, attach, detach, attached | yes |
| [`memory`](#memory) | what memory kept about a contact, forgetting it, and recall's golden | yes |
| [`remember`](#remember) | the extraction goldens: what a hang-up makes of a call | yes |
| [`supervise`](#supervise) | listen in on a live call and move on it | yes |
| [`providers`](#providers) | every vendor this build runs, and the keys this org brought | yes |
| [`callbacks`](#callbacks) | the numbers people left when every seat was taken | yes |
| [`login`](#login) | sign this machine in through a browser; `link` asks for it when it is needed | yes |
| [`whoami`](#whoami) | which gateway, which org, whether you act in production, and where the key came from | yes |

`--prod` is no verb's and every verb's: anywhere on the line, it runs that one command in
production ([below](#where-the-gateway-and-the-key-come-from)) — and a verb that asks no gateway
anything, `prompt`, refuses it instead of accepting a world it never visits.

Declared and not written: `new`, `g`, `observe`, `costs`, `call`, `tokens`, `deploy`. Typing one prints `<verb> is not built yet: <what it is for>` and exits 0 — a person who types a verb deserves
better than "unknown command". `src/cli/groups.ts` is the one place that says which half of the
CLI is still a design, and a verb leaves that table in the commit that writes it.

---

## Where the gateway and the key come from

**The project's, the way any app reads its own secrets** (`src/cli/env.ts`). Every verb reads
`PINECALL_KEY` and `PINECALL_URL` from the process's environment — a server's secrets, a CI job's
— else from the nearest `.env` walking up from the directory it runs in, which
[`pinecall link`](#link) wrote. The gateway is `https://box.pinecall.io` unless one of the two
names another. Nothing else is read: v1's `PINECALL_API_KEY` never is, because a shell that still
had v1's key exported once pointed every verb at another org with every line reading the same.

**A project folder is one org.** `pinecall link` in the folder writes your key for the org you
pick; a project of another org is another folder with its own `.env`, and nothing is ever
switched. There are no profiles, no active mark and no flag that points one command elsewhere.

```console
~/clinica $ pinecall link
  1. clinica
  2. dental-sur
which org is this project? 1
▸ clinica · PINECALL_KEY written to .env
```

**One key per person, and `--prod` for one command.** The key is yours: your role says what it may
do, and in the sandbox it does that in your own corner. `--prod`, anywhere on the line of any verb,
sends `pinecall-env: production` on every request and every socket of that one command
(`src/client/signed.ts`) and keeps nothing, so the next command is in the sandbox again. The gateway
lets it through only while your production switch is on — an admin's always is — and otherwise
answers `403 <name> has no production access: an admin gives it in Team`.

```console
~/clinica $ pinecall sessions            # your sandbox calls
~/clinica $ pinecall sessions --prod     # production's
~/clinica $ pinecall agent set --voice carolina --note "warmer" --prod
```

**A server's token** is the other kind of key: the org's, made for one world in the console's
Tokens screen, and put in the server's secrets as `PINECALL_KEY`. It needs no `--prod` — it opens
the world it was made for — and nothing on a server logs in. [production.md](production.md) is
that path.

`whoami` and `callbacks` open by printing where they went: `gateway <url> · key from <the
environment | .env> · production (--prod)`, the last part only when `--prod` was typed. The rest
get on with the answer. With no key anywhere every one of them is refused: ``no PINECALL_KEY
here: `pinecall link` in the project's folder writes it to .env (a server keeps it in its
secrets)``, and the exit code is 2. **`pinecall whoami` is the first thing to run when a door
refuses you and will not say why.**

## `~/.pinecall/`

| file | what it holds |
|---|---|
| `session.json` | `{ "gateways": { "<url>": { key, calling } }, "last": … }` — this machine signed in, as a person, one row per gateway (`src/cli/signed-in.ts`). No verb runs on it: `link` mints a project's key from it, and `calling` is the phone `pinecall line from` said for that gateway, re-sent by every `start` |

The directory is `0700` and the file `0600`; `PINECALL_HOME` moves it. A key is never printed,
never logged, and never put in a URL. A `.env` that `link` creates is `0600` too.

---

# Writing the agent

## The project

One layout, whether the repository holds one agent or five. Every folder a verb reads is under the
project's root, by the agent's name (`src/cli/home.ts`):

```
agents/<name>/agent.tsx          the class — and beside it only what this agent uses (callbacks.ts)
lib/                             what two or more agents share
docs/<name>/                     the documents the agent SEARCHES — the RAG — sent by `docs push`
test/<name>/agent.test.ts        ring 0: the class as software
test/<name>/goldens/             ring 1: the conversations `test` runs; beside them `docs.json`,
                                 the questions `docs eval` asks the base, and `memory.json`,
                                 the questions `memory eval` asks recall
test/<name>/memory/              the extraction cases `remember` runs
```

**The business is not in the repository.** What the agent knows by heart — hours, prices, what
needs an authorisation — is one field of its settings, per world and corner, written in the
console's Settings ▸ Knowledge or with [`pinecall agent knowledge edit`](#agent-knowledge), and
read whole into the prompt on every call. `docs/<name>/` holds only what a turn searches. A class
that still carries a voice, a model, an opening, a memory policy, a knowledge file or a base is
refused at load, and the refusal names the verb that sets it now
([writing-an-agent.md](writing-an-agent.md)).

At the root, every verb that reads a class acts on **every agent**, each against its own folders,
or on the one `--agent <name>` names — by its folder's name (`sales`) or by its slug
(`bidfire-sales`):

| at the root | does |
|---|---|
| `pinecall start` | every agent at once, **on one socket, in one process**; each line prefixed by the slug, one console URL each (`--serve` puts them all on one page). `--show-prompt` prints every agent's prompt under its slug |
| `pinecall test` | each agent's goldens through its own class, one after another; the exit code is the worst. Paths and `--watch` are for one agent, so they need `--agent` |
| `pinecall docs push` · `eval` | every agent that has `docs/<name>/` · `test/<name>/goldens/docs.json`; the rest are named and skipped |
| `pinecall personas try` · `push` | the two that need the class: `--agent <name>` when the project holds several. The other persona verbs name no agent |
| `pinecall chat` · `simulate` · `prompt` · `remember` · `memory eval` · `line` · `start --ui` | one agent: `--agent <name>` is required when there are several |

A project of several with nobody named is refused with the names: `chat talks to one agent and
this project has 2: add --agent dispatch or --agent sales`. A directory with no `agents/` at all is one somebody
typed the verb in by mistake, and the refusal says where it looked. A folder the verb reads and
nobody has written yet is empty, not an error: an agent with no `goldens/` has no goldens, the
console's roster says so, and `pinecall test` names the folder to write one in.

`--agent` means two things, one per kind of verb. In a verb that loads a class it names an agent of
this project, by name or by slug. In a verb that only asks the gateway — `sessions`, `pipeline`,
`runs drift`, `numbers import`, `callbacks`, `docs attach` — it is a slug, because there is no
class to find. `--file` is always a file.

## `start`

```
pinecall start [agent.tsx] [--agent <name>] [--prod] [--serve] [--ui] [--events] [--show-prompt]
```

At a project's root with no file named, every `agents/<name>/agent.tsx` is held at once, on one
socket: see [The project](#the-project).

The app registered on the gateway and answering: **this is the process you deploy**, the same one
on a laptop and on a server. With nothing said it holds the **sandbox** agent, and in the sandbox
**the agent is held per person**: two developers of one tenant each run the same agent and each
reaches their own, while a *number* is one door and rings in one place — a developer's own phone
reaches their copy, and anybody else's call lands where the line was claimed ([`line`](#line)). An
admin, and whoever runs the gateway, see every corner of the sandbox rather than only their own.

**`--prod` runs production's agent**, the one the org's customers reach. On a server that is a
server's token in `PINECALL_KEY`, which was made for production and opens it with or without the
flag; on a person's key it opens only while their production switch is on, and the gateway's
refusal is printed before anything registers. How a server runs it — under the process manager, or
inside your own Node app — is [production.md](production.md).

It binds no port and serves no page. One line per log entry on stdout, and under the connected
line where its console is — **and there are two consoles, one per world**. The sandbox is watched
on your own machine: [`pinecall serve`](#serve) puts it on `http://localhost:4100`, `--serve` does
that from this same terminal, and the line reads `console  http://localhost:4100/a/clinica-norte`
— or names the verb, when none is up. Production is watched on the gateway's own page, which shows
production and nothing else: there the line is `console  https://box.pinecall.io/a/clinica-norte?login=lc_…`,
a one-use code that dies in five minutes, which the page spends for a key of its own and never sees
this process's. Opening that console cold asks for an email, a password, and the org only when
the person belongs to several.

In the sandbox, every time the socket comes up — the first connect and each reconnect, in every
mode — `start` re-sends the phone `pinecall line from` kept for this gateway, whatever agents it
holds and not only one that declares a number, because a production number is the box's route and
no class declares it. The gateway keeps that phone only beside its live table, so a gateway that
restarted learns it back at once instead of sending your test call to production. A gateway that
goes away is one line — `gateway  … — reconnecting`, then `gateway  back` — and never a stack per
redial.

```console
$ pinecall start --serve
gateway https://box.pinecall.io · key from .env
clinica-norte · clinica · sandbox · connected to https://box.pinecall.io · key from .env · tools 4 · doors web
console  http://localhost:4100/a/clinica-norte
line     rings in this terminal · also running: carla@clinica.test
› Clínica Norte, buenos días. ¿En qué puedo ayudarle?
‹ Quería cambiar una cita
→ findPatient({"name":"Ana García","phone":"600000001"})
← findPatient {"id":"p-1041","cita":"jueves a las diez"}
```

| flag | |
|---|---|
| `--prod` | production's agent: a server's token, or a person's key while their switch is on |
| `--serve` | also serve the sandbox's console on `http://localhost:4100`, or point at the one already up. Refused in production |
| `--ui` | the full-screen terminal view. `p` pause · `c` clear · `e` events · `s` prompt · `q` quit |
| `--events` | one JSON line per log entry instead of the lines, for a pipe |
| `--show-prompt` | the prompt a fresh instance would produce, then exit. No key, no gateway |

**It answers the console for this directory.** What a screen needs of the agent's directory — a
written call to the class here, a simulation, the goldens and a suite, the
documents pushed and their golden asked, the memory goldens, a call promoted to a candidate,
the drift, a reproduction a broken run left — the console asks the gateway, and the gateway asks
THIS process over the socket it already holds (`dev.request` → `dev.answer`; the runtime's
`docs/protocol/dev-verbs.md`). The lines those verbs print land here, as if you had typed them.
A `pinecall start` in another agent's directory answers `simulate` with a sentence saying so.

## `serve`

```
pinecall serve [--port <n>] [--no-open]
```

**The sandbox's console, on your own machine.** The gateway's page shows production and only
production — what customers reach, watched by the people who run it. What YOU are running is
watched here: `http://localhost:4100`, the same console, looking at your corner of the sandbox —
your copies of the agents, their calls as they happen, chat, evals and their suites, docs,
memory, the widget and its preview, and how to reach your copy by phone. It mounts no agent:
`start` does that, and `pinecall start --serve` does both in one terminal.

```console
$ pinecall serve
gateway  https://box.pinecall.io · key from .env
console  http://localhost:4100   (your sandbox; Ctrl-C closes it)
```

It is a sidecar and keeps nothing: every request the page makes is forwarded to the gateway with
the project's key on it. **The key never reaches the browser**, so the page has no login, no
sign-out and no key in its storage. Only this machine's own page may ask: the port is bound to
the loopback, and a request whose `Host` is not this loopback, or whose `Origin` is another page's,
is answered `403` before the key is spent. When the gateway refuses the key — revoked, or never
linked — the page says **This project is not linked** and the two commands: `pinecall link`, then
`pinecall serve`.

**One per machine.** A second `serve` — or a `start --serve` — for the same gateway and org finds
the first and says where it is, so two projects share one page and `start` can be restarted under
it without the console going away. A port held by anything else is stepped past (4101, …), and
`--port` names one. `pinecall start` with no `--serve` still names a sidecar that is up.

Which screens this console has and which the gateway's has is one table in the console's source
(`src/cli/ui/console/lib/mode.ts`): running the org — numbers, tokens, providers, the team, usage —
and the box's own screens are the gateway's; **Dev chat**, running a suite and **Phone testing**
are this one's; Home, Overview, Live, Sessions, **Personas**, **Simulations**, Evals, Memory,
Docs, Lexicon and every tab of an agent are both's. An admin opens a colleague's copy from here, never from the gateway's page
([worlds-and-teams.md](worlds-and-teams.md)).

It is the sandbox's and nothing else: a key that opens production — a production server's token —
is refused in a sentence that says where production is watched. A machine with no browser prints
the URL and `--no-open` says not to try. In a checkout the console has to be bundled first
(`scripts/build`): until it is, the verb says so and exits 2.

## `line`

```
pinecall line [from <+number> | forget | claim | release] [agent.tsx] [--agent <name>]
```

**A number rings in one place, and a team shares its numbers.** With one developer that is not a
decision: the first `pinecall start` to hold the agent answers its ring and you never learn the word.
With three it used to be whoever restarted last — so you would dial the number to test your change
and be answered in a colleague's scrollback, with nothing on either screen saying so.

**Say which phone is yours, once.** Then every call you make lands in your own agent: no claim, no
coordination, three of you testing at the same time.

**It works on the production number, and that is the usual case.** A call from your phone to a
number that answers in production reaches your sandbox copy while you are holding that agent — your
class, your tools, your terminal, a sandbox log marked `diverted_from: production` — and every other
caller reaches production exactly as before. Stop `pinecall start`, or `pinecall line forget`, and
your own calls go back to production. That is how a team tests on the line its customers use, with
one number: a sandbox number is optional, and when an org has one, your phone reaches your copy
there too. The gateway's worker asks for this on every production ring
(`GET /v1/agents/{slug}/rings-for`), so nothing here knocks at that door.

```console
$ pinecall line from +59899111111
calls from +59899111111 reach this terminal
```

A phone is a **person's** and not an agent's, so it works in whatever directory you are standing
in and on every agent you hold. It is kept with this machine's sign-in for that gateway (`calling`
in `~/.pinecall/session.json`) and re-sent by every `pinecall start` when it starts — the gateway keeps
it beside its live table and not in a row, because it is only meaningful next to a socket: a
developer running nothing has no corner for a call to land in. `forget` undoes it. `claim`,
`release` and the bare `line` are about one agent: at a project's root with several, name it with
`--agent`. The **gateway** refuses a number that is not in E.164 form, with the shape in the
sentence, and refuses an org's own key outright: it names nobody, so there is no *their own agent*
to reach. Nothing is checked in the terminal first — what you see is what the gateway answered.

**And for a call from a number nobody said was theirs** — a customer, a colleague's phone — there
is the **line**:

```console
$ pinecall line
rings in berna@clinica.test · `pinecall line from <+your-number>` routes yours, or `claim` takes it

$ pinecall line claim
rings in this terminal · also running: berna@clinica.test
```

`release` gives it up, and whoever else is still running the agent picks it up — which is also
what happens on its own when the terminal holding it closes. A claim on an agent this terminal is
not running is refused: a ring lands on the line, so a corner with no app in it would take the
call and drop it. Production has one corner and the box holds it, so there is nothing to claim
there — only your own phone is diverted, as above; `pinecall start` prints the line only for an
agent that declares a number.

## `chat`

```
pinecall chat [agent] [--agent <name>] [--file agent.tsx] [--prod] [--as <contact>]
             [--state file [--case n]] [--events]
```

With nothing after it: the agent of this directory mounted in **this** process, and a written
caller against it in the same terminal. This is `rails console`: the tools run here, so a
breakpoint in a `@tool` is reachable. It works with no `pinecall start` up and with three of them,
because the caller socket names this process.

```console
$ pinecall chat --as +34600000001
‹ hola, quería cambiar mi cita del jueves
› Claro. ¿Me da su nombre completo y su teléfono?

$ pinecall chat clinica-norte
```

**The positional is an agent's slug, never a file.** Named one, `chat` mounts nothing and is only
the caller's side: a written call at whatever is already holding that slug — your own `pinecall
start` in the other terminal, or a colleague's, in the corner your key reaches. `--file` is how you
name the class to mount by its path, and it is the same word in every verb that loads a file
(`test`, `simulate`, `remember`, `personas`, `docs`, `memory`); `--agent` names one agent of a
project of several, by its name or its slug, and is required there because a chat talks to one.

`--as` is who is calling — the id memory files the call under. `--state file [--case n]` opens the
call in a state: the same goldens file `prompt` reads, and it is refused beside a slug, because
nothing is mounted here to open. `--events` prints the wire instead. `--prod` talks to production's
agent, while your org lets you act there; nothing said is the sandbox.

## `prompt`

```
pinecall prompt [agent.tsx] --state <file> [--case n] [--agent <name>]
```

The exact prompt a state would produce, offline: **no gateway, no key, no call**. The three
regions in the order the model receives them, then the stage and the tools that stage shows. The
verb you run while writing a `render()`, and it answers in the time it takes to save the file.
Because it asks nobody anything, `--prod` is refused here rather than taken and ignored.

```console
$ pinecall prompt --state test/clinica-norte/goldens/identifica-al-paciente.json
── identity (static) ──
Eres la recepción de Clínica Norte. Hablas de usted, con frases cortas. …

── knowledge (static) ──

── tools (static) ──
<tools>
- findPatient: Busca la ficha del paciente … 
```

---

# Holding it to something

## `test`

```
pinecall test [paths] [--agent <name>] [--file agent.tsx] [--model m]… [--grep x] [--watch] [--json]
pinecall test --voice [--background-noise dB] [--packet-loss 0.05]
```

Ring 1: every golden of `test/<name>/goldens/` (at a project's root, each agent's own) through
the class **this terminal holds**, scored by the gateway's judges, printed as a matrix. Exits 1
when a golden did not hold. One agent with no goldens yet is told where to write one and exits 2;
in a project, an agent with none is named and skipped. Every broken golden is
written whole to `.pinecall/evals/<run>/<golden>.json` — the golden as written, the verdicts, and
**the requests the model answered**, which the log deliberately keeps only a hash of.

```console
$ pinecall test --grep reserva
clinica-norte · 2 goldens · haiku · run_7ed3ace9352d
clinica-norte · 2 goldens · anthropic/claude-haiku-4-5-20251001
  ✓ no-reserva-antes-del-si  e2e_latency 2605ms · llm_node_ttft 763ms
  ✓ reserva-cuando-el-paciente-dice-que-si  e2e_latency 1948ms · llm_node_ttft 911ms
  2/2 · 0 judge calls · 0.0250 EUR · 8s
```

`--model vendor/model` repeated is a column of the matrix per model. `--voice` says the same
goldens out loud on a real line (ring 2); `--background-noise` puts a television behind the caller
at that many dB under them, and `--packet-loss` drops that share of their packets.

## `simulate`

```
pinecall simulate --persona <name> [--judge] [--turns n (6)] [--voice] [--listen]
                  [--background-noise dB] [--packet-loss percent] [--agent <name>] [--file agent.tsx]
```

A model in the gateway plays the caller — every turn improvised from the persona's goal, its style
and its own facts, with no script. This terminal holds the class and prints the conversation; the
gateway holds the provider keys.

```console
$ pinecall simulate --persona apurado --listen --turns 2
--listen is a call with audio in it: --voice is on
apurado · cambiar la cita al martes por la tarde sin dar más datos de los justos
  listening as sup_edb03d90e627 · ffplay
› Clínica Norte, buenos días.  ¿En qué puedo ayudarle?   tts_node_ttfb 127ms
‹ Hola, necesito cambiar mi cita del jueves con la doctora Vidal al martes por la tarde.
→ freeSlots({"day":"martes"})
← freeSlots [{"when":"martes a las diez","doctor":"la doctora Vidal"},{…
› Le muestro las horas libres del martes. …   llm_node_ttft 1681ms  tts_node_ttfb 127ms
  call_6123e7d7deb875e2e9be7686 · 2 caller turn(s) · 3 agent turn(s) · a clean line
```

`--persona` names a caller of this agent, kept by the gateway — not a file of the project.

`--voice` is a real line: a room, the agent dispatched into it, and the caller read out in an
**ElevenLabs voice the agent does not have**, in the agent's language, so the two sides are told
apart by ear. The caller waits for the opening to be said before its first line, as a person does.
`--background-noise` and `--packet-loss` spoil that line on purpose and are refused without it.

`--listen` puts the call on **this machine's speakers** while it happens: the same hidden `observe`
seat the console's listen button takes, joined from Node, both tracks mixed onto whichever of
`ffplay`, `play`, `aplay` or `pw-play` you have. It turns `--voice` on and says so, because a
written call has no audio in it. `--judge` reads back the `call.score` the log seals on.

## `personas`

```
pinecall personas [list] | show <name> | try <name>
pinecall personas add <name> --goal '…' --style '…' [--about '…'] [--fact 'what=said']…
pinecall personas edit <name> [--goal '…'] [--style '…'] [--about '…'] [--fact 'what=said']… [--rename <name>]
pinecall personas rm <name> · pinecall personas push [--from test/<agent>/personas]
                … any of them with --json, --prod in production; try and push also take
                --agent <name|slug> or --file agent.tsx, because those two need the class
```

**The callers are the ORG's, kept by the gateway** — one list, whichever agent picks up — the same cut the voice,
the lexicon and what it knows by heart took. So the console shows the same ones this verb does, a
caller written here needs no deploy, and a project holds none of them in its repository.

```console
$ pinecall personas
apurado       frases cortas, interrumpe, da el dato justo y pide la hora ya  cambiar la cita al martes
desconfiado   educado y receloso, responde con otra pregunta                 enterarse del precio de una corona

$ pinecall personas add price-shopper --goal "get a price for a deep clean" \
    --style "blunt, impatient" --fact "their name=Tom Baker"
price-shopper written · 3 persona(s)
```

`add` writes one whole; `edit` changes what is named and leaves the rest, and `--rename` moves it
to another name. `show` prints one with every fact; `rm` drops it; `try` puts it on the class in
this directory, which is `simulate` without the judge. A name is lower-case letters and digits
joined by hyphens, as `--persona` takes it — anything else is refused here, with exit 2, before it
travels. A caller nobody wrote is the same sentence and the same **exit 2** from `show`, `edit`,
`rm` and `try`.

`--agent` and `--file` are for `try` and `push` alone, the two verbs that need the CLASS: `try`
calls that agent as the caller, and `push` reads the files of that agent's project. `list`, `show`,
`add`, `edit` and `rm` name no agent at all — a caller is the org's, and a terminal outside a
project reaches them with its key alone. `--json` prints what
the gateway answered — the caller for `show`, the roster (`{"personas": […]}`) for `list`, `add`,
`edit`, `rm` and `push`; `try` prints a call as it happens, has no answer to print, and refuses the
flag with exit 2.

**`push` is the migration, run once per project**: the personas a project still keeps as files —
`test/<agent>/personas/*.ts` — are sent to the gateway, evaluated as they load, so a file that
computed its state from `lib/` lands as the value it produced. The files are yours to delete
afterwards; the verb never touches them. A caller the gateway refuses stops the push where it
stands: what landed and what is still only a file are both named, and it exits **2** — nothing is
undone, and pushing again once it is fixed finishes the migration.

## `eval`

```
pinecall eval <call-id> [--policy policy.json] [--json]
```

Ring 3: one finished call rebuilt from its log and answered by the runtime's four **code** checks.
Nothing is re-run and no model is asked. Exits 1 when a check did not hold.

```console
$ pinecall eval call_29d7c7b6cdd643de9c659984a0125c8c
call_29d7c7b6cdd643de9c659984a0125c8c  clinica-norte
  consent   passed    no irreversible tool ran in this call; 1 tool call(s) did
  register  skipped   no words were declared for this call: send them as `banned` …
  errors    passed    the call logged no error
  latency   failed    llm_node_ttft 1.209s > 1.000s over 1 turns; e2e_latency 2.638s > 2.000s
```

`--policy` is `{"banned": ["tarifa plana"], "budget": {"llm_ttft": 1.5}}`: the words this business
will not have its agent say, and the latencies it holds a call to.

## `runs`

```
pinecall runs list [--limit n] | show <id> | diff <a> <b>
pinecall runs promote <call-id> [--name x] [--out test/candidates] [--from-seq n]
pinecall runs drift --agent <slug> [--window 7d] [--baseline 30d] [--threshold 10]
                … any of them with --json: what the gateway answered, for a pipe
```

```console
$ pinecall runs list --limit 3
run_8a8870b59bc1  2026-09-11 12:47:23  clinica-norte     done     1/1
run_5c6b559d6093  2026-09-11 11:56:49  clinica-norte     done     2/2
```

`show` prints one run the way `test` printed its matrix when it happened — without the first
line, which carries the run id and belongs to a run that is still happening; `diff` says what moved between
two, golden by golden — a measurement that HELD and is new to the later run is not a change and is
left out, one that is BROKEN is printed (`not measured → broken`), and one the later run stopped
making is printed too, so a golden nobody ran is never read as a fix. **`promote`** writes one real call down as a golden **candidate** in
`test/candidates` — the state it was in, every caller turn from `--from-seq`, and an `expect`
derived from what the judges answered — for a person to edit before it counts as a golden.
**`drift`** counts each judge's held-rate over two windows of finished calls and exits 1 when one
fell further than `--threshold` points: nothing is judged again, a held-rate is a count of the
verdicts `call.score` already carries. It reads the agent's newest **200** calls, which is the
sessions door's own ceiling, so a window wider than that is counted over those 200.

---

# Running it

## `sessions`

```
pinecall sessions [list|show] [call] [--agent <slug>] [--limit <n>] [--json]
```

```console
$ pinecall sessions --limit 3
clinica-norte · 3 calls

● call_314b0306e2a64daba6b6dbab129540c0  web inbound     16m 27s  live                    —
  call_df5aaa81ac7142f5a2c6f9b77033d23e  web inbound         31s  caller_hung_up    €0.0000  Clínica Norte, buenos días…
  call_29d7c7b6cdd643de9c659984a0125c8c  web inbound          3s  caller_hung_up    €0.0205  Perfecto. El jueves tenemos…
```

With a call id (`sessions <call>`, or `sessions show <call>` — `list` and `show` are both optional
words): that call's **outcome**, how long it ran and why it ended, what it cost, and the **score**,
one line per judge with the question it answered and its own reasoning when it did not hold. The judging is ring 4's, at hang-up, in the gateway; this verb reads it back and runs
nothing. A call still running says so instead of reporting itself unjudged, and an id this gateway
has no log for is refused by name: it does not print a summary of nothing.

## `agent`

```
pinecall agent [--agent <slug>] [--json]
pinecall agent list · stop <app>
pinecall agent set [--voice x] [--tts x] [--tts-model x] [--stt x] [--llm x] [--greeting '…' | --reply '…']
                   [--hangup '…'] [--endpointing-ms n] [--min-interruption-words n]
                   [--remember '…' …] [--forget '…' …] [--team] [--note '…']
pinecall agent knowledge [--team] · knowledge edit [--team] [--note '…']
pinecall agent clear [voice|tts|tts-model|stt|llm|greeting|hangup|turn|memory|knowledge|bases …] [--team]
pinecall agent history [--team] · diff [--against team|production] · rollback <version> [--team]
pinecall agent pull [--team] · push <file> [--team]
                                        … and any of them with --prod, in production
```

```console
$ pinecall agent
maravilla · sandbox

                yours           team                        production
  voice         amelia          carolina                    carolina
  tts           —               —                           —
  tts model     —               —                           —
  stt           —               deepgram                    deepgram
  llm           —               anthropic/claude-haiku-4-5  anthropic/claude-haiku-4-5
  greeting      —               "Thanks for calling Marav…  "Thanks for calling Marav…
  hangup        —               when the person has what…   when the person has what…
  turn          —               —                           —
  memory        —               remember 4 · forget 1       remember 4 · forget 1
  knowledge     —               2,140 chars                 2,140 chars
  bases         —               maravilla (k 4)             maravilla (k 4)

  yours: v3 · m_ana · 2026-09-19 14:32 · "flat on the phone" · team: v11 · m_bruno · 2026-09-18 10:04 · production: v11 · m_ana · 2026-09-12 …
```

**What an agent runs on is the org's, not the class's** — per world, per corner, a version a row
(the runtime's `docs/protocol/settings-api.md`). The class declares the contract: its tools, its
state, its `render()`, its language, its doors. The voice, the models, the opening, how a call
ends, how a turn is cut, what is remembered, what is known by heart and which bases are searched
are **settings**, kept by the gateway and laid over the class at the one place every session is
built. A class that still declares one of them is refused at load — before a prompt is printed or
a gateway is knocked at — and the refusal names the verb: `` `voice` is the world's now, not the
class's: pinecall agent set --voice <name> — remove it from the class``.

**A model knob takes a tier by its short name.** `--llm haiku` · `sonnet` · `opus` are expanded
here to the model id the provider answers to — the same table `pinecall test --model` reads — so
the corner never holds a name that is a 404 at the vendor. `--llm <vendor>/<model>`, a vendor
alone and a model alone travel as typed; a word that names no model at all (an empty one, half a
`vendor/model`) is refused with exit 2 and nothing is written.

**Three corners.** In the sandbox your key has a corner of its own: what you `set` is yours, and a
colleague's next call does not hear it — so two developers testing two voices never change each
other's. A corner that set nothing reads the team's (`(team's)` in your column), which is the org's
own corner, written with `--team`. Production has one corner, and **`--prod` writes it directly**:
`pinecall agent set --voice carolina --note "warmer" --prod`, by a person whose production switch
is on — the same change the production console's Settings tab makes. There is no promote between
the corners: what guards production is the goldens in CI before a deploy
([production.md](production.md)), and the history after it.

**Versions.** Every `set` is a new row; nothing is updated, nothing deleted. The whole set travels
with the version it was read at, so two people saving at once never write over each other: the
second is told `this corner is at v4 now, not the version you read`. `history` prints every version
with who set it, why, and what it changed; `diff` reads this corner against the team's or
production's; `rollback <n>` brings one back as the next version — `rollback <n> --prod` is how a
production change that went wrong is undone, in one line.

**What is running, and where.** `list` prints every process holding the org's agents in the world
asked — one line an app socket: its id, the agents it holds, whose corner, the machine and address
it connected from, the SDK, and since when:

```console
$ pinecall agent list --prod
app_7  maravilla  the org's · web-1 (34.68.177.78) · pinecall/0.5.1 · since 2026-09-19 14:02
```

`stop <app>` closes that socket with the `stopped` code (`POST /v1/apps/{app}/stop`, a key with
`app`): the process prints `stopped by <name>` and exits instead of dialling back, and its agents
are free. A supervisor that restarts whatever exits — systemd's `Restart=always`, pm2 — starts it
again, so a process kept that way is stopped where it is supervised. An app on the SDK hears it on
`pc.onStopped(why => …)`. The Overview's Processes card is the same list, with a Stop per row.

**Git, for whoever wants it.** `pinecall agent pull > pinecall/maravilla.json` writes the corner's
config as a file; `pinecall agent push pinecall/maravilla.json --team` sends it back as the next
version, with no version check — it is what CI applies, and `push … --prod` is what a release
applies to production.

### `agent knowledge`

```
pinecall agent knowledge [--team]
pinecall agent knowledge edit [--team] [--note '…']
```

**What the agent knows by heart** — the business as the org describes it, a page of Markdown:
hours, prices, what needs an authorisation, what to say when asked for the doctor's mobile. It
is one field of the settings, versioned like the rest, and the runtime reads it **whole** into
the prompt's static `knowledge` block on every call — so it is read once and cached, and never
searched. Alone, the verb prints the corner's text; `edit` opens it in `$VISUAL` or `$EDITOR`,
the way `git commit` does, and what you leave is the next version. An unchanged file writes
nothing; an empty one takes the field out. The console's Settings ▸ Knowledge is the same
textarea, and a **supervisor's or a manager's key opens it** (`words`) — the person who knows
the prices changes them, without a developer and without a deploy.

```console
$ pinecall agent knowledge
maravilla knows nothing by heart in your corner: `pinecall agent knowledge edit` writes it
$ EDITOR=vim pinecall agent knowledge edit --team --note "prices for 2027"
maravilla · knowledge 2,140 chars · the team's corner v12
```

It is not the RAG. The documents a turn *searches* — a catalogue, a policy manual, anything
too long to read whole — are [`pinecall docs`](#docs), attached to the same settings as `bases`.
`pinecall agent` prints the two on two rows: `knowledge` as a size, `bases` by name.

## `lexicon`

```
pinecall lexicon [--json]
pinecall lexicon add <word> --say '…' [--team] [--note '…']
pinecall lexicon hear <word> [<word> …] [--team] [--note '…']
pinecall lexicon rm <word> [<word> …] [--team]
pinecall lexicon history [--team]
                                        … and any of them with --prod, in production
```

The org's words, laid over every agent's own `says` and `hears`: a brand, a surname, an acronym is
the same word whichever agent says it, and the org's word wins where both say the same one. Whole
and versioned like the settings, per corner, with the same `--team` and the same refusal when the
corner moved. A **supervisor's or a manager's key opens it** (`words`): the person who hears a word
said wrong forty times a day fixes it, without a developer and without a deploy — with `--prod`, in
production, while their switch is on; the production console's Lexicon screen is the same edit.
`history` and a word put back are the undo.

`pinecall memory policy [--agent <slug>] [--remember '…' …] [--forget '…' …] [--team] [--note '…']` is the memory field of the
same settings, on its own for the person whose job it is: what the agent keeps about a caller and
what it never does.

## `pipeline`

```
pinecall pipeline [--agent <slug>] [--json]
```

```console
$ pinecall pipeline
clinica-norte · 9 calls

  hears     soniox · es
  decides   anthropic · claude-haiku-4-5-20251001
  speaks    elevenlabs · EXAVITQu4vr4xnSDxMaL · es

  greeting  "Clínica Norte, buenos días. ¿En qué puedo ayudarle?"

  transcription_delay 0.39s · end_of_turn_delay 0.41s · llm_node_ttft 0.86s · e2e_latency 2.36s
```

The three legs as the **next** call would be built. It reads and nothing else: the six knobs are fields of the settings now, and
`pinecall agent set` sets them with the rest — a model knob reads four ways there,
`--llm anthropic/claude-haiku-4-5`, `--llm cartesia` (a vendor, its own model), `--llm
claude-haiku-4-5` (a model, the vendor in use), and `--llm haiku` (a tier, expanded to the id its
provider answers to, exactly as `pinecall test --model haiku` expands it). `pinecall pipeline set`
and `clear` say so and exit 2. `pinecall providers` lists every vendor a stage may be moved onto.

## `supervise`

```
pinecall supervise <call>
```

The call's transcript as it happens, and one line to move on it:

```
w <text>    whisper to the agent — the caller never hears it
s <text>    say it to the caller, in the agent's voice, verbatim
t           take the line: the agent stops speaking and you are on it
x           give it back
e [reason]  end the call
q           leave the desk; the call goes on
```

Every move lands in the caller's own log as its own `supervisor.*` entry with a seq, so what a
human did to a call is read the same way as what the agent did. The **audio** of a live call is
the console's Live screen, which has a room; this is the transcript and the desk.

A desk opens on a call that is **happening**: one that has ended, and an id this gateway has no
log for, are refused before the prompt — what a finished call was is `pinecall sessions show`.

## `numbers`

```
pinecall numbers list
pinecall numbers import <+34…> --agent <slug> [--channel phone|whatsapp] [--dry-run]
pinecall numbers move <+34…> --env <production|sandbox>
pinecall numbers drop <+34…>
```

A number exists once in a world and reaches one agent. `list` shows the key's world, because that
is the world this key works in.

**`move` is the one verb that crosses, and it is what makes a staging run cost nothing.** An org
buys ONE number, so a team wanting to try a new agent on the real line has nowhere to try it: a
second number is a second bill, and a third world would be a third of everything. Point the org's
number at the sandbox for an afternoon, run the new agent there, move it back. The carrier is
untouched either way — a call arrives at this box whichever world answers it — so the move is one
row and takes effect on the next call. Moving it to where it already is writes nothing and says so.

```console
$ pinecall numbers move +34910000000 --env sandbox
+34910000000 · production → sandbox · → clinica-norte
```

`import` takes a number the org's carrier account already owns and points it here: the carrier's
trunk, the SFU's trunk, the route — `--dry-run` prints those steps and writes nothing, which is
what you read before letting the gateway touch a carrier account. `drop` forgets the route and
takes the number off the SFU trunk; the carrier account keeps it, so nobody is un-bought by a typo.
Whose corner a ring lands in, once a world is answering it, is [`line`](#line).

## `providers`

```
pinecall providers [--does llm|stt|tts]   # every vendor this build runs
pinecall providers add <vendor>     # the key on stdin, never on the command line
pinecall providers rm <vendor>
pinecall providers list             # only the ones this org brought
```

```console
$ pinecall providers --does tts
vendor        does         standing   variable              also known as
livekit       llm,stt,tts  ready                            inference lk
cartesia      stt,tts      no key     CARTESIA_API_KEY
elevenlabs    stt,tts      ready      ELEVEN_API_KEY        11labs eleven elevenlab
rime          tts          no key     RIME_API_KEY
speechmatics  stt,tts      no plugin  SPEECHMATICS_API_KEY
```

With nothing after it: every vendor this build runs — forty-five, every one LiveKit ships a plugin
for, plus `livekit` itself, which is LiveKit Inference and fronts most of them on the box's own
project with no vendor key at all. `standing` is the one word for what each is still waiting for:
`ready` is the only one that runs a call, `no plugin` and `no key` are the operator's to fix, and
`its own` is a vendor whose credentials are a chain or a pair and never one key anybody could
bring. Any of these names — or any of its aliases — is what `agent set --stt`, `--llm` and
`--tts` take: the six knobs are the agent's settings, and `pipeline` only reads them back.

A key added here is this org's own account with that vendor, and every call of this org runs on it
from the next one; every vendor nobody brought runs on the box's own key. `add` reads the key from
**stdin** — typed with nothing echoed on a terminal, one piped line off one — and never from a
flag: argv is visible in `ps` to every user on the box, and a key pasted as an argument is a key in
the shell history.

No door a person reads ever answers with a provider key: `list` prints the vendors and nothing
else, not a value, not a prefix, not a fingerprint. The one door that reads a key back is the
**worker's** — `GET /v1/agents/{slug}/provider-keys`, an org's own keys handed to the org's own
process, on that org's key — which is the whole reason the vault exists. A key that was lost is set
again. A runtime with no `PINECALL_VAULT_KEY` cannot keep somebody else's
secret and says so with a 503; the vault, and how to turn it on, is the gateway API's §6.

## `callbacks`

```
pinecall callbacks [--agent <slug>] [--after <cursor>]
```

The numbers people left when every seat of the fleet was taken: a phone caller the overflow agent
answered, or a web visitor who left a number at the widget after `POST /v1/tokens` answered `503`.
One line each — when, the agent, the number, the channel, who took it — oldest first, and a
`more: --after <cursor>` line when there is another page. The runtime records them
(`callback.requested`, on the agent's log); dialing back is your app's.

```
gateway https://box.pinecall.io · key from .env
2026-09-11 19:20  clinica-norte  +34600000000  phone  via overflow on call_9f2c…
2026-09-11 19:22  clinica-norte  +34611111111  web    via the widget
```

## `link`

```
pinecall link [--org <slug>] [--gateway <url>]
```

**This project's folder, tied to one of your orgs.** Run in the project's folder: it signs this
machine in through the browser when it is not ([`login`](#login), the same dance), lists your orgs
(`GET /v1/login/orgs`), asks which one this project is — `--org` names it — and mints your key
there (`POST /v1/login/org`), unless it is the org this machine is signed in to, whose key it
already holds. The key goes into `./.env` as `PINECALL_KEY`, and `PINECALL_URL` beside it when the
gateway is not `https://box.pinecall.io`; every other line of the file is left as it was.

```console
~/clinica $ pinecall link --org clinica
▸ clinica · PINECALL_KEY written to .env
git would commit .env: add it to .gitignore before a commit carries your key
```

The last line is said every time until the project's `.gitignore` names `.env`: a key committed is
a key published. Every verb run in this folder, or under it, reads the key from there; a project of
another org is another folder, linked on its own. `--gateway` names another gateway than the one
this machine last signed in to. A server does not link: it runs on a server's token from the
console's Tokens screen, kept in its secrets ([production.md](production.md)).

## `login`

```
pinecall login [gateway-url]
```

`login` **prints a link and opens it**. You sign in there — in a browser, where a password belongs,
where the browser autofills it and a password manager holds it — and the page hands this terminal a
key of its **own**: minted for you, labelled as this machine, revoked on its own from the Tokens
screen. Nothing types a password into a shell, and the day your org signs in with Google this verb
does not change.

```console
$ pinecall login
gateway  https://box.pinecall.io   (the default — `pinecall login <url>` for your own)

open this to sign in:
https://box.pinecall.io/cli?c=cli_…

waiting…
signed in to https://box.pinecall.io as Ana García
```

**It signs the machine in, and no verb runs on that.** The key is proved at `/v1/whoami` and kept
in `~/.pinecall/session.json`; what a project runs on is the key [`link`](#link) mints from it into
the project's `.env`. `link` signs in on its own when it has to, so this is rarely typed. With no
URL it is `https://box.pinecall.io`, and it says so above the link, so a person who meant their
own box sees the assumption before anything is kept. The word in the link dies in ten minutes and
on first collection; a terminal with no browser prints the same link and you open it from wherever
you are. A server has no login at all.

## `whoami`

```
pinecall whoami
```

The gateway every connecting verb would talk to and where its key came from, then what that
gateway says the key is: the org (its slug, or its id when the gateway carries none), the key's id,
the world this command runs in, the label it was issued under, and whether the key may act in
production — your switch, an admin's always, or a production server token. The key itself is
neither printed nor sent anywhere else.

```console
$ pinecall whoami
gateway https://box.pinecall.io · key from .env
org clinica · key k_4f2a1d9c66b30e17 · sandbox · ana-macbook · production: yes

$ pinecall whoami --prod
gateway https://box.pinecall.io · key from .env · production (--prod)
org clinica · key k_4f2a1d9c66b30e17 · production · ana-macbook · production: yes
```

---

# What it remembers, and what it knows

## `docs`

```
pinecall docs push [dir] [--base <name>] [--agent <name>] [--file agent.tsx]
pinecall docs list
pinecall docs drop <base>
pinecall docs eval [docs.json] [--base <name>] [--k <n>] [--agent <name>] [--file agent.tsx]
pinecall docs attach <base> [--k <n>] [--mode retrieved|tool] [--min-score <x>] [--agent <slug>] [--team]
pinecall docs detach <base> [--agent <slug>] [--team]
pinecall docs attached
                                        … and any of them with --prod, in production
```

**The documents a turn searches** — the RAG, and only that. `push` reads every `*.md` under the
directory — `docs/<name>/` of the agent when none is named — and sends the folder **whole** to
`PUT /v1/knowledge/<base>`: the base is replaced, never merged. At a project's root with nothing
typed, `push` and `eval` act on every agent that has documents or a golden, and name the rest. The
base is the agent's slug unless `--base` says otherwise. What the agent knows *by heart* is not a
document and is never pushed: it is [`pinecall agent knowledge`](#agent-knowledge).

**The base you push is the world's the command runs in.** A push from a laptop replaces the sandbox
base — what your own `pinecall start` answers from — and never the one the telephone answers from.
Production's is the same push with `--prod`, made in the release step of a deploy like a migration,
by the server's token or by a person whose switch is on ([production.md](production.md)). `list`
and `drop` read the same world.

```console
$ pinecall docs push
clinica-norte · 7 files · 41 chunks · 812 ms      # base · sent · became · took
```

**`attach` says an agent reads a base.** It is one field of the agent's settings (`bases`),
written as the next version of the corner — yours, the team's with `--team`, production's with
`--prod` — with how a turn reads it: `--k` chunks, `--mode` (`retrieved`: the platform searches
before the turn and hands the model what it found; `tool`: the model decides when to search),
`--min-score`. A base attached twice is replaced, not doubled. `detach` takes it out, and taking
the last one out leaves an empty list rather than no field at all: this corner reads no base, and
the agent does not fall back to the team's. `attached` prints which agents read which base in the
world asked.

```console
$ pinecall docs attach clinica-norte --k 4
clinica-norte · clinica-norte attached · your corner v4
$ pinecall docs attached
clinica-norte · read by clinica-norte
```

The class reaches the base from inside a tool, and nowhere else: `await
this.knowledge.search("horarios", { k: 3 })` asks the gateway for the best chunks of the bases the
world attached, for these words ([writing-an-agent.md](writing-an-agent.md)). Which base is the
world's to say, so a class that searches and registers in a world where nothing is attached is
refused at registration: `clinica-norte searches its bases, and none is attached to it in sandbox:
pinecall docs attach <base> --agent clinica-norte`. A base attached and never pushed is refused
the same way, naming `pinecall docs push`.

`eval` asks the base every question of a golden — `test/<name>/goldens/docs.json`, a JSON list of
`{asks, expects}`, where `expects` is the heading path the answer should carry — and prints
`recall@k` and `nDCG@10`, computed by code with **no model in the loop**, plus every question it
missed and what came back instead. **With no `--k` it asks with the k this agent reads that base
with** — the attachment's, in this corner — because a golden asks what a turn gets: a base
attached with `--k 4` measured at the door's default of eight answers a question nobody's calls
are asking. Exits 1 when anything missed, so CI can hold a base to it. A
golden is fixed and the index is the variable: never soften a question so a change can pass.

## `memory`

```
pinecall memory <contact>
pinecall memory forget <contact>
pinecall memory policy [--agent <slug>] [--remember '…' …] [--forget '…' …] [--team] [--note '…']
pinecall memory eval [golden.json] [--k <n>] [--agent <name>] [--file agent.tsx]
```

Everything memory kept about one contact — the caller's number, or the id the app named — with the
current facts first and the ones a later call superseded dimmed, with the date they stopped
holding. `forget` erases all of it, the right to be forgotten; on a terminal it asks once, and
prints how many facts went.

`eval` holds **recall** to a golden of `{holds, asks, expects}` — `test/<name>/goldens/memory.json`:
each question brings its own facts, so no
contact of yours is read or written — they go to a scratch contact and are deleted again.

## `remember`

```
pinecall remember [paths] [--agent <name>] [--file agent.tsx] [--grep x] [--json]
```

The cases are `test/<name>/memory/`, one file per call written down.

The other half of memory: the **write** side. A case is one call written down — both speakers,
because nothing is re-run — the facts memory already holds, and what must come of it: which
categories got a fact, which never did, which values must not survive in any fact's text, and
which held facts the call contradicted.

Each case costs ONE model call, the very one a hang-up makes, run by the gateway against the class
this terminal is holding. Every answer is judged by code: a category is the class's own word, a
value is a literal, a supersession is an id — never one sentence compared to another, because two
ways of writing one fact are one fact.

---

## Exit codes

| | |
|---|---|
| `0` | it did what it says |
| `1` | the thing being measured did not hold: a golden broke, a check failed, a judge answered broken, a drift fell past the threshold — or the gateway refused, in its own words |
| `2` | this command cannot run: no key, a flag that is not a flag, a persona nobody wrote, a verb that moved (`pipeline set` is `agent set` now) |

A call **nobody judged** is not a pass: `simulate --judge` exits non-zero for it, because "nobody
looked at this" must never open a gate.

## What each verb knocks at

The bridge between this document and the gateway API. Anything in the right-hand column, your own
code can call — over HTTP, in any language, with the same key.

| verb | doors |
|---|---|
| `start` · `chat` · `test` · `simulate` · `remember` | `WS /v1/apps` — the class is mounted in the process that typed the verb |
| `start`, once connected | `POST /v1/login/codes` (the console's URL, in production), `PUT /v1/line/from` (the kept phone, on every connect in the sandbox), `GET /v1/agents/{slug}/line` (for an agent that declares a number) |
| `chat` | `WS /v1/chat?agent=&app=&contact=` |
| `start --events` · `sessions` · `supervise` | `GET /v1/calls/{call}/events` (SSE), `GET /v1/agents/{slug}/sessions` |
| `sessions <call>` · `supervise` | `GET /v1/calls/{call}/state` — asked FIRST, because it is the one door that 404s for a call this gateway has no log of |
| `supervise` | `POST /v1/calls/{call}/verbs` — with the **org key**: a desk that only reads and types needs no seat. A seat (`POST …/supervise`) is for audio, and that is the console's |
| `simulate --listen` | `POST /v1/calls/{call}/listen`, then the LiveKit room |
| `simulate --voice` · `test --voice` | `POST /v1/evals/voice`, `POST /v1/evals/caller` |
| `test` · `runs` | `POST /v1/evals/run`, `GET /v1/evals/runs[/{id}]` |
| `runs drift` | `GET /v1/agents/{slug}/sessions` — a held-rate is counted off the verdicts the calls already carry, so it asks the sessions door and no evals door at all |
| `eval` | `POST /v1/evals/replay/{call}` |
| `agent` | `GET`·`PUT /v1/agents/{slug}/settings`, `GET …/settings/history`, `GET …/settings/diff`, `POST …/settings/rollback`; `list` and `stop` are `GET /v1/apps` and `POST /v1/apps/{app}/stop` |
| `agent knowledge` · `lexicon` · `memory policy` · `docs attach` · `detach` | `GET`·`PUT /v1/agents/{slug}/settings` · `GET`·`PUT /v1/lexicon`, `GET …/history` |
| `pipeline` | `GET /v1/agents/{slug}/pipeline` |
| `docs` | `PUT`·`GET`·`DELETE /v1/knowledge[/{base}]`, `POST /v1/knowledge/{base}/eval`, `GET /v1/knowledge/attached` |
| `memory` | `GET`·`DELETE /v1/contacts/{contact}/memory`, `POST /v1/contacts/memory/eval` |
| `remember` | `POST /v1/agents/{slug}/memory/extraction` |
| `numbers` | `GET`·`POST /v1/numbers`, `PUT /v1/numbers/{number}/env`, `DELETE /v1/numbers/{number}` |
| `providers` | `GET /v1/providers` · `PUT`·`DELETE`·`GET /v1/provider-keys[/{vendor}]` |
| `callbacks` | `GET /v1/callbacks[?agent=&after=]` |
| `personas` | `GET /v1/personas` · `PUT`·`DELETE /v1/personas/{name}` — and `push` reads the project's remaining files before sending them |
| `line` | `GET`·`POST`·`DELETE /v1/agents/{slug}/line`, `PUT`·`DELETE /v1/line/from` |
| `serve` | every door the console asks, forwarded as the page sent it with the project's key: `GET /v1/whoami`, `/v1/agents`, the logs, `…/dev/*`, `GET /v1/line/numbers` |
| `login` | `POST /v1/login/pairings`, `GET …/{code}/key` — then `GET /v1/whoami` to prove what it got |
| `link` | what `login` knocks at when the machine is not signed in, then `GET /v1/login/orgs` for the person's orgs and `POST /v1/login/org` for the key in the one picked |
| `whoami` | `GET /v1/whoami` |
| every verb, with `--prod` | the same doors, with `pinecall-env: production` on each request and socket |
| `prompt` | none. It is the one verb that needs no gateway and no key |
