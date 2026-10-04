# Production

What answers the org's customers is an ordinary process — the same `pinecall start` a developer
runs on a laptop, holding production's agent instead of a sandbox copy — on the org's own server,
or on Pinecall's with `pinecall deploy --prod` ([(c)](#c-on-the-box-pinecall-deploy)). It runs on a **server's token**, it restarts with every deploy like the rest of the app, and
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
It is made in the **sandbox's** console, because the sandbox is an instance of its own with its
own keys, and CI puts the sandbox's URL beside it as `PINECALL_URL`.

A token belongs to the instance it was made on, and its prefix says which world that is: the verb
on a server says `--prod`, and the CLI holds the two to each other before it knocks — a sandbox
token pasted by mistake is refused out loud, ``this PINECALL_KEY is a sandbox server's token, made
at <url>: run the verb without --prod``, and a production token without the flag the same way.
`PINECALL_URL` goes beside the key only when the instance is not `https://cloud.pinecall.io`. A
gateway of one instance — your own runtime, with no sandbox beside it — makes only production
tokens, and a person's verbs there run in production with or without `--prod`.
Nothing is derived from a token and nothing else is read: no profile, no file in a home directory,
no `pinecall login`.

## Three ways to run it

### (a) Inside your own Node app

When the org already runs a Node server, the agent can live in it: mount the class in the server's
startup, and every deploy that restarts the server restarts the agent.

```ts
import { readFileSync } from "node:fs";
import { mount } from "pinecall";
import { Pinecall } from "pinecall/client";

import { Recepcion } from "./agents/recepcion/agent.js";

const pc = new Pinecall({ url: "https://cloud.pinecall.io", apiKey: process.env.PINECALL_KEY });
mount(Recepcion, { pc, source: readFileSync(new URL("./agents/recepcion/agent.tsx", import.meta.url), "utf8") });
await pc.connect();

process.on("SIGTERM", () => void pc.drain().finally(() => pc.close()));
```

`drain()` before `close()`: the calls this process serves go on in the next one (below).

`new Pinecall` reads nothing from the environment: the app hands it the URL and the key it keeps.
`source` is the agent file's own text — the class docstring and the tools' parameter types are gone
after compilation, and this is how they come back (`pinecall start` passes it for you); ship the
`.tsx` beside the build, or leave `source` out and accept a bare identity and untyped arguments. A
person's key would need `env: "production"` — production refuses a person's request that names no
world; a server's token needs nothing.

### (b) A process of its own

Or run `pinecall start --prod` under whatever already keeps the app's processes up. A Procfile:

```
web: node dist/server.js
agent: pinecall start --prod
```

pm2 (`pm2 start "pinecall start --prod" --name agent`), a systemd unit whose `ExecStart` is the same
line, a second container of the app's image with it as the command: the verb is the same, and it
binds no port and serves no page, so there is nothing to route to it. It prints one line per log
entry on stdout — the manager's logs — and under the connected line, the gateway's console URL for
the agent. `--events` prints JSON lines instead, for a log shipper. A project of several agents
runs them all on one socket, or one per process with `--agent <name>`.

A gateway that restarts is one line, `gateway … — reconnecting`, then `gateway back`: the client
redials on its own, the manager has nothing to restart, and every call in progress goes on — the
gateway hands each back to this process with `call.attached`.

**What is running, and a stop.** `pinecall agent list --prod` prints every process holding the
org's agents in production — the agents, the machine and address it connected from, the SDK,
since when — so an old deploy still holding a slug is one line to find. `pinecall agent stop <app>`
(or Stop on the console's Overview) closes one: `pinecall start` prints `stopped by <name>` and
exits instead of dialling back, and an app that mounts the SDK hears it on
`pc.onStopped(why => …)`. A manager that restarts whatever exits — systemd's `Restart=always`,
pm2 — starts it again, so a process kept that way is stopped for good where it is managed.

### (c) On the box: `pinecall deploy`

With no server of your own, the box runs the process:

```console
$ pinecall deploy --prod
support-line: release 1 sent · 38 KB · 3b507661b052
support-line: release 1 is live
$ printf %s "$CRM_TOKEN" | pinecall secrets set CRM_TOKEN --prod
```

It uploads the project (never `node_modules` or `.env`), installs it from the lockfile, and starts
`pinecall start --prod` in a container of its own on a **server's token it minted for the app**:
nothing above applies, no token to paste and no process manager to configure. What `.env` held for
your own code — a CRM's URL, its key — goes in as the org's secrets, which every hosted app of the
org starts with. A deploy is the next release: the one before answers until the new one's agents
register, then drains — [deploying.md](deploying.md) is the whole guide. `pinecall deploy logs` shows what the process printed, `stop` and `start`
take it off and back; `list`, `releases`, `rollback <n>` and `rm` are the rest,
and [the-cli.md](the-cli.md#deploy) says each. Your own code runs in an isolated sandbox that
reaches the internet and nothing of Pinecall's. On Pinecall's cloud an app costs $5 a month,
prorated by the hours it runs, and the sandbox hosts one free; an org's plan says how many it may host.

## A deploy

A deploy never cuts a call. On `SIGTERM` the process **drains**: it tells the gateway it is leaving,
the gateway hands its live calls to another process holding the agent — or keeps them, parked, for
the new one, which takes them when it registers — and the tools it is running are let finish. A
caller hears nothing of it; a tool the model asks for in the gap waits for the new process, up to
its own timeout.

`pinecall deploy` does all of this itself. On your own server, the process needs **40 seconds**
between the signal and the kill: ten for the gateway to answer, and
thirty for the slowest tool. Give it that under whatever runs it:

- pm2: `pm2 start "pinecall start --prod" --name agent --kill-timeout 40000` (its default is 1.6 s,
  which cuts every tool in flight). shipway: `restart.kill_timeout: 40000`.
- systemd: `TimeoutStopSec=45` and `KillSignal=SIGTERM` (the default).
- A platform with a fixed grace (Heroku's 30 s) still drains the calls; a tool longer than about
  twenty seconds may be cut, and the model reads its timeout.

Start the new process as soon as the old one has the signal, not after it exits: the calls it kept
wait for the new one to register.

## The base is not in the deploy

The base the telephone answers from is production's, and the repository does not carry it: its
documents are written in the console's Settings ▸ Docs, in production, by a person whose switch is
on — or started once with `pinecall docs push --prod` from a folder on that person's machine. A
deploy never pushes it, because a push replaces the base **whole** and would take out what was
added in the console. Which base an agent reads is production's own setting —
`pinecall docs attach <base> --k 4 --prod`, once.

## Before the deploy: the goldens, in CI

Nothing between the sandbox and production checks the agent at the gateway: there is no promote.
The gate is CI, on a sandbox token, before the deploy — `pinecall test` (ring 1), `pinecall docs
eval`, `pinecall remember`, `pinecall memory eval` — each exits 1 when something did not
hold ([testing-an-agent.md](testing-an-agent.md),
[testing-memory-and-knowledge.md](testing-memory-and-knowledge.md)).

## Changes without a deploy

The class carries nothing of the environment, so a deploy changes only code. The voice, the model,
the greeting, how a call ends, the lexicon, what memory keeps, what the agent knows by heart and
which base it searches and the documents in it: the org's **settings**, kept by the gateway, one corner in production and a
version per save. They change without a deploy, by a person whose production switch is on — `--prod`
on the verb, and there is no other door into production's corner:

```console
$ pinecall agent set --voice carolina --note "warmer on the phone" --prod
$ pinecall agent knowledge edit --prod          # what it knows by heart, in $EDITOR, as the next version
$ pinecall docs attach clinica-norte --k 4 --prod
$ pinecall lexicon add Vidal --say "Bidal" --prod
$ pinecall memory policy --forget "health details" --prod
```

or the same edit on the agent's **Settings** tab — Knowledge and Bases included — and its
**Lexicon** tab in the gateway's console. The next call hears it. `pinecall agent history --prod`
lists every version with who set it and why, and `pinecall agent rollback <n> --prod` brings one
back as the next version. `pinecall agent pull --prod > settings.json` writes production's as a
file, and `pinecall agent push settings.json --prod` is how a release applies one from git.

## From the sandbox to production, step by step

There is no promote button: production is written by the same verbs, with `--prod`, by a person
whose production switch is on. What a team carries across, and how:

| what | where it lives in the sandbox | how it reaches production |
|---|---|---|
| the code | your repository | the deploy: `pinecall start --prod` on the server's token |
| the settings — voice, model, greeting, hangup, turn, memory policy | the team's corner (`--team`) | `pinecall agent pull --team > settings.json`, then `pinecall agent push settings.json --prod` as the next production version — from CI, or by hand once |
| what it knows by heart | `pinecall agent knowledge --team` | the same push carries it; or `pinecall agent knowledge edit --prod` |
| the lexicon, each agent's | `pinecall lexicon --team` | `pinecall lexicon add … --prod`, word by word, or the agent's Lexicon tab in the console |
| the bases it searches | the sandbox's base, written in Settings ▸ Docs | written in production's Settings ▸ Docs, or started once with `pinecall docs push --prod`; `pinecall docs attach <base> --prod` once |
| the personas and the goldens | the agent's, run in the sandbox | never: they are tests. CI runs them on a sandbox token before the deploy |
| a contact's memory, the calls | the sandbox's own | never: each world keeps what happened in it |

To see what differs before pushing, read each side as a file: `pinecall agent pull --team` is the
sandbox's, `pinecall agent pull --prod` is production's, and `diff` between the two is the review.
If the push was wrong, `pinecall agent rollback <n> --prod` brings the version before back.

## Watching it

The gateway's console is production's: sign in at the gateway's address — or open the one-use URL
`pinecall start --prod` printed — for the agent's calls as they happen, Live, the numbers, the
tokens and the team. From a terminal, any read verb with `--prod`: `pinecall sessions --prod`,
`pinecall supervise <call> --prod`, `pinecall numbers list --prod`.
