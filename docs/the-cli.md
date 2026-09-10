# The CLI

`pinecall <group> [args]`. One module per group, and a group is imported only when it is asked
for — `pinecall prompt` must not pay for a websocket client. `pinecall` with nothing after it
prints the whole CLI on one screen, built verbs and planned ones alike.

In a checkout the CLI runs from source through tsx (`bin/pinecall.js`); what npm installs is the
compiled `dist/cli/index.js` and needs no loader. In an app that installed `pinecall`, the verb is
on the PATH: `pinecall run`. In this workspace: `pnpm exec pinecall run`.

## The verbs that are built

| verb | what it does | gateway |
|---|---|---|
| `run [agent.tsx]` | the app registered and answering — **the process you deploy**. Binds no port, serves no page. `--ui` for the full-screen terminal view, `--events` for one JSON line per entry, `--show-prompt` to print the prompt and exit | yes (except `--show-prompt`) |
| `chat [agent.tsx]` | the same app in this terminal's own process, and a written caller against it. `--state file [--case n]` opens the call in a state, `--as <contact>` says who is calling — the id memory files the call under, without which a written caller is a visitor and is remembered by nobody. This is `rails console`: a breakpoint in a `@tool` is reachable | yes |
| `ui [agent]` | the console on 127.0.0.1 for the life of the command, opened in this machine's browser | yes |
| `prompt [agent.tsx] --state file` | the exact prompt a state would produce, with the stage and its tools beneath | **no** |
| `test [paths]` | ring 1: the goldens, through the app in this process, scored by the runtime. `--agent`, `--model` (repeatable), `--grep`, `--watch`, `--json` | yes |
| `simulate --persona <name>` | a model plays one caller, live. `--judge`, `--turns n`, `--voice`, `--background-noise`, `--packet-loss` | yes |
| `eval <call-id>` | ring 3: one real call re-evaluated by the runtime's code checks. `--policy`, `--json`. Exits 1 when a check does not hold | yes |
| `runs list \| show \| diff \| promote \| drift` | what this gateway ran, and what moved between two windows | yes |
| `personas list \| show \| try` | the synthetic callers in `test/personas` | for `try` |
| `knowledge push [dir] [--base <name>] [--agent agent.tsx]` | every `*.md` under the directory (`./knowledge/docs` beside the agent file by default), sent whole to `PUT /v1/knowledge/<base>`; the base is the agent's slug unless named. Prints `base · files · chunks · ms`. `list` and `drop <base>` beside it | yes |
| `knowledge eval [golden.json] [--base <name>] [--k <n>]` | every question of a golden asked of the base, and `recall@k` and `nDCG@10` computed by code with no model. Prints the two figures and every question it missed with what came back instead; exits 1 when anything missed, so CI can hold a base to it. `knowledge/golden.json` beside the agent file by default | yes |
| `memory <contact>` | everything memory kept about one contact: the current facts first, the superseded ones dimmed with the date they stopped holding. `memory forget <contact>` asks once on a terminal, erases all of it, and prints `forgotten: n` | yes |
| `memory eval [golden.json] [--k <n>]` | every question of a memory golden asked of `recall`, and `recall@k` and `nDCG@10` computed by code with no model. Each question brings its own facts, so no contact of yours is read or written: they go to a scratch contact and are deleted again. Prints every question memory did not answer whole and what came back instead; exits 1 when anything did. `memory/golden.json` beside the agent file by default | yes |
| `remember [paths]` | the extraction goldens: one call written down per file — **both speakers** — and what the hang-up's one model call must make of it. Judged entirely by code: which categories got a fact, which never did, which values must not survive in any fact's text, which held facts the call contradicted, and that a planted sentence was refused. `--agent`, `--grep`, `--json`. Exits 1 when a case did not hold. `test/memory` beside the agent file by default | yes |
| `keys add <vendor>` | the org's own key for that vendor, read from **stdin** and never from a flag — typed with nothing echoed on a terminal, one piped line off one — sent to `PUT /v1/provider-keys/<vendor>`. Every call of this org then runs on that account; every vendor nobody brought runs on the box's own key. `keys rm <vendor>` gives one back, `keys list` prints the vendors and **never a value**: no door of the runtime answers with a provider key | yes |
| `login <gateway>` | the key typed once (never echoed), proved at `/v1/whoami`, kept in `~/.pinecall/credentials`. `--key-stdin` for a script | yes |
| `whoami` | which gateway, which org, which key id — and **where the key came from** | yes |

## The verbs that are declared and not written

`new`, `g`, `sessions`, `observe`, `costs`, `supervise`, `call`, `tokens`, `phones`,
`agents`, `deploy`. Typing one prints what it *will* be and exits 0 — a person
who types `pinecall supervise` deserves better than "unknown command". `src/cli/groups.ts` is the
one place that says which half of the CLI is still a design, and a verb leaves that table in the
commit that writes it.

Two of those names exist **in the runtime's CLI** today: `pinecall-runtime sessions show <id>`
reads a finished call, and the console's Sessions screen reads the same log.

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

Every verb that connects opens by printing the line `gateway <url> · key from <source>`, and
`pinecall whoami` prints it on its own, with what the gateway says that key is. **`env | grep
PINECALL` is the first thing to run when a door refuses you and will not say why.**

## `~/.pinecall/`

| file | what it holds |
|---|---|
| `credentials` | `{ "api_key": …, "gateways": { "<url>": { api_key, org, logged_in_at } } }`. The top-level `api_key` is v1's and is never touched |
| `dev` | what a local `pinecall-runtime gateway` on a dev key left behind: its URL and its key |

The directory is `0700` and every file `0600`. The `dev` file is trusted **only** when this
account owns it and nobody else can read it — a key another account could have written is not a
key, it is an invitation. A key is never printed, never logged, and never put in a URL.

## The console

`pinecall ui` is the one verb that opens a port: 127.0.0.1, a port the kernel picks, and every
path under a random nonce. The org key never reaches the browser — the page asks this process,
and this process signs the request. Ctrl-C closes the port with the command. Over ssh or with no
display it says so and exits 2.

In a checkout the console must be bundled once (`scripts/build`): a browser reads no TypeScript.
From npm it is already inside the package.
