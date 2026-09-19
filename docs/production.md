# Production

What answers the org's customers is an ordinary process on the org's own server — the same
`pinecall start` a developer runs on a laptop, holding production's agent instead of a sandbox
copy. It runs on a **server's token**, it restarts with every deploy like the rest of the app, and
nothing on the server logs in. Who may do what in production, and the team walked through it, is
[worlds-and-teams.md](worlds-and-teams.md); the verbs are [the-cli.md](the-cli.md).

## The server's token

A person's key is theirs and goes when they do; a server runs on a token of the **org's**. It is
made in the gateway's console, **Tokens ▸ New server token**: a name for what it runs on
(`clinica web`) and the world it opens. Production's is made by somebody the org lets act in
production. It is shown **once**, as the line to paste:

```
PINECALL_KEY=pc_live_…
```

Put it in the server's secrets — the platform's config vars, the systemd unit's
`EnvironmentFile`, the container's secret — exactly as the app's database URL is kept. The gateway
keeps its sha256 and nothing reads it back; a lost token is revoked from its row and a new one made.
The row lists it as *the org's · made by Ana*, with when it was last used, and it **outlives its
maker**: removing Ana from the org revokes every key of hers and none of the org's tokens.

A sandbox token (`pc_test_…`) is the same thing for the other world: what CI runs the goldens on.

A token opens the world it was made for, so a server needs no `--prod` — the flag is written below
anyway, because it says what the line is for, and a sandbox token pasted by mistake is then refused
out loud: `this token was made for sandbox: make one for production in Tokens`. `PINECALL_URL` goes beside the key
only when the gateway is not `https://box.pinecall.io`. Nothing else is read: no profile, no file
in a home directory, no `pinecall login`.

## Two ways to run it

### (a) Inside your own Node app

When the org already runs a Node server, the agent can live in it: mount the class in the server's
startup, and every deploy that restarts the server restarts the agent.

```ts
import { readFileSync } from "node:fs";
import { mount } from "pinecall";
import { Pinecall } from "pinecall/client";

import { Recepcion } from "./agents/recepcion/agent.js";

const pc = new Pinecall({ url: "https://box.pinecall.io", apiKey: process.env.PINECALL_KEY });
mount(Recepcion, { pc, source: readFileSync(new URL("./agents/recepcion/agent.tsx", import.meta.url), "utf8") });
await pc.connect();

process.on("SIGTERM", () => pc.close());
```

`new Pinecall` reads nothing from the environment: the app hands it the URL and the key it keeps.
`source` is the agent file's own text — the class docstring and the tools' parameter types are gone
after compilation, and this is how they come back (`pinecall start` passes it for you); ship the
`.tsx` beside the build, or leave `source` out and accept a bare identity and untyped arguments. A
person's key would need `env: "production"`; a server's token needs nothing.

### (b) A process of its own

Or run `pinecall start --prod` under whatever already keeps the app's processes up. A Procfile:

```
web: node dist/server.js
agent: pinecall start --prod
release: pinecall docs push --prod
```

pm2 (`pm2 start "pinecall start --prod" --name agent`), a systemd unit whose `ExecStart` is the same
line, a second container of the app's image with it as the command: the verb is the same, and it
binds no port and serves no page, so there is nothing to route to it. It prints one line per log
entry on stdout — the manager's logs — and under the connected line, the gateway's console URL for
the agent. `--events` prints JSON lines instead, for a log shipper. A project of several agents
runs them all on one socket, or one per process with `--agent <name>`.

A gateway that restarts is one line, `gateway … — reconnecting`, then `gateway back`: the client
redials on its own, and the manager has nothing to restart.

**What is running, and a stop.** `pinecall agent list --prod` prints every process holding the
org's agents in production — the agents, the machine and address it connected from, the SDK,
since when — so an old deploy still holding a slug is one line to find. `pinecall agent stop <app>`
(or Stop on the console's Overview) closes one: `pinecall start` prints `stopped by <name>` and
exits instead of dialling back, and an app that mounts the SDK hears it on
`pc.onStopped(why => …)`. A manager that restarts whatever exits — systemd's `Restart=always`,
pm2 — starts it again, so a process kept that way is stopped for good where it is managed.

## The base, in the release step

The base the telephone answers from is production's, and it is replaced **whole** by a push, like a
migration: `pinecall docs push --prod` in the release step, before the new process starts, sends
every `*.md` under `docs/<name>/` for each agent of the project. The server's token opens it. A
failed push fails the release, and the old process keeps answering from the old base. Which base
an agent reads is production's own setting — `pinecall docs attach <base> --k 4 --prod`, once — and
a push never changes it.

## Before the deploy: the goldens, in CI

Nothing between the sandbox and production checks the agent at the gateway: there is no promote.
The gate is CI, on a sandbox token, before the deploy — `pinecall test` (ring 1), `pinecall docs
eval`, `pinecall remember`, `pinecall memory eval` — each exits 1 when something did not
hold ([testing-an-agent.md](testing-an-agent.md),
[testing-memory-and-knowledge.md](testing-memory-and-knowledge.md)).

## Changes without a deploy

The class carries nothing of the environment, so a deploy changes only code. The voice, the model,
the greeting, how a call ends, the lexicon, what memory keeps, what the agent knows by heart and
which base it searches: the org's **settings**, kept by the gateway, one corner in production and a
version per save. They change without a deploy, by a person whose production switch is on — `--prod`
on the verb, and there is no other door into production's corner:

```console
$ pinecall agent set --voice carolina --note "warmer on the phone" --prod
$ pinecall agent knowledge edit --prod          # what it knows by heart, in $EDITOR, as the next version
$ pinecall docs attach clinica-norte --k 4 --prod
$ pinecall lexicon add Vidal --say "Bidal" --prod
$ pinecall memory policy --forget "health details" --prod
```

or the same edit on the agent's **Settings** tab — Knowledge and Bases included — and the
**Lexicon** screen of the gateway's console. The next call hears it. `pinecall agent history --prod`
lists every version with who set it and why, and `pinecall agent rollback <n> --prod` brings one
back as the next version. `pinecall agent pull --prod > settings.json` writes production's as a
file, and `pinecall agent push settings.json --prod` is how a release applies one from git.

## Watching it

The gateway's console is production's: sign in at the gateway's address — or open the one-use URL
`pinecall start --prod` printed — for the agent's calls as they happen, Live, the numbers, the
tokens and the team. From a terminal, any read verb with `--prod`: `pinecall sessions --prod`,
`pinecall supervise <call> --prod`, `pinecall numbers list --prod`.
