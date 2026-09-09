# `talk` and the recordings — the layer a microphone belongs at

The card asked for a decision: how does a person put a microphone on their agent, and how
does that leave an OGG the log can point at. Three paths were on the table. This page kept
which one we took and why — and then kept every reversal after it, because a decision that
was undone is worth more written down than one that was never made. There have been three.

## Superseded the same evening: the page became the first screen of `pinecall ui`

Bernardo, after the first real call from the page below: *"quiero que la consola exista, y sea el
talk: `pinecall ui`, donde esté el talk, logs en vivo."* So the page grew into the console it had
been a corner of. `pinecall talk` is not a verb any more; `pinecall ui [agent]` serves the whole
console — Talk first, then Calls, Sessions, Pipeline, Evals — on 127.0.0.1 under a nonce, and
signs every request to the gateway with the key it holds, so the page needs no token inlined and
no relay: it mints the visit itself through the CLI (`POST /v1/tokens`), joins the room, and reads
the call's log through the same door every other screen reads. The karaoke, the ordering rule for
a tool that arrives before the sentence announcing it, and the two voices from `lk.transcription`
moved as they were into `src/cli/ui/console/screens/talk/`. [console.md](console.md) is the page now.

## Landed, 2026-09-08 (evening): the page is the CLI's own, on 127.0.0.1 — superseded above

The fourth and last shape of this verb. `pinecall talk <agent>`:

1. mints the visit with the org key it already holds — `POST /v1/tokens {agent, scope: "talk"}`
   ([../protocol/tokens.md](../protocol/tokens.md)) — and gets the LiveKit URL, the token and the
   call id back;
2. binds `127.0.0.1` on a port the kernel picks and serves three paths for the life of the
   command: the page, its script, and a feed;
3. hands the URL to the machine's browser; the page joins the room over WebRTC with `livekit-client`
   raw — no components package — and publishes the microphone on a click;
4. reads the call's log itself, with the org key, and relays what the page may draw over the feed;
5. closes the port on hang-up or Ctrl-C and prints the call id with the `sessions show` hint.

`src/cli/talk/` is one directory, one idea per file: `index.ts` the verb,
`browser.ts` the machine's browser and whether it has one, `html.ts` the page as a string,
`server.ts` the loopback server, `relay.ts` what one log entry is worth to the page, and
`page/main.ts` the browser program, bundled by esbuild at build time into `dist/cli/talk/page.js`
and checked by its own `tsconfig.page.json` under the DOM's types. `verbs.test.ts` still greps
`cli/` for a socket and names `talk/server.ts` as the one file allowed to bind one.

**The key never reaches the browser.** The page is rendered with the visit inlined — the token,
the LiveKit URL, the call id, the agent's slug — and nothing else; `talk.test.ts` renders it with a
key in the environment and asserts the key is in neither the page nor its script.

**The token reaches only the browser this process opened.** The loopback is shared by every
process on the machine and a port is not a secret, so a page at `/` would hand a live talk token
to anything that can GET it. The page therefore lives under a 16-byte nonce — `http://127.0.0.1:
<port>/<nonce>/`, with the script and the feed relative to it — that exists only in the URL the
CLI hands to the browser; `/`, another nonce, and anything else on the port are 404, and the test
pins it. Past that, what holds the token is its own contract: it lives 60 s, opens one dispatch,
one room. A reload re-uses it — a second join into a live call takes over the seat, a join after
the call ended is refused at the dispatch (`token_spent`) — which is the reason the TTL stays at
the door's default minute.

**The join is a click, not a load.** A browser plays no audio a page started by itself; the click
on *Talk* is the gesture that unlocks playback and asks for the microphone, and the room is
connected from inside it. The agent's voice is a subscribed audio track, attached to the document.

### Which reader draws the conversation, and why

Two readers were on the table. `@pinecall/web`'s `useCallState` — the browser reading its own
call with the talk token, over the room's DataChannel or the gateway's `?token=` SSE door — and a
relay through the CLI, which holds the org key. **The CLI relays**, for three reasons, in order
of weight:

1. **The gateway sets no CORS headers, and the page is on another origin.** The page is served
   from `127.0.0.1:<port>`; the gateway is `localhost:8080`, or a box. A `fetch` or an
   `EventSource` from the page to `/v1/calls/{call}/state|events` is refused by the browser before
   any token is read. The DataChannel reader has no such problem, but it needs the worker to seat
   the page as a widget and greet it — and then the second reason applies.
2. **The public projection does not decode the conversation today.** `use-call-state.md` says it:
   `call.started`, `turn.user`, `confirm.request` and the `log.gap` snapshot leave the projection
   without fields the strict codec requires, so the guest's fold drops them. A dev's page that
   cannot show what the dev said is not a dev's page.
3. **The tenant projection is what a developer wants to see.** Tool calls with their arguments,
   the tool's answer, the state whole, an error in its own words: the org key reads all of it, and
   the CLI already has the reader — the sdk's `observe`, the same one every verb uses.

So `relay.ts` folds each observed entry into one of three items — a line with view.ts's marks
(so the page reads like `pinecall chat`), the state with what changed, or the end — and the
loopback server streams them as SSE on the page's own origin; the browser's `EventSource` is the
client and reconnects on its own, and the server replays the feed whole to a late reader. The
CLI prints the same lines to the terminal as it relays them, so a person who alt-tabbed away
still sees the call.

**What was said comes from the room, not from the relay** (2026-09-08, after the first real
call: the agent's sentences landed on the page whole and late, once the log had them, where a
voice is heard word by word). The page is a participant, and livekit-agents publishes both sides
of the conversation to every participant on the `lk.transcription` text stream — the caller's
transcript as one whole stream per STT update, the agent's as one stream per sentence written in
deltas at the pace the voice is synthesised, closed with `lk.transcription_final` in the trailer.
`page/main.ts` keeps one line per `lk.segment_id`, grey until the trailer settles it: the agent's
line grows as the words are spoken, with no timer of ours, and the caller's interim is replaced
by its final. `drawnByTheRoom` keeps those lines off the feed so nothing is drawn twice; the
terminal, which has no room, still prints them from the log. The worker already publishes the
aligned transcript (`session.py`, `use_tts_aligned_transcript`); nothing moved on that side. `@pinecall/web` stays what it is: a customer's widget reading its own call
with a guest's token. When the projection decodes whole and the gateway answers CORS for a
loopback origin, the page could read for itself; nothing in it would have to move but the source.

**Not here.** The CLI never opens a microphone: `browser.ts` refuses an ssh session and a Linux
with no display before a token is minted, with the reason and exit 2. No port survives the
command: `close()` ends every feed, closes every socket and the listener, and the test asserts
nothing answers at the URL afterwards.

## Superseded, 2026-09-08 (morning): it opened the console's Talk screen

For one day `pinecall talk clinica-norte` printed `<PINECALL_URL>/a/clinica-norte/talk`, handed it
to the machine's browser and exited 0. That page was the console's, and the console was deleted the
same day ([console.md](console.md)): the gateway is an API and serves no page. The lesson under it
survived the deletion whole, and it is the one below — **the microphone is the browser's**. A page
has one, with a speaker, a device picker and permission already asked for; it joins the agent's
room with a token exactly as `@pinecall/web` does. Node has none. What changed is only WHO serves
the page: the gateway did, and now the CLI does, for as long as somebody is talking.
See [tenant-cli.md](tenant-cli.md).

## Reversed, 2026-09-07: `pinecall talk` left the tenant's CLI

`pinecall talk` used to spawn `pinecall-runtime worker talk`: a verb of the TENANT's CLI
launching the OPERATOR's Python distribution as a child process. It was the only place in
this repo that named the runtime at all — every other verb reaches the gateway over a
socket, which is what a client does. It is deleted. `cli/talk.ts`, its test, `RUNTIME`,
`NO_RUNTIME`, `workerEnvironment` and `consoleFlags` are gone whole; nothing is aliased and
no helper was kept. Talk is now the console's first screen, and the CLI has no `talk` verb.

**The right layer.** A microphone reaches a worker by joining that worker's ROOM as a
participant, with a token — exactly what SIP does for a phone and what a browser does for
the web. The worker can be in Manhattan and the microphone in Miami and it does not matter:
the room is the meeting point, and the token is the whole of what the client needs. What the
spawn did was the opposite. Because Node has no microphone API, it brought the room down to
the laptop and borrowed the worker's own console for the audio — solving in the process
table what the protocol already solves on the wire, and only working at all when the
operator's Python distribution happened to be on the same machine's PATH.

**So `talk` returns as the same feature as the web widget.** Both mint a token, both join the
agent's room as a participant, both publish audio and subscribe to the agent's. It was written
here that one of them would draw it in a terminal; the section above is why neither does.

**What did not move.** `pinecall-runtime worker talk` stays exactly as it is: that is the
OPERATOR's verb, in the distribution that already owns a microphone through Python, and it
is what Bernardo types. The runtime's `Settings.app` and the `app` field of
`POST /v1/calls` stay too — the claim is the dispatch contract (the runtime's `docs/decisions/dispatch.md`),
`pinecall chat` still travels on `?app=`, and an operator can set `PINECALL_APP` by hand.
The deletion was on the TypeScript side only.

Everything below is the original decision, kept as it was written.

## The three paths

**livekit-client in Node.** `livekit-client` is a browser package: it wants
`navigator.mediaDevices`, and Node has none. The Node SDK, `@livekit/rtc-node`, can publish
an `AudioSource` — but the frames have to come from somewhere, which means a native
microphone binding, and playback of the agent's voice means a second one. Two native
dependencies, a resampler, a device picker and a recorder, all so that a person can say
"hola" to their own agent. We would be rewriting the console.

**A browser page.** Mint a web token, open a local page on `@pinecall/web`, talk there.
It is the right answer for a customer; it was not the right answer for an operator's own
terminal, and the recording would then be the browser's, not the session's.

**livekit's own console.** `livekit-agents` has owned a microphone since 1.0. The rich
Python console opens the input and output devices through `sounddevice`, draws the
transcript, toggles between voice and text on **Ctrl+T** (`cli/_legacy.py:1189`), lists the
machine's devices under `--list-devices` (`:1667`), and with `--record` (`:1677`) makes the
session write an OGG. It even prints, per turn, exactly the three numbers the card asked
for — `llm_node_ttft`, `tts_node_ttfb`, `e2e_latency` (`cli/_legacy.py:1303-1313`).

**We took the third.** Every flag the card named is already the library's, under the same
name. Writing any of it again is the thing the milestone's first rule forbids.

## What `pinecall talk` therefore was, for a day — reversed above

Two processes, one command.

`src/cli/talk.ts` loads the tenant's `agent.ts`, mounts it and holds the
app socket open — so every `@tool` runs in the developer's own process, where a breakpoint
in one is reachable — and then spawns `pinecall-runtime worker talk <flags>` with **stdio
inherited** and `PINECALL_GATEWAY_URL` / `PINECALL_AGENT` in its environment (the reason they
are environment and not flags is in `worker.md`, "The entrypoint is a name"). The child gets the terminal whole: it draws
the console, reads the keyboard in raw mode and restores the tty on its way out. Two
processes drawing at once would be two consoles.

`--list-devices` never loads an app, never asks for a key and never opens a socket: which
microphones this machine has is a question about the machine.

## And `pinecall-runtime worker`

`the runtime's cli/worker.py` is a name and a `Worker`, and nothing else:

| our verb | livekit's | what it is |
|---|---|---|
| `dev` | `dev` | registers against the LiveKit in `LIVEKIT_URL`, dev logging |
| `start` | `start` | the fleet process, with `--drain-timeout` and the rest of livekit's flags |
| `talk` | `console` | the microphone, the speaker, Ctrl+T, `--record`, `--list-devices` |
| `download-files` | `download-files` | every installed plugin's model weights |

Whatever follows the verb is passed through untouched, so livekit's own flags need no
second declaration here and cannot drift from it. `hand_over` writes the `sys.argv` that
livekit's CLI reads — which is exactly what every agent script in the world does when it
calls `run_app`; ours is a group of a larger CLI, so the argv is written rather than typed.

The Python CLI carries a deprecation notice pointing at the Go `lk agent` CLI, and the
modern door (`python -m livekit.agents console`) needs that binary running a TCP console on
the other end (`cli/cli.py:208`, `__main__.py:126`). We are not adding a Go binary to the
"clone it and talk to it" path. When `lk` becomes a dependency of this repo for other
reasons, `talk` moves to it and nothing above changes.

## The recording, and where its path is decided

`RecorderIO` is livekit's (`voice/recorder_io/recorder_io.py:155`), started by
`AgentSession.start` when the session records, and it writes **`audio.ogg` into
`job_ctx.session_directory`** (`voice/agent_session.py:1043`). That directory is a
`TemporaryDirectory` for an ordinary job and the **console's** directory when a console is
driving the process (`job.py:236-240`) — named after the clock, exposed read-only
(`cli/_legacy.py:440`).

So `worker/recordings.py` composes one directory per call and points the console at it
before the microphone opens. That is the whole module: the path is decided in one place, it
is printed on the first line of the session so nobody has to go looking, and a `worker
talk` of tomorrow does not write over the one from today — the console room is always
`console-room`, so the moment is what tells two sessions apart.

`RECORD` and `PINECALL_RECORDINGS` are fields of `Settings` like every other environment
variable of this runtime; `RECORD=0` is how a deploy keeps no audio at all, and pydantic
already reads `0/false/no/off` as no. Asking for `--record` on such a box is **refused**,
not quietly ignored.

## The pointer, closed by the integration card

`call.summary.recording` is written by the runtime's `session/voice/voice.py`, which this work did
not own, so the pointer landed with the integration that did. The shape it took is not the two
lines sketched above, because reading livekit more closely found a third fact: an ordinary job's
`session_directory` is a `TemporaryDirectory` the job removes when it ends (`job.py:232,364`), so
an `audio.ogg` written there is gone before anybody reads the pointer. `recordings.kept_by_the_job`
therefore does for the job what `kept_by_the_console` does for the console — points the private
`_session_directory` at the directory `destination_for` composed — and `entry.answer` decides it
before the session exists, hands the file to the bridge, and tells the session to record
`AUDIO_ONLY` (audio on, traces/logs/transcript off: those three are uploads). Under a console the
directory is already ours and the pointer is the console's file, but only when `--record` was
asked for, since livekit writes none otherwise (`agent_session.py:1042`).
