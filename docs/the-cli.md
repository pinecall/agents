# The CLI

`pinecall <group> [args]`. Every verb, what it is for, what it takes, and what it prints. The doors
underneath are the gateway API — the **runtime** repo's `docs/protocol/gateway-api.md` — and this
CLI is a client of that contract and of nothing else, so anything here is something your own code
can do too.

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

## The map

| verb | what it is | needs the gateway |
|---|---|---|
| [`run`](#run) | the app registered and answering — **the process you deploy** | yes |
| [`chat`](#chat) | the same app in this terminal, and a written caller against it | yes |
| [`prompt`](#prompt) | the exact prompt a state would produce, offline | **no** |
| [`test`](#test) | ring 1 (and ring 2 with `--voice`): the goldens through this process | yes |
| [`simulate`](#simulate) | a model plays one caller, live, and the call is judged at hang-up | yes |
| [`eval`](#eval) | ring 3: one real call re-checked by code | yes |
| [`sessions`](#sessions) | the calls this agent has run, and one of them whole | yes |
| [`runs`](#runs) | the suites: list, show, diff, promote a call, watch the drift | yes |
| [`pipeline`](#pipeline) | what it hears, decides and speaks with, and the five knobs | yes |
| [`personas`](#personas) | the synthetic callers in `test/personas` | for `try` |
| [`knowledge`](#knowledge) | the base the agent answers from: push, list, drop, eval | yes |
| [`memory`](#memory) | what memory kept about a contact, forgetting it, and recall's golden | yes |
| [`remember`](#remember) | the extraction goldens: what a hang-up makes of a call | yes |
| [`supervise`](#supervise) | listen in on a live call and move on it | yes |
| [`keys`](#keys) | the provider keys this org brought of its own | yes |
| [`signup`](#signup) | an org on Pinecall's cloud, and its first key kept here | no, it makes one |
| [`login`](#login) · [`whoami`](#whoami) | the key, once, and which one is being used | yes |

Declared and not written: `new`, `g`, `observe`, `costs`, `call`, `tokens`, `phones`, `agents`,
`deploy`. Typing one prints what it *will* be and exits 0 — a person who types a verb deserves
better than "unknown command". `src/cli/groups.ts` is the one place that says which half of the
CLI is still a design, and a verb leaves that table in the commit that writes it.

---

## Where the gateway and the key come from

One resolution order, in `src/cli/env.ts`, for every verb:

1. **the URL** — `PINECALL_URL`, then the local gateway's own file (`~/.pinecall/dev`), then the
   single gateway `pinecall login` kept when there is exactly one, then `http://localhost:8080`;
2. **the key** — if that URL *is* the local dev gateway, its own dev key, and an exported
   `PINECALL_API_KEY` is ignored **out loud**: a gateway started on a dev key honours that key and
   no other, and being refused with a bare `403` and no sentence in it cost this project an
   afternoon twice;
3. otherwise `PINECALL_API_KEY`, then the `credentials` row for that URL, then `PINECALL_DEV_KEY`;
4. nothing at all — the verb prints `pinecall login <url>` and exits 2.

Every verb that connects opens by printing `gateway <url> · key from <source>`. **`env | grep
PINECALL` is the first thing to run when a door refuses you and will not say why.**

## `~/.pinecall/`

| file | what it holds |
|---|---|
| `credentials` | `{ "api_key": …, "gateways": { "<url>": { api_key, org, logged_in_at } } }`. The top-level `api_key` is v1's and is never touched |
| `dev` | what a local `pinecall-runtime gateway` on a dev key left behind: its URL and its key |

The directory is `0700` and every file `0600`. The `dev` file is trusted **only** when this
account owns it and nobody else can read it — a key another account could have written is not a
key, it is an invitation. A key is never printed, never logged, and never put in a URL.

---

# Writing the agent

## `run`

```
pinecall run [agent.tsx] [--ui] [--events] [--show-prompt]
```

The app registered on the gateway and answering: **this is the process you deploy**. It binds no
port and serves no page — the gateway serves the console, at `/` — and nothing in this CLI answers
a browser. One line per log entry on stdout, and under the connected line the console's URL:
`console  https://box.pinecall.io/a/clinica-norte?login=lc_…`. The code in it is one-use and dies
in five minutes; the page spends it for a key of its own (a person's, scoped, kept for the tab)
and never sees this process's. Opening the console cold instead asks for org, email and password.

```console
$ pinecall run
gateway http://127.0.0.1:8080 · key from dev-file
clinica-norte · connected to http://127.0.0.1:8080 · tools 4 · doors web
console  http://127.0.0.1:8080/a/clinica-norte?login=lc_…   (opens within five minutes, once)
› Clínica Norte, buenos días. ¿En qué puedo ayudarle?
‹ Quería cambiar una cita
→ findPatient({"name":"Ana García","phone":"600000001"})
← findPatient {"id":"p-1041","cita":"jueves a las diez"}
```

| flag | |
|---|---|
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

## `chat`

```
pinecall chat [agent.tsx] [--as <contact>] [--state file [--case n]] [--events]
```

The same app mounted in **this** process, and a written caller against it in the same terminal.
This is `rails console`: the tools run here, so a breakpoint in a `@tool` is reachable. It works
with no `pinecall run` up and with three of them, because the caller socket names this process.

```console
$ pinecall chat --as +34600000001
‹ hola, quería cambiar mi cita del jueves
› Claro. ¿Me da su nombre completo y su teléfono?
```

`--as` is who is calling — the id memory files the call under. `--state file [--case n]` opens the
call in a state: the same goldens file `prompt` reads. `--events` prints the wire instead.

## `prompt`

```
pinecall prompt [agent.tsx] --state <file> [--case n]
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
pinecall test [paths] [--agent agent.tsx] [--model m]… [--grep x] [--watch] [--json]
pinecall test --voice [--background-noise dB] [--packet-loss 0.05]
```

Ring 1: every golden of `test/goldens` through the class **this terminal holds**, scored by the
gateway's judges, printed as a matrix. Exits 1 when a golden did not hold. Every broken golden is
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
                  [--background-noise dB] [--packet-loss percent] [--agent agent.tsx]
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
pinecall personas list | show <name> | try <name> [--agent agent.tsx]
```

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

## `pipeline`

```
pinecall pipeline [--agent <slug>] [--json]
pinecall pipeline set [--stt x] [--llm x] [--voice x] [--tts-model x] [--greeting '…']
pinecall pipeline clear [stt|llm|voice|tts-model|greeting …]
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

The three legs as the **next** call would be built, with `← turned` beside any knob an operator has
moved. `set` turns one for every call from the next one, held by the gateway and not by a deploy —
`--llm anthropic/claude-haiku-4-5` names the vendor and the model, `--llm claude-haiku-4-5` keeps
whichever vendor is in use. A knob nobody names is left exactly as it stands, because the door
takes the whole set and this verb reads it back before it sends. `clear` gives one back to what the
app declared; with no name, all five. There is no blank value: an empty voice once silenced a whole
line of calls.

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

## `keys`

```
pinecall keys add <vendor>     # the key on stdin, never on the command line
pinecall keys rm <vendor>
pinecall keys list
```

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
gateway https://box.pinecall.io · key from PINECALL_API_KEY
2026-09-11 19:20  clinica-norte  +34600000000  phone  via overflow on call_9f2c…
2026-09-11 19:22  clinica-norte  +34611111111  web    via the widget
```

## `signup`

```
pinecall signup [<gateway-url>] --org <slug> --email <you@…> --person "<your name>"
                [--name "<Org Name>"] [--password-stdin]
```

The one verb that needs no key, because it is the one that gets you the first. It makes the org on
Pinecall's cloud with you as its admin, on the free trial — forty-five minutes on us, no card — and
keeps the key it is answered exactly where `login` keeps one, so the next verb just works. The
gateway is `https://box.pinecall.io` unless another is named. The password is asked for without
echoing it, or read from one line of stdin with `--password-stdin`; it is never a flag, because a
flag is shell history.

```console
$ pinecall signup --org tienda-sur --name "Tienda Sur" --email ana@tiendasur.uy --person "Ana"
Password (12 characters at least):
created org tienda-sur on https://box.pinecall.io — signed in as Ana, key kept in ~/.pinecall/credentials
console  https://box.pinecall.io/?login=lc_…   (opens within five minutes, once)

$ pinecall whoami
gateway https://box.pinecall.io · key from credentials
org org_4ad95a171a72 · key k_8dcc… · cli
```

If `PINECALL_API_KEY` is exported in the shell, it is read *before* the row just kept, so the verb
says so on stderr rather than letting the next verb answer for another org.

The verb asks `GET /.well-known/pinecall` before anything else, so a gateway that opens no sign-up
is named **before** you type a password rather than after: its operator opens them with
`PINECALL_SIGNUP`, or makes the org and invites you, and you arrive with `login`. The org's slug is
yours to type and the gateway is its judge; a bad one comes back as a sentence, nothing is made.

**This is the only place a person makes an org, besides the API.** The console signs you in and
never registers you: it ships inside every self-hosted runtime, and a registration form there would
be one flag away from open registration on somebody else's box.

## `login` · `whoami`

```
pinecall login <gateway-url> [--key-stdin]
pinecall whoami
```

`login` asks for the key without echoing it, proves it at `/v1/whoami`, and keeps it in
`~/.pinecall/credentials` (0600) under that URL. After it, every verb finds the key by itself and
nothing has to be exported.

```console
$ pinecall whoami
gateway http://127.0.0.1:8080 · key from dev-file
org default · key dev · PINECALL_DEV_KEY
```

---

# What it remembers, and what it knows

## `knowledge`

```
pinecall knowledge push [dir] [--base <name>] [--agent agent.tsx]
pinecall knowledge list
pinecall knowledge drop <base>
pinecall knowledge eval [golden.json] [--base <name>] [--k <n>] [--agent agent.tsx]
```

`push` reads every `*.md` under the directory — `./knowledge/docs` beside the agent file when none
is named — and sends the folder **whole**: the base is replaced, never merged. The base is the
agent's slug unless `--base` says otherwise, and the class names it with `docs = "<base>"`.

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
pinecall memory eval [golden.json] [--k <n>] [--agent agent.tsx]
```

Everything memory kept about one contact — the caller's number, or the id the app named — with the
current facts first and the ones a later call superseded dimmed, with the date they stopped
holding. `forget` erases all of it, the right to be forgotten; on a terminal it asks once, and
prints how many facts went.

`eval` holds **recall** to a golden of `{holds, asks, expects}`: each question brings its own facts,
so no contact of yours is read or written — they go to a scratch contact and are deleted again.

## `remember`

```
pinecall remember [paths] [--agent agent.tsx] [--grep x] [--json]
```

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
| `chat` | `WS /v1/chat?agent=&app=&contact=` |
| `run --events` · `sessions` · `supervise` | `GET /v1/calls/{call}/events` (SSE), `GET /v1/agents/{slug}/sessions` |
| `supervise` | `POST /v1/calls/{call}/verbs` — with the **org key**: a desk that only reads and types needs no seat. A seat (`POST …/supervise`) is for audio, and that is the console's |
| `simulate --listen` | `POST /v1/calls/{call}/listen`, then the LiveKit room |
| `simulate --voice` · `test --voice` | `POST /v1/evals/voice`, `POST /v1/evals/caller` |
| `test` · `runs` | `POST /v1/evals/run`, `GET /v1/evals/runs[/{id}]` |
| `eval` | `POST /v1/evals/replay/{call}` |
| `pipeline` | `GET /v1/agents/{slug}/pipeline`, `PUT …/pipeline/overrides` |
| `knowledge` | `PUT`·`GET`·`DELETE /v1/knowledge[/{base}]`, `POST /v1/knowledge/{base}/eval` |
| `memory` | `GET`·`DELETE /v1/contacts/{contact}/memory`, `POST /v1/contacts/memory/eval` |
| `remember` | `POST /v1/agents/{slug}/memory/extraction` |
| `keys` | `PUT`·`DELETE`·`GET /v1/provider-keys[/{vendor}]` |
| `callbacks` | `GET /v1/callbacks[?agent=&after=]` |
| `login` · `whoami` | `GET /v1/whoami` |
| `ui` | all of the above, plus its own `ui/*` doors on 127.0.0.1 |
| `prompt` | none. It is the one verb that needs no gateway and no key |
