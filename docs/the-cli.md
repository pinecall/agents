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
pinecall run                 # in an app's directory: the process you deploy
npx pinecall run             # from a project that installed the package
pnpm exec pinecall run       # inside this workspace
```

In a checkout the CLI runs from source through tsx (`bin/pinecall.js`); what npm installs is the
compiled `dist/cli/index.js` and needs no loader.

Running the gateway yourself, from nothing? The runtime repo's `docs/from-zero.md` is that
path end to end, with every output under it.

## The map

| verb | what it is | needs the gateway |
|---|---|---|
| [`run`](#run) | the app registered and answering — **the process you deploy** | yes |
| [`serve`](#serve) | the sandbox's console on this machine, `http://localhost:4100`: your copies, your calls | yes |
| [`chat`](#chat) | the same app in this terminal, and a written caller against it | yes |
| [`prompt`](#prompt) | the exact prompt a state would produce, offline | **no** |
| [`test`](#test) | ring 1 (and ring 2 with `--voice`): the goldens through this process | yes |
| [`simulate`](#simulate) | a model plays one caller, live, and the call is judged at hang-up | yes |
| [`eval`](#eval) | ring 3: one real call re-checked by code | yes |
| [`sessions`](#sessions) | the calls this agent has run, and one of them whole | yes |
| [`runs`](#runs) | the suites: list, show, diff, promote a call, watch the drift | yes |
| [`agent`](#agent) | what the org set over the class — yours, the team's, production's — set, history, diff, rollback, promote, pull, push | yes |
| [`lexicon`](#lexicon) | the org's words: how the voice says them and what the ears must know, shared by every agent | yes |
| [`pipeline`](#pipeline) | what it hears, decides and speaks with, as the next call would be built | yes |
| [`line`](#line) | which phone is yours, and whose terminal a call from anybody else's rings in | yes |
| [`numbers`](#numbers) | which number reaches which agent, and the world it answers in | yes |
| [`personas`](#personas) | the synthetic callers in `test/personas` | for `try` |
| [`knowledge`](#knowledge) | the base the agent answers from: push, list, drop, eval | yes |
| [`memory`](#memory) | what memory kept about a contact, forgetting it, and recall's golden | yes |
| [`remember`](#remember) | the extraction goldens: what a hang-up makes of a call | yes |
| [`supervise`](#supervise) | listen in on a live call and move on it | yes |
| [`keys`](#keys) | the API keys this org's machines run on: issue, list, revoke | yes |
| [`providers`](#providers) | every vendor this build runs, and the keys this org brought | yes |
| [`callbacks`](#callbacks) | the numbers people left when every seat was taken | yes |
| [`gateway`](#gateway) | which gateway this machine talks to; the cloud until you point it elsewhere | no |
| [`login`](#login) | sign in through a browser: a profile per org, both worlds' keys | yes |
| [`config`](#config--use) · [`use`](#config--use) | the profiles this machine holds, and which org and world the next verb goes to | no |
| [`whoami`](#whoami) | which gateway, which org, which world, and where the key came from | yes |

Declared and not written: `new`, `g`, `observe`, `costs`, `call`, `tokens`, `deploy`. Typing one prints `<verb> is not built yet: <what it is for>` and exits 0 — a person who types a verb deserves
better than "unknown command". `src/cli/groups.ts` is the one place that says which half of the
CLI is still a design, and a verb leaves that table in the commit that writes it.

---

## Where the gateway and the key come from

**One profile.** `~/.pinecall/config.json` holds the gateways this machine knows, by name, and
which one is in hand; `pinecall login` writes one per org the person belongs to, `pinecall use`
moves the mark, `--profile <name>` points one command somewhere else. Both questions — which
gateway, which key — are that one answer.

```console
$ pinecall config
▸ clinica     https://box.pinecall.io  clinica · sandbox (and production)
  tienda-sur  https://box.pinecall.io  tienda-sur · sandbox (and production)
```

**A project names its org.** A package.json that says

```json
"pinecall": { "org": "cloudacio" }
```

makes every verb run in that directory, or any directory under it, take that org's profile —
whichever one `pinecall use` last marked. Four checkouts of four orgs need no `use` between them.
The nearest package.json that names an org wins; one that names none is passed over. When this
machine holds no profile of that org the verb is refused (`this project is org cloudacio (…), and
this machine holds no profile of it`) and is never handed the active profile, which is another
org's. `--profile <name>` still wins over the project, and outside any project it is the active
profile, as before. The first line says which: `gateway <url> · key from profile cloudacio · org
cloudacio from <path>/package.json`.

**`--prod` looks at production for one command.** A login keeps each org's key in both worlds,
and the one in hand is the sandbox's; `--prod`, anywhere on the line of any verb, takes the
production one for that command and keeps nothing, so the next command is in the sandbox again.

```console
~/bidfire $ pinecall sessions            # your sandbox calls
~/bidfire $ pinecall sessions --prod     # production's
~/bidfire $ pinecall numbers list --prod
```

The first line ends `· production (--prod)`. A profile that kept no production key is refused in a
sentence (`pinecall login` again keeps both). A person still only looks there: `pinecall run
--prod` is refused by the gateway, as `use <org> production` then `run` always was. `--env` keeps
its own meaning on the verbs that take it — the world a number moves to (`numbers move`), the world
a key is issued in (`keys issue`), the world `run` and `chat` believe they are in.

**Before there is a profile**, a verb goes to the gateway this machine is pointed at:
`https://box.pinecall.io` until [`pinecall gateway <url>`](#gateway) says otherwise. That is where
`login` knocks, and what the refusal `not signed in to <gateway>` names.

There is nothing to export and no order to remember. A machine with no browser — CI, a container —
writes a profile off stdin instead: `pinecall login --key-stdin <url> < key`, with `PINECALL_HOME`
saying where the file goes. A key in a 0600 file read once beats one every `ps` and every child
process can see.

Nothing else is read. `PINECALL_API_KEY`, `PINECALL_URL` and `PINECALL_DEV_KEY` are gone from
this CLI — the first of those is v1's variable too, and a shell that still had v1's key exported
pointed every verb at another org with every line reading the same. `~/.pinecall/dev` is gone with
them: a local gateway used to write it at every start, and a local gateway now runs the same
Postgres and the same issued keys a box does, so it is `pinecall login` like any other.

Every verb that connects opens by printing `gateway <url> · key from <source>`. **`env | grep
PINECALL` is the first thing to run when a door refuses you and will not say why.**

## `~/.pinecall/`

| file | what it holds |
|---|---|
| `config.json` | `{ "active": …, "gateway": …, "profiles": { "<name>": { url, key, keys: { sandbox, production }, org, env, calling } } }` — every verb reads this one. `gateway` is what `pinecall gateway <url>` wrote, and is absent on a machine on the cloud; `key` is the one in hand, `keys` both worlds' as the login minted them, `env` the world `key` opens; `calling` is the phone `pinecall line from` kept for that profile |
| `credentials` | `{ "api_key": …, "gateways": { "<url>": { api_key, org, logged_in_at } } }`, written beside the profile by `login` for v1's CLI on the same machine, and read once, to seed `config.json`. The top-level `api_key` is v1's and is never touched |

The directory is `0700` and every file `0600`. A key is never printed, never logged, and never put
in a URL.

---

# Writing the agent

## A project of several agents

One repository may hold several agents. Each is a file under `agents/`, and every folder the
verbs read is shared, by the agent's name:

```
agents/dispatch.tsx              one agent: its class, its slug declared on it
agents/sales.tsx                 another
lib/                             what both import
knowledge/dispatch.md            what dispatch knows by heart — `knowledge = "../knowledge/dispatch.md"`
knowledge/sales/                 the documents `knowledge push` sends to sales's base
knowledge/sales.golden.json      the questions `knowledge eval` holds that base to
memory/<name>.golden.json        what `memory eval` asks
test/dispatch.test.ts            ring 0, one file per agent
test/goldens/<name>/             what `test` runs for that agent
test/personas/<name>/            the callers `simulate` and `personas` read for that agent
test/memory/<name>/              what `remember` runs for that agent
```

At the root of such a project every verb that reads a class acts on **every agent**, each against
its own folders, or on the one `--agent <name>` names — by its file's name (`sales`) or by its slug
(`bidfire-sales`):

| at the root | does |
|---|---|
| `pinecall run` | every agent at once, **on one socket, in one process**; each line prefixed by the slug, one console URL each (`--serve` puts them all on one page). `--show-prompt` prints every agent's prompt under its slug |
| `pinecall test` | each agent's goldens through its own class, one after another; the exit code is the worst. Paths and `--watch` are for one agent, so they need `--agent` |
| `pinecall knowledge push` · `eval` | every agent that has `knowledge/<name>/` · `knowledge/<name>.golden.json`; the rest are named and skipped |
| `pinecall personas list` | every agent's callers, under its name |
| `pinecall chat` · `simulate` · `prompt` · `remember` · `memory eval` · `line` · `personas show\|try` · `run --ui` | one agent: `--agent <name>` is required when there are several |

A directory that holds an `agent.tsx` of its own is one agent's folder, and everything reads
beside that file as it always has: `knowledge/docs`, `knowledge/golden.json`, `memory/golden.json`,
`test/goldens`, `test/personas`, `test/memory`. The two layouts are one idea — an agent's *home*
(`src/cli/home.ts`) — and a verb never computes a path of its own. A folder the verb reads and
nobody has written yet is empty, not an error: an agent with no `test/goldens` has no goldens, the
console's roster says so, and `pinecall test` names the folder to write one in.

`--agent` means two things, one per kind of verb. In a verb that loads a class it names an agent of
this project, by name or by slug. In a verb that only asks the gateway — `sessions`, `pipeline`,
`runs drift`, `numbers import`, `callbacks` — it is a slug, because there is no class to find.
`--file` is always a file.

## `run`

```
pinecall run [agent.tsx] [--agent <name>] [--env production] [--serve] [--ui] [--events] [--show-prompt]
```

At a project's root with no file named, every `agents/*.tsx` is held at once, on one socket: see
[A project of several agents](#a-project-of-several-agents).

The app registered on the gateway and answering: **this is the process you deploy**. Which world
it answers in is the key's: a login keeps a sandbox key, so a laptop's
run holds a sandbox agent, and what holds the production one is a key issued for a machine
([`keys`](#keys)) put in that box's environment. A key you hold by being logged in does not open
`app` in production at all, so a `pinecall run` on it is refused there, in a sentence naming what
the key does open. **In the sandbox the agent is held per person**: two developers of one tenant
each run the same agent and each reaches their own, while a *number* is one door and rings in
one place: a developer's own phone reaches their copy, and anybody else's call lands where the line
was claimed ([`line`](#line)). An admin, and whoever runs the gateway, see
every corner of the sandbox rather than only their own — somebody has to be able to tell what the
team is running. **`--env` asserts and never selects**: a key opens one world, so the flag is you
saying which one you believe you hold, and `run` stops when the key disagrees. Nothing said means
the sandbox — a deployment types `--env production`, which is the deliberate act it should be.
It binds no port and serves no page. One line per log entry on stdout, and under the connected
line where its console is — **and there are two consoles, one per world**. The sandbox is watched
on your own machine: [`pinecall serve`](#serve) puts it on `http://localhost:4100`, `--serve` does
that from this same terminal, and the line reads `console  http://localhost:4100/a/clinica-norte`
— or names the verb, when none is up. Production is watched on the gateway's own page, which shows
production and nothing else: there the line is `console  https://box.pinecall.io/a/clinica-norte?login=lc_…`,
a one-use code that dies in five minutes, which the page spends for a key of its own (a person's,
scoped, kept by that browser) and never sees this process's. Opening that console cold asks for an
email, a password, and the org only when the person belongs to several.

Every time the socket comes up — the first connect and each reconnect, in every mode — `run`
re-sends the phone `pinecall line from` kept for this gateway, whatever agents it holds and not
only one that declares a number, because a production number is the box's route and no class
declares it. The gateway keeps that phone only beside its live table, so a gateway that restarted
learns it back at once instead of sending your test call to production. A gateway that goes away
is one line — `gateway  … — reconnecting`, then `gateway  back` — and never a stack per redial.

```console
$ pinecall run --serve
gateway http://127.0.0.1:8080 · key from profile
clinica-norte · clinica · sandbox · connected to http://127.0.0.1:8080 · key from profile · tools 4 · doors web
console  http://localhost:4100/a/clinica-norte
line     rings in this terminal · also running: carla@clinica.test
› Clínica Norte, buenos días. ¿En qué puedo ayudarle?
‹ Quería cambiar una cita
→ findPatient({"name":"Ana García","phone":"600000001"})
← findPatient {"id":"p-1041","cita":"jueves a las diez"}
```

| flag | |
|---|---|
| `--serve` | also serve the sandbox's console on `http://localhost:4100`, or point at the one already up. Refused on a production key |
| `--ui` | the full-screen terminal view. `p` pause · `c` clear · `e` events · `s` prompt · `q` quit |
| `--events` | one JSON line per log entry instead of the lines, for a pipe |
| `--show-prompt` | the prompt a fresh instance would produce, then exit. No key, no gateway |

**It answers the console for this directory.** What a screen needs of the agent's directory — a
written call to the class here, the personas and a simulation, the goldens and a suite, the
knowledge folder pushed and its golden asked, the memory goldens, a call promoted to a candidate,
the drift, a reproduction a broken run left — the console asks the gateway, and the gateway asks
THIS process over the socket it already holds (`dev.request` → `dev.answer`; the runtime's
`docs/protocol/dev-verbs.md`). The lines those verbs print land here, as if you had typed them.
A `pinecall run` in a directory with no personas answers `simulate` with a sentence saying so.

## `serve`

```
pinecall serve [--port <n>] [--no-open]
```

**The sandbox's console, on your own machine.** The gateway's page shows production and only
production — what customers reach, watched by the people who run it. What YOU are running is
watched here: `http://localhost:4100`, the same console, looking at your corner of the sandbox —
your copies of the agents, their calls as they happen, chat, evals and their suites, knowledge,
memory, the widget and its preview, and how to reach your copy by phone. It mounts no agent: `run`
does that, and `pinecall run --serve` does both in one terminal.

```console
$ pinecall serve
gateway  https://box.pinecall.io · key from profile
console  http://localhost:4100   (your sandbox; Ctrl-C closes it)
```

It is a sidecar and keeps nothing: every request the page makes is forwarded to the gateway with
this machine's sandbox key on it. **The key never reaches the browser**, so the page has no login,
no sign-out and no key in its storage. Only this machine's own page may ask: the port is bound to
the loopback, and a request whose `Host` is not this loopback, or whose `Origin` is another page's,
is answered `403` before the key is spent.

**One per machine.** A second `serve` — or a `run --serve` — for the same gateway and org finds the
first and says where it is, so two projects share one page and `run` can be restarted under it
without the console going away. A port held by anything else is stepped past (4101, …), and
`--port` names one. `pinecall run` with no `--serve` still names a sidecar that is up.

Which screens this console has and which the gateway's has is one table in the console's source
(`src/cli/ui/console/lib/mode.ts`): running the org — numbers, keys, providers, the team, usage —
and the box's own screens are the gateway's; **Dev chat**, running a suite and **Phone testing**
are this one's; Home, Overview, Live, Sessions, Evals, Memory and every tab of an agent are both's.
An admin opens a colleague's copy from here, never from the gateway's page
([worlds-and-teams.md](worlds-and-teams.md)).

A production key is refused, in a sentence that says where production is watched and names
`pinecall use <profile>` for a sandbox one; a machine with no browser prints the URL and
`--no-open` says not to try. In a checkout the console has to be bundled first (`scripts/build`):
until it is, the verb says so and exits 2.

## `line`

```
pinecall line [from <+number> | forget | claim | release] [agent.tsx] [--agent <name>]
```

**A number rings in one place, and a team shares its numbers.** With one developer that is not a
decision: the first `pinecall run` to hold the agent answers its ring and you never learn the word.
With three it used to be whoever restarted last — so you would dial the number to test your change
and be answered in a colleague's scrollback, with nothing on either screen saying so.

**Say which phone is yours, once.** Then every call you make lands in your own agent: no claim, no
coordination, three of you testing at the same time.

**It works on the production number, and that is the usual case.** A call from your phone to a
number that answers in production reaches your sandbox copy while you are holding that agent — your
class, your tools, your terminal, a sandbox log marked `diverted_from: production` — and every other
caller reaches production exactly as before. Stop `pinecall run`, or `pinecall line forget`, and
your own calls go back to production. That is how a team tests on the line its customers use, with
one number: a sandbox number is optional, and when an org has one, your phone reaches your copy
there too. The gateway's worker asks for this on every production ring
(`GET /v1/agents/{slug}/rings-for`), so nothing here knocks at that door.

```console
$ pinecall line from +59899111111
calls from +59899111111 reach this terminal
```

A phone is a **person's** and not an agent's, so it works in whatever directory you are standing
in and on every agent you hold. It is kept on that gateway's profile (`calling` in
`~/.pinecall/config.json`) and re-sent by every `pinecall run` when it starts — the gateway keeps
it beside its live table and not in a row, because it is only meaningful next to a socket: a
developer running nothing has no corner for a call to land in. `forget` undoes it. `claim`,
`release` and the bare `line` are about one agent: at a project's root with several, name it with
`--agent`. A number that is not in E.164 form is refused with the shape in the sentence, and an org's own
key is refused outright: it names nobody, so there is no *their own agent* to reach.

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
there — only your own phone is diverted, as above; `pinecall run` prints the line only for an
agent that declares a number.

## `chat`

```
pinecall chat [agent] [--agent <name>] [--file agent.tsx] [--env production] [--as <contact>]
             [--state file [--case n]] [--events]
```

With nothing after it: the agent of this directory mounted in **this** process, and a written
caller against it in the same terminal. This is `rails console`: the tools run here, so a
breakpoint in a `@tool` is reachable. It works with no `pinecall run` up and with three of them,
because the caller socket names this process.

```console
$ pinecall chat --as +34600000001
‹ hola, quería cambiar mi cita del jueves
› Claro. ¿Me da su nombre completo y su teléfono?

$ pinecall chat clinica-norte
```

**The positional is an agent's slug, never a file.** Named one, `chat` mounts nothing and is only
the caller's side: a written call at whatever is already holding that slug — your own `pinecall
run` in the other terminal, or a colleague's, in the corner your key reaches. `--file` is how you
name the class to mount by its path, and it is the same word in every verb that loads a file
(`test`, `simulate`, `remember`, `personas`, `knowledge`, `memory`); `--agent` names one agent of a
project of several, by its name or its slug, and is required there because a chat talks to one.

`--as` is who is calling — the id memory files the call under. `--state file [--case n]` opens the
call in a state: the same goldens file `prompt` reads, and it is refused beside a slug, because
nothing is mounted here to open. `--events` prints the wire instead. `--env` asserts the world, as
[`run`](#run)'s does: nothing said is the sandbox, and a key that opens the other one stops the verb.

## `prompt`

```
pinecall prompt [agent.tsx] --state <file> [--case n] [--agent <name>]
```

The exact prompt a state would produce, offline: **no gateway, no key, no call**. The three
regions in the order the model receives them, then the stage and the tools that stage shows. The
verb you run while writing a `render()`, and it answers in the time it takes to save the file.

```console
$ pinecall prompt --state test/goldens/identifica-al-paciente.json
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

Ring 1: every golden of `test/goldens` (in a project, `test/goldens/<name>/` for each agent) through
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
pinecall simulate --persona <name> [--judge] [--turns n] [--voice] [--listen]
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

`--listen` puts the call on **this machine's speakers** while it happens: the same hidden `observe`
seat the console's listen button takes, joined from Node, both tracks mixed onto whichever of
`ffplay`, `play`, `aplay` or `pw-play` you have. It turns `--voice` on and says so, because a
written call has no audio in it. `--judge` reads back the `call.score` the log seals on.

## `personas`

```
pinecall personas list | show <name> | try <name> [--agent <name>] [--file agent.tsx]
```

The callers are `test/personas` beside the agent, or `test/personas/<name>/` in a project, where
`list` prints every agent's under its name and `show` and `try` need `--agent`.

```console
$ pinecall personas list
apurado       frases cortas, interrumpe, da el dato justo y pide la hora ya   cambiar la cita al martes…
desconfiado   educado y receloso, responde con otra pregunta                  enterarse del precio…
spanglish     empieza en inglés y termina en español                          saber qué horas hay el lunes…
```

`show` prints one whole, facts and all. `try` asks the gateway's caller door for one improvised
line — the same door `simulate` asks for every turn — so you can hear a persona before running one.

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
```

```console
$ pinecall runs list --limit 3
run_8a8870b59bc1  2026-09-11 12:47:23  clinica-norte     done     1/1
run_5c6b559d6093  2026-09-11 11:56:49  clinica-norte     done     2/2
```

`show` prints one run the way `test` printed it when it happened; `diff` says what moved between
two, golden by golden. **`promote`** writes one real call down as a golden **candidate** in
`test/candidates` — the state it was in, every caller turn from `--from-seq`, and an `expect`
derived from what the judges answered — for a person to edit before it counts as a golden.
**`drift`** counts each judge's held-rate over two windows of finished calls and exits 1 when one
fell further than `--threshold` points: nothing is judged again, a held-rate is a count of the
verdicts `call.score` already carries.

---

# Running it

## `sessions`

```
pinecall sessions [call] [--agent <slug>] [--limit <n>] [--json]
```

```console
$ pinecall sessions --limit 3
clinica-norte · 3 calls

● call_314b0306e2a64daba6b6dbab129540c0  web inbound     16m 27s  live                    —
  call_df5aaa81ac7142f5a2c6f9b77033d23e  web inbound         31s  caller_hung_up    €0.0000  Clínica Norte, buenos días…
  call_29d7c7b6cdd643de9c659984a0125c8c  web inbound          3s  caller_hung_up    €0.0205  Perfecto. El jueves tenemos…
```

With a call id: that call whole — what it was, how long, why it ended, what it cost, and the
**score**, one line per judge with the question it answered and its own reasoning when it did not
hold. The judging is ring 4's, at hang-up, in the gateway; this verb reads it back and runs
nothing.

## `agent`

```
pinecall agent [--agent <slug>] [--json]
pinecall agent list
pinecall agent set [--voice x] [--tts x] [--tts-model x] [--stt x] [--llm x] [--greeting '…' | --reply '…']
                   [--hangup '…'] [--endpointing-ms n] [--min-interruption-words n]
                   [--remember '…' …] [--forget '…' …] [--team] [--note '…']
pinecall agent clear [voice|tts|tts-model|stt|llm|greeting|hangup|turn|memory|knowledge …] [--team]
pinecall agent history [--team] · diff [--against team|production] · rollback <version> [--team]
pinecall agent promote [--to team|production] [--note '…']
pinecall agent pull [--team] · push <file> [--team]
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
  knowledge     —               maravilla (k 4)             maravilla (k 4)

  yours: v3 · m_ana · 2026-09-19 14:32 · "flat on the phone" · team: v11 · m_bruno · 2026-09-18 10:04 · production: v11 · m_ana · 2026-09-12 …
```

**What an agent runs on is the org's, not the class's** — per world, per corner, a version a row
(the runtime's `docs/protocol/settings-api.md`). The class declares the contract: its tools, its
state, its `render()`, its language. The voice, the models, the opening, how a call ends, how a
turn is cut, what is remembered and which bases are read are **settings**, kept by the gateway and
laid over the class at the one place every session is built. A class that still declares one of
them seeds the world's first version the first time it registers there, and from then on **the
world wins**: `pinecall run` prints one line per field the class still says differently, and the
line says what to delete.

**Three corners.** In the sandbox your key has a corner of its own: what you `set` is yours until
you promote it, and a colleague's next call does not hear it — so two developers testing two
voices never change each other's. A corner that set nothing reads the team's (`(team's)` in your
column), which is the org's own corner, written with `--team`. Production has one corner and is
**written by promote alone**.

**Versions.** Every `set` is a new row; nothing is updated, nothing deleted. The whole set travels
with the version it was read at, so two people saving at once never write over each other: the
second is told `this corner is at v4 now, not the version you read`. `history` prints every version
with who set it, why, and what it changed; `diff` reads this corner against the team's or
production's; `rollback <n>` brings one back as the next version.

**Promote**, two hops, one verb. `pinecall agent promote` makes yours the team's next version.
`pinecall agent promote --to production` reads the goldens beside the agent and sends them with
the ask: the gateway drives them through the app serving your sandbox corner under the team's
settings, and writes production only when every one holds — otherwise it names the goldens that
did not, and production stays as it is. It is `--to production` and never `--prod`: that flag
takes the production *key*, and this hop is made from the sandbox.

**Git, for whoever wants it.** `pinecall agent pull > pinecall/maravilla.json` writes the corner's
config as a file; `pinecall agent push pinecall/maravilla.json --team` sends it back as the next
version, with no version check — it is what CI applies.

## `lexicon`

```
pinecall lexicon [--json]
pinecall lexicon add <word> --say '…' [--team] [--note '…']
pinecall lexicon hear <word> [<word> …] [--team]
pinecall lexicon rm <word> [<word> …] [--team]
pinecall lexicon history [--team]
pinecall lexicon promote [--to team|production]
```

The org's words, laid over every agent's own `says` and `hears`: a brand, a surname, an acronym is
the same word whichever agent says it, and the org's word wins where both say the same one. Whole
and versioned like the settings, per corner, with the same `--team` and the same refusal when the
corner moved. A **supervisor's or a manager's key opens it** (`words`): the person who hears a word
said wrong forty times a day fixes it, without a developer and without a deploy. `promote` makes
the two hops with no goldens between — a word said wrong is what the agent already does.

`pinecall memory policy [--remember '…' …] [--forget '…' …] [--team]` is the memory field of the
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

The three legs as the **next** call would be built, with `← set` beside any knob the agent's
settings set. It reads and nothing else: the six knobs are fields of the settings now, and
`pinecall agent set` sets them with the rest — a model knob still reads three ways there,
`--llm anthropic/claude-haiku-4-5`, `--llm cartesia` (a vendor, its own model), `--llm
claude-haiku-4-5` (a model, the vendor in use). `pinecall pipeline set` and `clear` say so and
exit 2. `pinecall providers` lists every vendor a stage may be moved onto.

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

## `keys`

```
pinecall keys issue --label "prod server" [--env production|sandbox] [--scope <scope>]…
pinecall keys list
pinecall keys revoke <fingerprint>
```

A key issued here is a **machine's**: a server, a CI job, a box. It names nobody — people get keys
by logging in — and it holds `app` in production unless `--scope` says otherwise, which is the
shape a deployment has. This matters because **your own key does not hold `app` in production**:
a deployed agent is held by the process somebody put on a box, not by whoever is logged in. So
this is the last step before a deploy — issue one, put it in that box's environment, and that
`pinecall run` is the one that answers your numbers.

`issue` prints the key once and never again: the gateway keeps its sha256 and no door reads one
back. `list` prints fingerprints, labels, worlds, whose each is and whether it is revoked — never
a key. `revoke` takes a fingerprint as `list` prints it; the row and its history stay, so the
calls that key wrote stay readable. A key may not issue a scope it does not itself open, and a
fingerprint that is not this org's is refused as one that is nobody's.

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
bring. Any of these names — or any of its aliases — is what `pipeline set --stt`, `--llm` and
`--tts` take, and what an agent declares.

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
gateway https://box.pinecall.io · key from profile
2026-09-11 19:20  clinica-norte  +34600000000  phone  via overflow on call_9f2c…
2026-09-11 19:22  clinica-norte  +34611111111  web    via the widget
```

## `gateway`

```
pinecall gateway              where this machine is pointed
pinecall gateway <url>        point it at your own box, then `pinecall login`
```

Every verb goes to `https://box.pinecall.io` until this says otherwise, so a person on the cloud
types `pinecall login` and nothing else — no URL to remember and none to mistype. Somebody running
their own box says so ONCE, and every verb after it goes there: the login, and any verb
that runs before this machine holds a key.

```console
$ pinecall gateway
▸ https://box.pinecall.io   (the default)

$ pinecall gateway voz.clinica.com
▸ https://voz.clinica.com
  `pinecall login` signs this machine in there
```

An address with no scheme is read as https, and only the origin is kept. An org you are already
signed in to is a profile, and `pinecall use <org>` is how you move between those; this verb is for
the gateway you have not signed in to yet. A URL typed on `pinecall login <url>` still wins, for
that one command.

## `login`

```
pinecall login [gateway-url] [--as <profile>] [--key-stdin]
```

`login` **prints a link and opens it**. You sign in there — in a browser, where a password belongs,
where the browser autofills it and a password manager holds it — and the page hands this terminal a
key of its **own**: minted for you, labelled as this machine, revoked on its own from the Keys
screen. Nothing types a password into a shell, and the day your org signs in with Google this verb
does not change.

```console
$ pinecall login
gateway  https://box.pinecall.io   (the default — `pinecall gateway <url>` for your own box)

open this to sign in:
https://box.pinecall.io/cli?c=cli_…

waiting…
▸ clinica · https://box.pinecall.io · sandbox (and production)
  tienda-sur · https://box.pinecall.io · sandbox (and production)
  `pinecall use <org>` moves between them; `pinecall use <org> production` looks at production
```

**With no URL it is the gateway this machine is pointed at** — `https://box.pinecall.io` until
[`pinecall gateway <url>`](#gateway) says otherwise — and it says which in the line above the link,
so a person who meant their own box sees the assumption before anything is kept. The word in the
link dies in ten minutes and on first collection; a terminal on a server with no browser prints the
same link and you open it from wherever you are.

**One login keeps everything a person holds.** A **profile per org** they belong to, named after
the org, each with the key of **both worlds** — the gateway mints the rest from the key in hand
(`POST /v1/login/org`, `POST /v1/login/env`), so there is no second login for a second org and none
to look at production. Every key is proved at `/v1/whoami` before it is written; the org signed in
to is the active one, in the sandbox. `--as <name>` keeps ONE profile under a name of yours, which
is what a machine's key wants (`--key-stdin`). A second gateway whose org has a slug this file
already holds is kept as `<slug>@<host>`.

**The key in hand after a login is the sandbox one.** `pinecall run` and `pinecall chat` answer in
a world of your own and never in the one your customers call — and it is watched from this
machine too, on [`pinecall serve`](#serve) ([worlds-and-teams.md](worlds-and-teams.md)).

`--key-stdin` reads a **key** from one line of stdin instead, for a machine: a server, a CI job, a
container. That is what `pinecall keys issue` mints, and it writes the same profile — so a machine
and a person hold their key the same way, in a 0600 file read once, and not in an environment
every child process and every `ps` can read. `PINECALL_HOME` says where that file goes. A machine's
key names nobody, so the profile holds the one world it opens.

## `config` · `use`

```
pinecall config
pinecall config rm <name>
pinecall use <org>
pinecall use <org> <sandbox|production>
```

```console
$ pinecall config
▸ clinica     https://box.pinecall.io  clinica · sandbox (and production)
  tienda-sur  https://box.pinecall.io  tienda-sur · sandbox (and production)

$ pinecall use tienda-sur              # another org
▸ tienda-sur

$ pinecall use tienda-sur production   # and its other world
▸ tienda-sur · production
  you look at production from here; what answers its numbers is the box's own key

$ pinecall config rm tienda-sur
forgot tienda-sur
```

Moving is a line in a file and never a trip to the gateway: `use <org>` makes that profile the
active one, `use <org> <world>` puts that world's key in hand as well, and a profile with no key
for that world is refused — `pinecall login` again keeps both. A world is `sandbox` or `production`
and nothing else. `pinecall use` with nothing after it prints the usage. **In production a person
LOOKS** — `sessions`, `numbers`, `keys`, `providers`, `supervise` — **and in the sandbox they
RUN**: a person's key never opens `app` in production, so no laptop answers the org's numbers by
accident. What runs there is a machine's key ([`keys issue`](#keys)) on the box.

`config` prints no key. What a listing may say about one is that it is there; the org and the
world beside each name are what the login wrote down, and *(and production)* is a profile holding
both worlds' keys. With no profile at all it prints ``no gateway yet: `pinecall login` ``. `config rm`
takes a row out — a gateway that has moved, a key that was revoked — and takes the active mark with
it rather than leaving it pointing at a row that is gone. **It keeps the gateway this machine is
pointed at** ([`pinecall gateway`](#gateway)), and forgets nothing else: the key itself is stopped
from the Keys screen, and a row left behind is a key somebody will trust tomorrow and a refusal
they will read as the gateway's fault. A name this file does not hold is refused, and the refusal
lists the ones it does.

## `whoami`

```
pinecall whoami
```

The gateway every connecting verb would talk to and where its key came from, then what that
gateway says the key is: the org (its slug, or its id when the gateway carries none), the key's id,
the world it opens and the label it was issued under. The key itself is neither printed nor sent
anywhere else.

```console
$ pinecall whoami
gateway http://127.0.0.1:8080 · key from profile
org default · key dev · sandbox · the local gateway
```

---

# What it remembers, and what it knows

## `knowledge`

```
pinecall knowledge push [dir] [--base <name>] [--agent <name>] [--file agent.tsx]
pinecall knowledge list
pinecall knowledge drop <base>
pinecall knowledge eval [golden.json] [--base <name>] [--k <n>] [--agent <name>] [--file agent.tsx]
```

`push` reads every `*.md` under the directory — `./knowledge/docs` beside the agent file when none
is named, or `knowledge/<name>/` for each agent of a project — and sends the folder **whole**: the
base is replaced, never merged. At a project's root with nothing typed, `push` and `eval` act on
every agent that has documents or a golden (`knowledge/<name>.golden.json`), and name the rest. The base is the
agent's slug unless `--base` says otherwise, and the class names it with `docs = "<base>"`.

**The base you push is your key's world's.** A push with the sandbox key a login keeps
replaces the sandbox base — what your own `pinecall run` answers from — and never the one the
telephone answers from. Promoting is the same push made with the key the box runs on
([`keys`](#keys)): keep it as a profile of its own — `pinecall login --key-stdin <url> < key
--as prod` — and push with `--profile prod`. `list` and `drop` read the same world.

```console
$ pinecall knowledge push
clinica-norte · 7 files · 41 chunks · 812 ms      # base · sent · became · took
```

`eval` asks the base every question of a golden — a JSON list of `{asks, expects}`, where `expects`
is the heading path the answer should carry — and prints `recall@k` and `nDCG@10`, computed by code
with **no model in the loop**, plus every question it missed and what came back instead. Exits 1
when anything missed, so CI can hold a base to it. A golden is fixed and the index is the variable:
never soften a question so a change can pass.

## `memory`

```
pinecall memory <contact>
pinecall memory forget <contact>
pinecall memory eval [golden.json] [--k <n>] [--agent <name>] [--file agent.tsx]
```

Everything memory kept about one contact — the caller's number, or the id the app named — with the
current facts first and the ones a later call superseded dimmed, with the date they stopped
holding. `forget` erases all of it, the right to be forgotten; on a terminal it asks once, and
prints how many facts went.

`eval` holds **recall** to a golden of `{holds, asks, expects}` — `memory/golden.json` beside the
agent, or `memory/<name>.golden.json` in a project: each question brings its own facts, so no
contact of yours is read or written — they go to a scratch contact and are deleted again.

## `remember`

```
pinecall remember [paths] [--agent <name>] [--file agent.tsx] [--grep x] [--json]
```

The cases are `test/memory` beside the agent, or `test/memory/<name>/` in a project.

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
| `2` | this command cannot run: no key, a flag that is not a flag, a persona nobody wrote, no browser for `ui` |

A call **nobody judged** is not a pass: `simulate --judge` exits non-zero for it, because "nobody
looked at this" must never open a gate.

## What each verb knocks at

The bridge between this document and the gateway API. Anything in the right-hand column, your own
code can call — over HTTP, in any language, with the same key.

| verb | doors |
|---|---|
| `run` · `chat` · `test` · `simulate` · `remember` | `WS /v1/apps` — the class is mounted in the process that typed the verb |
| `run`, once connected | `POST /v1/login/codes` (the console's URL, in production), `PUT /v1/line/from` (the kept phone, on every connect), `GET /v1/agents/{slug}/line` (for an agent that declares a number) |
| `chat` | `WS /v1/chat?agent=&app=&contact=` |
| `run --events` · `sessions` · `supervise` | `GET /v1/calls/{call}/events` (SSE), `GET /v1/agents/{slug}/sessions` |
| `supervise` | `POST /v1/calls/{call}/verbs` — with the **org key**: a desk that only reads and types needs no seat. A seat (`POST …/supervise`) is for audio, and that is the console's |
| `simulate --listen` | `POST /v1/calls/{call}/listen`, then the LiveKit room |
| `simulate --voice` · `test --voice` | `POST /v1/evals/voice`, `POST /v1/evals/caller` |
| `test` · `runs` | `POST /v1/evals/run`, `GET /v1/evals/runs[/{id}]` |
| `eval` | `POST /v1/evals/replay/{call}` |
| `agent` | `GET`·`PUT /v1/agents/{slug}/settings`, `GET …/settings/history`, `GET …/settings/diff`, `POST …/settings/rollback`, `POST …/settings/promote` (the goldens in the body for `--to production`), `GET /v1/agents` for `list` |
| `lexicon` · `memory policy` | `GET`·`PUT /v1/lexicon`, `GET …/history`, `POST …/promote` · `GET`·`PUT /v1/agents/{slug}/settings` |
| `run`, once connected, too | `GET /v1/agents/{slug}/settings`, `GET /v1/lexicon` — the lines that say where the world says otherwise |
| `pipeline` | `GET /v1/agents/{slug}/pipeline` |
| `knowledge` | `PUT`·`GET`·`DELETE /v1/knowledge[/{base}]`, `POST /v1/knowledge/{base}/eval` |
| `memory` | `GET`·`DELETE /v1/contacts/{contact}/memory`, `POST /v1/contacts/memory/eval` |
| `remember` | `POST /v1/agents/{slug}/memory/extraction` |
| `keys` | `GET`·`POST /v1/keys`, `POST /v1/keys/{fingerprint}/revoke` |
| `numbers` | `GET`·`POST /v1/numbers`, `PUT /v1/numbers/{number}/env`, `DELETE /v1/numbers/{number}` |
| `providers` | `GET /v1/providers` · `PUT`·`DELETE`·`GET /v1/provider-keys[/{vendor}]` |
| `callbacks` | `GET /v1/callbacks[?agent=&after=]` |
| `line` | `GET`·`POST`·`DELETE /v1/agents/{slug}/line`, `PUT`·`DELETE /v1/line/from` |
| `serve` | every door the console asks, forwarded as the page sent it with the profile's key: `GET /v1/whoami`, `/v1/agents`, the logs, `…/dev/*`, `GET /v1/line/numbers` |
| `login` | `POST /v1/login/pairings`, `GET …/{code}/key` — then `GET /v1/whoami` to prove what it got, `GET /v1/login/orgs` for the person's orgs, `POST /v1/login/org` for the key in each, `POST /v1/login/env` for the other world's |
| `whoami` | `GET /v1/whoami` |
| `gateway` · `config` · `use` | none. They read and write `~/.pinecall/config.json` and nothing else |
| `prompt` | none. It is the one verb that needs no gateway and no key |
