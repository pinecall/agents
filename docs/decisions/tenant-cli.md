# The tenant's CLI — `pinecall run`, `chat`, `ui`, `prompt`

`src/cli/` is the command a person who builds an agent types. The
operator's CLI is a different program with a different reader — `pinecall-runtime`, in
Python, argued in the runtime's `docs/decisions/cli.md`. Same grammar, no shared code and no shared process.

## The shape is Rails', and only one verb is a server

| Rails | here | what it is |
|---|---|---|
| `rails server` | `pinecall run` | the app. This is what you put under pm2 or in a container. |
| `rails console` | `pinecall chat` | the app in ITS OWN process, and a prompt against it. |
| `rails console` with a microphone | `pinecall ui [agent]` | the console, served by this CLI on 127.0.0.1 for the life of the command: Talk (the browser's microphone joins the room), Calls, Sessions, Pipeline, Evals. Lands on the agent of this directory when none is named, as `run` names it — [console.md](console.md). |
| `rails test` | `pinecall test` | the goldens through the app in this terminal, scored by the runtime — [pinecall-test.md](pinecall-test.md). |

Bernardo, 2026-09-07, within an hour of running it for the first time: *"no quiero mas `pinecall run` es horrible
man"*. `run` said nothing about what the process does — every CLI in the world has a `run` —
and it had grown into the developer's screen, the web console and the deployed process all at
once. So `run` was **deleted**, not aliased and not deprecated, and the verb became `serve`.

Bernardo, 2026-09-08: it comes back the other way. What was horrible about `run` was never the
word, it was the process the word named, and that process is gone — no screen to host, no
console, nothing to open. `serve` promises a port and a server; this binds neither, it registers
an agent on a gateway and stays reachable. So the verb is `run` again, renamed and not aliased:
nothing answers to `serve`, and typing it is refused with the usage that names `run`.

**Only `run` is a server.** `chat` mounts the class too — that is the whole point of it — but it
ends when the conversation does, and what it opens is a conversation, not a door.

## `run` is the agent alone: dev and prod are the same process, and it binds nothing

`run` had `--no-ui` and `--no-console`: two negatives, which is a table saying out loud that the
default was picked for a developer watching a screen and that production has to switch two things
off. It also meant a container bound `127.0.0.1:4747` nobody asked for, and two replicas of one
app on a box collided on that port before either of them had served a call. So the flags were
turned into positives and switched off by default.

Bernardo, 2026-09-08, reading the table that came out of it: the flags were the wrong answer to
the right complaint. **A page is not the agent's to serve.** One hosted by the agent's own process
dies when the dev closes the terminal, lives on whichever machine the agent happens to run on, and
is why a person has to fill in flags at all. `--console`, `--console-port` and `--open` are
**deleted**, with `src/cli/console/` — the server, the dist lookup, the opener —
and nothing is aliased or deprecated.

Later the same day the rule went one step further: **the gateway serves no page.** The console it
used to serve was deleted whole, and came back the same evening as the CLI's own, on 127.0.0.1
under `pinecall ui` — see [console.md](console.md). What a developer looks at is `--ui` in this
terminal, the console in a browser, or the log over `/v1`; the agent's process serves none of it.

What is left is the process a container runs and the process a developer runs, and they are the
same one: **one line per log entry on stdout, no port bound, no page served**.

So `run` says what it registered, once, when the socket is up:

```
clinica-norte · connected to https://box.pinecall.io · tools 4 · doors phone +34 910 000 000, web
```

Three things a person needs and nothing the process had to invent: who registered, which gateway
took it, and what the class declared. It names no page, because there is none to name. It is one
function, `connectedLine` in `run.ts`. It is printed **after** `pc.connect()`: a gateway that
refused the socket must leave its own refusal as the last thing on the screen.

The two flags that are left are pipes, not flags for a person to choose between:

| flag | what it is |
|---|---|
| `--events` | one JSON line per entry instead of the lines, for `\| jq`. It is the wire, for a program |
| `--show-prompt` | the prompt a fresh instance would produce, and then exit. No key, no gateway, no network |
| `--ui` | the full-screen terminal view, repainted ten times a second. It binds nothing either |

Nobody types `--events` to read a call; they type it to feed one to something else, and
`--show-prompt` is a question answered offline. Neither is a choice about how `run` runs.

## `ui` opens a page; it never opens a microphone

The microphone is always a browser's. Node has none: the first `talk` borrowed the operator's
Python worker through a child process, and the second was planned as a participant drawn in the
terminal, which would have meant two native audio bindings so that somebody can say "hola" to
their own agent. A browser already has a microphone, a speaker and a device picker, and
`@pinecall/web` already joins the agent's room with a token. That is the lesson
[talk.md](talk.md) keeps, now three times over.

The third form pointed at the console's Talk screen, served by the gateway; the fourth was a page
of the CLI's own for one evening; the fifth is the console again, served by the CLI:
`pinecall ui [agent]` opens it on 127.0.0.1 under a nonce for the life of the command, signs every
request to the gateway with the org key it holds so the key never reaches the browser, and closes
the port when the command ends. Talk is its first screen. The turns of that story are in
[talk.md](talk.md); the console as it stands is [console.md](console.md).

## The whole verb list is declared, including what does not exist

`groups.ts` names every group of the design's §16, written or not, and the dispatcher answers
`pinecall supervise` with `supervise is not built yet: …` and its purpose, exit 0.

Declaring the unwritten half is the point. A CLI that says "unknown command" for a verb
its own documentation promises makes a person doubt the documentation; one that names the
milestone tells them the truth and where to look for it. It also keeps the roadmap in a
file a test can read: `dispatch.test.ts` checks the list against the design's own.

The order they are written in comes from the design doc, not from taste: chat, run and prompt
first, then `call` and `eval` once there is a phone, then the log readers, then `test`, then
`supervise`, then memory and knowledge, then the scaffolders — and last everything that needs an
account: login, keys, tokens, phones, agents, deploy.

Two names left the table rather than being written: `talk`, which became the first screen of
`ui`, and `console`, which was `the web console on :4747` — the console is `ui` now, a verb of
this CLI, and the only one that ever opens a page.

**A group's flags are the group's own, and so is its help.** `pinecall --help` is the whole CLI on
one screen — one line per group — and `pinecall <group> --help` is that group's page: its purpose,
then the `usage` string the module itself exports. The dispatcher only knows to ask, which is what
keeps a new group one import and one line. A group with no flags exports no `usage` and prints its
purpose alone.

Argument parsing is `node:util`'s `parseArgs` and nothing else. A CLI whose whole surface
is three verbs with three flags each does not need a framework, and the tenant installs
`pinecall` to get an agent, not a parser.

## No TUI library

The live terminal view is a full-screen redraw written by hand: clear, print, repeat, at most
ten times a second.

A TUI library (blessed, ink, a React reconciler for the terminal) buys a component tree
and a diffing renderer. We have neither problem. The view is one page with four fixed
panels, and the page is a pure function — `draw(screen, rows, columns)` — over a value
that a pure reducer folds out of the entries: `absorb(screen, event)`. That is the whole
design, and it is why the view is tested without a terminal, without a gateway and
without a snapshot of escape codes: the tests call `statePanel` and `metricsLine` and read
strings back.

The cost of ink would have been a React runtime in a package whose one dependency story is
"install pinecall". The cost of blessed is a redraw model we would then have to reason
about on top of ours. Neither pays for itself against forty lines of `the runtime's `docs/decisions/dispatch.md`). That is what makes `chat` possible beside a running `run` — and it
is also what would ruin it: the server registered last, so a chat that named nobody would open its
call over there and every `@tool` would run in the wrong process. A console whose breakpoints land
in another terminal is not a console.

So the id travels. `agent.registered` comes back with the socket the gateway minted, the SDK's
`Agent` keeps it as `agent.app` — it exists only after the register `pc.connect()` awaits, which is
why the verb reads it after connecting and not where it mounted — and `chat` puts it on its own
caller socket: `WS /v1/chat?agent=<slug>&app=<id>`.

A process that does not open its own caller socket cannot pass it that way. `pinecall-runtime
worker talk`, the operator's microphone, is one: livekit runs a job in a process of its own and
hands it the entrypoint by name, so nothing the parent parsed reaches the job. There the id goes by
**environment**, beside the two names that already travel that way — `PINECALL_GATEWAY_URL`,
`PINECALL_AGENT`, `PINECALL_APP` — and the job puts it in the `app` of its `POST /v1/calls`. An
operator sets those by hand; no verb of the tenant's CLI writes them, and none launches that
process ([talk.md](talk.md)).

A fleet worker on a box sets none, and its calls take the newest socket holding the agent, which is
the deployed app. That asymmetry is the whole feature: a real phone call must never land in
somebody's terminal, and a terminal's own call must never land on the deployed app.

The answer to "where do my tools run" is therefore the same sentence in every case — in the process
you typed the command in — whether nothing else is running, or three `run`s are.

## `chat` prints the conversation, and `--events` prints the wire

Bernardo, the first time he used the finished verb: *"salio feo el TUI feo feo"*. Two lines of
conversation came out wrapped in twelve of `call.started`, `prompt.changed`, `agent.state`,
`metrics.llm`. The cause was a fallback at the end of `lineOf`: an entry `lineFor` had no line for
was printed as its own type, *so nothing would be dropped*. It was written to be safe and it read
as debug output.

So the rule is the verb's whole shape: **`chat` prints the conversation and what the tenant's own
code did in it** — the four marks `view.ts` owns, `‹` `›` `→` `←`, and nothing else. An entry with
no line among them is machinery, and machinery is printed by nobody.

The one exception is `error`, which is not machinery: a tool that threw is the thing a person most
needs to see, and as a type it printed as five characters. It gets a fifth mark, `✗`, and the
message the entry carries — defined in `chat.ts` and not in `view.ts`, because the view draws an
error in a panel of its own and only a terminal has to put one in the middle of a transcript.

The whole stream stays one flag away, because when what is wrong is the wire it is the only thing
worth reading: **`chat --events`**, off by default and a positive, spelled and meaning exactly what
`run --events` already means — one JSON entry per line, verbatim, nothing else.

## `chat` does not print `turn.user`, and the chat door refuses in words

Bernardo's own sentence came back at him twice. readline echoes the line as it is typed at
the `‹ ` prompt; then the call's `turn.user` arrives on the socket and `talk()` drew it
again as `‹ hola` on the line below — the `\r` there returns to column 0 of the NEW line and
erases nothing. In `chat` the caller IS this terminal and the terminal has already shown the
line, so `lineOf` gives `turn.user` no line at all. The rule is the verb's, not the
renderer's: a view watching somebody else's call must still draw what the caller said, so
`lineFor` in `view.ts` is untouched and every other reader keeps the line.

The chat door closed a socket for an agent nobody is holding with 1008 and no words, so the
CLI could only print `the gateway refused the chat socket:` with nothing after the colon.
The reason is now the sentence `no app is holding agent <slug>: start the app that serves
it, then chat again`, and `chat` prints whatever reason a close carries — a close with none
is the conversation ending, and that is not worth a line.

Saying it costs accepting the socket first: a `close` before the handshake is an HTTP 403
with no body, and the reason never leaves the process. The two refusals above it stay
closed at the door on purpose — a caller with no key is told nothing, and a missing provider
key goes to the process's log and never down a socket to a stranger. This one is different:
the caller came with the key and named the slug itself, so the sentence tells them nothing
they did not already know.

## `prompt` never connects

`pinecall prompt --state test/choose.json` loads the class, restores the state and prints
the three regions under `── static ──`, `── history ──`, `── dynamic ──`, and under them
`── tools ──` with the stage the state is in and every tool with what gates it — the model
never reads that page, the person writing the class does
(`docs/decisions/agent-model.md`). No key, no gateway, no network. It is the verb a person
runs while writing a view, and it has to answer in the time it takes to save the file. Same
reason `run --show-prompt` exits before constructing a client.

## The loader hands the class its own source

`load.ts` registers `tsx` and imports the file, and then does the one thing that is not
obvious: `describe(Ctor, readFileSync(file))`. A class docstring sits ABOVE the class,
where `Ctor.toString()` cannot see it, and the parameter types are gone once the file is a
module. Without that call the static region opens without its first line and every tool
carries untyped arguments. The CLI is the only place that has both the class and the text.

`tsx` is a dependency because the tenant writes `.ts` and `.tsx` and never a build step:
`pinecall run` on a fresh clone must work after `pnpm i` and nothing else.

## What convo's CLI taught, and what we did differently

- **Kept**: one module per group, a `PURPOSE` line each, and a dispatcher that is a table
  rather than a branch. A new group is one entry, never an edit to a growing `if`.
- **Kept**: the transcript renderer is pure and shared — convo's `sessions show` and its
  chat printed through the same `lines_of`. Ours is `absorb` + `draw`, and the default
  log prints the lines the view would have grown rather than a second formatter.
- **Dropped**: argparse's subparser tree. `parseArgs` in each group is smaller and lets a
  group own its flags without declaring them to a parent.
- **Dropped**: a group that fails when it is not built. convo simply had no verb; we
  declare it and say which milestone owns it.

## A verb closes what it opened

`pinecall` was written for months without a `pc.close()` in any verb, and the suites never
saw it: they exercise `main()` and a mounted agent, never the moment a process is supposed
to end. Running it did, in the first minute. `chat` finished its last turn and stayed alive
forever; `run` caught `SIGTERM`, returned 0 and did not die — a plain `kill` on it did
nothing and it took a `-9`. Back then the gateway kept an agent's slug for the one socket that
claimed it, so a hung process refused every `pinecall chat` after it with "already registered on
another socket": three runs of the verification blocked on one leftover. The refusal is gone
(the runtime's `docs/decisions/dispatch.md`); the handle that leaks a process is still a bug and still this.

A timer is a handle too, and a screen that repaints is a screen that erases. `live()` started
its 10 Hz repaint before `await pc.connect()`, so a refused connection left it running: nothing
reached the `clearInterval` below it, the interval held the process open, and it wrote
`\x1b[2J\x1b[3J\x1b[H` over the one line that said what went wrong — Bernardo saw the screen
clear and no error, which is the worst thing a CLI can do. The repaint now starts after the
socket is up, so there is nothing to clean up if it never started.

`process.exitCode = await main(...)` is deliberate — `process.exit()` would truncate a
half-written stdout — and node then leaves when the last handle is gone. The app socket is
that handle. So each verb that opens a client closes it in a `finally`, next to the thing it
opened, rather than a wrapper that owns the lifetime for everybody. `run` used to close a
page server there too; it opens none, so there is nothing to close.

## A goldens case is a partial state; `restore` is a whole one

`restore` writes `undefined` over every field the snapshot does not name, and that is
right: it is how a call coming back from the log is put back exactly as it was, with
nothing left over from the instance that is serving it. A goldens case is the opposite
shape — it names the two fields the case is about and says nothing about the rest, because
that is what makes it readable.

Feeding one to the other is what `pinecall prompt --state test/choose.json` did, and it
died in the tenant's own view on `slots.length` with `slots` erased. The tell was already
in the tree: `test/prompts/states.json` carried `"slots": []` written by hand in every
case, and `agent.test.ts` spread `{...snapshot(agent), stage}`. Three call sites, three
conventions, no door.

`Agent.startIn(state)` is the door: the named fields written over the ones the agent already
has. The hand-written `"slots": []` is gone from the fixture and the three call sites now go
through it.

Removing the crutch does not by itself keep the fix honest — the fixture's first case is
`identify`, which never reaches the line that broke. What keeps it honest is a case that
does: `prompt-regions.test.ts` now renders the first case of `test/choose.json`, the design's
own goldens file, which stands in `choose` and says nothing about `slots`. Put `restore` back
in it and the test dies with the same `Cannot read properties of undefined (reading 'length')`
the CLI died with.
